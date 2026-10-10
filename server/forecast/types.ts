/**
 * Core types for CraveCast Phase 5 Forecast Engine
 */

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  quantitySold: number;
  soldOut: boolean;
  isClosed?: boolean;
}

export interface DayFeatures {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isRain: boolean;
  precipitationChance?: number; // 0-100
  tempMax?: number; // Celsius
  tempBucket: 'cold' | 'mild' | 'warm' | 'hot';
  isHolidayOrEvent: boolean;
  eventName?: string;
  isFirstWeekOfMonth: boolean; // Day of month 1..7
  recentLevel?: number; // Rolling 7-day average uncensored demand
}

export type ConfidenceTier = 'Low' | 'Medium' | 'High';

export interface FactorContributions {
  baseLevel: number;
  weekdayEffect: number;
  trendEffect: number;
  weatherEffect: number;
  eventEffect: number;
}

export interface ForecastResult {
  menuItemId: string;
  dishName: string;
  category: string;
  targetDate: string;
  p10: number;
  p50: number;
  p90: number;
  confidence: ConfidenceTier;
  confidenceReason: string;
  modelWeights: Record<string, number>;
  factorContributions: FactorContributions;
  baselineSeasonalNaive: number;
  daysOfHistory: number;
}

export interface DishBacktestMetrics {
  menuItemId: string;
  dishName: string;
  testDaysCount: number;
  wape: number; // Weighted Absolute Percentage Error (0..1)
  mase: number; // Mean Absolute Scaled Error relative to seasonal naive
  bias: number; // Mean forecast error (positive = overforecasting)
  intervalCoverage: number; // Share of points inside [p10, p90] (0..1)
  stockoutRate: number; // Share of days actual exceeded p50 (0..1)
  maeEnsemble: number;
  maeSeasonalNaive: number;
  errorReductionPercent: number; // % lower error than same-as-last-week
}

export interface BacktestSummary {
  eligible: boolean;
  totalDaysAvailable: number;
  daysNeeded: number; // 84 - totalDaysAvailable if < 84, else 0
  message?: string;
  testWindowDays: number; // 28
  overallWape: number;
  overallMase: number;
  overallBias: number;
  overallIntervalCoverage: number;
  overallStockoutRate: number;
  overallErrorReductionPercent: number;
  dishes: DishBacktestMetrics[];
  dailyComparisons: Array<{
    date: string;
    dishName: string;
    menuItemId: string;
    actualDemand: number;
    predictedP50: number;
    p10: number;
    p90: number;
    seasonalNaive: number;
    soldOut: boolean;
  }>;
}

/**
 * Standard Forecaster interface allowing any statistical or foundation model
 * (e.g. TimesFM, Chronos) to be plugged in.
 */
export interface Forecaster<M = any> {
  name: string;
  fit(series: SeriesPoint[], features: DayFeatures[]): M;
  predict(model: M, targetDate: string, features: DayFeatures): number;
}
