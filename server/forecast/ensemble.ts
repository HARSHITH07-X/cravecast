import {
  SeriesPoint,
  DayFeatures,
  ConfidenceTier,
  FactorContributions,
  ForecastResult,
} from './types.js';
import { seasonalNaiveForecaster } from './models/seasonalNaive.js';
import { weightedWeekdayForecaster } from './models/weightedWeekday.js';
import { holtWintersForecaster } from './models/holtWinters.js';
import { ridgeForecaster, fitPooledRidge, predictPooledRidge, DishSeriesBundle } from './models/ridgeRegression.js';
import { buildConformalCalibrator, computeConformalInterval, ConformalResidualPoint } from './conformal.js';
import { estimateUncensoredLevel, mean } from './math.js';

export interface DishForecastContext {
  menuItemId: string;
  dishName: string;
  category: string;
  embedding?: number[];
  series: SeriesPoint[];
}

/**
 * Evaluates models on rolling-origin historical predictions to compute inverse-error weights
 */
export function computeModelWeights(
  series: SeriesPoint[],
  features: DayFeatures[],
  minDays = 14
): Record<string, number> {
  const sorted = [...series].filter((p) => !p.isClosed).sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < minDays) {
    return {
      seasonal_naive: 0.5,
      weighted_weekday: 0.5,
      holt_winters: 0,
      ridge_regression: 0,
    };
  }

  // Use up to the last 21 days for rolling-origin error calculation
  const evalWindow = Math.min(21, Math.floor(sorted.length / 2));
  const errors: Record<string, number> = {
    seasonal_naive: 0,
    weighted_weekday: 0,
    holt_winters: 0,
    ridge_regression: 0,
  };
  let count = 0;

  for (let offset = evalWindow; offset >= 1; offset--) {
    const cutIdx = sorted.length - offset;
    const trainSub = sorted.slice(0, cutIdx);
    const testPoint = sorted[cutIdx];
    const featPoint = features.find((f) => f.date === testPoint.date) || {
      date: testPoint.date,
      dayOfWeek: new Date(testPoint.date + 'T00:00:00Z').getUTCDay(),
      isRain: false,
      tempBucket: 'mild',
      isHolidayOrEvent: false,
      isFirstWeekOfMonth: false,
      recentLevel: estimateUncensoredLevel(trainSub),
    };

    if (trainSub.length < 7) continue;

    const mNaive = seasonalNaiveForecaster.fit(trainSub, features);
    const pNaive = seasonalNaiveForecaster.predict(mNaive, testPoint.date, featPoint);

    const mWeighted = weightedWeekdayForecaster.fit(trainSub, features);
    const pWeighted = weightedWeekdayForecaster.predict(mWeighted, testPoint.date, featPoint);

    const mHw = holtWintersForecaster.fit(trainSub, features);
    const pHw = holtWintersForecaster.predict(mHw, testPoint.date, featPoint);

    const mRidge = ridgeForecaster.fit(trainSub, features);
    const pRidge = ridgeForecaster.predict(mRidge, testPoint.date, featPoint);

    const actual = testPoint.quantitySold;
    errors.seasonal_naive += Math.abs(actual - pNaive);
    errors.weighted_weekday += Math.abs(actual - pWeighted);
    errors.holt_winters += Math.abs(actual - pHw);
    errors.ridge_regression += Math.abs(actual - pRidge);
    count++;
  }

  if (count === 0) {
    return {
      seasonal_naive: 0.25,
      weighted_weekday: 0.25,
      holt_winters: 0.25,
      ridge_regression: 0.25,
    };
  }

  // Inverse MAE weights
  const epsilon = 0.5;
  const invNaive = 1.0 / (errors.seasonal_naive / count + epsilon);
  const invWeighted = 1.0 / (errors.weighted_weekday / count + epsilon);
  const invHw = 1.0 / (errors.holt_winters / count + epsilon);
  const invRidge = 1.0 / (errors.ridge_regression / count + epsilon);

  const sum = invNaive + invWeighted + invHw + invRidge;

  return {
    seasonal_naive: Math.round((invNaive / sum) * 1000) / 1000,
    weighted_weekday: Math.round((invWeighted / sum) * 1000) / 1000,
    holt_winters: Math.round((invHw / sum) * 1000) / 1000,
    ridge_regression: Math.round((invRidge / sum) * 1000) / 1000,
  };
}

