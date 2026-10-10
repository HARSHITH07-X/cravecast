import { GoogleGenAI, Type } from '@google/genai';
import { MODEL_FAST, CONFIG } from '../config.js';
import { agentObservability } from '../lib/observability.js';
import { verifyNumberGuard } from '../lib/guards.js';
import type { FirestoreClient } from '../lib/firestoreRest.js';
import { executeDailyPlan, DailyPlanOutput } from '../planner.js';
import { executeForecastPipeline, buildFeatureDictionary } from '../forecast/engine.js';
import { executeRunForecast } from '../tools/run_forecast.js';
import { executeBuildPlan } from '../tools/build_plan.js';

export interface WhatIfOverrides {
  isRain?: boolean;
  precipitationChance?: number;
  additionalBookingCovers?: number;
  eventName?: string;
  demandMultiplier?: number;
  tempMax?: number;
  customNote?: string;
}

export interface WhatIfParseResult {
  scenarioTitle: string;
  overrides: WhatIfOverrides;
  requiresConfirmation: boolean;
  summaryInLanguage: string;
}

export interface DishDelta {
  menuItemId: string;
  dishName: string;
  baselinePortions: number;
  simulatedPortions: number;
  delta: number;
  deltaPercent: number;
}

export interface WhatIfSimulationResult {
  scenarioTitle: string;
  overridesApplied: WhatIfOverrides;
  baselineTotalPortions: number;
  simulatedTotalPortions: number;
  netPortionDelta: number;
  dishDeltas: DishDelta[];
  topIncreases: DishDelta[];
  topDecreases: DishDelta[];
  orderCostDelta: number;
  explanation: string;
}

/**
 * Parses user what-if queries (e.g. "what if it rains" or "we have a 40-person booking")
 * into structured overrides for owner confirmation.
 */
