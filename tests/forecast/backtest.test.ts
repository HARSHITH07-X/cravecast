import assert from 'node:assert/strict';
import { runWalkForwardBacktest } from '../../server/forecast/backtest.js';
import { DishForecastContext } from '../../server/forecast/ensemble.js';
import { DayFeatures, SeriesPoint } from '../../server/forecast/types.js';

console.log('Running Phase 5 Walk-Forward Backtest & Conformal Coverage Tests...');

// Generate 90 days of synthetic series with weekly seasonality + rain effect
const dates: string[] = [];
const startDate = new Date('2025-01-01T00:00:00Z');
for (let i = 0; i < 90; i++) {
  const d = new Date(startDate);
  d.setUTCDate(startDate.getUTCDate() + i);
  dates.push(d.toISOString().slice(0, 10));
}

const allFeatures: DayFeatures[] = [];
const series: SeriesPoint[] = [];

for (let i = 0; i < dates.length; i++) {
  const dateStr = dates[i];
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const isWeekend = dow === 5 || dow === 6;
  const isRain = i % 9 === 0;

  allFeatures.push({
    date: dateStr,
    dayOfWeek: dow,
    isRain,
    tempMax: isRain ? 23 : 31,
    tempBucket: isRain ? 'mild' : 'warm',
    isHolidayOrEvent: false,
    isFirstWeekOfMonth: d.getUTCDate() <= 7,
    recentLevel: 45,
  });

  // True demand: 40 on weekdays, 70 on weekends, +12 when raining + small deterministic oscillation
  const noise = ((i * 7) % 5) - 2;
  const actual = (isWeekend ? 70 : 40) + (isRain ? 12 : 0) + noise;

  series.push({
    date: dateStr,
    quantitySold: actual,
    soldOut: false,
    isClosed: false,
  });
}

const ctx: DishForecastContext = {
  menuItemId: 'dish_1',
  dishName: 'Hyderabadi Chicken Biryani',
  category: 'Biryani',
  series,
};

const summary = runWalkForwardBacktest([ctx], allFeatures);

assert.equal(summary.eligible, true, 'Should be eligible with 90 days of history');
assert.equal(summary.dishes.length, 1, 'Should produce metrics for 1 dish');

const metric = summary.dishes[0];
console.log(
  `  Backtest Results for ${metric.dishName}: Ensemble WAPE=${(metric.wape * 100).toFixed(1)}%, MASE=${metric.mase.toFixed(2)}, Coverage=${(metric.intervalCoverage * 100).toFixed(1)}%`
);

assert.ok(metric.mase <= 1.05, 'Ensemble MASE should be competitive with or beat seasonal naive');
assert.ok(metric.intervalCoverage >= 0.65, `Conformal [p10, p90] coverage (${metric.intervalCoverage}) should be well-calibrated`);
assert.equal(metric.testDaysCount, 28, 'Should have 28 walk-forward test predictions');

console.log('✓ Walk-forward backtest and conformal coverage tests passed.\n');