/**
 * Predict next-day demand with calibrated range and factor contributions
 */
export function generateDishForecast(
  targetDish: DishForecastContext,
  allDishes: DishForecastContext[],
  targetDate: string,
  targetFeatures: DayFeatures,
  allFeatures: DayFeatures[]
): ForecastResult {
  const sorted = [...targetDish.series]
    .filter((p) => !p.isClosed && p.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const daysOfHistory = sorted.length;
  let confidence: ConfidenceTier = 'High';
  let confidenceReason = '';

  const baselineLevel = estimateUncensoredLevel(sorted);
  const naiveModel = seasonalNaiveForecaster.fit(sorted, allFeatures);
  const baselineSeasonalNaive = seasonalNaiveForecaster.predict(naiveModel, targetDate, targetFeatures);

  let pointForecast = 0;
  let modelWeights: Record<string, number> = {};

  // ==========================================
  // Cold Start Tiering
  // ==========================================
  if (daysOfHistory < 14) {
    // 1. Under 14 days: Cold Start tier
    confidence = 'Low';
    confidenceReason = `Dish has ${daysOfHistory} days of history (<14 days). Borrowing pattern from category peers.`;

    // Borrow average pattern from nearest dishes (same category)
    const categoryPeers = allDishes.filter(
      (d) => d.menuItemId !== targetDish.menuItemId && d.category === targetDish.category && d.series.length >= 14
    );

    const peerPool = categoryPeers.length > 0 ? categoryPeers : allDishes.filter((d) => d.series.length >= 14);

    if (peerPool.length > 0) {
      // Compute peer weekday ratios
      let sumPeerRatio = 0;
      let validPeers = 0;

      for (const peer of peerPool) {
        const peerSorted = peer.series.filter((p) => !p.isClosed);
        const peerLevel = estimateUncensoredLevel(peerSorted);
        if (peerLevel > 0) {
          const peerDowPoints = peerSorted.filter(
            (p) => new Date(p.date + 'T00:00:00Z').getUTCDay() === targetFeatures.dayOfWeek
          );
          if (peerDowPoints.length > 0) {
            const peerDowMean = mean(peerDowPoints.map((p) => p.quantitySold));
            sumPeerRatio += peerDowMean / peerLevel;
            validPeers++;
          }
        }
      }

      const categoryWeekdayRatio = validPeers > 0 ? sumPeerRatio / validPeers : 1.0;
      pointForecast = baselineLevel * categoryWeekdayRatio;
    } else {
      pointForecast = baselineLevel > 0 ? baselineLevel : 10;
    }

    modelWeights = { cold_start_category_borrowing: 1.0 };
  } else if (daysOfHistory < 56) {
    // 2. 14 to 55 days: Medium confidence (models a and b only)
    confidence = 'Medium';
    confidenceReason = `Dish has ${daysOfHistory} days of history (14-55 days). Using Seasonal Naive and Weighted Weekday models.`;

    const weightedModel = weightedWeekdayForecaster.fit(sorted, allFeatures);
    const predA = seasonalNaiveForecaster.predict(naiveModel, targetDate, targetFeatures);
    const predB = weightedWeekdayForecaster.predict(weightedModel, targetDate, targetFeatures);

    modelWeights = {
      seasonal_naive: 0.45,
      weighted_weekday: 0.55,
      holt_winters: 0,
      ridge_regression: 0,
    };
    pointForecast = modelWeights.seasonal_naive * predA + modelWeights.weighted_weekday * predB;
  } else {
    // 3. 56+ days: High confidence (full ensemble a, b, c, d)
    confidence = 'High';
    confidenceReason = `Dish has ${daysOfHistory} days of history (56+ days). Full 4-model ensemble active.`;

    modelWeights = computeModelWeights(sorted, allFeatures, 14);

    const weightedModel = weightedWeekdayForecaster.fit(sorted, allFeatures);
    const hwModel = holtWintersForecaster.fit(sorted, allFeatures);

    // Multi-dish pooled Ridge
    const bundles: DishSeriesBundle[] = allDishes.map((d) => ({
      dishId: d.menuItemId,
      series: d.series.filter((p) => p.date < targetDate),
    }));
    const pooledRidge = fitPooledRidge(bundles, allFeatures, 2.0);

    const predA = seasonalNaiveForecaster.predict(naiveModel, targetDate, targetFeatures);
    const predB = weightedWeekdayForecaster.predict(weightedModel, targetDate, targetFeatures);
    const predC = holtWintersForecaster.predict(hwModel, targetDate, targetFeatures);
    const predD = predictPooledRidge(pooledRidge, targetDish.menuItemId, targetFeatures);

    pointForecast =
      (modelWeights.seasonal_naive || 0) * predA +
      (modelWeights.weighted_weekday || 0) * predB +
      (modelWeights.holt_winters || 0) * predC +
      (modelWeights.ridge_regression || 0) * predD;
  }

  // ==========================================
  // Conformal Intervals (p10, p50, p90)
  // ==========================================
  const residualPoints: ConformalResidualPoint[] = [];
  const evalHistory = sorted.slice(-Math.min(35, sorted.length));
  for (let i = 7; i < evalHistory.length; i++) {
    const pt = evalHistory[i];
    const prevSub = evalHistory.slice(0, i);
    const prevNaive = seasonalNaiveForecaster.fit(prevSub, allFeatures);
    const prevPred = seasonalNaiveForecaster.predict(prevNaive, pt.date, targetFeatures);
    residualPoints.push({
      date: pt.date,
      dayOfWeek: new Date(pt.date + 'T00:00:00Z').getUTCDay(),
      actual: pt.quantitySold,
      predicted: prevPred,
      residual: pt.quantitySold - prevPred,
      soldOut: pt.soldOut,
    });
  }

  const calibrator = buildConformalCalibrator(residualPoints);
  const interval = computeConformalInterval(calibrator, pointForecast, targetFeatures.dayOfWeek);

  // ==========================================
  // Explainability Factor Contributions
  // ==========================================
  const baseLevel = Math.round(baselineLevel * 10) / 10;
  const weekdayEffect = Math.round((baselineSeasonalNaive - baselineLevel) * 10) / 10;

  // Trend effect estimated from recent 7-day vs 28-day slope
  const recent7 = sorted.slice(-7);
  const prior21 = sorted.slice(-28, -7);
  const recent7Mean = recent7.length > 0 ? mean(recent7.map((p) => p.quantitySold)) : baselineLevel;
  const prior21Mean = prior21.length > 0 ? mean(prior21.map((p) => p.quantitySold)) : baselineLevel;
  const trendEffect = Math.round((recent7Mean - prior21Mean) * 0.4 * 10) / 10;

  // Weather effect
  let weatherEffect = 0;
  if (targetFeatures.isRain) weatherEffect -= Math.round(baseLevel * 0.08 * 10) / 10;
  if (targetFeatures.tempBucket === 'hot') weatherEffect -= Math.round(baseLevel * 0.05 * 10) / 10;
  if (targetFeatures.tempBucket === 'cold') weatherEffect += Math.round(baseLevel * 0.04 * 10) / 10;

  // Event effect
  const eventEffect = targetFeatures.isHolidayOrEvent ? Math.round(baseLevel * 0.18 * 10) / 10 : 0;

  const factorContributions: FactorContributions = {
    baseLevel,
    weekdayEffect,
    trendEffect,
    weatherEffect,
    eventEffect,
  };

  return {
    menuItemId: targetDish.menuItemId,
    dishName: targetDish.dishName,
    category: targetDish.category,
    targetDate,
    p10: interval.p10,
    p50: interval.p50,
    p90: interval.p90,
    confidence,
    confidenceReason,
    modelWeights,
    factorContributions,
    baselineSeasonalNaive: Math.round(baselineSeasonalNaive * 10) / 10,
    daysOfHistory,
  };
}
