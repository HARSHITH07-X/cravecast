/**
 * CraveCast Phase 6 Daily Kitchen Planner Engine
 * 
 * Deterministic planning algorithm:
 * 1. Service level per dish via Newsvendor Critical Ratio cu / (cu + co) or owner slider (default 85%).
 * 2. Planned portions = chosen quantile between p50 and p90.
 * 3. Convert to ingredient needs using confirmed recipes, including trim/wastage percent. Dishes without recipes: "recipe missing".
 * 4. Subtract editable current stock. (Inventory starts empty; if none: "No stock entered, order list assumes an empty kitchen.")
 * 5. Cap prep by shelf_life_days.
 * 6. Round order list to supplier pack sizes and minimum order quantities, respecting lead times. Group by supplier.
 * 7. Reason lines generated with Number Guard verification and fallback code templates.
 * 8. Supplier WhatsApp order templates with wa.me links.
 */

import { ForecastResult, DayFeatures } from './forecast/types.js';
import { DishBiasAdjustment } from './forecast/learningLoop.js';
import { verifyNumberGuard } from './lib/guards.js';
import { GoogleGenAI } from '@google/genai';
import { MODEL_FAST, CONFIG } from './config.js';

export interface PlanMenuItemInput {
  id: string;
  name: string;
  category?: string;
  price?: number;
  cost?: number;
  shelfLifeDays?: number;
  prepLeadTimeHours?: number;
  hasConfirmedRecipe?: boolean;
  recipeId?: string;
}

export interface PlanRecipeIngredient {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  trimWastePercent?: number;
  costPerUnit?: number;
}

export interface PlanRecipeInput {
  id: string;
  menuItemId: string;
  dishName: string;
  batchYield: number;
  ingredients: PlanRecipeIngredient[];
  prepInstructions?: string;
  prepStation?: string;
}

export interface PlanIngredientInput {
  id: string;
  name: string;
  category?: string;
  unit: string;
  packageSize?: number;
  packageUnit?: string;
  minOrderQuantity?: number;
  leadTimeDays?: number;
  supplierId?: string | null;
  unitCost?: number;
  shelfLifeDays?: number;
}

export interface PlanSupplierInput {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  leadTimeDays?: number;
  orderCutoffTime?: string;
  minimumOrderAmount?: number;
}

export interface PlanInventoryInput {
  ingredientId: string;
  currentStock: number;
  unit?: string;
}

export interface PlannerExecutionInput {
  restaurantId: string;
  restaurantName: string;
  targetDate: string; // YYYY-MM-DD
  serviceLevelSlider: number; // e.g. 0.85
  forecasts: ForecastResult[];
  menuItems: PlanMenuItemInput[];
  recipes: PlanRecipeInput[];
  ingredients: PlanIngredientInput[];
  suppliers: PlanSupplierInput[];
  inventory: PlanInventoryInput[];
  dayFeatures?: DayFeatures;
  dishFeedbackAdjustment?: Record<string, number>;
  feedbackDetailsByDishId?: Record<string, DishBiasAdjustment>;
  status?: 'draft' | 'approved';
  // Constraint adjustments from Critic retries
  stockOverrides?: Record<string, number>;
  dishPortionCaps?: Record<string, number>;
  historicalMaxMap?: Record<string, number>;
}

export interface ComputedPrepItem {
  menuItemId: string;
  dishName: string;
  category: string;
  p10: number;
  p50: number;
  p90: number;
  serviceLevel: number; // 0.50 .. 0.99
  serviceLevelSource: 'newsvendor' | 'owner-set';
  serviceLevelLabel: string;
  plannedPortions: number;
  feedbackAdjustment?: number;
  feedbackExplanation?: string;
  cappedByShelfLife: boolean;
  shelfLifeDays: number;
  hasRecipe: boolean;
  recipeMissing: boolean;
  recipeId?: string;
  station: string;
  reason: string;
  confidence: string;
}

