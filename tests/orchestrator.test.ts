import assert from 'node:assert/strict';
import {
  getOrStartPlanningPipeline,
  OrchestratorProgressEvent,
} from '../server/agents/orchestrator.js';
import { agentObservability } from '../server/lib/observability.js';

const TEST_FIXTURES = {
  forecasts: [
    {
      menuItemId: 'dish_1',
      dishName: 'Hyderabadi Chicken Biryani',
      category: 'Biryani',
      targetDate: '2026-04-05',
      p10: 32,
      p50: 46,
      p90: 60,
      confidence: 'High',
      confidenceReason: '28 days of history',
      factorContributions: {
        baseLevel: 40,
        weekdayEffect: 4,
        weatherEffect: 2,
        eventEffect: 0,
        trendEffect: 0,
      },
      modelWeights: { seasonalNaive: 0.25, weightedWeekday: 0.25, holtWinters: 0.25, ridge: 0.25 },
      baselineSeasonalNaive: 42,
      daysOfHistory: 28,
    },
    {
      menuItemId: 'dish_2',
      dishName: 'Paneer Butter Masala',
      category: 'Curries',
      targetDate: '2026-04-05',
      p10: 20,
      p50: 28,
      p90: 36,
      confidence: 'High',
      confidenceReason: '28 days of history',
      factorContributions: {
        baseLevel: 25,
        weekdayEffect: 2,
        weatherEffect: 1,
        eventEffect: 0,
        trendEffect: 0,
      },
      modelWeights: { seasonalNaive: 0.25, weightedWeekday: 0.25, holtWinters: 0.25, ridge: 0.25 },
      baselineSeasonalNaive: 26,
      daysOfHistory: 28,
    },
  ],
  menuItems: [
    {
      id: 'dish_1',
      name: 'Hyderabadi Chicken Biryani',
      category: 'Biryani',
      price: 340,
      cost: 115,
      shelfLifeDays: 1,
      hasConfirmedRecipe: true,
      recipeId: 'rec_1',
    },
    {
      id: 'dish_2',
      name: 'Paneer Butter Masala',
      category: 'Curries',
      price: 280,
      cost: 90,
      shelfLifeDays: 1,
      hasConfirmedRecipe: true,
      recipeId: 'rec_2',
    },
  ],
  recipes: [
    {
      id: 'rec_1',
      menuItemId: 'dish_1',
      dishName: 'Hyderabadi Chicken Biryani',
      batchYield: 10,
      prepStation: 'Biryani Handi Station',
      ingredients: [
        {
          ingredientId: 'ing_chicken',
          name: 'Fresh Farm Chicken',
          quantity: 2.5,
          unit: 'kg',
          trimWastePercent: 10,
        },
        {
          ingredientId: 'ing_rice',
          name: 'Aged Basmati Rice',
          quantity: 1.5,
          unit: 'kg',
          trimWastePercent: 2,
        },
      ],
    },
    {
      id: 'rec_2',
      menuItemId: 'dish_2',
      dishName: 'Paneer Butter Masala',
      batchYield: 8,
      prepStation: 'Tandoor & Curry Line',
      ingredients: [
        {
          ingredientId: 'ing_paneer',
          name: 'Fresh Malai Paneer',
          quantity: 1.6,
          unit: 'kg',
          trimWastePercent: 5,
        },
      ],
    },
  ],
  ingredients: [
    {
      id: 'ing_chicken',
      name: 'Fresh Farm Chicken',
      category: 'Meat & Poultry',
      unit: 'kg',
      packageSize: 5,
      packageUnit: 'kg',
      minOrderQuantity: 2,
      leadTimeDays: 1,
      supplierId: 'sup_1',
      unitCost: 220,
      shelfLifeDays: 2,
    },
    {
      id: 'ing_rice',
      name: 'Aged Basmati Rice',
      category: 'Grains & Dry',
      unit: 'kg',
      packageSize: 25,
      packageUnit: 'kg',
      minOrderQuantity: 1,
      leadTimeDays: 2,
      supplierId: 'sup_2',
      unitCost: 110,
      shelfLifeDays: 90,
    },
    {
      id: 'ing_paneer',
      name: 'Fresh Malai Paneer',
      category: 'Dairy',
      unit: 'kg',
      packageSize: 2,
      packageUnit: 'kg',
      minOrderQuantity: 1,
      leadTimeDays: 1,
      supplierId: 'sup_1',
      unitCost: 340,
      shelfLifeDays: 2,
    },
  ],
  suppliers: [
    {
      id: 'sup_1',
      name: 'Deccan Fresh Farms',
      phone: '+919876543210',
      whatsapp: '+919876543210',
      orderCutoffTime: '18:00',
      leadTimeDays: 1,
    },
    {
      id: 'sup_2',
      name: 'Royal Grains Co.',
      phone: '+919123456789',
      whatsapp: '+919123456789',
      orderCutoffTime: '17:00',
      leadTimeDays: 2,
    },
  ],
  historicalMaxMap: {
    dish_1: 60,
    dish_2: 45,
  },
};

