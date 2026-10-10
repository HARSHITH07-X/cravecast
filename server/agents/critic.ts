import { z } from 'zod';
import { DailyPlanOutput, ComputedPrepItem, ComputedOrderItem } from '../planner.js';
import { generateStructured } from '../lib/llm.js';
import { MODEL_REASONING, CONFIG } from '../config.js';

export type CriticIssueCode =
  | 'NEGATIVE_STOCK'
  | 'NEGATIVE_QUANTITY'
  | 'EXCEEDS_2X_HISTORICAL_MAX'
  | 'SHELF_LIFE_EXCEEDED'
  | 'ORDER_MATH_INCONSISTENCY'
  | 'PACK_SIZE_VIOLATION'
  | 'GEMINI_SUSPICIOUS_ITEM';

export interface ConstraintAdjustment {
  type: 'CLAMP_STOCK_ZERO' | 'CAP_PORTIONS' | 'SNAP_PACK_SIZE';
  targetId: string; // ingredientId or menuItemId
  targetName: string;
  originalValue: number;
  adjustedValue: number;
  reason: string;
}

export interface CriticIssue {
  code: CriticIssueCode;
  severity: 'CRITICAL' | 'WARNING';
  category: 'PREP' | 'ORDER' | 'STOCK' | 'SUPPLIER';
  item: string;
  message: string;
  constraintAdjustment?: ConstraintAdjustment;
}

export interface GeminiReviewFlag {
  item: string;
  category: 'prep' | 'order' | 'supplier';
  concern: string;
  severity: 'warning' | 'alert';
}

export interface CriticReport {
  passed: boolean;
  issues: CriticIssue[];
  deterministicPassed: boolean;
  geminiReviewPassed: boolean;
  geminiReviewFlags: GeminiReviewFlag[];
  adjustmentsToApply: ConstraintAdjustment[];
  retries: number;
  timestamp: string;
}

/**
 * Step 1: Evaluates pure deterministic business invariants.
 * Code-authoritative, fast, and 100% reproducible.
 */