export interface ComputedOrderItem {
  ingredientId: string;
  ingredientName: string;
  category: string;
  unit: string;
  totalGrossNeeded: number;
  currentStock: number;
  netNeeded: number;
  packageSize: number;
  packageUnit: string;
  minOrderQuantity: number;
  packsToOrder: number;
  finalOrderQuantity: number;
  unitCost: number;
  estimatedCost: number;
  leadTimeDays: number;
  mustOrderTodayForTomorrow: boolean;
  leadTimeNotice: string;
  supplierId: string | null;
  supplierName: string;
  dishesUsedIn: string[];
  reason: string;
}

export interface SupplierOrderGroup {
  supplierId: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  orderCutoffTime: string;
  leadTimeDays: number;
  items: ComputedOrderItem[];
  totalEstimatedCost: number;
  messageTemplate: string;
  whatsAppUrl: string;
}

export interface DailyPlanOutput {
  id?: string;
  restaurantId: string;
  restaurantName: string;
  targetDate: string;
  generatedAt: string;
  status: 'draft' | 'approved';
  serviceLevelSlider: number;
  noStockEntered: boolean;
  stockStatusMessage: string;
  prepItems: ComputedPrepItem[];
  orderItems: ComputedOrderItem[];
  supplierGroups: SupplierOrderGroup[];
  summary: {
    totalPlannedPortions: number;
    totalDishesCount: number;
    dishesWithRecipesCount: number;
    dishesMissingRecipesCount: number;
    totalOrderItemsCount: number;
    totalEstimatedOrderCost: number;
    urgentOrderCount: number; // must order today
  };
}

/**
 * Calculates planned portions from quantile q (between 0.50 and 0.99)
 * using p50 and p90 from the conformal distribution.
 */
export function calculatePlannedPortions(p50: number, p90: number, serviceLevel: number): number {
  const safeP50 = Math.max(0, p50);
  const safeP90 = Math.max(safeP50, p90);
  const q = Math.min(0.99, Math.max(0.50, serviceLevel));

  if (safeP90 === safeP50) {
    return Math.round(safeP50);
  }

  if (q <= 0.90) {
    // Interpolate between p50 (at 0.50) and p90 (at 0.90)
    const t = (q - 0.50) / 0.40;
    const interpolated = safeP50 + t * (safeP90 - safeP50);
    return Math.max(0, Math.round(interpolated));
  } else {
    // For quantiles > 0.90, smoothly extend beyond p90
    const t = (q - 0.90) / 0.10;
    const upperBuffer = Math.max(1, (safeP90 - safeP50) * 0.25);
    const extended = safeP90 + t * upperBuffer;
    return Math.max(0, Math.round(extended));
  }
}

/**
 * Computes Newsvendor critical ratio if valid price and cost exist.
 * Otherwise falls back to owner's slider. Never invents costs.
 */
export function determineServiceLevel(
  price: number | undefined,
  cost: number | undefined,
  ownerSlider: number
): {
  serviceLevel: number;
  source: 'newsvendor' | 'owner-set';
  label: string;
} {
  const slider = Math.min(0.99, Math.max(0.50, Number(ownerSlider) || 0.85));

  if (typeof price === 'number' && typeof cost === 'number' && price > 0 && cost > 0 && price > cost) {
    const cu = price - cost; // margin lost per stockout
    const co = cost; // cost of one wasted portion
    const criticalRatio = cu / (cu + co); // (price - cost) / price

    // Clamp between 0.50 and 0.99
    const clampedLevel = Math.min(0.99, Math.max(0.50, Math.round(criticalRatio * 100) / 100));
    return {
      serviceLevel: clampedLevel,
      source: 'newsvendor',
      label: `Newsvendor Critical Ratio (${Math.round(clampedLevel * 100)}%)`,
    };
  }

  return {
    serviceLevel: slider,
    source: 'owner-set',
    label: `Owner-set (${Math.round(slider * 100)}%)`,
  };
}

/**
 * Formats a ready-to-send WhatsApp message template for a supplier order.
 */
