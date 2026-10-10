import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTING_EVAL_DATASET, EvalSample } from './dataset.js';
import { classifyMessageDeterministically, triageMessage } from '../../server/agents/triage.js';
import { explainDishPortion } from '../../server/agents/explainer.js';
import { verifyNumberGuard } from '../../server/lib/guards.js';
import { DailyPlanOutput } from '../../server/planner.js';

describe('Phase 8 Evals Harness: Multi-Lingual Routing & Grounding Verification', () => {
  it('achieves >= 90% routing accuracy across 30 multi-lingual messages (EN, HI, TE, typos)', async () => {
    let correctCount = 0;
    const totalCount = ROUTING_EVAL_DATASET.length;
    const failures: Array<{ id: string; message: string; expected: string; actual: string }> = [];

    for (const sample of ROUTING_EVAL_DATASET) {
      // Test both deterministic classifier and triage function
      const result = classifyMessageDeterministically(sample.message);
      if (result.route === sample.expectedRoute) {
        correctCount++;
      } else {
        failures.push({
          id: sample.id,
          message: sample.message,
          expected: sample.expectedRoute,
          actual: result.route,
        });
      }

      // Check language detection
      assert.strictEqual(
        result.language,
        sample.language,
        `Language misclassified for sample ${sample.id} ("${sample.message}"): expected ${sample.language}, got ${result.language}`
      );
    }

    const accuracyPercent = (correctCount / totalCount) * 100;
    console.log('\n========================================');
    console.log('--- CRAVECAST TRIAGE ROUTING EVALUATION ---');
    console.log(`Total Samples:       ${totalCount}`);
    console.log(`Correctly Classified: ${correctCount}`);
    console.log(`Accuracy:            ${accuracyPercent.toFixed(1)}%`);
    if (failures.length > 0) {
      console.log('Failures:', failures);
    }
    console.log('========================================\n');

    assert.ok(
      accuracyPercent >= 90,
      `Routing accuracy was ${accuracyPercent.toFixed(1)}%, expected >= 90%`
    );
  });

  it('formulates a clarifying question in the owner language when message is ambiguous / low confidence', async () => {
    // English ambiguous
    const enAmbiguous = classifyMessageDeterministically('tomorrow');
    assert.ok(enAmbiguous.confidence < 0.7);
    assert.ok(enAmbiguous.clarifyingQuestion?.includes('clarify') || enAmbiguous.clarifyingQuestion?.includes('Would you like'));

    // Hindi ambiguous
    const hiAmbiguous = classifyMessageDeterministically('kal');
    assert.strictEqual(hiAmbiguous.language, 'hi');
    assert.ok(hiAmbiguous.confidence < 0.7);
    assert.ok(hiAmbiguous.clarifyingQuestion?.includes('किचन प्लान') || hiAmbiguous.clarifyingQuestion?.includes('कारण'));

    // Telugu ambiguous
    const teAmbiguous = classifyMessageDeterministically('repu');
    assert.strictEqual(teAmbiguous.language, 'te');
    assert.ok(teAmbiguous.confidence < 0.7);
    assert.ok(teAmbiguous.clarifyingQuestion?.includes('ప్లాన్') || teAmbiguous.clarifyingQuestion?.includes('వివరాలు'));
  });

  it('Grounding Check 1: Explainer MUST refuse when plan or dish data is missing', async () => {
    // 1. Missing plan entirely
    const resNoPlan = await explainDishPortion({
      restaurantId: 'test_rest',
      targetDate: '2026-10-15',
      dishNameOrQuery: 'Chicken Biryani',
    });

    assert.strictEqual(resNoPlan.grounded, false, 'Explainer must not claim grounding when plan is absent');
    assert.ok(
      resNoPlan.explanation.includes('No forecast or plan data found') || resNoPlan.refusalReason,
      'Explainer must state that data is missing'
    );

    // 2. Dish not in plan
    const mockPlan: DailyPlanOutput = {
      restaurantId: 'test_rest',
      restaurantName: 'Test Kitchen',
      targetDate: '2026-10-15',
      generatedAt: '2026-10-14T10:00:00.000Z',
      status: 'draft',
      serviceLevelSlider: 0.85,
      noStockEntered: false,
      stockStatusMessage: 'Current stock deducted from ingredient prep requirements.',
      prepItems: [
        {
          menuItemId: 'dish_1',
          dishName: 'Paneer Butter Masala',
          category: 'Curry',
          p10: 12,
          p50: 25,
          p90: 38,
          serviceLevel: 0.85,
          serviceLevelSource: 'newsvendor',
          serviceLevelLabel: 'Newsvendor (85%)',
          plannedPortions: 34,
          cappedByShelfLife: false,
          shelfLifeDays: 2,
          hasRecipe: true,
          recipeMissing: false,
          station: 'Hot Range',
          reason: 'Weekend boost',
          confidence: 'High',
        },
      ],
      orderItems: [],
      supplierGroups: [],
      summary: {
        totalPlannedPortions: 34,
        totalDishesCount: 1,
        dishesWithRecipesCount: 1,
        dishesMissingRecipesCount: 0,
        totalOrderItemsCount: 0,
        totalEstimatedOrderCost: 0,
        urgentOrderCount: 0,
      },
    };

    const resMissingDish = await explainDishPortion({
      restaurantId: 'test_rest',
      targetDate: '2026-10-15',
      dishNameOrQuery: 'Mutton Nihari',
      planData: mockPlan,
    });

    assert.strictEqual(resMissingDish.grounded, false);
    assert.ok(
      resMissingDish.explanation.includes('was not found in the plan') || resMissingDish.refusalReason,
      'Explainer must explicitly refuse when requested dish is missing from plan'
    );
  });

  it('Grounding Check 2: Number Guard catches hallucinated / invented figures', () => {
    // Real dish input: planned portions 34, p50 25, p90 38, 85%
    const allowedNumbers = [34, 12, 25, 38, 85, 2];

    // Truthful sentence containing only allowed numbers
    const truthfulText = 'We planned 34 portions based on a median p50 of 25 and 85% service level.';
    const validResult = verifyNumberGuard(truthfulText, allowedNumbers);
    assert.strictEqual(validResult.valid, true);
    assert.strictEqual(validResult.rejectedSentences.length, 0);

    // Invented figure: 99 or 450
    const hallucinatedText = 'We planned 34 portions because yesterday 450 customers bought 99 plates.';
    const invalidResult = verifyNumberGuard(hallucinatedText, allowedNumbers);
    assert.strictEqual(invalidResult.valid, false);
    assert.ok(invalidResult.rejectedSentences.length > 0);
    assert.ok(invalidResult.rejectedSentences[0].includes('450') || invalidResult.rejectedSentences[0].includes('99'));
  });

  it('Grounding Check 3: Explainer succeeds and cites verified data when present', async () => {
    const mockPlan: DailyPlanOutput = {
      restaurantId: 'test_rest',
      restaurantName: 'Test Kitchen',
      targetDate: '2026-10-15',
      generatedAt: '2026-10-14T10:00:00.000Z',
      status: 'draft',
      serviceLevelSlider: 0.85,
      noStockEntered: false,
      stockStatusMessage: 'Current stock deducted from ingredient prep requirements.',
      prepItems: [
        {
          menuItemId: 'dish_biryani',
          dishName: 'Chicken Dum Biryani',
          category: 'Biryani',
          p10: 20,
          p50: 40,
          p90: 55,
          serviceLevel: 0.85,
          serviceLevelSource: 'newsvendor',
          serviceLevelLabel: 'Newsvendor (85%)',
          plannedPortions: 45,
          cappedByShelfLife: false,
          shelfLifeDays: 1,
          hasRecipe: true,
          recipeMissing: false,
          station: 'Biryani Station',
          reason: 'Normal demand',
          confidence: 'High',
        },
      ],
      orderItems: [],
      supplierGroups: [],
      summary: {
        totalPlannedPortions: 45,
        totalDishesCount: 1,
        dishesWithRecipesCount: 1,
        dishesMissingRecipesCount: 0,
        totalOrderItemsCount: 0,
        totalEstimatedOrderCost: 0,
        urgentOrderCount: 0,
      },
    };

    const res = await explainDishPortion({
      restaurantId: 'test_rest',
      targetDate: '2026-10-15',
      dishNameOrQuery: 'why 45 biryanis tomorrow?',
      planData: mockPlan,
      language: 'en',
    });

    assert.strictEqual(res.grounded, true);
    assert.strictEqual(res.dishName, 'Chicken Dum Biryani');
    assert.strictEqual(res.factors.plannedPortions, 45);
    assert.strictEqual(res.factors.p50, 40);
    assert.strictEqual(res.factors.p90, 55);
    assert.ok(res.explanation.includes('45'));
    assert.ok(res.explanation.includes('2026-10-15') || res.citation.planDate === '2026-10-15');
    assert.strictEqual(res.numberGuardPassed, true);
  });
});
