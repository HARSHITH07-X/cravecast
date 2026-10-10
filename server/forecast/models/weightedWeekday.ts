import { Forecaster, SeriesPoint, DayFeatures } from '../types.js';
import { estimateUncensoredLevel } from '../math.js';

export interface WeightedWeekdayModel {
  byWeekday: Record<number, Array<{ qty: number; soldOut: boolean; date: string }>>;
  fallbackLevel: number;
}

/**
 * Weighted Same-Weekday Average Forecaster:
 * Examines up to the last 8 occurrences of the target weekday.
 * Applies decaying weights where recent weeks are weighted higher:
 * e.g. for k = 0 (1 week ago), 1 (2 weeks ago), ..., 7 (8 weeks ago):
 * weight = 0.8^k or linear ramp.
 * Censored (sold out) days act as lower bounds and are adjusted.
 */
export const weightedWeekdayForecaster: Forecaster<WeightedWeekdayModel> = {
  name: 'weighted_weekday',

  fit(series: SeriesPoint[], _features: DayFeatures[]): WeightedWeekdayModel {
    const byWeekday: Record<number, Array<{ qty: number; soldOut: boolean; date: string }>> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));

    for (const point of sorted) {
      if (point.isClosed) continue;
      const d = new Date(point.date + 'T00:00:00Z');
      const w = d.getUTCDay();

      byWeekday[w].push({
        qty: point.quantitySold,
        soldOut: Boolean(point.soldOut),
        date: point.date,
      });
    }

    const fallbackLevel = estimateUncensoredLevel(sorted);

    return {
      byWeekday,
      fallbackLevel,
    };
  },

  predict(model: WeightedWeekdayModel, targetDate: string, _features: DayFeatures): number {
    const d = new Date(targetDate + 'T00:00:00Z');
    const w = d.getUTCDay();

    const history = model.byWeekday[w];
    if (!history || history.length === 0) {
      return model.fallbackLevel;
    }

    // Take up to the last 8 occurrences (most recent at the end)
    const recentWeeks = history.slice(-8).reverse(); // index 0 is 1 week ago, index 1 is 2 weeks ago...

    let weightedSum = 0;
    let totalWeight = 0;

    // Weight scheme: 0.85^k (recent weeks weighted higher)
    const decayFactor = 0.85;

    for (let k = 0; k < recentWeeks.length; k++) {
      const item = recentWeeks[k];
      const weight = Math.pow(decayFactor, k);

      // If sold out, actual demand was at least item.qty
      const effectiveQty = item.soldOut ? Math.max(item.qty, model.fallbackLevel) : item.qty;

      weightedSum += weight * effectiveQty;
      totalWeight += weight;
    }

    if (totalWeight <= 0) return model.fallbackLevel;
    return weightedSum / totalWeight;
  },
};
