import { calculateQuantile } from './math.js';

export interface ConformalResidualPoint {
  date: string;
  dayOfWeek: number; // 0..6
  actual: number;
  predicted: number;
  residual: number; // actual - predicted
  soldOut: boolean;
}

export interface ConformalCalibrator {
  residualsByWeekday: Record<number, number[]>;
  allResiduals: number[];
}

export interface IntervalResult {
  p10: number;
  p50: number;
  p90: number;
  isWidened: boolean;
  sampleCount: number;
}

/**
 * Creates a split conformal calibrator from rolling-origin historical predictions
 */
export function buildConformalCalibrator(points: ConformalResidualPoint[]): ConformalCalibrator {
  const residualsByWeekday: Record<number, number[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  const allResiduals: number[] = [];

  for (const pt of points) {
    residualsByWeekday[pt.dayOfWeek].push(pt.residual);
    allResiduals.push(pt.residual);
  }

  return {
    residualsByWeekday,
    allResiduals,
  };
}

/**
 * Calculates conformal intervals (p10, p50, p90) for a given point forecast.
 * Grouped by target weekday, widening automatically when data is thin.
 */
export function computeConformalInterval(
  calibrator: ConformalCalibrator,
  pointForecast: number,
  targetDayOfWeek: number
): IntervalResult {
  let samples = calibrator.residualsByWeekday[targetDayOfWeek] || [];
  let isWidened = false;

  // If thin data for this specific weekday (< 5 samples), blend with pooled residuals
  if (samples.length < 5) {
    isWidened = true;
    samples = samples.length > 0 ? [...samples, ...calibrator.allResiduals] : calibrator.allResiduals;
  }

  // If globally very thin data (< 8 samples), apply synthetic conservative widening
  const sampleCount = samples.length;
  if (sampleCount < 8) {
    isWidened = true;
  }

  let q10 = -Math.max(2, pointForecast * 0.25);
  let q50 = 0;
  let q90 = Math.max(3, pointForecast * 0.35);

  if (samples.length >= 3) {
    q10 = calculateQuantile(samples, 0.1);
    q50 = calculateQuantile(samples, 0.5);
    q90 = calculateQuantile(samples, 0.9);
  }

  // Widen when sample size is small
  if (isWidened) {
    const expansionMultiplier = 1.0 + 2.0 / Math.sqrt(Math.max(1, sampleCount));
    q10 *= expansionMultiplier;
    q90 *= expansionMultiplier;
  }

  // Construct calibrated intervals around pointForecast
  const rawP10 = Math.max(0, pointForecast + q10);
  const rawP50 = Math.max(0, pointForecast + q50);
  const rawP90 = Math.max(rawP50, pointForecast + q90);

  return {
    p10: Math.round(rawP10 * 10) / 10,
    p50: Math.round(rawP50 * 10) / 10,
    p90: Math.round(rawP90 * 10) / 10,
    isWidened,
    sampleCount,
  };
}

/**
 * Computes empirical coverage of the 80% interval [p10, p90] over test observations.
 */
export function computeEmpiricalCoverage(
  items: Array<{ actual: number; p10: number; p90: number }>
): number {
  if (items.length === 0) return 0;
  let covered = 0;
  for (const item of items) {
    if (item.actual >= item.p10 && item.actual <= item.p90) {
      covered++;
    }
  }
  return covered / items.length;
}