export function auditPlanDeterministic(
  plan: DailyPlanOutput,
  historicalMaxMap: Record<string, number> = {}
): {
  passed: boolean;
  issues: CriticIssue[];
  adjustmentsToApply: ConstraintAdjustment[];
} {
  const issues: CriticIssue[] = [];
  const adjustmentsToApply: ConstraintAdjustment[] = [];

  // Invariant 1: No negative quantities
  // Check Prep Items
  for (const prep of plan.prepItems) {
    if (prep.plannedPortions < 0) {
      const adj: ConstraintAdjustment = {
        type: 'CAP_PORTIONS',
        targetId: prep.menuItemId,
        targetName: prep.dishName,
        originalValue: prep.plannedPortions,
        adjustedValue: 0,
        reason: 'Reset negative planned portions to zero',
      };
      issues.push({
        code: 'NEGATIVE_QUANTITY',
        severity: 'CRITICAL',
        category: 'PREP',
        item: prep.dishName,
        message: `Dish "${prep.dishName}" has negative planned portions (${prep.plannedPortions}). Quantities must be ≥ 0.`,
        constraintAdjustment: adj,
      });
      adjustmentsToApply.push(adj);
    }
  }

  // Check Order Items
  for (const order of plan.orderItems) {
    // Check for negative stock
    if (order.currentStock < 0) {
      const adj: ConstraintAdjustment = {
        type: 'CLAMP_STOCK_ZERO',
        targetId: order.ingredientId,
        targetName: order.ingredientName,
        originalValue: order.currentStock,
        adjustedValue: 0,
        reason: 'Clamp negative inventory stock to zero',
      };
      issues.push({
        code: 'NEGATIVE_STOCK',
        severity: 'CRITICAL',
        category: 'STOCK',
        item: order.ingredientName,
        message: `Ingredient "${order.ingredientName}" has negative recorded stock (${order.currentStock} ${order.unit}). Stock cannot be negative.`,
        constraintAdjustment: adj,
      });
      adjustmentsToApply.push(adj);
    }

    // Check for negative order calculations
    if (
      order.totalGrossNeeded < 0 ||
      order.netNeeded < 0 ||
      order.packsToOrder < 0 ||
      order.finalOrderQuantity < 0
    ) {
      issues.push({
        code: 'NEGATIVE_QUANTITY',
        severity: 'CRITICAL',
        category: 'ORDER',
        item: order.ingredientName,
        message: `Ingredient "${order.ingredientName}" has negative order quantities (needed: ${order.totalGrossNeeded}, order: ${order.finalOrderQuantity}).`,
      });
    }
  }

  // Invariant 2: Nothing above 2x the dish's historical maximum
  for (const prep of plan.prepItems) {
    const historicalMax = historicalMaxMap[prep.menuItemId];
    // Apply rule if historical maximum is established (>= 5 portions)
    if (historicalMax && historicalMax >= 5) {
      const maxAllowed = 2 * historicalMax;
      if (prep.plannedPortions > maxAllowed) {
        const adj: ConstraintAdjustment = {
          type: 'CAP_PORTIONS',
          targetId: prep.menuItemId,
          targetName: prep.dishName,
          originalValue: prep.plannedPortions,
          adjustedValue: maxAllowed,
          reason: `Cap planned portions to 2x historical maximum sales (${maxAllowed} portions)`,
        };
        issues.push({
          code: 'EXCEEDS_2X_HISTORICAL_MAX',
          severity: 'CRITICAL',
          category: 'PREP',
          item: prep.dishName,
          message: `Dish "${prep.dishName}" planned portions (${prep.plannedPortions}) exceeds 2x historical maximum sales (${historicalMax} portions, cap: ${maxAllowed}).`,
          constraintAdjustment: adj,
        });
        adjustmentsToApply.push(adj);
      }
    }
  }

  // Invariant 3: Shelf life respected
  for (const prep of plan.prepItems) {
    if (prep.shelfLifeDays === 1) {
      const maxSafeDemand = Math.round(prep.p90 * 1.15);
      if (prep.plannedPortions > maxSafeDemand && !prep.cappedByShelfLife) {
        const adj: ConstraintAdjustment = {
          type: 'CAP_PORTIONS',
          targetId: prep.menuItemId,
          targetName: prep.dishName,
          originalValue: prep.plannedPortions,
          adjustedValue: Math.round(prep.p90),
          reason: `Cap planned portions to P90 for 1-day shelf life item to prevent spoil wastage`,
        };
        issues.push({
          code: 'SHELF_LIFE_EXCEEDED',
          severity: 'CRITICAL',
          category: 'PREP',
          item: prep.dishName,
          message: `Dish "${prep.dishName}" has 1-day shelf life but planned portions (${prep.plannedPortions}) exceeds safe upper bound (${maxSafeDemand}).`,
          constraintAdjustment: adj,
        });
        adjustmentsToApply.push(adj);
      }
    }
  }

  // Invariant 4: Order list consistent with prep list and stock
  for (const order of plan.orderItems) {
    const expectedNet = Math.max(0, order.totalGrossNeeded - Math.max(0, order.currentStock));
    if (Math.abs(order.netNeeded - expectedNet) > 0.1) {
      issues.push({
        code: 'ORDER_MATH_INCONSISTENCY',
        severity: 'CRITICAL',
        category: 'ORDER',
        item: order.ingredientName,
        message: `Ingredient "${order.ingredientName}" net needed (${order.netNeeded}) does not match gross needed (${order.totalGrossNeeded}) minus stock (${order.currentStock}).`,
      });
    }
  }

  // Invariant 5: Pack sizes and Minimum Order Quantities (MOQ) respected
  for (const order of plan.orderItems) {
    if (order.packsToOrder > 0 && order.packageSize > 0) {
      const expectedTotal = Math.round(order.packsToOrder * order.packageSize * 100) / 100;
      if (Math.abs(order.finalOrderQuantity - expectedTotal) > 0.05) {
        const adj: ConstraintAdjustment = {
          type: 'SNAP_PACK_SIZE',
          targetId: order.ingredientId,
          targetName: order.ingredientName,
          originalValue: order.finalOrderQuantity,
          adjustedValue: expectedTotal,
          reason: `Snap order quantity to integer pack multiple (${order.packsToOrder} × ${order.packageSize} ${order.unit})`,
        };
        issues.push({
          code: 'PACK_SIZE_VIOLATION',
          severity: 'CRITICAL',
          category: 'ORDER',
          item: order.ingredientName,
          message: `Ingredient "${order.ingredientName}" final order quantity (${order.finalOrderQuantity}) is not a multiple of supplier pack size (${order.packageSize} ${order.packageUnit}).`,
          constraintAdjustment: adj,
        });
        adjustmentsToApply.push(adj);
      }

      if (order.packsToOrder < order.minOrderQuantity) {
        issues.push({
          code: 'PACK_SIZE_VIOLATION',
          severity: 'CRITICAL',
          category: 'ORDER',
          item: order.ingredientName,
          message: `Ingredient "${order.ingredientName}" order packs (${order.packsToOrder}) is below supplier minimum order quantity (${order.minOrderQuantity}).`,
        });
      }
    }
  }

  const passed = issues.filter((i) => i.severity === 'CRITICAL').length === 0;

  return {
    passed,
    issues,
    adjustmentsToApply,
  };
}

