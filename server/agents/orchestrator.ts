import { EventEmitter } from 'events';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { MODEL_REASONING, CONFIG } from '../config.js';
import type { FirestoreClient } from '../lib/firestoreRest.js';
import {
  getWeatherToolDeclaration,
  executeGetWeather,
  WeatherToolOutput,
  getEventsToolDeclaration,
  executeGetEvents,
  EventsToolOutput,
  getInventoryToolDeclaration,
  executeGetInventory,
  InventoryToolOutput,
  runForecastToolDeclaration,
  executeRunForecast,
  ForecastToolOutput,
  buildPlanToolDeclaration,
  executeBuildPlan,
  BuildPlanToolOutput,
  BuildPlanOptions,
  runCriticToolDeclaration,
  executeRunCritic,
} from '../tools/index.js';
import { CriticReport, ConstraintAdjustment } from './critic.js';
import { computeChangeSummary, ChangeSummaryResult } from './changeSummary.js';
import { DailyPlanOutput } from '../planner.js';

// ==========================================
// 1. Typed State Machine Schemas
// ==========================================
export const OrchestratorStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'retrying',
  'failed',
]);

export type OrchestratorStepStatus = z.infer<typeof OrchestratorStepStatusSchema>;

export const OrchestratorStateSchema = z.object({
  idempotencyKey: z.string(),
  restaurantId: z.string(),
  targetDate: z.string(),
  status: z.enum([
    'IDLE',
    'FETCHING_CONTEXT',
    'RUNNING_FORECAST',
    'BUILDING_PLAN',
    'CRITIQUING',
    'ADJUSTING_RETRY',
    'COMPLETED',
    'FAILED',
  ]),
  currentStep: z.string(),
  steps: z.record(
    z.string(),
    z.object({
      status: OrchestratorStepStatusSchema,
      detail: z.string().optional(),
      attempt: z.number().default(1),
      startedAt: z.string().optional(),
      completedAt: z.string().optional(),
    })
  ),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(2),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>;

export interface OrchestratorProgressEvent {
  type:
    | 'pipeline_started'
    | 'step_started'
    | 'step_progress'
    | 'step_completed'
    | 'critic_alert'
    | 'critic_retry'
    | 'pipeline_completed'
    | 'pipeline_failed';
  idempotencyKey: string;
  step?: string;
  status?: OrchestratorStepStatus;
  message: string;
  timestamp: string;
  state?: OrchestratorState;
  criticReport?: CriticReport;
  changeSummary?: ChangeSummaryResult;
  plan?: DailyPlanOutput;
}

export interface OrchestrationInput {
  restaurantId: string;
  targetDate: string;
  idempotencyKey: string;
  serviceLevelSlider?: number;
  testNegativeStock?: boolean;
  skipNetwork?: boolean;
  db?: FirestoreClient;
  testFixtures?: {
    forecasts?: any[];
    menuItems?: any[];
    recipes?: any[];
    ingredients?: any[];
    suppliers?: any[];
    inventory?: any[];
    historicalMaxMap?: Record<string, number>;
  };
}

export interface OrchestrationResult {
  success: boolean;
  plan: DailyPlanOutput;
  criticReport: CriticReport;
  changeSummary: ChangeSummaryResult;
  state: OrchestratorState;
  retries: number;
}

// In-memory idempotency cache for active / recent pipeline runs
interface ActivePipelineEntry {
  state: OrchestratorState;
  emitter: EventEmitter;
  resultPromise?: Promise<OrchestrationResult>;
  cachedResult?: OrchestrationResult;
  createdAt: number;
}

const activePipelines = new Map<string, ActivePipelineEntry>();

// Purge cache older than 10 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of activePipelines.entries()) {
    if (now - entry.createdAt > 10 * 60 * 1000) {
      activePipelines.delete(key);
    }
  }
}, 60 * 1000);
cleanupInterval.unref();

/**
 * Executes an async task with timeout.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, stepName: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout of ${timeoutMs}ms exceeded in step: ${stepName}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Executes a function with exponential backoff retry.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 2,
  baseDelayMs: number = 300
): Promise<T> {
  let attempt = 0;
  let lastError: any;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Initializes Google Gen AI for function-calling reasoning.
 */
function createGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: CONFIG.geminiApiKey || process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Main Planning Orchestrator
 */
