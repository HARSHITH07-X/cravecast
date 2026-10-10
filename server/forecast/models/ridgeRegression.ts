import { Forecaster, SeriesPoint, DayFeatures } from '../types.js';
import { solveRidgeRegression, estimateUncensoredLevel, mean } from '../math.js';

export interface RidgeRegressionModel {
  weights: number[]; // Learned regression weights
  dishIndexMap: Record<string, number>; // dishId -> column index for intercept
  featureCount: number;
  fallbackLevel: number;
  featureNames: string[];
}

export interface DishSeriesBundle {
  dishId: string;
  series: SeriesPoint[];
}

/**
 * Encodes DayFeatures into numeric feature vector.
 * Features:
 * - 7 weekday indicators (0=Sun, 1=Mon, ..., 6=Sat)
 * - Rain (0 or 1)
 * - Temp buckets: Cold, Mild, Warm, Hot (one-hot)
 * - Holiday / Event flag (0 or 1)
 * - First week of month (0 or 1)
 * - Recent 7-day uncensored level (normalized)
 */
export function encodeFeatures(
  features: DayFeatures,
  dishInterceptsTotal: number,
  dishColIdx: number
): number[] {
  const vec: number[] = new Array(dishInterceptsTotal + 7 + 1 + 4 + 1 + 1 + 1).fill(0);

  // Per-dish intercept
  if (dishColIdx >= 0 && dishColIdx < dishInterceptsTotal) {
    vec[dishColIdx] = 1.0;
  }

  let offset = dishInterceptsTotal;

  // 1. Weekday indicators (0..6)
  if (features.dayOfWeek >= 0 && features.dayOfWeek <= 6) {
    vec[offset + features.dayOfWeek] = 1.0;
  }
  offset += 7;

  // 2. Rain flag
  vec[offset] = features.isRain ? 1.0 : 0.0;
  offset += 1;

  // 3. Temp bucket (cold, mild, warm, hot)
  if (features.tempBucket === 'cold') vec[offset] = 1.0;
  else if (features.tempBucket === 'mild') vec[offset + 1] = 1.0;
  else if (features.tempBucket === 'warm') vec[offset + 2] = 1.0;
  else if (features.tempBucket === 'hot') vec[offset + 3] = 1.0;
  offset += 4;

  // 4. Holiday / Event flag
  vec[offset] = features.isHolidayOrEvent ? 1.0 : 0.0;
  offset += 1;

  // 5. First week of month flag
  vec[offset] = features.isFirstWeekOfMonth ? 1.0 : 0.0;
  offset += 1;

  // 6. Recent level
  vec[offset] = (features.recentLevel ?? 10) / 10.0; // scale factor
  offset += 1;

  return vec;
}

/**
 * Ridge Regression Forecaster across dishes with per-dish intercepts (partial pooling).
 */
export const ridgeForecaster: Forecaster<RidgeRegressionModel> = {
  name: 'ridge_regression',

  fit(series: SeriesPoint[], features: DayFeatures[]): RidgeRegressionModel {
    // Single dish fitting fallback
    return fitPooledRidge([{ dishId: 'default', series }], features);
  },

  predict(model: RidgeRegressionModel, targetDate: string, features: DayFeatures): number {
    const dishIdx = model.dishIndexMap['default'] ?? 0;
    const x = encodeFeatures(features, Math.max(1, Object.keys(model.dishIndexMap).length), dishIdx);

    if (x.length !== model.weights.length) {
      return model.fallbackLevel;
    }

    let pred = 0;
    for (let i = 0; i < x.length; i++) {
      pred += x[i] * (model.weights[i] || 0);
    }

    return Math.max(0, isNaN(pred) ? model.fallbackLevel : pred);
  },
};

/**
 * Fits Ridge regression across all dishes simultaneously with per-dish intercepts
 * (partial pooling / shrinkage) so thin dishes borrow strength from higher-volume dishes.
 */
export function fitPooledRidge(
  dishBundles: DishSeriesBundle[],
  allFeatures: DayFeatures[],
  lambda = 2.0
): RidgeRegressionModel {
  const dishIndexMap: Record<string, number> = {};
  dishBundles.forEach((b, idx) => {
    dishIndexMap[b.dishId] = idx;
  });

  const numDishes = Math.max(1, dishBundles.length);
  const featureMapByDate = new Map<string, DayFeatures>();
  for (const f of allFeatures) {
    featureMapByDate.set(f.date, f);
  }

  const X: number[][] = [];
  const y: number[] = [];
  const allLevels: number[] = [];

  for (const bundle of dishBundles) {
    const dishIdx = dishIndexMap[bundle.dishId] ?? 0;
    const sorted = [...bundle.series]
      .filter((p) => !p.isClosed)
      .sort((a, b) => a.date.localeCompare(b.date));

    const dishLevel = estimateUncensoredLevel(sorted);
    allLevels.push(dishLevel);

    for (let i = 0; i < sorted.length; i++) {
      const pt = sorted[i];
      let feat = featureMapByDate.get(pt.date);
      if (!feat) {
        const d = new Date(pt.date + 'T00:00:00Z');
        feat = {
          date: pt.date,
          dayOfWeek: d.getUTCDay(),
          isRain: false,
          tempBucket: 'mild',
          isHolidayOrEvent: false,
          isFirstWeekOfMonth: d.getUTCDate() <= 7,
          recentLevel: dishLevel,
        };
      } else {
        // compute rolling 7-day uncensored level up to this point
        const windowStart = Math.max(0, i - 7);
        const windowPts = sorted.slice(windowStart, i);
        const rolling = windowPts.length > 0 ? mean(windowPts.map((p) => p.quantitySold)) : dishLevel;
        feat = { ...feat, recentLevel: rolling };
      }

      const xRow = encodeFeatures(feat, numDishes, dishIdx);
      // Sold out days act as lower bound; we include them as lower bounds
      X.push(xRow);
      y.push(pt.quantitySold);
    }
  }

  const fallbackLevel = allLevels.length > 0 ? mean(allLevels) : 10;

  if (X.length === 0) {
    return {
      weights: [],
      dishIndexMap,
      featureCount: 0,
      fallbackLevel,
      featureNames: [],
    };
  }

  const weights = solveRidgeRegression(X, y, lambda);

  return {
    weights,
    dishIndexMap,
    featureCount: X[0].length,
    fallbackLevel,
    featureNames: [
      ...dishBundles.map((d) => `intercept_${d.dishId}`),
      'dow_sun',
      'dow_mon',
      'dow_tue',
      'dow_wed',
      'dow_thu',
      'dow_fri',
      'dow_sat',
      'rain',
      'temp_cold',
      'temp_mild',
      'temp_warm',
      'temp_hot',
      'holiday_event',
      'first_week_month',
      'recent_level',
    ],
  };
}

/**
 * Predict using pooled Ridge model for a specific dish
 */
export function predictPooledRidge(
  model: RidgeRegressionModel,
  dishId: string,
  features: DayFeatures
): number {
  const dishIdx = model.dishIndexMap[dishId] ?? 0;
  const numDishes = Math.max(1, Object.keys(model.dishIndexMap).length);
  const x = encodeFeatures(features, numDishes, dishIdx);

  if (x.length !== model.weights.length) {
    return model.fallbackLevel;
  }

  let pred = 0;
  for (let i = 0; i < x.length; i++) {
    pred += x[i] * (model.weights[i] || 0);
  }

  return Math.max(0, isNaN(pred) ? model.fallbackLevel : pred);
}
