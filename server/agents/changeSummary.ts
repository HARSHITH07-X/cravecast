import type { FirestoreClient } from '../lib/firestoreRest.js';
import { DailyPlanOutput, ComputedPrepItem } from '../planner.js';
import { DayFeatures } from '../forecast/types.js';

export interface DishChangeRecord {
  menuItemId: string;
  dishName: string;
  category: string;
  previousPortions: number;
  currentPortions: number;
  delta: number;
  deltaPercent: number;
  direction: 'UP' | 'DOWN' | 'SAME';
  mainFactor: string;
}

export interface ChangeSummaryResult {
  hasPreviousPlan: boolean;
  previousPlanDate?: string;
  previousPlanStatus?: string;
  totalPreviousPortions: number;
  totalCurrentPortions: number;
  totalDeltaPortions: number;
  dishesUpCount: number;
  dishesDownCount: number;
  dishesUnchangedCount: number;
  topIncreases: DishChangeRecord[];
  topDecreases: DishChangeRecord[];
  dishChanges: DishChangeRecord[];
}

/**
 * Computes the factor explanation for a dish portion change deterministically using code.
 */
export function computeMainFactor(
  prepItem: ComputedPrepItem,
  delta: number,
  dayFeatures?: DayFeatures,
  prevDayOfWeek?: number
): string {
  if (prepItem.cappedByShelfLife) {
    return `Capped by ${prepItem.shelfLifeDays}-day shelf life to prevent wastage`;
  }

  if (dayFeatures?.eventName) {
    return `Special event: "${dayFeatures.eventName}" anticipated impact`;
  }

  if (dayFeatures?.isRain) {
    return delta < 0
      ? 'Monsoon rain forecast dampening dining footfall'
      : 'Comfort food demand boost from rainy weather';
  }

  if (dayFeatures) {
    const isWeekend = dayFeatures.dayOfWeek === 0 || dayFeatures.dayOfWeek === 6;
    const prevWasWeekend = prevDayOfWeek === 0 || prevDayOfWeek === 6;

    if (isWeekend && !prevWasWeekend && delta > 0) {
      return 'Weekend dining traffic surge';
    }
    if (!isWeekend && prevWasWeekend && delta < 0) {
      return 'Weekday volume moderation following weekend rush';
    }
  }

  if (prepItem.serviceLevelSource === 'newsvendor' && prepItem.serviceLevel >= 0.85) {
    return `Newsvendor margin protection (cu / (cu + co) = ${Math.round(prepItem.serviceLevel * 100)}%)`;
  }

  if (Math.abs(delta) >= 10) {
    return delta > 0 ? 'Upward demand trajectory from recent trend' : 'Downward correction from rolling 8-week pattern';
  }

  return 'Calibrated weekday baseline adjustment';
}

/**
 * Computes what changed versus the last approved kitchen plan.
 * Code-authoritative, transparent, and reproducible.
 */
export async function computeChangeSummary(
  currentPlan: DailyPlanOutput,
  restaurantId: string,
  db?: FirestoreClient,
  dayFeatures?: DayFeatures,
  previousPlanOverride?: DailyPlanOutput
): Promise<ChangeSummaryResult> {
  let previousPlanData: any = previousPlanOverride || null;

  if (!previousPlanData && db) {
    try {
      // Find latest approved plan for a different date
      const approvedSnap = await db
        .collection(`restaurants/${restaurantId}/plans`)
        .where('status', '==', 'approved')
        .limit(10)
        .get();

      const candidatePlans = approvedSnap.docs
        .map((d: any) => d.data())
        .filter((p: any) => p.targetDate && p.targetDate !== currentPlan.targetDate)
        .sort((a: any, b: any) => b.targetDate.localeCompare(a.targetDate));

      if (candidatePlans.length > 0) {
        previousPlanData = candidatePlans[0];
      } else {
        // Fallback: check any prior plan doc
        const allPlansSnap = await db
          .collection(`restaurants/${restaurantId}/plans`)
          .limit(10)
          .get();
        const otherPlans = allPlansSnap.docs
          .map((d: any) => d.data())
          .filter((p: any) => p.targetDate && p.targetDate !== currentPlan.targetDate)
          .sort((a: any, b: any) => b.targetDate.localeCompare(a.targetDate));

        if (otherPlans.length > 0) {
          previousPlanData = otherPlans[0];
        }
      }
    } catch (err) {
      console.warn('[computeChangeSummary] DB query for previous plan failed:', err);
    }
  }

  const prevPrepMap = new Map<string, number>();
  if (previousPlanData && Array.isArray(previousPlanData.prepItems)) {
    for (const p of previousPlanData.prepItems) {
      prevPrepMap.set(p.menuItemId, Number(p.plannedPortions) || 0);
    }
  }

  let prevDayOfWeek: number | undefined;
  if (previousPlanData?.targetDate) {
    prevDayOfWeek = new Date(previousPlanData.targetDate).getDay();
  }

  const dishChanges: DishChangeRecord[] = [];
  let totalPrevious = 0;
  let totalCurrent = 0;
  let upCount = 0;
  let downCount = 0;
  let sameCount = 0;

  for (const prep of currentPlan.prepItems) {
    const prevPortions = prevPrepMap.has(prep.menuItemId)
      ? prevPrepMap.get(prep.menuItemId)!
      : previousPlanData
      ? 0
      : Math.round(prep.p50); // if no previous plan ever existed, compare against p50 baseline

    const currentPortions = prep.plannedPortions;
    const delta = currentPortions - prevPortions;
    const deltaPercent = prevPortions > 0 ? Math.round((delta / prevPortions) * 100) : delta > 0 ? 100 : 0;
    const direction: 'UP' | 'DOWN' | 'SAME' = delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'SAME';

    if (direction === 'UP') upCount++;
    else if (direction === 'DOWN') downCount++;
    else sameCount++;

    totalPrevious += prevPortions;
    totalCurrent += currentPortions;

    const mainFactor = computeMainFactor(prep, delta, dayFeatures, prevDayOfWeek);

    dishChanges.push({
      menuItemId: prep.menuItemId,
      dishName: prep.dishName,
      category: prep.category,
      previousPortions: prevPortions,
      currentPortions,
      delta,
      deltaPercent,
      direction,
      mainFactor,
    });
  }

  const topIncreases = [...dishChanges]
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  const topDecreases = [...dishChanges]
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  return {
    hasPreviousPlan: Boolean(previousPlanData),
    previousPlanDate: previousPlanData?.targetDate,
    previousPlanStatus: previousPlanData?.status,
    totalPreviousPortions: totalPrevious,
    totalCurrentPortions: totalCurrent,
    totalDeltaPortions: totalCurrent - totalPrevious,
    dishesUpCount: upCount,
    dishesDownCount: downCount,
    dishesUnchangedCount: sameCount,
    topIncreases,
    topDecreases,
    dishChanges,
  };
}
