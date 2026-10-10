import { GoogleGenAI } from '@google/genai';
import { MODEL_FAST, CONFIG } from '../config.js';
import { verifyNumberGuard } from '../lib/guards.js';
import { agentObservability } from '../lib/observability.js';
import type { FirestoreClient } from '../lib/firestoreRest.js';
import { DailyPlanOutput, ComputedPrepItem } from '../planner.js';

export interface ExplainRequest {
  restaurantId: string;
  targetDate?: string;
  dishNameOrQuery: string;
  language?: 'en' | 'hi' | 'te';
  runId?: string;
  planData?: DailyPlanOutput;
}

export interface ExplainResult {
  dishName: string;
  grounded: boolean;
  citation: {
    planId?: string;
    planDate?: string;
    generatedAt?: string;
    dataSource: string;
    recentSalesCount?: number;
    recentSalesAvg?: number;
  };
  factors: {
    plannedPortions: number;
    p10: number;
    p50: number;
    p90: number;
    serviceLevelPercent: number;
    confidenceTier: string;
    weatherFactor?: string;
    eventFactor?: string;
    shelfLifeDays?: number;
    recentSalesCount?: number;
    recentSalesAvg?: number;
  };
  explanation: string;
  numberGuardPassed: boolean;
  refusalReason?: string;
}

/**
 * Searches stored plan, recent sales, and forecast factors via tools,
 * applies strict grounding and Number Guard, and cites the plan/run used.
 * Refuses if data is missing or dish is unidentifiable.
 */
