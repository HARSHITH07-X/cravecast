import { FunctionDeclaration, Type } from '@google/genai';
import type { FirestoreClient } from '../lib/firestoreRest.js';
import { executeForecastPipeline } from '../forecast/engine.js';
import { ForecastResult } from '../forecast/types.js';
import { DishBiasAdjustment, FeedbackObservation } from '../forecast/learningLoop.js';

export interface ForecastToolOutput {
  targetDate: string;
  forecasts: ForecastResult[];
  learningLoop?: {
    adjustmentsByDishId: Record<string, DishBiasAdjustment>;
    deltaMap: Record<string, number>;
  };
  summary: {
    dishCount: number;
    totalExpectedP50: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
  };
}

export const runForecastToolDeclaration: FunctionDeclaration = {
  name: 'run_forecast',
  description: 'Executes the multi-model demand forecasting engine (Seasonal Naive, Weighted Weekday, Holt-Winters, Ridge Regression ensemble with conformal prediction intervals and 4-week learning loop).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      restaurantId: {
        type: Type.STRING,
        description: 'The unique restaurant ID.',
      },
      targetDate: {
        type: Type.STRING,
        description: 'Target calendar date in YYYY-MM-DD format.',
      },
    },
    required: ['restaurantId', 'targetDate'],
  },
};

/**
 * Runs the demand forecasting pipeline for all menu items and caches the result.
 * Zero fake data: if no DB or no sales history exists, returns empty forecasts.
 */
export async function executeRunForecast(
  restaurantId: string,
  targetDate: string,
  db?: FirestoreClient,
  contextData?: {
    weatherList?: any[];
    eventsList?: any[];
    feedbackRecords?: FeedbackObservation[];
    testForecasts?: ForecastResult[];
  }
): Promise<ForecastToolOutput> {
  if (!db) {
    const injectedForecasts = contextData?.testForecasts || [];
    const totalExpectedP50 = injectedForecasts.reduce((acc, f) => acc + f.p50, 0);
    return {
      targetDate,
      forecasts: injectedForecasts,
      summary: {
        dishCount: injectedForecasts.length,
        totalExpectedP50: Math.round(totalExpectedP50),
        highConfidenceCount: injectedForecasts.filter((f) => f.confidence === 'High').length,
        mediumConfidenceCount: injectedForecasts.filter((f) => f.confidence === 'Medium').length,
        lowConfidenceCount: injectedForecasts.filter((f) => f.confidence === 'Low').length,
      },
    };
  }

  // 1. Fetch menu items
  const menuSnap = await db
    .collection(`restaurants/${restaurantId}/menu_items`)
    .limit(100)
    .get();
  const menuItems = menuSnap.docs
    .map((d: any) => ({
      id: d.id,
      name: d.data().name || 'Menu Item',
      category: d.data().category || 'Mains',
      embedding: d.data().embedding,
      isActive: d.data().isActive !== false,
    }))
    .filter((m) => m.isActive);

  // 2. Fetch sales history
  const salesSnap = await db
    .collection(`restaurants/${restaurantId}/sales`)
    .limit(1000)
    .get();
  const salesRecords = salesSnap.docs.map((d: any) => {
    const data = d.data();
    return {
      date: data.date,
      dishName: data.dishName,
      menuItemId: data.menuItemId,
      quantitySold: Number(data.quantitySold) || 0,
      soldOut: Boolean(data.soldOut),
      isClosed: Boolean(data.isClosed),
    };
  });

  // 3. Weather & Events
  let weatherList = contextData?.weatherList;
  if (!weatherList) {
    const wSnap = await db.collection(`restaurants/${restaurantId}/weather_cache`).limit(200).get();
    weatherList = wSnap.docs.map((d: any) => d.data());
  }

  let eventsList = contextData?.eventsList;
  if (!eventsList) {
    const eSnap = await db.collection(`restaurants/${restaurantId}/events`).limit(100).get();
    eventsList = eSnap.docs.map((d: any) => d.data());
  }

  // 4. Fetch 4-week feedback records for learning loop
  let feedbackRecords = contextData?.feedbackRecords;
  if (!feedbackRecords) {
    try {
      const fbSnap = await db.collection(`restaurants/${restaurantId}/feedback`).limit(200).get();
      feedbackRecords = fbSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as FeedbackObservation[];
    } catch {
      feedbackRecords = [];
    }
  }

  // 5. Execute forecast engine
  const pipelineResult = executeForecastPipeline({
    salesRecords,
    menuItems,
    weatherList,
    eventsList,
    feedbackRecords,
    targetDate,
  });

  const forecasts = pipelineResult.forecasts;

  // 6. Cache forecasts in Firestore
  try {
    const docRef = db.collection(`restaurants/${restaurantId}/forecasts`).doc(targetDate);
    await docRef.set(
      {
        targetDate,
        restaurantId,
        dishForecasts: forecasts,
        learningLoop: pipelineResult.learningLoop,
        computedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`[run_forecast] Could not cache forecast in DB:`, err);
  }

  let totalP50 = 0;
  let highConf = 0;
  let medConf = 0;
  let lowConf = 0;

  for (const fc of forecasts) {
    totalP50 += fc.p50;
    if (fc.confidence === 'High') highConf++;
    else if (fc.confidence === 'Medium') medConf++;
    else lowConf++;
  }

  return {
    targetDate,
    forecasts,
    learningLoop: pipelineResult.learningLoop,
    summary: {
      dishCount: forecasts.length,
      totalExpectedP50: Math.round(totalP50),
      highConfidenceCount: highConf,
      mediumConfidenceCount: medConf,
      lowConfidenceCount: lowConf,
    },
  };
}
