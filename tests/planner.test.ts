import assert from 'node:assert/strict';
import {
  executeDailyPlan,
  calculatePlannedPortions,
  determineServiceLevel,
  PlannerExecutionInput,
} from '../server/planner.js';
import { ForecastResult, DayFeatures } from '../server/forecast/types.js';

async function runPlannerTests() {
  console.log('Running Phase 6 Daily Kitchen Planner Engine Tests...');

  // 1. Test Newsvendor Critical Ratio vs Owner Slider
  const nv1 = determineServiceLevel(300, 90, 0.85); // cu = 210, co = 90 -> 210/300 = 0.70
  assert.equal(nv1.source, 'newsvendor');
  assert.equal(nv1.serviceLevel, 0.70);

  // Missing cost -> falls back to owner slider without inventing cost
  const nv2 = determineServiceLevel(300, undefined, 0.85);
  assert.equal(nv2.source, 'owner-set');
  assert.equal(nv2.serviceLevel, 0.85);

  // 2. Test Quantile Portion Calculation
  assert.equal(calculatePlannedPortions(40, 60, 0.50), 40);
  assert.equal(calculatePlannedPortions(40, 60, 0.90), 60);
  assert.equal(calculatePlannedPortions(40, 60, 0.70), 50);

  // 3. Test Full Planner Execution
  const forecasts: ForecastResult[] = [
    {
      menuItemId: 'dish_biryani',
      dishName: 'Chicken Biryani',
      category: 'Main Course',
      targetDate: '2025-05-15',
      p10: 30,
      p50: 40,
      p90: 60,
      confidence: 'High',
      confidenceReason: '30 days history',
      factorContributions: { baseLevel: 40, weekdayEffect: 5, weatherEffect: 0, eventEffect: 0, trendEffect: 0 },
      modelWeights: { seasonalNaive: 0.2, weightedWeekday: 0.3, holtWinters: 0.3, ridge: 0.2 },
      baselineSeasonalNaive: 38,
      daysOfHistory: 30,
    },
    {
      menuItemId: 'dish_salad',
      dishName: 'Fresh Kachumber Salad',
      category: 'Sides',
      targetDate: '2025-05-15',
      p10: 10,
      p50: 20,
      p90: 30,
      confidence: 'Medium',
      confidenceReason: '14 days history',
      factorContributions: { baseLevel: 20, weekdayEffect: 0, weatherEffect: 0, eventEffect: 0, trendEffect: 0 },
      modelWeights: { seasonalNaive: 0.5, weightedWeekday: 0.5, holtWinters: 0, ridge: 0 },
      baselineSeasonalNaive: 20,
      daysOfHistory: 14,
    },
    {
      menuItemId: 'dish_mystery',
      dishName: 'Chef Special Kebab',
      category: 'Starters',
      targetDate: '2025-05-15',
      p10: 15,
      p50: 25,
      p90: 35,
      confidence: 'Low',
      confidenceReason: '7 days history',
      factorContributions: { baseLevel: 25, weekdayEffect: 0, weatherEffect: 0, eventEffect: 0, trendEffect: 0 },
      modelWeights: { seasonalNaive: 1, weightedWeekday: 0, holtWinters: 0, ridge: 0 },
      baselineSeasonalNaive: 25,
      daysOfHistory: 7,
    },
  ];

  const dayFeatures: DayFeatures = {
    date: '2025-05-15',
    dayOfWeek: 4, // Thursday
    tempMax: 33,
    tempBucket: 'warm',
    isRain: true,
    isHolidayOrEvent: true,
    eventName: 'Local Cricket Match',
    isFirstWeekOfMonth: false,
  };

  const plannerInput: PlannerExecutionInput = {
    restaurantId: 'rest_test_1',
    restaurantName: 'Spice Garden Kitchen',
    targetDate: '2025-05-15',
    serviceLevelSlider: 0.90,
    forecasts,
    menuItems: [
      {
        id: 'dish_biryani',
        name: 'Chicken Biryani',
        category: 'Main Course',
        price: 300,
        cost: 90,
        shelfLifeDays: 2,
      },
      {
        id: 'dish_salad',
        name: 'Fresh Kachumber Salad',
        category: 'Sides',
        shelfLifeDays: 1,
      },
      {
        id: 'dish_mystery',
        name: 'Chef Special Kebab',
        category: 'Starters',
      },
    ],
    recipes: [
      {
        id: 'rec_biryani',
        menuItemId: 'dish_biryani',
        dishName: 'Chicken Biryani',
        batchYield: 10,
        prepStation: 'Dum Station',
        ingredients: [
          {
            ingredientId: 'ing_chicken',
            name: 'Boneless Chicken',
            quantity: 2,
            unit: 'kg',
            trimWastePercent: 20,
          },
          {
            ingredientId: 'ing_rice',
            name: 'Basmati Rice',
            quantity: 1.5,
            unit: 'kg',
            trimWastePercent: 0,
          },
        ],
      },
      {
        id: 'rec_salad',
        menuItemId: 'dish_salad',
        dishName: 'Fresh Kachumber Salad',
        batchYield: 1,
        prepStation: 'Cold Garde Manger',
        ingredients: [
          {
            ingredientId: 'ing_cucumber',
            name: 'Fresh Cucumber',
            quantity: 0.15,
            unit: 'kg',
            trimWastePercent: 10,
          },
        ],
      },
    ],
    ingredients: [
      {
        id: 'ing_chicken',
        name: 'Boneless Chicken',
        category: 'Meat & Poultry',
        unit: 'kg',
        packageSize: 5,
        packageUnit: 'kg',
        minOrderQuantity: 2,
        leadTimeDays: 1,
        supplierId: 'sup_meat',
        unitCost: 240,
      },
      {
        id: 'ing_rice',
        name: 'Basmati Rice',
        category: 'Dry Store',
        unit: 'kg',
        packageSize: 10,
        packageUnit: 'kg',
        minOrderQuantity: 3,
        leadTimeDays: 2,
        supplierId: 'sup_dry',
        unitCost: 110,
      },
      {
        id: 'ing_cucumber',
        name: 'Fresh Cucumber',
        category: 'Produce',
        unit: 'kg',
        packageSize: 2,
        packageUnit: 'kg',
        minOrderQuantity: 1,
        leadTimeDays: 1,
        supplierId: null,
        unitCost: 40,
      },
    ],
    suppliers: [
      {
        id: 'sup_meat',
        name: 'Deccan Prime Meats',
        phone: '+91 98765 43210',
        whatsapp: '+919876543210',
        orderCutoffTime: '19:00',
        leadTimeDays: 1,
      },
      {
        id: 'sup_dry',
        name: 'Royal Grains Wholesale',
        phone: '+91 91234 56789',
        orderCutoffTime: '17:00',
        leadTimeDays: 2,
      },
    ],
    inventory: [
      {
        ingredientId: 'ing_chicken',
        currentStock: 3.5,
      },
      {
        ingredientId: 'ing_rice',
        currentStock: 0,
      },
    ],
    dayFeatures,
  };

  const plan = executeDailyPlan(plannerInput);

  assert.equal(plan.noStockEntered, false);

  const biryaniPrep = plan.prepItems.find((p) => p.menuItemId === 'dish_biryani')!;
  assert.ok(biryaniPrep);
  assert.equal(biryaniPrep.plannedPortions, 50);
  assert.equal(biryaniPrep.serviceLevelSource, 'newsvendor');
  assert.equal(biryaniPrep.recipeMissing, false);

  const kebabPrep = plan.prepItems.find((p) => p.menuItemId === 'dish_mystery')!;
  assert.ok(kebabPrep);
  assert.equal(kebabPrep.recipeMissing, true);
  assert.equal(kebabPrep.hasRecipe, false);

  const chickenOrder = plan.orderItems.find((o) => o.ingredientId === 'ing_chicken')!;
  assert.ok(chickenOrder);
  assert.equal(chickenOrder.totalGrossNeeded, 12.5);
  assert.equal(chickenOrder.currentStock, 3.5);
  assert.equal(chickenOrder.netNeeded, 9.0);
  assert.equal(chickenOrder.packsToOrder, 2);
  assert.equal(chickenOrder.finalOrderQuantity, 10);
  assert.equal(chickenOrder.estimatedCost, 2400);

  const riceOrder = plan.orderItems.find((o) => o.ingredientId === 'ing_rice')!;
  assert.ok(riceOrder);
  assert.equal(riceOrder.totalGrossNeeded, 7.5);
  assert.equal(riceOrder.packsToOrder, 3);
  assert.equal(riceOrder.finalOrderQuantity, 30);

  assert.equal(plan.supplierGroups.length, 3);
  const meatSupplier = plan.supplierGroups.find((g) => g.supplierId === 'sup_meat')!;
  assert.ok(meatSupplier);
  assert.ok(meatSupplier.whatsAppUrl.startsWith('https://wa.me/919876543210?text='));
  assert.ok(meatSupplier.messageTemplate.includes('Boneless Chicken: 10 kg'));

  const emptyStockPlan = executeDailyPlan({
    ...plannerInput,
    inventory: [],
  });
  assert.equal(emptyStockPlan.noStockEntered, true);
  assert.equal(emptyStockPlan.stockStatusMessage, 'No stock entered, order list assumes an empty kitchen.');

  console.log('✓ All Phase 6 Planner Engine unit tests passed!\n');
}

runPlannerTests().catch((err) => {
  console.error('Planner tests failed:', err);
  process.exit(1);
});