export function generateSupplierWhatsAppMessage(
  supplierName: string,
  restaurantName: string,
  targetDate: string,
  deliveryTime: string,
  items: ComputedOrderItem[]
): string {
  const lines: string[] = [
    `Hi ${supplierName || 'Team'}, here is the order from ${restaurantName} for delivery on ${targetDate} (by ${deliveryTime}):`,
    '',
  ];

  for (const item of items) {
    if (item.packsToOrder <= 0) continue;
    lines.push(
      `• ${item.ingredientName}: ${item.finalOrderQuantity} ${item.unit} (${item.packsToOrder} pack${item.packsToOrder > 1 ? 's' : ''} × ${item.packageSize} ${item.packageUnit})`
    );
  }

  lines.push('');
  lines.push('Please confirm receipt and availability. Thank you!');
  return lines.join('\n');
}

/**
 * Generates fallback code template explanation for a prep item.
 */
export function buildCodeTemplatePrepReason(
  dishName: string,
  portions: number,
  p50: number,
  p90: number,
  serviceLevelLabel: string,
  confidence: string,
  dayFeatures?: DayFeatures,
  cappedByShelfLife?: boolean,
  shelfLifeDays?: number,
  feedbackDelta?: number,
  feedbackDetail?: DishBiasAdjustment
): string {
  const dowName = dayFeatures
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayFeatures.dayOfWeek]
    : 'service';

  const parts: string[] = [`Planned ${portions} portions for ${dowName}`];

  if (cappedByShelfLife && shelfLifeDays) {
    parts.push(`(capped by ${shelfLifeDays}-day shelf life)`);
  } else {
    parts.push(`targeting ${serviceLevelLabel} (P50: ${p50}, P90: ${p90})`);
  }

  if (feedbackDelta && feedbackDelta !== 0) {
    const sign = feedbackDelta > 0 ? `+${feedbackDelta}` : `${feedbackDelta}`;
    const kind = feedbackDelta > 0 ? 'stockout' : 'leftover';
    if (feedbackDetail && feedbackDetail.shrinkageFactor) {
      parts.push(
        `with ${sign} portions 4-week ${kind} bias correction (shrinkage ${feedbackDetail.shrinkageFactor}, backtest verified)`
      );
    } else {
      parts.push(`with ${sign} portions 4-week ${kind} feedback bias correction`);
    }
  }

  if (dayFeatures?.isRain) {
    parts.push('accounting for rain conditions');
  }
  if (dayFeatures?.eventName) {
    parts.push(`with local event ${dayFeatures.eventName}`);
  }

  parts.push(`at ${confidence} confidence.`);
  return parts.join(' ');
}

/**
 * Builds order item code template explanation.
 */
export function buildCodeTemplateOrderReason(
  ingredientName: string,
  needed: number,
  stock: number,
  packs: number,
  packageSize: number,
  unit: string,
  dishes: string[],
  mustOrderToday: boolean
): string {
  if (stock <= 0) {
    return `Zero stock on hand. Ordered ${packs} pack${packs > 1 ? 's' : ''} (${packs * packageSize} ${unit}) for ${dishes.slice(0, 2).join(', ')}${mustOrderToday ? ' — order today for tomorrow' : ''}.`;
  }
  return `Need ${Math.round(needed * 10) / 10} ${unit} across ${dishes.slice(0, 2).join(', ')}. After ${stock} ${unit} on hand, rounded to ${packs} pack${packs > 1 ? 's' : ''} (${packs * packageSize} ${unit}).`;
}

/**
 * Pure code planning engine: executes the complete daily kitchen plan.
 */
