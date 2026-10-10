import { ForecastResult, SeriesPoint } from './types.js';

export interface FeedbackObservation {
  id?: string;
  date: string; // YYYY-MM-DD
  menuItemId?: string;
  dishName: string;
  type?: 'stockout' | 'leftover' | 'on_target';
  feedbackType?: 'ran_out' | 'leftover' | 'on_target';
  occurredAtTime?: string; // HH:mm for ran-out
  ranOutAt?: string;
  soldOutTime?: string;
  estimatedPortions?: number; // leftover quantity or missed stockout demand
  leftoverQty?: number;
  plannedPortions?: number;
  suggestedDelta?: number;
}

export type FeedbackRecordInput = FeedbackObservation;
export type FeedbackLoopRecord = FeedbackObservation;

export interface DishBiasAdjustment {
  menuItemId: string;
  dishName: string;
  observationsLast4Weeks: number;
  stockoutCount: number;
  leftoverCount: number;
  rawMeanSignal: number;
  shrinkageFactor: number;
  candidateDelta: number;
  baselineBacktestLoss: number;
  correctedBacktestLoss: number;
  helpedInBacktest: boolean;
  appliedDelta: number;
  explanation: string;
}

/**
 * Evaluates whether applying `candidateDelta` reduces backtest error / censored stockout loss
 * over the dish's recent 28-day evaluation window.
 *
 * - On uncensored days (`soldOut === false`), error is |actual - predicted|.
 * - On censored stockout days (`soldOut === true`), actual sales were right-censored at `quantitySold`,
 *   so true latent demand was at least `quantitySold + max(2, 0.15 * quantitySold)`.
 * - Also evaluates against explicit 4-week feedback observations if sales series is short.
 */
export function verifyBiasCorrectionWithBacktest(
  dishSeries: SeriesPoint[],
  dishFeedback: FeedbackObservation[],
  baseP50: number,
  candidateDelta: number
): {
  baselineLoss: number;
  correctedLoss: number;
  helped: boolean;
} {
  if (candidateDelta === 0) {
    return { baselineLoss: 0, correctedLoss: 0, helped: false };
  }

  // Filter active evaluation points from the last 28 days
  const sortedSeries = [...dishSeries]
    .filter((p) => !p.isClosed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-28);

  const feedbackByDate = new Map<string, FeedbackObservation>();
  for (const fb of dishFeedback) {
    if (fb.date) {
      feedbackByDate.set(fb.date, fb);
    }
  }

  let baselineTotalLoss = 0;
  let correctedTotalLoss = 0;
  let evalCount = 0;

  // 1. Evaluate across the recent 14-day walk-forward evaluation window (using prior days as context)
  const startEvalIdx = Math.max(0, sortedSeries.length - 14);
  for (let i = startEvalIdx; i < sortedSeries.length; i++) {
    const pt = sortedSeries[i];
    // Rolling local baseline prediction prior to pt.date
    const priorSlice = sortedSeries.slice(Math.max(0, i - 7), i);
    const localPred =
      priorSlice.length > 0
        ? priorSlice.reduce((acc, s) => acc + s.quantitySold, 0) / priorSlice.length
        : baseP50;

    const fbOnDay = feedbackByDate.get(pt.date);
    const wasSoldOut = Boolean(pt.soldOut || fbOnDay?.type === 'stockout');
    const leftoverPortions =
      fbOnDay?.type === 'leftover'
        ? Number(fbOnDay.leftoverQty ?? fbOnDay.estimatedPortions ?? 0)
        : 0;

    // Latent true demand on that day:
    // - If sold out early, latent demand exceeded quantitySold
    // - If leftovers occurred, effective demand was lower than prepared
    let latentDemand = pt.quantitySold;
    if (wasSoldOut) {
      const shortage = Math.max(2, Math.round(pt.quantitySold * 0.15));
      latentDemand = Math.max(pt.quantitySold + shortage, localPred + shortage);
    } else if (leftoverPortions > 0) {
      latentDemand = Math.min(pt.quantitySold, localPred - leftoverPortions);
    }

    const weight = wasSoldOut || leftoverPortions > 0 ? 2.0 : 1.0;
    const baseErr = Math.abs(latentDemand - localPred) * weight;
    const corrErr = Math.abs(latentDemand - (localPred + candidateDelta)) * weight;

    baselineTotalLoss += baseErr;
    correctedTotalLoss += corrErr;
    evalCount += weight;
  }

  // 2. Also include any feedback dates not already represented in the evaluated window
  const evaluatedDates = new Set(sortedSeries.slice(startEvalIdx).map((s) => s.date));
  for (const fb of dishFeedback) {
    if (evaluatedDates.has(fb.date)) continue;
    const mag = Math.max(
      2,
      Number(fb.leftoverQty ?? fb.estimatedPortions ?? (Math.abs(fb.suggestedDelta || 0) || Math.round(baseP50 * 0.15)))
    );
    const latentTarget =
      fb.type === 'stockout'
        ? baseP50 + mag
        : fb.type === 'leftover'
        ? Math.max(0, baseP50 - mag)
        : baseP50;

    baselineTotalLoss += Math.abs(latentTarget - baseP50) * 2.0;
    correctedTotalLoss += Math.abs(latentTarget - (baseP50 + candidateDelta)) * 2.0;
    evalCount += 2.0;
  }

  if (evalCount === 0) {
    return { baselineLoss: 0, correctedLoss: 0, helped: false };
  }

  const baselineLoss = Math.round((baselineTotalLoss / evalCount) * 100) / 100;
  const correctedLoss = Math.round((correctedTotalLoss / evalCount) * 100) / 100;

  return {
    baselineLoss,
    correctedLoss,
    helped: correctedLoss < baselineLoss,
  };
}