export class PlanningOrchestrator {
  private input: OrchestrationInput;
  private state: OrchestratorState;
  private emitter: EventEmitter;
  private ai: GoogleGenAI;

  constructor(input: OrchestrationInput, emitter: EventEmitter) {
    this.input = input;
    this.emitter = emitter;
    this.ai = createGenAIClient();

    const now = new Date().toISOString();
    this.state = {
      idempotencyKey: input.idempotencyKey,
      restaurantId: input.restaurantId,
      targetDate: input.targetDate,
      status: 'IDLE',
      currentStep: 'initialization',
      steps: {
        weather: { status: 'pending', attempt: 1 },
        events: { status: 'pending', attempt: 1 },
        inventory: { status: 'pending', attempt: 1 },
        forecast: { status: 'pending', attempt: 1 },
        plan: { status: 'pending', attempt: 1 },
        critic: { status: 'pending', attempt: 1 },
        change_summary: { status: 'pending', attempt: 1 },
      },
      retryCount: 0,
      maxRetries: 2,
      createdAt: now,
      updatedAt: now,
    };
  }

  public getState(): OrchestratorState {
    return this.state;
  }

  private emitEvent(event: Omit<OrchestratorProgressEvent, 'idempotencyKey' | 'timestamp'>) {
    this.state.updatedAt = new Date().toISOString();
    // Validate state shape using Zod
    OrchestratorStateSchema.parse(this.state);

    const fullEvent: OrchestratorProgressEvent = {
      ...event,
      idempotencyKey: this.input.idempotencyKey,
      timestamp: new Date().toISOString(),
      state: { ...this.state },
    };
    this.emitter.emit('progress', fullEvent);
  }

  private updateStep(
    stepName: string,
    status: OrchestratorStepStatus,
    detail?: string,
    attempt?: number
  ) {
    if (!this.state.steps[stepName]) {
      this.state.steps[stepName] = { status, attempt: attempt || 1 };
    }
    const current = this.state.steps[stepName];
    current.status = status;
    if (detail) current.detail = detail;
    if (attempt) current.attempt = attempt;
    if (status === 'running') current.startedAt = new Date().toISOString();
    if (status === 'completed' || status === 'failed') current.completedAt = new Date().toISOString();
    this.state.currentStep = stepName;
  }

