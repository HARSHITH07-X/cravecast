import assert from 'node:assert/strict';
import {
  compute4WeekFeedbackAdjustments,
  FeedbackRecordInput,
} from '../server/forecast/learningLoop.js';
import { executeForecastPipeline } from '../server/forecast/engine.js';
import { ForecastResult } from '../server/forecast/types.js';

console.log('Running Phase 10 4-Week Feedback Learning Loop & Backtest Verification Tests...');

const targetDate = '2026-04-15';

function makeBaseForecast(id: string, name: string, p50: number): ForecastResult {
  return {
    menuItemId: id,
    dishName: name,
    category: 'Main Course',
    targetDate,
    p10: Math.round(p50 * 0.75),
    p50,
    p90: Math.round(p50 * 1.25),
    confidence: 'High',
    confidenceReason: '28 days of history',
    modelWeights: { seasonalNaive: 0.25, weightedWeekday: 0.25, holtWinters: 0.25, ridge: 0.25 },
    factorContributions: { baseLevel: p50, weekdayEffect: 0, trendEffect: 0, weatherEffect: 0, eventEffect: 0 },
    baselineSeasonalNaive: p50,
    daysOfHistory: 28,
  };
}

// 1. Test Shrinkage so one single bad day cannot swing the plan wildly
{
  const singleBadDayFeedback: FeedbackRecordInput[] = [
    {
      id: 'fb_single',
      date: '2026-04-14',
      menuItemId: 'dish_biryani',
      dishName: 'Chicken Biryani',
      feedbackType: 'leftover',
      leftoverQty: 30, // Huge 1-day leftover anomaly
      plannedPortions: 50,
    },
  ];

  const out = compute4WeekFeedbackAdjustments({
    targetDate,
    forecasts: [makeBaseForecast('dish_biryani', 'Chicken Biryani', 50)],
    feedbackRecords: singleBadDayFeedback,
  });

  const adj = out.adjustmentsByDishId['dish_biryani'];
  assert.ok(adj, 'Should compute adjustment record for Chicken Biryani');
  assert.ok(adj.shrinkageFactor <= 0.25, `Single observation must be shrunk (got ${adj.shrinkageFactor})`);
  assert.ok(
    Math.abs(adj.candidateDelta) <= 6,
    `Single bad day must not swing the plan wildly (got ${adj.candidateDelta})`
  );
  console.log(
    `✓ Test 1 Passed: Empirical Bayes shrinkage (factor=${adj.shrinkageFactor}) damped 1-day 30-portion leftover anomaly to ${adj.candidateDelta} portions.`
  );
}