export function executeDailyPlan(input: PlannerExecutionInput): DailyPlanOutput {
  const {
    restaurantId,
    restaurantName,
    targetDate,
    serviceLevelSlider,
    forecasts,
    menuItems,
    recipes,
    ingredients,
    suppliers,
    inventory,
    dayFeatures,
    dishFeedbackAdjustment = {},
    feedbackDetailsByDishId = {},
    status = 'draft',
  } = input;

  // 1. Build lookup maps
  const menuItemMap = new Map<string, PlanMenuItemInput>();
  for (const m of menuItems) {
    menuItemMap.set(m.id, m);
  }

  const recipeByDishId = new Map<string, PlanRecipeInput>();
  for (const r of recipes) {
    recipeByDishId.set(r.menuItemId, r);
  }

  const ingredientMap = new Map<string, PlanIngredientInput>();
  for (const ing of ingredients) {
    ingredientMap.set(ing.id, ing);
  }

  const supplierMap = new Map<string, PlanSupplierInput>();
  for (const s of suppliers) {
    supplierMap.set(s.id, s);
  }

  const inventoryStockMap = new Map<string, number>();
  let hasAnyNonZeroStock = false;
  for (const inv of inventory) {
    const effectiveStock = input.stockOverrides && input.stockOverrides[inv.ingredientId] !== undefined
      ? input.stockOverrides[inv.ingredientId]
      : Number(inv.currentStock);
    inventoryStockMap.set(inv.ingredientId, effectiveStock);
    if (effectiveStock > 0) {
      hasAnyNonZeroStock = true;
    }
  }

  const noStockEntered = !hasAnyNonZeroStock;
  const stockStatusMessage = noStockEntered
    ? 'No stock entered, order list assumes an empty kitchen.'
    : 'Current stock deducted from ingredient prep requirements.';

  // 2. Compute Prep Items
  const prepItems: ComputedPrepItem[] = [];
  const dishPortionsMap = new Map<string, number>();

  for (const fc of forecasts) {
    const menuItem = menuItemMap.get(fc.menuItemId);
    const dishRecipe = recipeByDishId.get(fc.menuItemId);

    // Determine service level
    const { serviceLevel, source, label } = determineServiceLevel(
      menuItem?.price,
      menuItem?.cost,
      serviceLevelSlider
    );

    // Calculate baseline planned portions
    let plannedPortions = calculatePlannedPortions(fc.p50, fc.p90, serviceLevel);

    // Apply feedback adjustment if any
    const feedbackDetail = feedbackDetailsByDishId[fc.menuItemId];
    const feedbackDelta =
      dishFeedbackAdjustment[fc.menuItemId] ??
      (feedbackDetail ? feedbackDetail.appliedDelta : 0);
    if (feedbackDelta !== 0) {
      plannedPortions = Math.max(0, plannedPortions + feedbackDelta);
    }

    // Apply portion cap from Critic adjustments if present
    if (input.dishPortionCaps && input.dishPortionCaps[fc.menuItemId] !== undefined) {
      plannedPortions = Math.min(plannedPortions, input.dishPortionCaps[fc.menuItemId]);
    }

    // Shelf life cap
    const shelfLifeDays = menuItem?.shelfLifeDays || 2;
    let cappedByShelfLife = false;

    // If shelfLifeDays is strictly 1 day, prep cannot exceed safe maximum demand (p90)
    if (shelfLifeDays === 1 && plannedPortions > Math.round(fc.p90 * 1.1)) {
      plannedPortions = Math.round(fc.p90);
      cappedByShelfLife = true;
    }

    const hasRecipe = Boolean(dishRecipe && dishRecipe.ingredients && dishRecipe.ingredients.length > 0);
    const recipeMissing = !hasRecipe;

    dishPortionsMap.set(fc.menuItemId, plannedPortions);

    const fallbackReason = buildCodeTemplatePrepReason(
      fc.dishName,
      plannedPortions,
      fc.p50,
      fc.p90,
      label,
      fc.confidence,
      dayFeatures,
      cappedByShelfLife,
      shelfLifeDays,
      feedbackDelta,
      feedbackDetail
    );

    prepItems.push({
      menuItemId: fc.menuItemId,
      dishName: fc.dishName,
      category: fc.category || 'Main Course',
      p10: fc.p10,
      p50: fc.p50,
      p90: fc.p90,
      serviceLevel,
      serviceLevelSource: source,
      serviceLevelLabel: label,
      plannedPortions,
      feedbackAdjustment: feedbackDelta,
      feedbackExplanation: feedbackDetail?.explanation || undefined,
      cappedByShelfLife,
      shelfLifeDays,
      hasRecipe,
      recipeMissing,
      recipeId: dishRecipe?.id,
      station: dishRecipe?.prepStation || 'Main Line',
      reason: fallbackReason,
      confidence: fc.confidence,
    });
  }

  // 3. Convert planned portions into ingredient requirements
  interface NeededIngRecord {
    ingredientId: string;
    ingredientName: string;
    grossNeeded: number;
    unit: string;
    dishesUsedIn: Set<string>;
  }

  const neededIngredientsMap = new Map<string, NeededIngRecord>();

  for (const prepItem of prepItems) {
    if (prepItem.recipeMissing || prepItem.plannedPortions <= 0) continue;

    const recipe = recipeByDishId.get(prepItem.menuItemId);
    if (!recipe) continue;

    const batchYield = Math.max(1, recipe.batchYield || 1);
    const portionsRatio = prepItem.plannedPortions / batchYield;

    for (const rIng of recipe.ingredients) {
      const ingId = rIng.ingredientId;
      const baseQty = Number(rIng.quantity) || 0;
      const grossRaw = baseQty * portionsRatio;

      // Wastage / Trim Percent adjustment
      const trimWaste = Math.min(90, Math.max(0, Number(rIng.trimWastePercent) || 0));
      const wastageFactor = trimWaste > 0 ? 1 - trimWaste / 100 : 1;
      const grossAdjusted = grossRaw / wastageFactor;

      let record = neededIngredientsMap.get(ingId);
      if (!record) {
        record = {
          ingredientId: ingId,
          ingredientName: rIng.name,
          grossNeeded: 0,
          unit: rIng.unit,
          dishesUsedIn: new Set<string>(),
        };
        neededIngredientsMap.set(ingId, record);
      }

      record.grossNeeded += grossAdjusted;
      record.dishesUsedIn.add(prepItem.dishName);
    }
  }

  // 4. Calculate Order Items: Deduct stock, round to supplier pack sizes & MOQs
  const orderItems: ComputedOrderItem[] = [];
  let totalEstimatedOrderCost = 0;
  let urgentOrderCount = 0;

  for (const neededRec of neededIngredientsMap.values()) {
    const ingMeta = ingredientMap.get(neededRec.ingredientId);
    const ingName = ingMeta?.name || neededRec.ingredientName;
    const category = ingMeta?.category || 'Kitchen Mise';
    const unit = ingMeta?.unit || neededRec.unit;
    const packageSize = Math.max(0.01, ingMeta?.packageSize || 1);
    const packageUnit = ingMeta?.packageUnit || unit;
    const minOrderQuantity = Math.max(1, ingMeta?.minOrderQuantity || 1);
    const leadTimeDays = ingMeta?.leadTimeDays ?? 1;
    const unitCost = Number(ingMeta?.unitCost) || 0;
    const supplierId = ingMeta?.supplierId || null;

    const currentStock = inventoryStockMap.get(neededRec.ingredientId) || 0;
    const totalGrossNeeded = Math.round(neededRec.grossNeeded * 100) / 100;
    const netNeeded = Math.max(0, totalGrossNeeded - currentStock);

    let packsToOrder = 0;
    let finalOrderQuantity = 0;

    if (netNeeded > 0) {
      const packsCalculated = Math.ceil(netNeeded / packageSize);
      packsToOrder = Math.max(packsCalculated, minOrderQuantity);
      finalOrderQuantity = Math.round(packsToOrder * packageSize * 100) / 100;
    }

    const estimatedCost = Math.round(finalOrderQuantity * unitCost * 100) / 100;
    totalEstimatedOrderCost += estimatedCost;

    const mustOrderTodayForTomorrow = leadTimeDays >= 1;
    if (mustOrderTodayForTomorrow && packsToOrder > 0) {
      urgentOrderCount++;
    }

    const leadTimeNotice =
      leadTimeDays === 1
        ? 'Order today for tomorrow morning'
        : leadTimeDays > 1
        ? `Lead time: ${leadTimeDays} days (Order today)`
        : 'Same-day delivery';

    const supplierObj = supplierId ? supplierMap.get(supplierId) : undefined;
    const supplierName = supplierObj?.name || 'Local Market / Unassigned';

    const dishesList = Array.from(neededRec.dishesUsedIn);

    const orderReason = buildCodeTemplateOrderReason(
      ingName,
      totalGrossNeeded,
      currentStock,
      packsToOrder,
      packageSize,
      unit,
      dishesList,
      mustOrderTodayForTomorrow
    );

    orderItems.push({
      ingredientId: neededRec.ingredientId,
      ingredientName: ingName,
      category,
      unit,
      totalGrossNeeded,
      currentStock,
      netNeeded: Math.round(netNeeded * 100) / 100,
      packageSize,
      packageUnit,
      minOrderQuantity,
      packsToOrder,
      finalOrderQuantity,
      unitCost,
      estimatedCost,
      leadTimeDays,
      mustOrderTodayForTomorrow,
      leadTimeNotice,
      supplierId,
      supplierName,
      dishesUsedIn: dishesList,
      reason: orderReason,
    });
  }

  // Sort order items: items to order first, then alphabetical
  orderItems.sort((a, b) => {
    if (b.packsToOrder !== a.packsToOrder) return b.packsToOrder - a.packsToOrder;
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  // 5. Group by Supplier and generate ready-to-send WhatsApp messages
  const supplierGroupsMap = new Map<string, ComputedOrderItem[]>();

  for (const item of orderItems) {
    const sId = item.supplierId || 'unassigned';
    if (!supplierGroupsMap.has(sId)) {
      supplierGroupsMap.set(sId, []);
    }
    supplierGroupsMap.get(sId)!.push(item);
  }

  const supplierGroups: SupplierOrderGroup[] = [];

  for (const [sId, groupItems] of supplierGroupsMap.entries()) {
    const sObj = sId !== 'unassigned' ? supplierMap.get(sId) : undefined;
    const supplierName = sObj?.name || 'Local Market / Unassigned';
    const cutoff = sObj?.orderCutoffTime || '18:00';
    const leadTime = sObj?.leadTimeDays ?? 1;
    const phone = sObj?.whatsapp || sObj?.phone || '';

    const groupCost = groupItems.reduce((acc, it) => acc + it.estimatedCost, 0);

    const messageTemplate = generateSupplierWhatsAppMessage(
      supplierName,
      restaurantName,
      targetDate,
      '09:00 AM',
      groupItems
    );

    // Clean phone number for WhatsApp link
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const whatsAppUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageTemplate)}`
      : `https://wa.me/?text=${encodeURIComponent(messageTemplate)}`;

    supplierGroups.push({
      supplierId: sId,
      supplierName,
      contactPerson: sObj?.contactPerson,
      phone: sObj?.phone,
      whatsapp: sObj?.whatsapp,
      orderCutoffTime: cutoff,
      leadTimeDays: leadTime,
      items: groupItems,
      totalEstimatedCost: Math.round(groupCost * 100) / 100,
      messageTemplate,
      whatsAppUrl,
    });
  }

  // Sort supplier groups: named suppliers first, unassigned last
  supplierGroups.sort((a, b) => {
    if (a.supplierId === 'unassigned') return 1;
    if (b.supplierId === 'unassigned') return -1;
    return a.supplierName.localeCompare(b.supplierName);
  });

  const totalPlannedPortions = prepItems.reduce((acc, p) => acc + p.plannedPortions, 0);
  const dishesWithRecipesCount = prepItems.filter((p) => p.hasRecipe).length;
  const dishesMissingRecipesCount = prepItems.filter((p) => p.recipeMissing).length;

  return {
    restaurantId,
    restaurantName,
    targetDate,
    generatedAt: new Date().toISOString(),
    status,
    serviceLevelSlider,
    noStockEntered,
    stockStatusMessage,
    prepItems,
    orderItems,
    supplierGroups,
    summary: {
      totalPlannedPortions,
      totalDishesCount: prepItems.length,
      dishesWithRecipesCount,
      dishesMissingRecipesCount,
      totalOrderItemsCount: orderItems.length,
      totalEstimatedOrderCost: Math.round(totalEstimatedOrderCost * 100) / 100,
      urgentOrderCount,
    },
  };
}