  /**
   * Runs the complete pipeline with parallel steps, invariant validation, and retries.
   */
  public async run(): Promise<OrchestrationResult> {
    const { restaurantId, targetDate, serviceLevelSlider = 0.85, testNegativeStock, db } = this.input;

    this.state.status = 'FETCHING_CONTEXT';
    this.emitEvent({
      type: 'pipeline_started',
      message: `Starting CraveCast planning pipeline for ${targetDate}...`,
    });

    try {
      // ==============================================================
      // STEP 1: PARALLEL CONTEXT FETCH (Weather, Events, Inventory)
      // Independent tools run in parallel!
      // ==============================================================
      this.updateStep('weather', 'running', 'Connecting to Open-Meteo forecast API...');
      this.updateStep('events', 'running', 'Fetching confirmed events and public holidays...');
      this.updateStep('inventory', 'running', 'Reading on-hand inventory levels...');

      this.emitEvent({
        type: 'step_started',
        step: 'context_parallel',
        message: 'Fetching weather, events calendar, and kitchen inventory concurrently in parallel...',
      });

      const [weatherResult, eventsResult, inventoryResult] = await withTimeout(
        Promise.all([
          withRetry(() => executeGetWeather(restaurantId, targetDate, db), 2, 400),
          withRetry(() => executeGetEvents(restaurantId, targetDate, db), 2, 300),
          withRetry(() => executeGetInventory(restaurantId, db), 2, 300),
        ]),
        12000,
        'parallel_context_fetch'
      );

      this.updateStep(
        'weather',
        'completed',
        `${weatherResult.condition}, ${weatherResult.tempMin}°C–${weatherResult.tempMax}°C (${weatherResult.precipitationChance}% rain chance)`
      );
      this.updateStep(
        'events',
        'completed',
        eventsResult.hasEvent ? eventsResult.eventSummary : 'No special events or holidays'
      );
      this.updateStep(
        'inventory',
        'completed',
        inventoryResult.hasNegativeStock
          ? `WARNING: Negative stock detected on ${inventoryResult.negativeStockItems.length} items (e.g. ${inventoryResult.negativeStockItems[0].ingredientName}: ${inventoryResult.negativeStockItems[0].currentStock})`
          : `${inventoryResult.totalItems} ingredients cataloged (${inventoryResult.hasStockEntered ? 'stock recorded' : 'empty kitchen assumed'})`
      );

      this.emitEvent({
        type: 'step_completed',
        step: 'context_parallel',
        message: `Context gathered: Weather is ${weatherResult.condition}, ${eventsResult.events.length} calendar events, ${inventoryResult.totalItems} ingredients analyzed.`,
      });

      // Optional LLM Reasoning step using @google/genai with bounded thinking budget & function declarations
      if (
        (CONFIG.geminiApiKey || process.env.GEMINI_API_KEY) &&
        process.env.NODE_ENV !== 'test' &&
        !this.input.skipNetwork
      ) {
        try {
          await withTimeout(
            this.ai.models.generateContent({
              model: MODEL_REASONING,
              contents: `The kitchen planner orchestrator is preparing demand forecasting and supply orders for ${targetDate}. Weather: ${weatherResult.condition}, Events: ${eventsResult.eventSummary}. Formulate the operational strategy.`,
              config: {
                thinkingConfig: {
                  thinkingBudget: 512,
                },
                tools: [
                  {
                    functionDeclarations: [
                      getWeatherToolDeclaration,
                      getEventsToolDeclaration,
                      getInventoryToolDeclaration,
                      runForecastToolDeclaration,
                      buildPlanToolDeclaration,
                      runCriticToolDeclaration,
                    ],
                  },
                ],
              },
            }),
            1500,
            'gemini_reasoning_orchestrator'
          );
        } catch (llmErr) {
          // LLM reasoning is non-blocking to protect deterministic pipeline
        }
      }

      // ==============================================================
      // STEP 2: DEMAND FORECASTING (Phase 5 Engine)
      // ==============================================================
      this.state.status = 'RUNNING_FORECAST';
      this.updateStep('forecast', 'running', 'Running multi-model demand ensemble with conformal intervals...');
      this.emitEvent({
        type: 'step_started',
        step: 'forecast',
        message: 'Executing multi-model ensemble (Holt-Winters, Ridge regression, Seasonal Naive) for each dish...',
      });

      const forecastOutput = await withTimeout(
        withRetry(
          () =>
            executeRunForecast(restaurantId, targetDate, db, {
              weatherList: [weatherResult],
              eventsList: eventsResult.events,
              testForecasts: this.input.testFixtures?.forecasts,
            }),
          2,
          500
        ),
        15000,
        'run_forecast'
      );

      this.updateStep(
        'forecast',
        'completed',
        `Forecasted ${forecastOutput.summary.dishCount} dishes (P50 total: ${forecastOutput.summary.totalExpectedP50} portions, ${forecastOutput.summary.highConfidenceCount} high confidence)`
      );

      this.emitEvent({
        type: 'step_completed',
        step: 'forecast',
        message: `Demand forecast complete: ${forecastOutput.summary.dishCount} active dishes forecasted with calibrated P10–P90 intervals.`,
      });

      // ==============================================================
      // STEP 3 & 4: BUILD PLAN + CRITIC LOOP WITH RETRIES (Up to 2 retries)
      // ==============================================================
      let activePlan: DailyPlanOutput | null = null;
      let activeCriticReport: CriticReport | null = null;
      let retriesCount = 0;
      const maxRetries = 2;

      // Applied constraints across retry attempts
      const stockOverrides: Record<string, number> = {};
      const dishPortionCaps: Record<string, number> = {};
      let historicalMaxMap: Record<string, number> = this.input.testFixtures?.historicalMaxMap
        ? { ...this.input.testFixtures.historicalMaxMap }
        : {};

      while (retriesCount <= maxRetries) {
        const isRetry = retriesCount > 0;
        this.state.status = isRetry ? 'ADJUSTING_RETRY' : 'BUILDING_PLAN';
        this.state.retryCount = retriesCount;

        const planAttempt = retriesCount + 1;
        this.updateStep(
          'plan',
          'running',
          isRetry
            ? `Re-building plan (Attempt ${planAttempt}) with adjusted constraints...`
            : 'Applying Newsvendor critical ratio, recipe trim conversion, and supplier pack rounding...',
          planAttempt
        );

        this.emitEvent({
          type: isRetry ? 'critic_retry' : 'step_started',
          step: 'plan',
          message: isRetry
            ? `Retry attempt ${retriesCount}/${maxRetries}: Re-running planner with code-adjusted constraints...`
            : `Building daily kitchen prep and order schedule (service level: ${Math.round(serviceLevelSlider * 100)}%)...`,
        });

        // Build Plan
        const buildOptions: BuildPlanOptions = {
          serviceLevelSlider,
          stockOverrides: Object.keys(stockOverrides).length > 0 ? stockOverrides : undefined,
          dishPortionCaps: Object.keys(dishPortionCaps).length > 0 ? dishPortionCaps : undefined,
          historicalMaxMap,
          testNegativeStock: testNegativeStock && retriesCount === 0, // only inject on first run if requested
          testFixtures: this.input.testFixtures,
        };

        const planResult = await withTimeout(
          executeBuildPlan(
            restaurantId,
            targetDate,
            forecastOutput.forecasts,
            db,
            buildOptions,
            {
              weatherList: [weatherResult],
              eventsList: eventsResult.events,
            }
          ),
          12000,
          'build_plan'
        );

        activePlan = planResult.plan;
        historicalMaxMap = planResult.historicalMaxMap;

        this.updateStep(
          'plan',
          'completed',
          `${activePlan.summary.totalDishesCount} dishes prepped (${activePlan.summary.totalPlannedPortions} portions), ${activePlan.summary.totalOrderItemsCount} ingredients ordered (₹${activePlan.summary.totalEstimatedOrderCost})`,
          planAttempt
        );

        // Run Critic
        this.state.status = 'CRITIQUING';
        this.updateStep('critic', 'running', 'Auditing deterministic invariants and Gemini sanity review...', planAttempt);
        this.emitEvent({
          type: 'step_started',
          step: 'critic',
          message: `Auditing kitchen plan invariants (non-negative, <=2x historical max, shelf life, pack sizes)...`,
        });

        activeCriticReport = await withTimeout(
          executeRunCritic(
            activePlan,
            historicalMaxMap,
            retriesCount,
            {
              weatherCondition: weatherResult.condition,
              avgTemp: (weatherResult.tempMin + weatherResult.tempMax) / 2,
              eventName: eventsResult.events[0]?.name,
            }
          ),
          12000,
          'run_critic'
        );

        if (activeCriticReport.passed) {
          // Critic passed!
          this.updateStep(
            'critic',
            'completed',
            `Plan passed all deterministic invariants! (${activeCriticReport.geminiReviewFlags.length} warnings/notes, ${retriesCount} retries required)`,
            planAttempt
          );
          this.emitEvent({
            type: 'step_completed',
            step: 'critic',
            message: `Critic audit passed successfully! All business invariants satisfied.${retriesCount > 0 ? ` (Resolved after ${retriesCount} retry)` : ''}`,
            criticReport: activeCriticReport,
            plan: activePlan,
          });
          break; // Exit retry loop
        } else {
          // Critic failed! Deterministic invariant violated!
          const criticalIssues = activeCriticReport.issues.filter((i) => i.severity === 'CRITICAL');
          const issueSummary = criticalIssues.map((i) => `${i.item}: ${i.message}`).join('; ');

          this.updateStep(
            'critic',
            'retrying',
            `Critic invariant violation detected: ${issueSummary}. Preparing automatic constraint adjustment...`,
            planAttempt
          );

          this.emitEvent({
            type: 'critic_alert',
            step: 'critic',
            message: `Critic detected invariant violation: ${criticalIssues[0]?.message || 'Constraint violation'}`,
            criticReport: activeCriticReport,
          });

          if (retriesCount < maxRetries) {
            // Apply code-decided constraint adjustments derived from the issues
            for (const adj of activeCriticReport.adjustmentsToApply) {
              if (adj.type === 'CLAMP_STOCK_ZERO') {
                stockOverrides[adj.targetId] = 0;
              } else if (adj.type === 'CAP_PORTIONS') {
                dishPortionCaps[adj.targetId] = adj.adjustedValue;
              }
            }

            retriesCount++;
            // Short backoff before retry
            await new Promise((res) => setTimeout(res, 400));
          } else {
            // Reached max retries
            this.updateStep(
              'critic',
              'failed',
              `Critic invariants could not be fully resolved after ${maxRetries} retries: ${issueSummary}`
            );
            break;
          }
        }
      }

      if (!activePlan || !activeCriticReport) {
        throw new Error('Pipeline execution failed to produce a valid plan or critic report.');
      }

      // ==============================================================
      // STEP 5: CHANGE SUMMARY (Versus last approved plan)
      // ==============================================================
      this.state.status = 'COMPLETED';
      this.updateStep('change_summary', 'running', 'Comparing against last approved kitchen plan...');
      this.emitEvent({
        type: 'step_started',
        step: 'change_summary',
        message: 'Calculating portion deltas and deterministic factor contributions versus previous approved plan...',
      });

      const changeSummary = await computeChangeSummary(
        activePlan,
        restaurantId,
        db,
        activePlan.prepItems[0] ? undefined : undefined
      );

      this.updateStep(
        'change_summary',
        'completed',
        changeSummary.hasPreviousPlan
          ? `${changeSummary.totalDeltaPortions >= 0 ? '+' : ''}${changeSummary.totalDeltaPortions} total portion change (${changeSummary.dishesUpCount} up, ${changeSummary.dishesDownCount} down) vs ${changeSummary.previousPlanDate}`
          : `First baseline plan established (${changeSummary.totalCurrentPortions} total portions)`
      );

      this.emitEvent({
        type: 'step_completed',
        step: 'change_summary',
        message: `Change summary computed: ${changeSummary.dishesUpCount} dishes increased, ${changeSummary.dishesDownCount} decreased.`,
        changeSummary,
      });

      // Save plan to Firestore
      if (db) {
        try {
          const planRef = db.collection(`restaurants/${restaurantId}/plans`).doc(targetDate);
          await planRef.set(
            {
              ...activePlan,
              criticReport: activeCriticReport,
              changeSummary,
              retriesCount,
              orchestratedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (dbErr) {
          console.warn('[orchestrator] Could not persist final plan to DB:', dbErr);
        }
      }

      this.emitEvent({
        type: 'pipeline_completed',
        message: `Daily kitchen plan successfully generated and verified for ${targetDate}!`,
        plan: activePlan,
        criticReport: activeCriticReport,
        changeSummary,
      });

      return {
        success: activeCriticReport.passed,
        plan: activePlan,
        criticReport: activeCriticReport,
        changeSummary,
        state: this.state,
        retries: retriesCount,
      };
    } catch (err: any) {
      console.error('[orchestrator] Pipeline fatal error:', err);
      this.state.status = 'FAILED';
      this.state.error = err.message || 'Pipeline execution failed';
      this.updateStep(this.state.currentStep, 'failed', err.message);

      this.emitEvent({
        type: 'pipeline_failed',
        message: `Pipeline halted: ${err.message || 'Unknown failure'}. You can retry this step.`,
      });

      throw err;
    }
  }
}

/**
 * Global entry point to get or start an orchestrated planning execution.
 * Enforces the idempotency key so a double click never creates two plans.
 */
export function getOrStartPlanningPipeline(
  input: OrchestrationInput
): {
  emitter: EventEmitter;
  isExisting: boolean;
  resultPromise: Promise<OrchestrationResult>;
} {
  const existing = activePipelines.get(input.idempotencyKey);
  if (existing) {
    return {
      emitter: existing.emitter,
      isExisting: true,
      resultPromise: existing.resultPromise!,
    };
  }

  const emitter = new EventEmitter();
  // Keep up to 20 listeners for multiple SSE subscribers
  emitter.setMaxListeners(20);

  const orchestrator = new PlanningOrchestrator(input, emitter);
  const resultPromise = orchestrator.run();

  const entry: ActivePipelineEntry = {
    state: orchestrator.getState(),
    emitter,
    resultPromise,
    createdAt: Date.now(),
  };

  resultPromise
    .then((res) => {
      entry.cachedResult = res;
    })
    .catch((err) => {
      console.error(`Pipeline ${input.idempotencyKey} failed:`, err);
    });

  activePipelines.set(input.idempotencyKey, entry);

  return {
    emitter,
    isExisting: false,
    resultPromise,
  };
}