const GeminiReviewSchema = z.object({
  flags: z.array(
    z.object({
      item: z.string().describe('Name of the dish, ingredient, or supplier'),
      category: z.enum(['prep', 'order', 'supplier']),
      concern: z.string().describe('Clear 1-sentence description of the operational suspicion or risk'),
      severity: z.enum(['warning', 'alert']),
    })
  ),
});

/**
 * Step 2: Gemini review (structured output) that flags suspicious items
 * using ONLY supplied data and CANNOT change numbers.
 */
export async function runGeminiCriticReview(
  plan: DailyPlanOutput,
  context?: {
    weatherCondition?: string;
    avgTemp?: number;
    eventName?: string;
    skipGemini?: boolean;
  }
): Promise<{ passed: boolean; flags: GeminiReviewFlag[] }> {
  if (
    context?.skipGemini ||
    process.env.NODE_ENV === 'test' ||
    (!CONFIG.geminiApiKey && !process.env.GEMINI_API_KEY)
  ) {
    return { passed: true, flags: [] };
  }

  try {
    const prepSummary = plan.prepItems.slice(0, 15).map((p) => ({
      dish: p.dishName,
      plannedPortions: p.plannedPortions,
      p50: p.p50,
      p90: p.p90,
      confidence: p.confidence,
      reason: p.reason,
    }));

    const orderSummary = plan.orderItems.slice(0, 15).map((o) => ({
      ingredient: o.ingredientName,
      stock: o.currentStock,
      needed: o.totalGrossNeeded,
      finalOrder: o.finalOrderQuantity,
      unit: o.unit,
      supplier: o.supplierName,
      cost: o.estimatedCost,
    }));

    const prompt = `Review this kitchen plan for operational anomalies using ONLY the supplied data below:

Date: ${plan.targetDate}
Weather: ${context?.weatherCondition || 'Normal'}, Temp: ${context?.avgTemp || 26}°C
Event: ${context?.eventName || 'None'}
Total Planned Portions: ${plan.summary.totalPlannedPortions}
Total Order Cost: ₹${plan.summary.totalEstimatedOrderCost}

Top Prep Items:
${JSON.stringify(prepSummary, null, 2)}

Top Order Items:
${JSON.stringify(orderSummary, null, 2)}

Identify any genuine operational anomalies, such as:
1. High-risk dish spikes without matching event or weather justification.
2. Orders with zero supplier assigned or extreme cost concentration.
3. Severe weather mismatches (e.g. cold desserts spike during severe monsoon).

You CANNOT modify any numbers. Return flags only. If the plan looks realistic, return an empty array of flags.`;

    const result = await generateStructured({
      prompt,
      schema: GeminiReviewSchema,
      model: MODEL_REASONING,
      thinkingBudget: 512,
      systemInstruction:
        'You are CraveCast Kitchen Quality Critic. Audit the kitchen schedule against realistic operational patterns using ONLY provided data. Never alter numerical figures. Output structured JSON flags only.',
    });

    const flags: GeminiReviewFlag[] = result.flags || [];
    return {
      passed: true,
      flags,
    };
  } catch (err) {
    console.warn('[runGeminiCriticReview] Gemini review skipped or failed gracefully:', err);
    return {
      passed: true,
      flags: [],
    };
  }
}

/**
 * Combined Critic audit execution.
 */
export async function evaluatePlanWithCritic(
  plan: DailyPlanOutput,
  historicalMaxMap: Record<string, number> = {},
  retriesSoFar: number = 0,
  context?: {
    weatherCondition?: string;
    avgTemp?: number;
    eventName?: string;
  }
): Promise<CriticReport> {
  // 1. Deterministic invariants first
  const deterministicResult = auditPlanDeterministic(plan, historicalMaxMap);

  // 2. Gemini review
  const geminiResult = await runGeminiCriticReview(plan, context);

  // Combine issues
  const allIssues: CriticIssue[] = [...deterministicResult.issues];
  for (const flag of geminiResult.flags) {
    allIssues.push({
      code: 'GEMINI_SUSPICIOUS_ITEM',
      severity: flag.severity === 'alert' ? 'CRITICAL' : 'WARNING',
      category: flag.category.toUpperCase() as any,
      item: flag.item,
      message: flag.concern,
    });
  }

  const passed = deterministicResult.passed;

  return {
    passed,
    issues: allIssues,
    deterministicPassed: deterministicResult.passed,
    geminiReviewPassed: geminiResult.passed,
    geminiReviewFlags: geminiResult.flags,
    adjustmentsToApply: deterministicResult.adjustmentsToApply,
    retries: retriesSoFar,
    timestamp: new Date().toISOString(),
  };
}