/**
 * Computes 4-week feedback bias corrections per dish with Empirical Bayes shrinkage
 * (K = 5) so a single outlier day cannot swing the plan, and verifies each adjustment
 * against the walk-forward backtest before applying it.
 */
export function compute4WeekFeedbackAdjustments(params: {
  targetDate: string;
  forecasts: ForecastResult[];
  feedbackRecords: FeedbackObservation[];
  salesRecords?: Array<{
    date: string;
    dishName: string;
    menuItemId?: string;
    quantitySold: number;
    soldOut?: boolean;
    isClosed?: boolean;
  }>;
}): {
  adjustmentsByDishId: Record<string, DishBiasAdjustment>;
  deltaMap: Record<string, number>;
} {
  const { targetDate, forecasts, feedbackRecords, salesRecords = [] } = params;

  // 4-week (28-day) lookback cutoff
  const targetMs = Date.parse(targetDate + 'T00:00:00Z') || Date.now();
  const cutoffMs = targetMs - 28 * 24 * 60 * 60 * 1000;
  const cutoffDateStr = new Date(cutoffMs).toISOString().slice(0, 10);

  // Filter and normalize feedback records to the last 4 weeks
  const recentFeedback = feedbackRecords
    .filter((fb) => {
      if (!fb || !fb.date) return false;
      return fb.date >= cutoffDateStr && fb.date <= targetDate;
    })
    .map((fb) => ({
      ...fb,
      type:
        fb.type ||
        (fb.feedbackType === 'ran_out'
          ? 'stockout'
          : fb.feedbackType === 'leftover'
          ? 'leftover'
          : 'on_target'),
      occurredAtTime: fb.occurredAtTime || fb.ranOutAt || fb.soldOutTime,
    }));

  const SHRINKAGE_PRIOR_K = 5; // Shrinkage strength so 1 bad day gets weight 1/(1+5) = 0.167
  const adjustmentsByDishId: Record<string, DishBiasAdjustment> = {};
  const deltaMap: Record<string, number> = {};

  for (const fc of forecasts) {
    const dishNameLower = fc.dishName.toLowerCase().trim();

    // Match feedback records for this dish
    const matchingFeedback = recentFeedback.filter(
      (fb) =>
        (fb.menuItemId && fb.menuItemId === fc.menuItemId) ||
        (fb.dishName && fb.dishName.toLowerCase().trim() === dishNameLower)
    );

    // Match sales series for this dish
    const dishSeries: SeriesPoint[] = salesRecords
      .filter(
        (s) =>
          (s.menuItemId && s.menuItemId === fc.menuItemId) ||
          (s.dishName && s.dishName.toLowerCase().trim() === dishNameLower)
      )
      .map((s) => ({
        date: s.date,
        quantitySold: Number(s.quantitySold) || 0,
        soldOut: Boolean(s.soldOut),
        isClosed: Boolean(s.isClosed),
      }));

    // Also include recent sold-out sales days from the last 28 days as stockout signals if not already in feedback
    const feedbackDates = new Set(matchingFeedback.map((f) => f.date));
    const combinedObservations: FeedbackObservation[] = [...matchingFeedback];
    for (const pt of dishSeries) {
      if (pt.date >= cutoffDateStr && pt.date <= targetDate && pt.soldOut && !feedbackDates.has(pt.date)) {
        combinedObservations.push({
          date: pt.date,
          menuItemId: fc.menuItemId,
          dishName: fc.dishName,
          type: 'stockout',
          estimatedPortions: Math.max(2, Math.round(fc.p50 * 0.15)),
        });
      }
    }

    const n = combinedObservations.length;
    if (n === 0) continue;

    let stockoutCount = 0;
    let leftoverCount = 0;
    let signalSum = 0;

    for (const obs of combinedObservations) {
      if (obs.type === 'stockout') {
        stockoutCount++;
        const timeStr = obs.soldOutTime || obs.occurredAtTime || obs.ranOutAt || '';
        const isEarlyStockout = Boolean(timeStr && timeStr < '20:00');
        const defaultBoost = Math.max(2, Math.round(fc.p50 * (isEarlyStockout ? 0.18 : 0.12)));
        const rawBoost =
          typeof obs.estimatedPortions === 'number' && obs.estimatedPortions > 0
            ? obs.estimatedPortions
            : typeof obs.suggestedDelta === 'number' && obs.suggestedDelta > 0
            ? obs.suggestedDelta
            : defaultBoost;
        signalSum += Math.min(Math.max(2, fc.p50 * 0.35), rawBoost);
      } else if (obs.type === 'leftover') {
        leftoverCount++;
        const rawLeftover =
          typeof obs.leftoverQty === 'number' && obs.leftoverQty > 0
            ? obs.leftoverQty
            : typeof obs.estimatedPortions === 'number' && obs.estimatedPortions > 0
            ? obs.estimatedPortions
            : typeof obs.suggestedDelta === 'number' && obs.suggestedDelta < 0
            ? Math.abs(obs.suggestedDelta)
            : Math.max(1, Math.round(fc.p50 * 0.1));
        signalSum -= Math.min(Math.max(2, fc.p50 * 0.35), rawLeftover);
      }
    }

    const rawMeanSignal = signalSum / n;
    // Empirical Bayes shrinkage factor n / (n + K) so 1 day has weight 1/6
    const shrinkageFactor = Math.round((n / (n + SHRINKAGE_PRIOR_K)) * 100) / 100;
    const shrunkSignal = rawMeanSignal * (n / (n + SHRINKAGE_PRIOR_K));

    // Cap maximum bias shift at ±20% of P50 (minimum 1 portion if non-zero)
    const maxCap = Math.max(1, Math.round(fc.p50 * 0.2));
    let candidateDelta = Math.round(shrunkSignal);
    if (candidateDelta === 0 && Math.abs(shrunkSignal) >= 0.45) {
      candidateDelta = shrunkSignal > 0 ? 1 : -1;
    }
    candidateDelta = Math.max(-maxCap, Math.min(maxCap, candidateDelta));

    // Re-run backtest evaluation to confirm whether the bias correction helps
    const btVerify = verifyBiasCorrectionWithBacktest(
      dishSeries,
      combinedObservations,
      fc.p50,
      candidateDelta
    );

    const appliedDelta = btVerify.helped ? candidateDelta : 0;

    let explanation = '';
    if (appliedDelta !== 0) {
      const dir = appliedDelta > 0 ? `+${appliedDelta}` : `${appliedDelta}`;
      const cause =
        stockoutCount >= leftoverCount
          ? `${stockoutCount} stockout${stockoutCount > 1 ? 's' : ''}`
          : `${leftoverCount} leftover log${leftoverCount > 1 ? 's' : ''}`;
      explanation = `4-week learning loop: ${dir} portions from ${cause} (shrinkage ${shrinkageFactor}, backtest MAE ${btVerify.baselineLoss} → ${btVerify.correctedLoss})`;
    } else if (candidateDelta !== 0) {
      explanation = `4-week feedback candidate (${candidateDelta > 0 ? '+' : ''}${candidateDelta}) held back by backtest gate (${btVerify.baselineLoss} vs ${btVerify.correctedLoss})`;
    }

    const adjustment: DishBiasAdjustment = {
      menuItemId: fc.menuItemId,
      dishName: fc.dishName,
      observationsLast4Weeks: n,
      stockoutCount,
      leftoverCount,
      rawMeanSignal: Math.round(rawMeanSignal * 100) / 100,
      shrinkageFactor,
      candidateDelta,
      baselineBacktestLoss: btVerify.baselineLoss,
      correctedBacktestLoss: btVerify.correctedLoss,
      helpedInBacktest: btVerify.helped,
      appliedDelta,
      explanation,
    };

    adjustmentsByDishId[fc.menuItemId] = adjustment;
    if (appliedDelta !== 0) {
      deltaMap[fc.menuItemId] = appliedDelta;
    }
  }

  return { adjustmentsByDishId, deltaMap };
}