export async function explainDishPortion(
  req: ExplainRequest,
  db?: FirestoreClient
): Promise<ExplainResult> {
  const startTime = Date.now();
  const runId = req.runId || `run_${Date.now()}`;
  const language = req.language || 'en';

  let targetDate = req.targetDate;
  if (!targetDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().slice(0, 10);
  }

  const toolCalls: Array<{ name: string; args: any; result?: any }> = [];

  // 1. Tool: get_stored_plan
  let plan = req.planData;
  let fetchedFromDb = false;
  let planDocId = targetDate;

  if (!plan && db) {
    try {
      const planDoc = await db.collection(`restaurants/${req.restaurantId}/plans`).doc(targetDate).get();
      if (planDoc.exists) {
        plan = planDoc.data() as DailyPlanOutput;
        fetchedFromDb = true;
      } else {
        // Check if there is a latest stored plan in the collection
        const recentPlansSnap = await db
          .collection(`restaurants/${req.restaurantId}/plans`)
          .limit(5)
          .get();
        if (!recentPlansSnap.empty) {
          const docs = recentPlansSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as DailyPlanOutput) }));
          docs.sort((a: any, b: any) => (b.targetDate || b.id || '').localeCompare(a.targetDate || a.id || ''));
          if (docs[0] && Array.isArray(docs[0].prepItems) && docs[0].prepItems.length > 0) {
            plan = docs[0];
            planDocId = docs[0].targetDate || docs[0].id;
            fetchedFromDb = true;
          }
        }
      }
      toolCalls.push({
        name: 'get_stored_plan',
        args: { restaurantId: req.restaurantId, targetDate },
        result: plan
          ? { found: true, planId: planDocId, dishCount: plan.prepItems?.length || 0, generatedAt: plan.generatedAt }
          : { found: false },
      });
    } catch (err) {
      console.warn('Could not load plan from DB:', err);
    }
  } else if (plan) {
    toolCalls.push({
      name: 'get_stored_plan',
      args: { restaurantId: req.restaurantId, targetDate },
      result: { found: true, planId: targetDate, dishCount: plan.prepItems?.length || 0, source: 'session_plan' },
    });
  }

  // 2. If no plan exists, refuse cleanly
  if (!plan || !plan.prepItems || plan.prepItems.length === 0) {
    const refusalEn = `No forecast or plan data found for date ${targetDate}. Please generate tomorrow's plan first so I can explain the numbers.`;
    const refusalHi = `तारीख ${targetDate} के लिए कोई फोरकास्ट या प्लान डेटा उपलब्ध नहीं है। कृपया पहले कल का प्लान तैयार करें।`;
    const refusalTe = `తేదీ ${targetDate} కోసం ఎలాంటి ఫోర్‌కాస్ట్ లేదా ప్లాన్ డేటా కనుగొనబడలేదు. దయచేసి ముందుగా రేపటి ప్లాన్ సిద్ధం చేయండి.`;

    const explanation = language === 'hi' ? refusalHi : language === 'te' ? refusalTe : refusalEn;

    await agentObservability.recordStep(
      {
        runId,
        restaurantId: req.restaurantId,
        agent: 'explainer',
        step: 'grounding_check_refused',
        input: req,
        output: { grounded: false, reason: 'missing_plan_data' },
        latencyMs: Date.now() - startTime,
        tokenCounts: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
        model: 'grounding_engine',
        toolCalls,
      },
      db
    );

    return {
      dishName: req.dishNameOrQuery,
      grounded: false,
      citation: { dataSource: 'none' },
      factors: {
        plannedPortions: 0,
        p10: 0,
        p50: 0,
        p90: 0,
        serviceLevelPercent: 85,
        confidenceTier: 'unknown',
      },
      explanation,
      numberGuardPassed: true,
      refusalReason: 'Plan data for target date is missing.',
    };
  }

  // 3. Find the matched dish in prep items
  const queryLower = req.dishNameOrQuery.toLowerCase();
  const matchedItem = plan.prepItems.find((p) => {
    const nameLower = p.dishName.toLowerCase();
    return (
      nameLower.includes(queryLower) ||
      queryLower.includes(nameLower) ||
      nameLower.split(' ').some((w) => w.length > 3 && queryLower.includes(w.replace(/s$/, ''))) ||
      queryLower.split(/\s+/).some((w) => w.length > 3 && nameLower.includes(w.replace(/s$/, '')))
    );
  });

  if (!matchedItem) {
    const refusalEn = `Dish "${req.dishNameOrQuery}" was not found in the plan for ${planDocId}. Available dishes are: ${plan.prepItems.map((p) => p.dishName).slice(0, 5).join(', ')}.`;
    const refusalHi = `डिश "${req.dishNameOrQuery}" तारीख ${planDocId} के प्लान में नहीं मिली। उपलब्ध डिशें: ${plan.prepItems.map((p) => p.dishName).slice(0, 5).join(', ')}।`;
    const refusalTe = `డిష్ "${req.dishNameOrQuery}" ${planDocId} ప్లాన్‌లో దొరకలేదు. అందుబాటులో ఉన్న డిష్‌లు: ${plan.prepItems.map((p) => p.dishName).slice(0, 5).join(', ')}.`;

    const explanation = language === 'hi' ? refusalHi : language === 'te' ? refusalTe : refusalEn;

    await agentObservability.recordStep(
      {
        runId,
        restaurantId: req.restaurantId,
        agent: 'explainer',
        step: 'grounding_check_dish_not_found',
        input: req,
        output: { grounded: false, reason: 'dish_not_found' },
        latencyMs: Date.now() - startTime,
        tokenCounts: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
        model: 'grounding_engine',
        toolCalls,
      },
      db
    );

    return {
      dishName: req.dishNameOrQuery,
      grounded: false,
      citation: {
        planId: planDocId,
        planDate: planDocId,
        generatedAt: plan.generatedAt,
        dataSource: fetchedFromDb ? `restaurants/${req.restaurantId}/plans/${planDocId}` : 'Memory:ActivePlan',
      },
      factors: {
        plannedPortions: 0,
        p10: 0,
        p50: 0,
        p90: 0,
        serviceLevelPercent: 85,
        confidenceTier: 'unknown',
      },
      explanation,
      numberGuardPassed: true,
      refusalReason: `Dish "${req.dishNameOrQuery}" does not exist in the active plan.`,
    };
  }

  // 4. Tool: get_recent_sales (fetch recent sales history for this dish if DB available)
  let recentSalesCount = 0;
  let recentSalesAvg = matchedItem.p50;
  if (db) {
    try {
      const salesSnap = await db
        .collection(`restaurants/${req.restaurantId}/sales`)
        .limit(200)
        .get();
      const dishSales = salesSnap.docs
        .map((d: any) => d.data())
        .filter(
          (s: any) =>
            s.menuItemId === matchedItem.menuItemId ||
            (s.dishName && s.dishName.toLowerCase() === matchedItem.dishName.toLowerCase())
        );
      recentSalesCount = dishSales.length;
      if (dishSales.length > 0) {
        const sum = dishSales.reduce((acc: number, s: any) => acc + (Number(s.quantitySold) || 0), 0);
        recentSalesAvg = Math.round(sum / dishSales.length);
      }
      toolCalls.push({
        name: 'get_recent_sales',
        args: { dishName: matchedItem.dishName, menuItemId: matchedItem.menuItemId },
        result: { recentSalesCount, recentSalesAvg },
      });
    } catch {
      // Ignore sales fetch error
    }
  }

  // 5. Grounded Factors & Citation
  const slPercent = Math.round(matchedItem.serviceLevel * 100);
  const citation = {
    planId: `plan_${planDocId}`,
    planDate: planDocId,
    generatedAt: plan.generatedAt,
    dataSource: fetchedFromDb
      ? `restaurants/${req.restaurantId}/plans/${planDocId}`
      : `Session Plan (${planDocId})`,
    recentSalesCount,
    recentSalesAvg,
  };

  const factors = {
    plannedPortions: matchedItem.plannedPortions,
    p10: matchedItem.p10,
    p50: matchedItem.p50,
    p90: matchedItem.p90,
    serviceLevelPercent: slPercent,
    confidenceTier: matchedItem.confidence,
    weatherFactor: matchedItem.reason.includes('Rain') ? 'Rain adjustment' : 'Standard weather',
    eventFactor: matchedItem.reason || 'Historical same-day momentum',
    shelfLifeDays: matchedItem.shelfLifeDays,
    recentSalesCount,
    recentSalesAvg,
  };

  toolCalls.push({
    name: 'get_forecast_factors',
    args: { targetDate: planDocId, dishName: matchedItem.dishName },
    result: factors,
  });

  // 6. Code-template baseline explanation
  let templateExplanation = '';
  if (language === 'hi') {
    templateExplanation = `${matchedItem.dishName} के लिए ${matchedItem.plannedPortions} भाग तय किए गए हैं। आधार पूर्वानुमान p50=${matchedItem.p50} और p90=${matchedItem.p90} है${recentSalesCount > 0 ? ` (हालिया औसत बिक्री: ${recentSalesAvg})` : ''}, जो ${slPercent}% सर्विस लेवल (${matchedItem.serviceLevelLabel}) और ${matchedItem.confidence} विश्वास स्तर पर आधारित है। [संदर्भ: ${citation.dataSource}]`;
  } else if (language === 'te') {
    templateExplanation = `${matchedItem.dishName} కోసం ${matchedItem.plannedPortions} భాగాలు ప్లాన్ చేయబడ్డాయి. బేస్‌లైన్ p50=${matchedItem.p50} మరియు p90=${matchedItem.p90}${recentSalesCount > 0 ? ` (సగటు అమ్మకాలు: ${recentSalesAvg})` : ''}, ${slPercent}% సర్వీస్ లెవెల్ (${matchedItem.serviceLevelLabel}) మరియు ${matchedItem.confidence} నమ్మక స్థాయి ఆధారంగా లెక్కించబడింది. [ప్లాన్: ${citation.dataSource}]`;
  } else {
    templateExplanation = `${matchedItem.plannedPortions} portions of ${matchedItem.dishName} were planned for ${planDocId}. This is computed from a baseline median p50=${matchedItem.p50} up to p90=${matchedItem.p90}${recentSalesCount > 0 ? ` (recent sales avg: ${recentSalesAvg} over ${recentSalesCount} records)` : ''} at ${slPercent}% service level (${matchedItem.serviceLevelLabel}) with ${matchedItem.confidence} confidence. Citing plan run: ${citation.dataSource}.`;
  }

  // 7. Gemini enhancement if API key is present
  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;
  let finalExplanation = templateExplanation;
  let numberGuardPassed = true;
  let tokenUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };

  if (apiKey && process.env.NODE_ENV !== 'test') {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const { sanitizeUntrustedInput } = await import('../lib/guards.js');
      const safeQuery = sanitizeUntrustedInput(req.dishNameOrQuery, 1000, 'owner_query');
      const prompt = `You are the CraveCast Explainer Agent. The kitchen owner asked: ${safeQuery}.
Explain why ${matchedItem.plannedPortions} portions are planned for ${matchedItem.dishName} on ${planDocId}.

STRICT GROUNDING RULES:
1. Explicitly cite the plan source: "${citation.dataSource}".
2. You must ONLY use the verified numbers below. DO NOT invent or mention ANY other numeric values (no dates with numbers unless listed, no extra percentages):
   - Planned Portions: ${matchedItem.plannedPortions}
   - Median (p50): ${matchedItem.p50}
   - Upper (p90): ${matchedItem.p90}
   - Lower (p10): ${matchedItem.p10}
   - Recent Sales Average: ${recentSalesAvg}
   - Recent Sales Records: ${recentSalesCount}
   - Service Level: ${slPercent}% (${matchedItem.serviceLevelLabel})
   - Confidence: ${matchedItem.confidence}
   - Shelf Life Days: ${matchedItem.shelfLifeDays}
3. Language: Reply in ${language === 'hi' ? 'Hindi' : language === 'te' ? 'Telugu' : 'English'}.
4. Keep the explanation to 2 clear, grounded sentences.`;

      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: {
          temperature: 0.1,
        },
      });

      const candidateText = response.text?.trim() || '';
      tokenUsage = {
        promptTokens: (response as any).usageMetadata?.promptTokenCount || 0,
        candidateTokens: (response as any).usageMetadata?.candidatesTokenCount || 0,
        totalTokens: (response as any).usageMetadata?.totalTokenCount || 0,
      };

      if (req.restaurantId) {
        const { recordFeatureTokenUsage } = await import('../lib/llm.js');
        await recordFeatureTokenUsage(
          req.restaurantId,
          'ask_cravecast_explain',
          tokenUsage.promptTokens || Math.ceil(prompt.length / 4),
          tokenUsage.candidateTokens || 60,
          (response as any).usageMetadata?.cachedContentTokenCount || 0,
          MODEL_FAST,
          db
        );
      }

      // Extract date numbers from planDocId so citing the date doesn't trip Number Guard
      const dateNums = (planDocId.match(/\d+/g) || []).map(Number);

      // Apply Number Guard
      const allowedNumbers = [
        matchedItem.plannedPortions,
        matchedItem.p10,
        matchedItem.p50,
        matchedItem.p90,
        slPercent,
        matchedItem.shelfLifeDays,
        recentSalesCount,
        recentSalesAvg,
        10,
        50,
        90,
        0,
        ...dateNums,
      ];

      const guard = verifyNumberGuard(candidateText, allowedNumbers, 0.01, () => templateExplanation);
      if (guard.valid && candidateText) {
        finalExplanation = candidateText;
        numberGuardPassed = true;
      } else {
        // Hallucinated number detected -> fallback to code template
        console.warn('Number Guard rejected explainer output due to unauthorized number:', guard.rejectedSentences);
        finalExplanation = templateExplanation;
        numberGuardPassed = false;
      }
    } catch (err: any) {
      console.warn('Explainer LLM generation error, using code template:', err.message);
      finalExplanation = templateExplanation;
    }
  }

  await agentObservability.recordStep(
    {
      runId,
      restaurantId: req.restaurantId,
      agent: 'explainer',
      step: 'explain_dish_portions',
      input: req,
      output: {
        dishName: matchedItem.dishName,
        portions: matchedItem.plannedPortions,
        citation,
        numberGuardPassed,
        explanation: finalExplanation,
      },
      latencyMs: Date.now() - startTime,
      tokenCounts: tokenUsage,
      model: apiKey ? MODEL_FAST : 'code_explainer_template',
      toolCalls,
    },
    db
  );

  return {
    dishName: matchedItem.dishName,
    grounded: true,
    citation,
    factors,
    explanation: finalExplanation,
    numberGuardPassed,
  };
}
