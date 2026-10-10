import { Forecaster, SeriesPoint, DayFeatures } from '../types.js';
import { estimateUncensoredLevel, mean } from '../math.js';

export interface HoltWintersModel {
  level: number;
  trend: number;
  seasonals: number[]; // Length 7 (indexed by day-of-week 0..6)
  phi: number; // Damping parameter
  fallbackLevel: number;
  lastDate: string;
}

/**
 * Holt-Winters Additive Forecaster with Weekly Seasonality (m=7) and Damped Trend.
 * Accommodates censored demand (sold-out days) by preserving lower-bound constraints.
 */
export const holtWintersForecaster: Forecaster<HoltWintersModel> = {
  name: 'holt_winters',

  fit(series: SeriesPoint[], _features: DayFeatures[]): HoltWintersModel {
    const m = 7; // Weekly season
    const alpha = 0.25; // Level smoothing
    const beta = 0.1; // Trend smoothing
    const gamma = 0.2; // Seasonal smoothing
    const phi = 0.9; // Trend damping

    const sorted = [...series]
      .filter((p) => !p.isClosed)
      .sort((a, b) => a.date.localeCompare(b.date));

    const fallbackLevel = estimateUncensoredLevel(sorted);

    if (sorted.length === 0) {
      return {
        level: 0,
        trend: 0,
        seasonals: new Array(m).fill(0),
        phi,
        fallbackLevel: 0,
        lastDate: '',
      };
    }

    if (sorted.length < 14) {
      // Short series: simple level initialization
      const avg = fallbackLevel;
      return {
        level: avg,
        trend: 0,
        seasonals: new Array(m).fill(0),
        phi,
        fallbackLevel: avg,
        lastDate: sorted[sorted.length - 1].date,
      };
    }

    // Initialize level and trend using first two weeks
    const firstWeek = sorted.slice(0, m);
    const secondWeek = sorted.slice(m, 2 * m);

    const firstWeekAvg = mean(firstWeek.map((p) => p.quantitySold));
    const secondWeekAvg = mean(secondWeek.map((p) => p.quantitySold));

    let level = firstWeekAvg;
    let trend = (secondWeekAvg - firstWeekAvg) / m;

    // Initialize seasonal indices for each weekday (0..6)
    const seasonalsByDow: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (let i = 0; i < Math.min(21, sorted.length); i++) {
      const p = sorted[i];
      const dow = new Date(p.date + 'T00:00:00Z').getUTCDay();
      seasonalsByDow[dow].push(p.quantitySold - level);
    }

    const seasonals = new Array(m).fill(0);
    for (let dow = 0; dow < m; dow++) {
      const vals = seasonalsByDow[dow];
      seasonals[dow] = vals.length > 0 ? mean(vals) : 0;
    }

    // Center seasonals around 0
    const seasonMean = mean(seasonals);
    for (let dow = 0; dow < m; dow++) {
      seasonals[dow] -= seasonMean;
    }

    // Walk through historical series and update states
    for (let t = 0; t < sorted.length; t++) {
      const point = sorted[t];
      const dow = new Date(point.date + 'T00:00:00Z').getUTCDay();

      // Predicted 1-step ahead
      const yHat = level + phi * trend + seasonals[dow];

      // Handle censored demand: if sold out, actual demand was at least point.quantitySold
      let effectiveY = point.quantitySold;
      if (point.soldOut && effectiveY < yHat) {
        // Demand exceeded sales; use 1-step prediction or sales lower bound
        effectiveY = Math.max(effectiveY, yHat);
      }

      const prevLevel = level;
      const prevTrend = trend;
      const prevSeason = seasonals[dow];

      // Update equations
      level = alpha * (effectiveY - prevSeason) + (1 - alpha) * (prevLevel + phi * prevTrend);
      trend = beta * (level - prevLevel) + (1 - beta) * (phi * prevTrend);
      seasonals[dow] = gamma * (effectiveY - level) + (1 - gamma) * prevSeason;

      // Ensure sanity: clamp extreme negative levels
      if (level < 0) level = 0;
    }

    return {
      level,
      trend,
      seasonals,
      phi,
      fallbackLevel,
      lastDate: sorted[sorted.length - 1].date,
    };
  },

  predict(model: HoltWintersModel, targetDate: string, _features: DayFeatures): number {
    const dow = new Date(targetDate + 'T00:00:00Z').getUTCDay();
    const season = model.seasonals[dow] ?? 0;

    // 1-step damped trend forecast
    const forecast = model.level + model.phi * model.trend + season;
    return Math.max(0, forecast);
  },
};