export async function parseWhatIfOverrides(
  message: string,
  language: 'en' | 'hi' | 'te' = 'en',
  restaurantId: string = 'rest_demo',
  runId: string = `run_${Date.now()}`,
  db?: FirestoreClient
): Promise<WhatIfParseResult> {
  const startTime = Date.now();
  const textLower = message.toLowerCase();

  // Deterministic baseline extraction
  let isRain: boolean | undefined = undefined;
  let covers: number | undefined = undefined;
  let tempMax: number | undefined = undefined;

  if (
    /rain|rainy|barish|varsham|raining|precipitation/i.test(textLower)
  ) {
    isRain = true;
  }

  // Covers / booking detection (e.g., "40-person booking", "50 people party", "30 covers")
  const coversMatch = textLower.match(/(\d+)\s*[- ]*(person|people|guest|guests|pax|cover|covers|mehman|log|mandi)/i);
  if (coversMatch) {
    covers = parseInt(coversMatch[1], 10);
  }

  // Temperature match (e.g., "42 degrees", "40C")
  const tempMatch = textLower.match(/(\d+)\s*(?:c|degrees|celsius|degree)/i);
  if (tempMatch) {
    tempMax = parseInt(tempMatch[1], 10);
  }

  // Default scenario title
  let scenarioTitle = 'Scenario Simulation';
  if (isRain && covers) {
    scenarioTitle = `Rain + ${covers}-Guest Booking`;
  } else if (isRain) {
    scenarioTitle = 'Heavy Rain / Monsoon Shift';
  } else if (covers) {
    scenarioTitle = `${covers}-Person Private Booking`;
  } else if (tempMax) {
    scenarioTitle = `High Heat (${tempMax}°C)`;
  }

  let summaryInLanguage = `Detected overrides: ${isRain ? 'Rain expected (100%), ' : ''}${covers ? `Booking +${covers} covers, ` : ''}${tempMax ? `Max Temp ${tempMax}°C` : ''}`.replace(/,\s*$/, '');
  if (language === 'hi') {
    summaryInLanguage = `पहचाने गए बदलाव: ${isRain ? 'बारिश (100%), ' : ''}${covers ? `बुकिंग +${covers} लोग, ` : ''}${tempMax ? `तापमान ${tempMax}°C` : ''}`.replace(/,\s*$/, '');
  } else if (language === 'te') {
    summaryInLanguage = `గుర్తించబడిన మార్పులు: ${isRain ? 'వర్షం (100%), ' : ''}${covers ? `బుకింగ్ +${covers} మంది, ` : ''}${tempMax ? `ఉష్ణోగ్రత ${tempMax}°C` : ''}`.replace(/,\s*$/, '');
  }

  const overrides: WhatIfOverrides = {
    isRain,
    precipitationChance: isRain ? 90 : undefined,
    additionalBookingCovers: covers,
    tempMax,
    customNote: message,
  };

  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;
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
      const safeMsg = sanitizeUntrustedInput(message, 1500, 'what_if_scenario');
      const prompt = `You are a culinary planner parsing a "what-if" kitchen scenario from a restaurant owner: ${safeMsg}.
Extract any conditional overrides:
- isRain: boolean
- additionalBookingCovers: integer count of extra guests/people booked (0 if none)
- tempMax: number in Celsius (0 if not mentioned)
- scenarioTitle: short English title (max 5 words)
- summaryInLanguage: short 1-sentence description in ${language === 'hi' ? 'Hindi' : language === 'te' ? 'Telugu' : 'English'}`;

      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isRain: { type: Type.BOOLEAN },
              additionalBookingCovers: { type: Type.INTEGER },
              tempMax: { type: Type.NUMBER },
              scenarioTitle: { type: Type.STRING },
              summaryInLanguage: { type: Type.STRING },
            },
            required: ['scenarioTitle', 'summaryInLanguage'],
          },
          temperature: 0.1,
        },
      });

      const usage = (response as any).usageMetadata || {};
      tokenUsage = {
        promptTokens: usage.promptTokenCount || 0,
        candidateTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      };

      if (restaurantId) {
        const { recordFeatureTokenUsage } = await import('../lib/llm.js');
        await recordFeatureTokenUsage(
          restaurantId,
          'ask_cravecast_what_if',
          tokenUsage.promptTokens || Math.ceil(prompt.length / 4),
          tokenUsage.candidateTokens || 50,
          usage.cachedContentTokenCount || 0,
          MODEL_FAST,
          db
        );
      }

      const parsed = JSON.parse(response.text?.trim() || '{}');
      if (parsed.scenarioTitle) scenarioTitle = parsed.scenarioTitle;
      if (parsed.isRain !== undefined) overrides.isRain = Boolean(parsed.isRain);
      if (parsed.additionalBookingCovers && parsed.additionalBookingCovers > 0) {
        overrides.additionalBookingCovers = Number(parsed.additionalBookingCovers);
      }
      if (parsed.tempMax && parsed.tempMax > 0) {
        overrides.tempMax = Number(parsed.tempMax);
      }
      if (parsed.summaryInLanguage) summaryInLanguage = parsed.summaryInLanguage;
    } catch (err: any) {
      console.warn('What-if LLM parse error, using deterministic extraction:', err.message);
    }
  }

  const result: WhatIfParseResult = {
    scenarioTitle,
    overrides,
    requiresConfirmation: true,
    summaryInLanguage,
  };

  await agentObservability.recordStep(
    {
      runId,
      restaurantId,
      agent: 'what_if',
      step: 'parse_overrides',
      input: { message, language },
      output: result,
      latencyMs: Date.now() - startTime,
      tokenCounts: tokenUsage,
      model: apiKey ? MODEL_FAST : 'code_parser',
    },
    db
  );

  return result;
}

/**
 * Re-runs the forecast and planner with the stated overrides and explains the delta.
 */
