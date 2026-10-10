import { DayFeatures, ForecastResult, BacktestSummary } from './types.js';
import { DishForecastContext, generateDishForecast } from './ensemble.js';
import { runWalkForwardBacktest } from './backtest.js';
import { categorizeTemp } from './math.js';
import {
  FeedbackObservation,
  DishBiasAdjustment,
  compute4WeekFeedbackAdjustments,
} from './learningLoop.js';

export interface RawRestaurantForecastInput {
  salesRecords: Array<{
    date: string;
    dishName: string;
    menuItemId?: string;
    quantitySold: number;
    soldOut?: boolean;
    isClosed?: boolean;
  }>;
  menuItems: Array<{
    id: string;
    name: string;
    category: string;
    embedding?: number[];
  }>;
  weatherList?: Array<{
    date: string;
    condition?: string;
    tempMax?: number;
    precipitationChance?: number;
  }>;
  eventsList?: Array<{
    date: string;
    eventName: string;
    approvedByOwner?: boolean;
  }>;
  feedbackRecords?: FeedbackObservation[];
  targetDate?: string; // YYYY-MM-DD (defaults to tomorrow)
}

/**
 * Builds DayFeatures for all dates in history plus future forecast horizon
 */
export function buildFeatureDictionary(
  dates: string[],
  weatherList: RawRestaurantForecastInput['weatherList'] = [],
  eventsList: RawRestaurantForecastInput['eventsList'] = []
): DayFeatures[] {
  const weatherMap = new Map<string, any>();
  for (const w of weatherList) {
    weatherMap.set(w.date, w);
  }

  const eventMap = new Map<string, any>();
  for (const e of eventsList) {
    if (e.approvedByOwner !== false) {
      eventMap.set(e.date, e);
    }
  }

  return dates.map((dateStr) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dow = d.getUTCDay();
    const dayOfMonth = d.getUTCDate();
    const w = weatherMap.get(dateStr);
    const ev = eventMap.get(dateStr);

    const isRain =
      (w?.condition && /rain|shower|drizzle|storm/i.test(w.condition)) ||
      (w?.precipitationChance && w.precipitationChance > 40) ||
      false;

    return {
      date: dateStr,
      dayOfWeek: dow,
      isRain,
      precipitationChance: w?.precipitationChance,
      tempMax: w?.tempMax,
      tempBucket: categorizeTemp(w?.tempMax),
      isHolidayOrEvent: Boolean(ev),
      eventName: ev?.eventName,
      isFirstWeekOfMonth: dayOfMonth <= 7,
    };
  });
}

/**
 * Orchestrates complete forecasting, 4-week feedback learning loop, and backtesting for a restaurant's kitchen
 */
export function executeForecastPipeline(input: RawRestaurantForecastInput): {
  targetDate: string;
  forecasts: ForecastResult[];
  backtest: BacktestSummary;
  learningAdjustments: Record<string, DishBiasAdjustment>;
  learningLoop: {
    adjustmentsByDishId: Record<string, DishBiasAdjustment>;
    deltaMap: Record<string, number>;
  };
} {
  // Determine target date (tomorrow by default)
  let targetDate = input.targetDate;
  if (!targetDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().slice(0, 10);
  }

  // Group sales series by menu item
  const dishContextMap = new Map<string, DishForecastContext>();

  // Map known menu items first
  for (const item of input.menuItems) {
    dishContextMap.set(item.id, {
      menuItemId: item.id,
      dishName: item.name,
      category: item.category || 'Main Course',
      embedding: item.embedding,
      series: [],
    });
  }

  // Populate series points
  const allDatesSet = new Set<string>();
  for (const sale of input.salesRecords) {
    allDatesSet.add(sale.date);

    // Find matching dish context either by menuItemId or by dishName
    let ctx = sale.menuItemId ? dishContextMap.get(sale.menuItemId) : undefined;
    if (!ctx) {
      // Find by name
      for (const existing of dishContextMap.values()) {
        if (existing.dishName.toLowerCase() === sale.dishName.toLowerCase()) {
          ctx = existing;
          break;
        }
      }
    }

    if (!ctx) {
      // Create ad-hoc context for dish from sales
      const fallbackId = sale.menuItemId || `dish_${sale.dishName.toLowerCase().replace(/\s+/g, '_')}`;
      ctx = {
        menuItemId: fallbackId,
        dishName: sale.dishName,
        category: 'Uncategorized',
        series: [],
      };
      dishContextMap.set(fallbackId, ctx);
    }

    ctx.series.push({
      date: sale.date,
      quantitySold: sale.quantitySold,
      soldOut: Boolean(sale.soldOut),
      isClosed: Boolean(sale.isClosed),
    });
  }

  allDatesSet.add(targetDate);
  const allSortedDates = Array.from(allDatesSet).sort();

  // Build features
  const allFeatures = buildFeatureDictionary(
    allSortedDates,
    input.weatherList || [],
    input.eventsList || []
  );

  const targetDayFeatures =
    allFeatures.find((f) => f.date === targetDate) || {
      date: targetDate,
      dayOfWeek: new Date(targetDate + 'T00:00:00Z').getUTCDay(),
      isRain: false,
      tempBucket: 'mild',
      isHolidayOrEvent: false,
      isFirstWeekOfMonth: new Date(targetDate + 'T00:00:00Z').getUTCDate() <= 7,
    };

  const dishList = Array.from(dishContextMap.values());

  // Generate tomorrow's forecasts
  const forecasts: ForecastResult[] = [];
  for (const dish of dishList) {
    if (dish.series.length === 0) continue;
    const res = generateDishForecast(dish, dishList, targetDate, targetDayFeatures, allFeatures);
    forecasts.push(res);
  }

  // Run 4-week feedback learning loop with shrinkage & backtest verification
  const learningLoop = compute4WeekFeedbackAdjustments({
    targetDate,
    forecasts,
    feedbackRecords: input.feedbackRecords || [],
    salesRecords: input.salesRecords,
  });

  // Apply verified bias corrections to forecast quantiles when backtest confirms improvement
  for (const fc of forecasts) {
    const delta = learningLoop.deltaMap[fc.menuItemId];
    if (delta && delta !== 0) {
      fc.p50 = Math.max(0, Math.round(fc.p50 + delta));
      fc.p10 = Math.max(0, Math.min(fc.p50, Math.round(fc.p10 + delta)));
      fc.p90 = Math.max(fc.p50, Math.round(fc.p90 + delta));
    }
  }

  // Run walk-forward backtest
  const backtest = runWalkForwardBacktest(dishList, allFeatures);

  return {
    targetDate,
    forecasts,
    backtest,
    learningAdjustments: learningLoop.adjustmentsByDishId,
    learningLoop,
  };
}
