import assert from 'node:assert/strict';
import { auditPlanDeterministic } from '../server/agents/critic.js';
import { DailyPlanOutput, PlannerExecutionInput, executeDailyPlan } from '../server/planner.js';
import { computeChangeSummary } from '../server/agents/changeSummary.js';

function createBaseTestPlan(): { plan: DailyPlanOutput; input: PlannerExecutionInput } {
  const input: PlannerExecutionInput = {
    restaurantId: 'rest_test_1',
    restaurantName: 'Test Kitchen',
    targetDate: '2026-04-01',
    serviceLevelSlider: 0.85,
    forecasts: [
      {
        menuItemId: 'dish_1',
        dishName: 'Hyderabadi Chicken Biryani',
        category: 'Biryani',
        targetDate: '2026-04-01',
        p10: 30,
        p50: 45,
        p90: 60,
        confidence: 'High',
        confidenceReason: '28 days of history',
        factorContributions: {
          baseLevel: 40,
          weekdayEffect: 3,
          weatherEffect: 2,
          eventEffect: 0,
          trendEffect: 0,
        },
        modelWeights: { seasonalNaive: 0.25, weightedWeekday: 0.25, holtWinters: 0.25, ridge: 0.25 },
        baselineSeasonalNaive: 42,
        daysOfHistory: 28,
      },
    ],
    menuItems: [
      {
        id: 'dish_1',
        name: 'Hyderabadi Chicken Biryani',
        category: 'Biryani',
        price: 320,
        cost: 110,
        shelfLifeDays: 1,
        hasConfirmedRecipe: true,
        recipeId: 'rec_1',
      },
    ],
    recipes: [
      {
        id: 'rec_1',
        menuItemId: 'dish_1',
        dishName: 'Hyderabadi Chicken Biryani',
        batchYield: 10,
        prepStation: 'Main Line',
        ingredients: [
          {
            ingredientId: 'ing_chicken',
            name: 'Fresh Chicken',
            quantity: 2.5,
            unit: 'kg',
            trimWastePercent: 10,
          },
        ],
      },
    ],
    ingredients: [
      {
        id: 'ing_chicken',
        name: 'Fresh Chicken',
        category: 'Meat',
        unit: 'kg',
        packageSize: 5,
        packageUnit: 'kg',
        minOrderQuantity: 2,
        leadTimeDays: 1,
        supplierId: 'sup_1',
        unitCost: 220,
        shelfLifeDays: 2,
      },
    ],
    suppliers: [
      {
        id: 'sup_1',
        name: 'Prime Poultry',
        orderCutoffTime: '18:00',
        leadTimeDays: 1,
      },
    ],
    inventory: [
      {
        ingredientId: 'ing_chicken',
        currentStock: 2,
        unit: 'kg',
      },
    ],
  };

  const plan = executeDailyPlan(input);
  return { plan, input };
}

async function runTests() {
  console.log('Running Phase 7 Critic & Change Summary Unit Tests...');

  // Test 1: Valid plan passes all invariants
  {
    const { plan } = createBaseTestPlan();
    const report = auditPlanDeterministic(plan, { dish_1: 60 });
    assert.equal(report.passed, true, 'Valid baseline plan should pass');
    assert.equal(report.issues.length, 0, 'Valid baseline plan should have 0 issues');
    console.log('✓ Test 1 Passed: Valid baseline plan approved with 0 issues.');
  }

  // Test 2: Negative stock triggers rejection with CLAMP_STOCK_ZERO adjustment
  {
    const { plan } = createBaseTestPlan();
    plan.orderItems[0].currentStock = -4;
    const report = auditPlanDeterministic(plan, { dish_1: 60 });
    assert.equal(report.passed, false, 'Negative stock plan must be rejected');
    assert.ok(
      report.issues.some((i) => i.code === 'NEGATIVE_STOCK'),
      'Must flag NEGATIVE_STOCK'
    );
    assert.ok(
      report.adjustmentsToApply.some((a) => a.type === 'CLAMP_STOCK_ZERO' && a.adjustedValue === 0),
      'Must emit CLAMP_STOCK_ZERO constraint adjustment'
    );
    console.log('✓ Test 2 Passed: Negative stock rejected with CLAMP_STOCK_ZERO adjustment.');
  }

  // Test 3: Exceeding 2x historical max triggers rejection and CAP_PORTIONS adjustment
  {
    const { plan } = createBaseTestPlan();
    plan.prepItems[0].plannedPortions = 150;
    const report = auditPlanDeterministic(plan, { dish_1: 60 });
    assert.equal(report.passed, false, 'Plan exceeding 2x historical max must be rejected');
    assert.ok(
      report.issues.some((i) => i.code === 'EXCEEDS_2X_HISTORICAL_MAX'),
      'Must flag EXCEEDS_2X_HISTORICAL_MAX'
    );
    assert.ok(
      report.adjustmentsToApply.some((a) => a.type === 'CAP_PORTIONS' && a.adjustedValue === 120),
      'Must emit CAP_PORTIONS to 2x max (120)'
    );
    console.log('✓ Test 3 Passed: >2x historical max rejected and capped at 120 portions.');
  }

  // Test 4: Change summary computes portion deltas accurately
  {
    const { plan: currentPlan } = createBaseTestPlan();
    const { plan: prevPlan } = createBaseTestPlan();
    prevPlan.targetDate = '2026-03-31';
    prevPlan.prepItems[0].plannedPortions = 38;
    const summary = await computeChangeSummary(currentPlan, 'rest_test_1', undefined, undefined, prevPlan);
    assert.equal(summary.hasPreviousPlan, true);
    assert.equal(
      summary.totalDeltaPortions,
      currentPlan.prepItems[0].plannedPortions - 38
    );
    console.log('✓ Test 4 Passed: Change summary accurately computed portion deltas.\n');
  }
}

runTests().catch((err) => {
  console.error('Critic test failed:', err);
  process.exit(1);
});
