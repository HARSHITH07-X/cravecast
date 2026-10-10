import { FunctionDeclaration, Type } from '@google/genai';
import { DailyPlanOutput } from '../planner.js';
import { evaluatePlanWithCritic, CriticReport } from '../agents/critic.js';

export const runCriticToolDeclaration: FunctionDeclaration = {
  name: 'run_critic',
  description: 'Audits the kitchen plan against deterministic business invariants (no negative values, <= 2x historical max, shelf life, math consistency, pack sizes) and Gemini operational sanity review.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      planId: {
        type: Type.STRING,
        description: 'Identifier of the generated plan to audit.',
      },
    },
  },
};

/**
 * Executes Critic audit on the generated DailyPlanOutput.
 */
export async function executeRunCritic(
  plan: DailyPlanOutput,
  historicalMaxMap: Record<string, number> = {},
  retriesSoFar: number = 0,
  context?: {
    weatherCondition?: string;
    avgTemp?: number;
    eventName?: string;
  }
): Promise<CriticReport> {
  return evaluatePlanWithCritic(plan, historicalMaxMap, retriesSoFar, context);
}