export async function simulateWhatIf(params: {
  restaurantId: string;
  targetDate: string;
  overrides: WhatIfOverrides;
  scenarioTitle?: string;
  language?: 'en' | 'hi' | 'te';
  runId?: string;
  db?: FirestoreClient;
}): Promise<WhatIfSimulationResult> {
  const startTime = Date.now();
  const runId = params.runId || `run_${Date.now()}`;
  const language = params.language || 'en';
  const toolCalls: Array<{ name: string; args: any; result?: any }> = [];

  // 1. Fetch baseline plan or run baseline forecast + planner
  let baselinePlan: DailyPlanOutput | null = null;
  if (params.db) {
    try {
      const planDoc = await params.db.collection(`restaurants/${params.restaurantId}/plans`).doc(params.targetDate).get();
      if (planDoc.exists) {
        baselinePlan = planDoc.data() as DailyPlanOutput;
      }
    } catch {}
  }

  if (!baselinePlan) {
    const baseForecastOut = await executeRunForecast(params.restaurantId, params.targetDate, params.db);
    const basePlanOut = await executeBuildPlan(
      params.restaurantId,
      params.targetDate,
      baseForecastOut.forecasts,
      params.db,
      { serviceLevelSlider: 0.85 }
    );
    baselinePlan = basePlanOut.plan;
  }

  toolCalls.push({
    name: 'get_baseline_plan',
    args: { targetDate: params.targetDate },
    result: {
      totalPlannedPortions: baselinePlan.summary.totalPlannedPortions,
      totalEstimatedOrderCost: baselinePlan.summary.totalEstimatedOrderCost,
      dishCount: baselinePlan.prepItems.length,
    },
  });

  // 2. Construct Override Weather & Events and Re-run Forecast & Planner
  const bookingCovers = params.overrides.additionalBookingCovers || 0;
  const isRain = params.overrides.isRain ?? false;
  const tempMax = params.overrides.tempMax ?? (isRain ? 24 : 32);

  const overrideWeather = [
    {
      date: params.targetDate,
      tempMin: Math.max(15, tempMax - 7),
      tempMax,
      precipitationMm: isRain ? 18.5 : 0,
      precipitationChance: isRain ? 90 : 10,
      condition: isRain ? 'Heavy Rain' : tempMax >= 38 ? 'Extreme Heat' : 'Clear',
    },
  ];

  const overrideEvents = bookingCovers > 0
    ? [
        {
          date: params.targetDate,
          name: params.overrides.eventName || `${bookingCovers}-Guest Booking`,
          eventName: params.overrides.eventName || `${bookingCovers}-Guest Booking`,
          type: 'local_event',
          expectedImpact: 'surge',
          impactMultiplier: 1 + Math.min(0.8, bookingCovers / 100),
        },
      ]
    : [];

  // Re-run forecast pipeline with overrides
  const simForecastOut = await executeRunForecast(params.restaurantId, params.targetDate, params.db, {
    weatherList: overrideWeather,
    eventsList: overrideEvents,
  });

  // Apply explicit weather/booking override lift onto forecast quantiles before running executeBuildPlan
  const adjustedForecasts = simForecastOut.forecasts.map((f) => {
    const baseItem = baselinePlan!.prepItems.find(
      (p) => p.menuItemId === f.menuItemId || p.dishName.toLowerCase() === f.dishName.toLowerCase()
    );
    const baseP50 = baseItem ? baseItem.p50 : f.p50;
    const baseP90 = baseItem ? baseItem.p90 : f.p90;

    let factor = 1.0;
    let extraPortions = 0;

    if (isRain) {
      const name = f.dishName.toLowerCase();
      if (name.includes('biryani') || name.includes('soup') || name.includes('curry') || name.includes('chai') || name.includes('masala') || name.includes('tikka')) {
        factor *= 1.15;
        extraPortions += 2;
      } else if (name.includes('ice') || name.includes('cold') || name.includes('salad') || name.includes('lassi')) {
        factor *= 0.85;
      } else {
        factor *= 1.05;
      }
    }

    if (params.overrides.tempMax && params.overrides.tempMax >= 38) {
      const name = f.dishName.toLowerCase();
      if (name.includes('lassi') || name.includes('cold') || name.includes('ice') || name.includes('salad')) {
        factor *= 1.25;
        extraPortions += 3;
      }
    }

    if (bookingCovers > 0) {
      const share =
        baselinePlan!.summary.totalPlannedPortions > 0 && baseItem
          ? baseItem.plannedPortions / baselinePlan!.summary.totalPlannedPortions
          : 1 / Math.max(1, simForecastOut.forecasts.length);
      extraPortions += Math.max(1, Math.round(bookingCovers * share * 1.15));
    }

    const newP50 = Math.max(0, Math.round(baseP50 * factor + extraPortions));
    const newP90 = Math.max(newP50, Math.round(baseP90 * factor + extraPortions * 1.15));
    const newP10 = Math.max(0, Math.round(f.p10 * factor + extraPortions * 0.7));

    return {
      ...f,
      p10: newP10,
      p50: newP50,
      p90: newP90,
      mean: newP50,
    };
  });

  // Re-run planner with the overridden forecasts
  const simPlanOut = await executeBuildPlan(
    params.restaurantId,
    params.targetDate,
    adjustedForecasts,
    params.db,
    { serviceLevelSlider: baselinePlan.serviceLevelSlider || 0.85 },
    {
      weatherList: overrideWeather,
      eventsList: overrideEvents,
    }
  );

  const simulatedPlan = simPlanOut.plan;

  toolCalls.push({
    name: 'rerun_forecast_and_planner',
    args: { targetDate: params.targetDate, overrides: params.overrides },
    result: {
      simulatedTotalPortions: simulatedPlan.summary.totalPlannedPortions,
      simulatedOrderCost: simulatedPlan.summary.totalEstimatedOrderCost,
    },
  });

  // 3. Compute dish-by-dish and order-cost delta between baselinePlan and simulatedPlan
  const dishDeltas: DishDelta[] = [];
  let simulatedTotal = 0;
  let baselineTotal = 0;

  for (const baseItem of baselinePlan.prepItems) {
    const basePortions = baseItem.plannedPortions;
    baselineTotal += basePortions;

    const simItem = simulatedPlan.prepItems.find(
      (s) => s.menuItemId === baseItem.menuItemId || s.dishName.toLowerCase() === baseItem.dishName.toLowerCase()
    );
    const simPortions = simItem ? simItem.plannedPortions : basePortions;
    simulatedTotal += simPortions;

    dishDeltas.push({
      menuItemId: baseItem.menuItemId,
      dishName: baseItem.dishName,
      baselinePortions: basePortions,
      simulatedPortions: simPortions,
      delta: simPortions - basePortions,
      deltaPercent: basePortions > 0 ? Math.round(((simPortions - basePortions) / basePortions) * 100) : 0,
    });
  }

  dishDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const topIncreases = dishDeltas.filter((d) => d.delta > 0).slice(0, 5);
  const topDecreases = dishDeltas.filter((d) => d.delta < 0).slice(0, 5);

  const netPortionDelta = simulatedTotal - baselineTotal;
  const rawOrderCostDelta =
    simulatedPlan.summary.totalEstimatedOrderCost - baselinePlan.summary.totalEstimatedOrderCost;
  const orderCostDelta = rawOrderCostDelta !== 0 ? Math.round(rawOrderCostDelta) : Math.round(netPortionDelta * 45);

  // 4. Generate code-calculated baseline explanation & optional LLM explanation guarded by Number Guard
  let templateExplanation = '';
  const topIncText = topIncreases.map((d) => `${d.dishName} (+${d.delta})`).join(', ');
  const topDecText = topDecreases.map((d) => `${d.dishName} (${d.delta})`).join(', ');

  if (language === 'hi') {
    templateExplanation = `सिमुलेशन के अनुसार कुल भाग ${baselineTotal} से बदलकर ${simulatedTotal} (अंतर: ${netPortionDelta > 0 ? '+' : ''}${netPortionDelta}) हो जाएंगे। प्रमुख वृद्धि: ${topIncText || 'कोई नहीं'}। ${topDecreases.length > 0 ? `कमी: ${topDecText}।` : ''} अनुमानित सामग्री लागत में ₹${orderCostDelta} का बदलाव।`;
  } else if (language === 'te') {
    templateExplanation = `సిమ్యులేషన్ ప్రకారం మొత్తం భాగాలు ${baselineTotal} నుండి ${simulatedTotal} కి మారుతాయి (తేడా: ${netPortionDelta > 0 ? '+' : ''}${netPortionDelta}). ప్రధాన పెరుగుదల: ${topIncText || 'ఏదీ లేదు'}. ${topDecreases.length > 0 ? `తగ్గుదల: ${topDecText}.` : ''} ఆర్డర్ ఖర్చు వ్యత్యాసం: ₹${orderCostDelta}.`;
  } else {
    templateExplanation = `Simulating "${params.scenarioTitle || 'Scenario'}" changes planned portions from ${baselineTotal} to ${simulatedTotal} (net ${netPortionDelta > 0 ? '+' : ''}${netPortionDelta} portions). Key increases: ${topIncText || 'None'}.${topDecreases.length > 0 ? ` Decreases: ${topDecText}.` : ''} Estimated order cost shift: ₹${orderCostDelta}.`;
  }

  let finalExplanation = templateExplanation;
  let tokenUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;

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
      const allowedNumbers = [
        baselineTotal,
        simulatedTotal,
        Math.abs(netPortionDelta),
        netPortionDelta,
        Math.abs(orderCostDelta),
        orderCostDelta,
        bookingCovers,
        tempMax,
        0,
        ...dishDeltas.flatMap((d) => [d.baselinePortions, d.simulatedPortions, Math.abs(d.delta), Math.abs(d.deltaPercent)]),
      ];

      const prompt = `You are the CraveCast What-If Simulation Agent.
Explain the computed delta when re-running the forecast and planner for "${params.scenarioTitle || 'Scenario'}":
- Baseline total portions: ${baselineTotal}
- Simulated total portions: ${simulatedTotal} (net delta: ${netPortionDelta > 0 ? '+' : ''}${netPortionDelta})
- Top increases: ${topIncText || 'None'}
- Top decreases: ${topDecText || 'None'}
- Order cost delta: ₹${orderCostDelta}

Rules:
1. ONLY use the exact numbers provided above. Do not invent any numbers.
2. Reply in ${language === 'hi' ? 'Hindi' : language === 'te' ? 'Telugu' : 'English'} in 2 concise sentences.`;

      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: { temperature: 0.1 },
      });

      const usage = (response as any).usageMetadata || {};
      tokenUsage = {
        promptTokens: usage.promptTokenCount || 0,
        candidateTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      };

      const candidate = response.text?.trim() || '';
      const guard = verifyNumberGuard(candidate, allowedNumbers, 0.01, () => templateExplanation);
      if (guard.valid && candidate) {
        finalExplanation = candidate;
      }
    } catch {
      finalExplanation = templateExplanation;
    }
  }

  const result: WhatIfSimulationResult = {
    scenarioTitle: params.scenarioTitle || 'What-If Simulation',
    overridesApplied: params.overrides,
    baselineTotalPortions: baselineTotal,
    simulatedTotalPortions: simulatedTotal,
    netPortionDelta,
    dishDeltas,
    topIncreases,
    topDecreases,
    orderCostDelta,
    explanation: finalExplanation,
  };

  await agentObservability.recordStep(
    {
      runId,
      restaurantId: params.restaurantId,
      agent: 'what_if',
      step: 'run_simulation',
      input: { targetDate: params.targetDate, overrides: params.overrides },
      output: {
        baselineTotal,
        simulatedTotal,
        netDelta: netPortionDelta,
        orderCostDelta,
        topIncreases: topIncreases.map((d) => `${d.dishName}: +${d.delta}`),
      },
      latencyMs: Date.now() - startTime,
      tokenCounts: tokenUsage,
      model: apiKey ? MODEL_FAST : 'code_simulation_engine',
      toolCalls,
    },
    params.db
  );

  return result;
}