/**
 * Reason Lines with Gemini and Number Guard:
 * Calls Gemini receiving ONLY computed numbers and factors.
 * Validates output with verifyNumberGuard against code-supplied numbers.
 * On rejection or failure, safely retains the code template fallback.
 */
export async function enhancePlanWithGeminiReasons(
  plan: DailyPlanOutput,
  dayFeatures?: DayFeatures
): Promise<DailyPlanOutput> {
  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return plan;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build items payload with strict factor numbers only
    const itemsPayload = plan.prepItems.slice(0, 15).map((item) => ({
      dishName: item.dishName,
      portions: item.plannedPortions,
      p10: item.p10,
      p50: item.p50,
      p90: item.p90,
      confidence: item.confidence,
      weekday: dayFeatures
        ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayFeatures.dayOfWeek]
        : 'Tomorrow',
      weather: dayFeatures?.isRain ? 'Rain expected' : 'Normal',
      event: dayFeatures?.eventName || 'None',
      serviceLevel: item.serviceLevelLabel,
      shelfLifeDays: item.shelfLifeDays,
      cappedByShelfLife: item.cappedByShelfLife,
      feedbackAdjustment: item.feedbackAdjustment || 0,
      feedbackExplanation: item.feedbackExplanation || 'None',
    }));

    const prompt = `You are a kitchen operational planner. For each dish below, provide exactly one concise explanation sentence for the prep portion count.
Strict constraints:
1. Mention ONLY numbers that appear in the provided data (portions, p50, p90, shelfLifeDays, feedbackAdjustment). Do not hallucinate or calculate any other numbers.
2. If feedbackAdjustment is non-zero, explicitly mention the feedback adjustment in the sentence.
3. Return a JSON array of objects with "dishName" and "reasonSentence".

Input Data:
${JSON.stringify(itemsPayload, null, 2)}`;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '[]');
    if (Array.isArray(parsed)) {
      const reasonMap = new Map<string, string>();
      for (const item of parsed) {
        if (item.dishName && item.reasonSentence) {
          reasonMap.set(item.dishName, item.reasonSentence);
        }
      }

      // Verify each sentence with Number Guard
      for (const prepItem of plan.prepItems) {
        const candidateReason = reasonMap.get(prepItem.dishName);
        if (candidateReason) {
          // Allowed numbers from code input
          const allowedNumbers = [
            prepItem.plannedPortions,
            prepItem.p10,
            prepItem.p50,
            prepItem.p90,
            Math.round(prepItem.serviceLevel * 100),
            prepItem.shelfLifeDays,
            Math.abs(prepItem.feedbackAdjustment || 0),
            prepItem.feedbackAdjustment || 0,
            4,
            dayFeatures?.tempMax || 0,
          ];

          const guard = verifyNumberGuard(candidateReason, allowedNumbers);
          if (guard.valid && guard.sanitizedText) {
            let finalReason = guard.sanitizedText;
            if (
              prepItem.feedbackAdjustment &&
              prepItem.feedbackAdjustment !== 0 &&
              !finalReason.toLowerCase().includes('feedback') &&
              !finalReason.toLowerCase().includes('bias') &&
              !finalReason.toLowerCase().includes('stockout') &&
              !finalReason.toLowerCase().includes('leftover')
            ) {
              const sign = prepItem.feedbackAdjustment > 0 ? `+${prepItem.feedbackAdjustment}` : `${prepItem.feedbackAdjustment}`;
              const kind = prepItem.feedbackAdjustment > 0 ? 'stockout' : 'leftover';
              finalReason = `${finalReason.replace(/\.$/, '')} (includes ${sign} portions 4-week ${kind} bias adjustment).`;
            }
            prepItem.reason = finalReason;
          }
          // If guard.valid is false, keep the deterministic code template reason
        }
      }
    }
  } catch (err) {
    // Graceful fallback to code template reasons
    console.warn('Gemini reason generation skipped/failed, using code templates:', err);
  }

  return plan;
}
