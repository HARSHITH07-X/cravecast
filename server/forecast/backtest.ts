import { BacktestSummary, DishBacktestMetrics, DayFeatures } from './types.js';
import { DishForecastContext, generateDishForecast } from './ensemble.js';
import { seasonalNaiveForecaster } from './models/seasonalNaive.js';

/**
 * Runs walk-forward backtest over the last 28 days using only earlier data.
 * Requires at least 84 days of history (56 training + 28 test).
 * Otherwise returns exact days needed.
 */
export function runWalkForwardBacktest(
  dishes: DishForecastContext[],
  features: DayFeatures[]
): BacktestSummary {
  // Collect all distinct dates across dishes
  const dateSet = new Set<string>();
  for (const d of dishes) {
    for (const p of d.series) {
      if (!p.isClosed) dateSet.add(p.date);
    }
  }

  const allDates = Array.from(dateSet).sort();
  const totalDays = allDates.length;

  if (totalDays < 84) {
    const needed = 84 - totalDays;
    return {
      eligible: false,
      totalDaysAvailable: totalDays,
      daysNeeded: needed,
      message: `Not enough history yet: add ${needed} more days`,
      testWindowDays: 28,
      overallWape: 0,
      overallMase: 0,
      overallBias: 0,
      overallIntervalCoverage: 0,
      overallStockoutRate: 0,
      overallErrorReductionPercent: 0,
      dishes: [],
      dailyComparisons: [],
    };
  }

  // Last 28 days are the test window
  const testDates = allDates.slice(-28);
  const dailyComparisons: BacktestSummary['dailyComparisons'] = [];
  const dishMetricsList: DishBacktestMetrics[] = [];

  let grandSumActual = 0;
  let grandSumAbsErrorEnsemble = 0;
  let grandSumAbsErrorNaive = 0;
  let grandSumSignedBias = 0;
  let grandCoveredCount = 0;
  let grandStockoutCount = 0;
  let grandTotalEvaluations = 0;

  for (const dish of dishes) {
    let dishSumActual = 0;
    let dishSumAbsErrorEnsemble = 0;
    let dishSumAbsErrorNaive = 0;
    let dishSumSignedBias = 0;
    let dishCoveredCount = 0;
    let dishStockoutCount = 0;
    let dishTestCount = 0;

    for (const testDate of testDates) {
      // Find actual observation for this dish on testDate
      const actualPt = dish.series.find((p) => p.date === testDate && !p.isClosed);
      if (!actualPt) continue;

      // Ensure target day features exist
      let targetFeat = features.find((f) => f.date === testDate);
      if (!targetFeat) {
        const dObj = new Date(testDate + 'T00:00:00Z');
        targetFeat = {
          date: testDate,
          dayOfWeek: dObj.getUTCDay(),
          isRain: false,
          tempBucket: 'mild',
          isHolidayOrEvent: false,
          isFirstWeekOfMonth: dObj.getUTCDate() <= 7,
        };
      }

      // 1. Forecast using ONLY earlier data (< testDate)
      const forecast = generateDishForecast(dish, dishes, testDate, targetFeat, features);

      // 2. Baseline Seasonal Naive
      const trainSeriesOnly = dish.series.filter((p) => !p.isClosed && p.date < testDate);
      const naiveModel = seasonalNaiveForecaster.fit(trainSeriesOnly, features);
      const naivePred = seasonalNaiveForecaster.predict(naiveModel, testDate, targetFeat);

      const actual = actualPt.quantitySold;
      const pred = forecast.p50;
      const absErrEnsemble = Math.abs(actual - pred);
      const absErrNaive = Math.abs(actual - naivePred);

      dishSumActual += actual;
      dishSumAbsErrorEnsemble += absErrEnsemble;
      dishSumAbsErrorNaive += absErrNaive;
      dishSumSignedBias += pred - actual;
      dishTestCount++;

      // Conformal interval coverage check
      if (actual >= forecast.p10 && actual <= forecast.p90) {
        dishCoveredCount++;
      }

      // Stockout rate (actual exceeded predicted P50)
      if (actual > pred) {
        dishStockoutCount++;
      }

      dailyComparisons.push({
        date: testDate,
        dishName: dish.dishName,
        menuItemId: dish.menuItemId,
        actualDemand: actual,
        predictedP50: Math.round(pred * 10) / 10,
        p10: Math.round(forecast.p10 * 10) / 10,
        p90: Math.round(forecast.p90 * 10) / 10,
        seasonalNaive: Math.round(naivePred * 10) / 10,
        soldOut: Boolean(actualPt.soldOut),
      });
    }

    if (dishTestCount > 0) {
      const wape = dishSumActual > 0 ? dishSumAbsErrorEnsemble / dishSumActual : 0;
      const maeEnsemble = dishSumAbsErrorEnsemble / dishTestCount;
      const maeNaive = dishSumAbsErrorNaive / dishTestCount;
      const mase = maeNaive > 0 ? maeEnsemble / maeNaive : 1.0;
      const bias = dishSumActual > 0 ? dishSumSignedBias / dishSumActual : 0;
      const intervalCoverage = dishCoveredCount / dishTestCount;
      const stockoutRate = dishStockoutCount / dishTestCount;
      const errorReduction = maeNaive > 0 ? Math.max(0, ((maeNaive - maeEnsemble) / maeNaive) * 100) : 0;

      dishMetricsList.push({
        menuItemId: dish.menuItemId,
        dishName: dish.dishName,
        testDaysCount: dishTestCount,
        wape: Math.round(wape * 1000) / 1000,
        mase: Math.round(mase * 1000) / 1000,
        bias: Math.round(bias * 1000) / 1000,
        intervalCoverage: Math.round(intervalCoverage * 1000) / 1000,
        stockoutRate: Math.round(stockoutRate * 1000) / 1000,
        maeEnsemble: Math.round(maeEnsemble * 10) / 10,
        maeSeasonalNaive: Math.round(maeNaive * 10) / 10,
        errorReductionPercent: Math.round(errorReduction * 10) / 10,
      });

      grandSumActual += dishSumActual;
      grandSumAbsErrorEnsemble += dishSumAbsErrorEnsemble;
      grandSumAbsErrorNaive += dishSumAbsErrorNaive;
      grandSumSignedBias += dishSumSignedBias;
      grandCoveredCount += dishCoveredCount;
      grandStockoutCount += dishStockoutCount;
      grandTotalEvaluations += dishTestCount;
    }
  }

  const overallWape = grandSumActual > 0 ? grandSumAbsErrorEnsemble / grandSumActual : 0;
  const overallMaeEnsemble = grandTotalEvaluations > 0 ? grandSumAbsErrorEnsemble / grandTotalEvaluations : 0;
  const overallMaeNaive = grandTotalEvaluations > 0 ? grandSumAbsErrorNaive / grandTotalEvaluations : 0;
  const overallMase = overallMaeNaive > 0 ? overallMaeEnsemble / overallMaeNaive : 1.0;
  const overallBias = grandSumActual > 0 ? grandSumSignedBias / grandSumActual : 0;
  const overallCoverage = grandTotalEvaluations > 0 ? grandCoveredCount / grandTotalEvaluations : 0;
  const overallStockout = grandTotalEvaluations > 0 ? grandStockoutCount / grandTotalEvaluations : 0;
  const overallReduction =
    overallMaeNaive > 0 ? Math.max(0, ((overallMaeNaive - overallMaeEnsemble) / overallMaeNaive) * 100) : 0;

  return {
    eligible: true,
    totalDaysAvailable: totalDays,
    daysNeeded: 0,
    testWindowDays: 28,
    overallWape: Math.round(overallWape * 1000) / 1000,
    overallMase: Math.round(overallMase * 1000) / 1000,
    overallBias: Math.round(overallBias * 1000) / 1000,
    overallIntervalCoverage: Math.round(overallCoverage * 1000) / 1000,
    overallStockoutRate: Math.round(overallStockout * 1000) / 1000,
    overallErrorReductionPercent: Math.round(overallReduction * 10) / 10,
    dishes: dishMetricsList,
    dailyComparisons,
  };
}