async function runOrchestratorTests() {
  console.log('Running Phase 7 Orchestrator & Critic Retry Loop Tests...');

  // Test 1: End-to-End Orchestrator with Simulated Negative Stock Critic Rejection & Auto-Fix Retry
  {
    const progressEvents: OrchestratorProgressEvent[] = [];
    const pipeline = getOrStartPlanningPipeline({
      restaurantId: 'rest_test_orchestrator',
      targetDate: '2026-04-05',
      idempotencyKey: `test_neg_stock_${Date.now()}`,
      serviceLevelSlider: 0.85,
      testNegativeStock: true,
      skipNetwork: true,
      testFixtures: TEST_FIXTURES,
    });

    pipeline.emitter.on('progress', (event: OrchestratorProgressEvent) => {
      progressEvents.push(event);
    });

    const result = await pipeline.resultPromise;

    assert.equal(result.success, true, 'Orchestrator should succeed after Critic retry');
    assert.equal(result.retries, 1, 'Should take 1 retry (Attempt 1 rejected -> Attempt 2 approved)');
    assert.equal(
      result.criticReport.passed,
      true,
      'Final Critic report on Attempt 2 must pass'
    );

    const retryEvent = progressEvents.find((e) => e.type === 'critic_retry');
    assert.ok(retryEvent, 'Progress stream must emit a critic_retry event');

    for (const item of result.plan.orderItems) {
      assert.ok(item.currentStock >= 0, `Final plan ingredient ${item.ingredientName} must have stock >= 0`);
    }

    const traces = agentObservability.getSteps('rest_test_orchestrator');
    console.log(
      `✓ Test 1 Passed: Critic rejected negative stock on Attempt 1, adjusted stock to 0, and approved on Attempt 2 (${traces.length} trace steps logged).`
    );
  }

  // Test 2: Idempotency Key Deduplication (Concurrent calls share the same execution)
  {
    const sharedKey = `idemp_key_${Date.now()}`;
    const call1 = getOrStartPlanningPipeline({
      restaurantId: 'rest_test_orchestrator',
      targetDate: '2026-04-06',
      idempotencyKey: sharedKey,
      serviceLevelSlider: 0.85,
      skipNetwork: true,
      testFixtures: TEST_FIXTURES,
    });

    const call2 = getOrStartPlanningPipeline({
      restaurantId: 'rest_test_orchestrator',
      targetDate: '2026-04-06',
      idempotencyKey: sharedKey,
      serviceLevelSlider: 0.85,
      skipNetwork: true,
      testFixtures: TEST_FIXTURES,
    });

    assert.equal(call2.isExisting, true, 'Second concurrent call with same idempotencyKey must attach to existing run');

    const [res1, res2] = await Promise.all([call1.resultPromise, call2.resultPromise]);
    assert.equal(
      res1.state.idempotencyKey,
      res2.state.idempotencyKey,
      'Concurrent calls with same idempotencyKey must share execution'
    );
    assert.equal(res1.retries, 0, 'Clean run without negative stock should approve on Attempt 1 (0 retries)');
    console.log('✓ Test 2 Passed: Idempotency key deduplicated concurrent pipeline calls.\n');
  }
}

runOrchestratorTests().catch((err) => {
  console.error('Orchestrator test failed:', err);
  process.exit(1);
});
