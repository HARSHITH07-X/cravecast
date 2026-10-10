import assert from 'node:assert/strict';
import {
  buildConformalCalibrator,
  computeConformalInterval,
  computeEmpiricalCoverage,
  ConformalResidualPoint,
} from '../../server/forecast/conformal.js';

console.log('Running Phase 5 Conformal Intervals Tests...');

// 1. Test conformal quantiles monotonicity and non-negativity
{
  const residuals = [-8, -5, -3, -2, -1, 0, 1, 2, 4, 6, 9, 12];
  const points: ConformalResidualPoint[] = residuals.map((r, idx) => ({
    date: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    dayOfWeek: 3,
    actual: 45 + r,
    predicted: 45,
    residual: r,
    soldOut: false,
  }));

  const calibrator = buildConformalCalibrator(points);
  const { p10, p50, p90 } = computeConformalInterval(calibrator, 45, 3);

  assert.ok(p10 >= 0, 'p10 must be non-negative');
  assert.ok(p10 <= p50, `p10 (${p10}) must be <= p50 (${p50})`);
  assert.ok(p50 <= p90, `p50 (${p50}) must be <= p90 (${p90})`);
  assert.ok(p90 > p10, 'Interval width should be positive');
  console.log('✓ Conformal quantiles [p10, p50, p90] ordering and non-negativity passed.');
}

// 2. Test fallback when very few residuals exist
{
  const calibrator = buildConformalCalibrator([
    { date: '2025-01-01', dayOfWeek: 1, actual: 21, predicted: 20, residual: 1, soldOut: false },
    { date: '2025-01-02', dayOfWeek: 2, actual: 19, predicted: 20, residual: -1, soldOut: false },
  ]);
  const { p10, p50, p90, isWidened } = computeConformalInterval(calibrator, 20, 1);
  assert.ok(p50 >= 20 && p50 <= 21);
  assert.ok(p10 < 20);
  assert.ok(p90 > 20);
  assert.equal(isWidened, true);
  console.log('✓ Conformal fallback with small sample passed.');
}

// 3. Test empirical coverage calculation
{
  const actuals = [10, 12, 15, 20, 25, 30, 18, 22, 14, 16];
  const items = actuals.map((y, idx) => ({
    actual: idx === 0 ? 25 : y, // 1 out of 10 falls outside -> 0.90 coverage
    p10: y - 4,
    p90: y + 4,
  }));
  const coverage = computeEmpiricalCoverage(items);
  assert.equal(coverage, 0.9);
  console.log('✓ Empirical interval coverage evaluation passed.\n');
}
