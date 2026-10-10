import assert from 'node:assert/strict';
import { seasonalNaiveForecaster } from '../../server/forecast/models/seasonalNaive.js';
import { weightedWeekdayForecaster } from '../../server/forecast/models/weightedWeekday.js';
import { holtWintersForecaster } from '../../server/forecast/models/holtWinters.js';
import { ridgeForecaster } from '../../server/forecast/models/ridgeRegression.js';
import { estimateUncensoredLevel } from '../../server/forecast/math.js';
import { SeriesPoint, DayFeatures } from '../../server/forecast/types.js';

function makeFeature(dateStr: string, dow: number, isRain = false): DayFeatures {
  return {
    date: dateStr,
    dayOfWeek: dow,
    isRain,
    tempMax: isRain ? 22 : 30,
    tempBucket: isRain ? 'mild' : 'warm',
    isHolidayOrEvent: false,
    isFirstWeekOfMonth: false,
    recentLevel: 30,
  };
}

function makeSeries(quantities: number[], startDow = 1): { series: SeriesPoint[]; features: DayFeatures[] } {
  const series: SeriesPoint[] = [];
  const features: DayFeatures[] = [];
  quantities.forEach((q, idx) => {
    const dow = (startDow + idx) % 7;
    const dateStr = `2025-01-${String(idx + 1).padStart(2, '0')}`;
    series.push({
      date: dateStr,
      quantitySold: q,
      soldOut: false,
      isClosed: false,
    });
    features.push(makeFeature(dateStr, dow, idx % 5 === 0));
  });
  return { series, features };
}

console.log('Running Phase 5 Statistical Models Unit Tests...');

// 1. Test Sold-Out Censoring Adjustment
{
  const normal = estimateUncensoredLevel([
    { quantitySold: 40, soldOut: false },
    { quantitySold: 40, soldOut: false },
  ]);
  const withSoldOut = estimateUncensoredLevel([
    { quantitySold: 30, soldOut: false },
    { quantitySold: 50, soldOut: true },
  ]);
  assert.equal(normal, 40, 'Non-sold-out level should equal uncensored mean');
  assert.ok(withSoldOut >= 50, 'Sold-out quantity should act as lower bound for censored demand');
  console.log('✓ Sold-out censoring adjustment passed.');
}

// 2. Test Seasonal Naive (same weekday pattern)
{
  // 2025-01-01 is Wednesday (dow 3). Every 7th day (same weekday) has 50, others have 20
  const quantities = Array.from({ length: 21 }, (_, i) => (i % 7 === 0 ? 50 : 20));
  const { series, features } = makeSeries(quantities, 3);
  const model = seasonalNaiveForecaster.fit(series, features);
  // 2025-01-22 is also Wednesday (i=21)
  const pred = seasonalNaiveForecaster.predict(model, '2025-01-22', makeFeature('2025-01-22', 3));
  assert.ok(Math.abs(pred - 50) < 0.01, `Expected ~50 for same weekday, got ${pred}`);
  console.log('✓ Seasonal Naive model passed.');
}

// 3. Test Exponentially Weighted Weekday Average (recent trend on same weekday)
{
  // Same weekday values increasing: week 1 (Jan 1) = 20, week 2 (Jan 8) = 40, week 3 (Jan 15) = 60
  const quantities = Array.from({ length: 21 }, (_, i) => {
    if (i === 0) return 20;
    if (i === 7) return 40;
    if (i === 14) return 60;
    return 15;
  });
  const { series, features } = makeSeries(quantities, 3);
  const model = weightedWeekdayForecaster.fit(series, features);
  const pred = weightedWeekdayForecaster.predict(model, '2025-01-22', makeFeature('2025-01-22', 3));
  // Should weight 60 highest, so prediction > simple average (40)
  assert.ok(pred > 41 && pred <= 60, `Expected weighted weekday > 41, got ${pred}`);
  console.log('✓ Exponentially Weighted Weekday Average passed.');
}

// 4. Test Holt-Winters Weekly Seasonal Smoothing
{
  const quantities = Array.from({ length: 28 }, (_, i) => {
    const dow = (3 + i) % 7; // Jan 1 2025 is Wed (3)
    const seasonal = dow === 5 || dow === 6 ? 30 : 0; // Weekend surge
    return 40 + seasonal + i * 0.5;
  });
  const { series, features } = makeSeries(quantities, 3);
  const model = holtWintersForecaster.fit(series, features);
  // 2025-01-29 is Wed (3), 2025-02-01 is Sat (6)
  const predWeekday = holtWintersForecaster.predict(model, '2025-01-29', makeFeature('2025-01-29', 3));
  const predWeekend = holtWintersForecaster.predict(model, '2025-02-01', makeFeature('2025-02-01', 6));
  assert.ok(
    predWeekend > predWeekday + 15,
    `Expected weekend Holt-Winters (${predWeekend}) > weekday (${predWeekday})`
  );
  console.log('✓ Holt-Winters weekly seasonal smoothing passed.');
}

// 5. Test Ridge Regression with Weather & Event features
{
  const series: SeriesPoint[] = [];
  const features: DayFeatures[] = [];
  for (let i = 0; i < 28; i++) {
    const dateStr = `2025-02-${String(i + 1).padStart(2, '0')}`;
    const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay();
    const isRain = i % 4 === 0;
    const base = dow === 0 || dow === 6 ? 50 : 30;
    const q = base + (isRain ? 25 : 0);
    const f = makeFeature(dateStr, dow, isRain);
    series.push({
      date: dateStr,
      quantitySold: q,
      soldOut: false,
      isClosed: false,
    });
    features.push(f);
  }

  const model = ridgeForecaster.fit(series, features);
  const dryTarget = makeFeature('2025-03-01', 6, false);
  const rainTarget = makeFeature('2025-03-01', 6, true);

  const dryPred = ridgeForecaster.predict(model, '2025-03-01', dryTarget);
  const rainPred = ridgeForecaster.predict(model, '2025-03-01', rainTarget);

  assert.ok(
    rainPred > dryPred + 10,
    `Expected rainy Ridge prediction (${rainPred}) > dry (${dryPred})`
  );
  console.log('✓ L2 Ridge Regression with weather & weekday features passed.\n');
}
