import { Forecaster, SeriesPoint, DayFeatures } from '../types.js';
import { estimateUncensoredLevel } from '../math.js';

export interface SeasonalNaiveModel {
  byWeekday: Record<number, number[]>; // Array of historical sales on each weekday (most recent last)
  censoredByWeekday: Record<number, boolean[]>;
  lastObservedByWeekday: Record<number, number>;
  fallbackLevel: number;
}

/**
 * Seasonal Naive Forecaster:
 * Predicts the value from the exact same weekday last week.
 * If sold out on that day, demand was at least that value (censored lower bound).
 */
export const seasonalNaiveForecaster: Forecaster<SeasonalNaiveModel> = {
  name: 'seasonal_naive',

  fit(series: SeriesPoint[], _features: DayFeatures[]): SeasonalNaiveModel {
    const byWeekday: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const censoredByWeekday: Record<number, boolean[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const lastObservedByWeekday: Record<number, number> = {};

    // Sort series chronologically
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));

    for (const point of sorted) {
      if (point.isClosed) continue;
      const d = new Date(point.date + 'T00:00:00Z');
      const w = d.getUTCDay();

      byWeekday[w].push(point.quantitySold);
      censoredByWeekday[w].push(point.soldOut);
      lastObservedByWeekday[w] = point.quantitySold;
    }

    const fallbackLevel = estimateUncensoredLevel(sorted);

    return {
      byWeekday,
      censoredByWeekday,
      lastObservedByWeekday,
      fallbackLevel,
    };
  },

  predict(model: SeasonalNaiveModel, targetDate: string, _features: DayFeatures): number {
    const d = new Date(targetDate + 'T00:00:00Z');
    const w = d.getUTCDay();

    const history = model.byWeekday[w];
    if (history && history.length > 0) {
      // Same weekday last week is the last entry in history
      const lastWeekVal = history[history.length - 1];
      const wasSoldOut = model.censoredByWeekday[w]?.[history.length - 1];

      if (wasSoldOut) {
        // Sold out acts as a lower bound: actual demand >= lastWeekVal
        return Math.max(lastWeekVal, model.fallbackLevel);
      }
      return lastWeekVal;
    }

    return model.fallbackLevel;
  },
};
