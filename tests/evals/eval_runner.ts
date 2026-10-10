import { ROUTING_EVAL_DATASET } from './dataset.js';
import { classifyMessageDeterministically } from '../../server/agents/triage.js';
import { verifyNumberGuard } from '../../server/lib/guards.js';
import { explainDishPortion } from '../../server/agents/explainer.js';
import { DailyPlanOutput } from '../../server/planner.js';

async function runEvaluation() {
  console.log('=================================================================');
  console.log('    CRAVECAST PHASE 8 EVALUATION HARNESS: ROUTING & GROUNDING    ');
  console.log('=================================================================');

  // 1. Evaluate Routing Accuracy
  let correct = 0;
  const total = ROUTING_EVAL_DATASET.length;
  const routeStats: Record<string, { total: number; correct: number }> = {};
  const langStats: Record<string, { total: number; correct: number }> = {};

  for (const sample of ROUTING_EVAL_DATASET) {
    if (!routeStats[sample.expectedRoute]) routeStats[sample.expectedRoute] = { total: 0, correct: 0 };
    if (!langStats[sample.language]) langStats[sample.language] = { total: 0, correct: 0 };

    routeStats[sample.expectedRoute].total++;
    langStats[sample.language].total++;

    const res = classifyMessageDeterministically(sample.message);
    const isCorrect = res.route === sample.expectedRoute && res.language === sample.language;

    if (isCorrect) {
      correct++;
      routeStats[sample.expectedRoute].correct++;
      langStats[sample.language].correct++;
    } else {
      console.log(`[MISMATCH] ${sample.id}: "${sample.message}" -> got route:${res.route} (expected:${sample.expectedRoute}), lang:${res.language} (expected:${sample.language})`);
    }
  }

  const overallAccuracy = (correct / total) * 100;
  console.log(`\nOverall Routing Accuracy: ${correct}/${total} (${overallAccuracy.toFixed(1)}%)\n`);

  console.log('--- BY ROUTE ---');
  for (const [r, stat] of Object.entries(routeStats)) {
    console.log(`  ${r.padEnd(10)}: ${stat.correct}/${stat.total} (${((stat.correct / stat.total) * 100).toFixed(0)}%)`);
  }

  console.log('\n--- BY LANGUAGE ---');
  for (const [l, stat] of Object.entries(langStats)) {
    console.log(`  ${l.padEnd(10)}: ${stat.correct}/${stat.total} (${((stat.correct / stat.total) * 100).toFixed(0)}%)`);
  }

  // 2. Grounding Check: Explainer Refusal on Missing Data
  console.log('\n--- GROUNDING CHECK: MISSING DATA REFUSAL ---');
  const refusalResult = await explainDishPortion({
    restaurantId: 'eval_rest',
    dishNameOrQuery: 'Haleem',
    targetDate: '2026-10-20',
  });
  const refusalPassed = !refusalResult.grounded && refusalResult.explanation.includes('No forecast or plan data found');
  console.log(`  Missing Data Refusal: ${refusalPassed ? 'PASSED (Cleanly Refused with Citation Notice)' : 'FAILED'}`);

  // 3. Grounding Check: Number Guard Rejection
  console.log('\n--- GROUNDING CHECK: NUMBER GUARD INVENTED FIGURE ---');
  const guardResult = verifyNumberGuard('We recommend 45 portions because 999 orders were delivered.', [45]);
  const guardPassed = !guardResult.valid && guardResult.rejectedSentences.length > 0;
  console.log(`  Number Guard Trap:   ${guardPassed ? 'PASSED (Invented 999 Rejected)' : 'FAILED'}`);

  console.log('\n=================================================================');
  if (overallAccuracy >= 90 && refusalPassed && guardPassed) {
    console.log('  EVALUATION SUMMARY: ALL CHECKS PASSED SUCCESSFULLY (PASS)');
    console.log('=================================================================\n');
    process.exit(0);
  } else {
    console.error('  EVALUATION SUMMARY: FAILED CRITERIA');
    console.log('=================================================================\n');
    process.exit(1);
  }
}

runEvaluation().catch((err) => {
  console.error('Fatal eval error:', err);
  process.exit(1);
});