// 2. Test repeated stockouts raise the forecast & repeated leftovers lower the forecast
{
  const repeatedFeedback: FeedbackRecordInput[] = [
    // Dish 1: Repeated early stockouts across 4 weeks
    { id: 'fb_1', date: '2026-04-01', menuItemId: 'dish_1', dishName: 'Garlic Naan', feedbackType: 'ran_out', ranOutAt: '19:30' },
    { id: 'fb_2', date: '2026-04-05', menuItemId: 'dish_1', dishName: 'Garlic Naan', feedbackType: 'ran_out', ranOutAt: '20:00' },
    { id: 'fb_3', date: '2026-04-09', menuItemId: 'dish_1', dishName: 'Garlic Naan', feedbackType: 'ran_out', ranOutAt: '19:45' },
    { id: 'fb_4', date: '2026-04-12', menuItemId: 'dish_1', dishName: 'Garlic Naan', feedbackType: 'ran_out', ranOutAt: '20:15' },
    // Dish 2: Repeated leftovers across 4 weeks
    { id: 'fb_5', date: '2026-04-02', menuItemId: 'dish_2', dishName: 'Dal Makhani', feedbackType: 'leftover', leftoverQty: 10 },
    { id: 'fb_6', date: '2026-04-06', menuItemId: 'dish_2', dishName: 'Dal Makhani', feedbackType: 'leftover', leftoverQty: 8 },
    { id: 'fb_7', date: '2026-04-10', menuItemId: 'dish_2', dishName: 'Dal Makhani', feedbackType: 'leftover', leftoverQty: 12 },
    { id: 'fb_8', date: '2026-04-13', menuItemId: 'dish_2', dishName: 'Dal Makhani', feedbackType: 'leftover', leftoverQty: 10 },
  ];

  const out = compute4WeekFeedbackAdjustments({
    targetDate,
    forecasts: [
      makeBaseForecast('dish_1', 'Garlic Naan', 40),
      makeBaseForecast('dish_2', 'Dal Makhani', 35),
    ],
    feedbackRecords: repeatedFeedback,
  });

  assert.ok(out.adjustmentsByDishId['dish_1'].candidateDelta > 0, 'Repeated stockouts must raise the forecast');
  assert.ok(out.adjustmentsByDishId['dish_2'].candidateDelta < 0, 'Repeated leftovers must lower the forecast');
  console.log(
    `✓ Test 2 Passed: Stockouts raised Garlic Naan by +${out.adjustmentsByDishId['dish_1'].candidateDelta}, leftovers lowered Dal Makhani by ${out.adjustmentsByDishId['dish_2'].candidateDelta}.`
  );
}

// 3. Test Backtest Verification in Forecast Pipeline (only applies correction when backtest confirms it helps)
{
  const salesRecords = [];
  const start = new Date('2026-03-15T00:00:00Z');
  for (let i = 0; i < 28; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    // Upward demand shift in last 14 days so positive stockout correction improves backtest loss
    const qty = i >= 14 ? 52 : 40;
    salesRecords.push({
      date: dateStr,
      dishName: 'Mutton Dum Biryani',
      menuItemId: 'dish_mutton',
      quantitySold: qty,
      soldOut: i >= 20,
    });
  }

  const feedbackRecords: FeedbackRecordInput[] = [
    { id: 'f1', date: '2026-04-06', menuItemId: 'dish_mutton', dishName: 'Mutton Dum Biryani', feedbackType: 'ran_out', ranOutAt: '19:45' },
    { id: 'f2', date: '2026-04-08', menuItemId: 'dish_mutton', dishName: 'Mutton Dum Biryani', feedbackType: 'ran_out', ranOutAt: '20:00' },
    { id: 'f3', date: '2026-04-10', menuItemId: 'dish_mutton', dishName: 'Mutton Dum Biryani', feedbackType: 'ran_out', ranOutAt: '19:30' },
  ];

  const baseOut = executeForecastPipeline({
    salesRecords,
    menuItems: [{ id: 'dish_mutton', name: 'Mutton Dum Biryani', category: 'Main Course' }],
    targetDate: '2026-04-15',
  });

  const learnedOut = executeForecastPipeline({
    salesRecords,
    menuItems: [{ id: 'dish_mutton', name: 'Mutton Dum Biryani', category: 'Main Course' }],
    feedbackRecords,
    targetDate: '2026-04-15',
  });

  const adj = learnedOut.learningAdjustments?.['dish_mutton'];
  assert.ok(adj, 'Pipeline should return learningAdjustments for dish_mutton');
  assert.equal(adj.helpedInBacktest, true, 'Backtest verification should confirm stockout bias correction helps');
  assert.ok(
    learnedOut.forecasts[0].p50 > baseOut.forecasts[0].p50,
    `Verified learning loop should raise p50 (${learnedOut.forecasts[0].p50} > ${baseOut.forecasts[0].p50})`
  );
  console.log(
    `✓ Test 3 Passed: Walk-forward backtest verified bias correction (loss ${adj.baselineBacktestLoss} -> ${adj.correctedBacktestLoss}) and raised P50 from ${baseOut.forecasts[0].p50} to ${learnedOut.forecasts[0].p50}.\n`
  );
}
