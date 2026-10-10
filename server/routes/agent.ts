import { Router, Response } from 'express';
import { requireAuth, requireRestaurant, AuthenticatedRequest } from '../lib/authMiddleware.js';
import { triageMessage } from '../agents/triage.js';
import { explainDishPortion } from '../agents/explainer.js';
import { parseWhatIfOverrides, simulateWhatIf } from '../agents/whatIf.js';
import { parseFeedbackMessage, saveConfirmedFeedback } from '../agents/feedbackParser.js';
import { parseIngestSales } from '../agents/ingestParser.js';
import { getOrStartPlanningPipeline } from '../agents/orchestrator.js';
import { agentObservability, AgentRunStep } from '../lib/observability.js';

const router = Router();

// ==========================================
// 1. Triage Message
// ==========================================
router.post('/triage', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { message, runId } = req.body;
    if (!message) {
      res.status(400).json({ error: 'InvalidInput', message: 'message string is required.' });
      return;
    }

    const triage = await triageMessage(message, restaurantId, runId, authReq.db);
    res.json({ success: true, triage });
  } catch (err: any) {
    console.error('Triage error:', err);
    res.status(500).json({ error: 'TriageFailed', message: err.message });
  }
});

// ==========================================
// 2. Explainer Agent
// ==========================================
router.post('/explain', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { dishNameOrQuery, targetDate, language, runId } = req.body;
    if (!dishNameOrQuery) {
      res.status(400).json({ error: 'InvalidInput', message: 'dishNameOrQuery is required.' });
      return;
    }

    const explanation = await explainDishPortion(
      {
        restaurantId,
        dishNameOrQuery,
        targetDate,
        language,
        runId,
      },
      authReq.db
    );

    res.json({ success: true, explanation });
  } catch (err: any) {
    console.error('Explainer error:', err);
    res.status(500).json({ error: 'ExplainerFailed', message: err.message });
  }
});

// ==========================================
// 3. What-If Overrides Parser
// ==========================================
router.post('/what-if/parse', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { message, language, runId } = req.body;
    if (!message) {
      res.status(400).json({ error: 'InvalidInput', message: 'message is required.' });
      return;
    }

    const result = await parseWhatIfOverrides(message, language, restaurantId, runId, authReq.db);
    res.json({ success: true, parsed: result });
  } catch (err: any) {
    console.error('What-If parse error:', err);
    res.status(500).json({ error: 'WhatIfParseFailed', message: err.message });
  }
});

// ==========================================
// 4. What-If Simulation
// ==========================================
router.post('/what-if/simulate', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { targetDate, overrides, scenarioTitle, language, runId } = req.body;
    let dateToUse = targetDate;
    if (!dateToUse) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateToUse = tomorrow.toISOString().slice(0, 10);
    }

    const simulation = await simulateWhatIf({
      restaurantId,
      targetDate: dateToUse,
      overrides: overrides || {},
      scenarioTitle,
      language,
      runId,
      db: authReq.db,
    });

    res.json({ success: true, simulation });
  } catch (err: any) {
    console.error('What-If simulation error:', err);
    res.status(500).json({ error: 'SimulationFailed', message: err.message });
  }
});

// ==========================================
// 5. Feedback Parser
// ==========================================
router.post('/feedback/parse', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { message, language, runId } = req.body;
    if (!message) {
      res.status(400).json({ error: 'InvalidInput', message: 'message is required.' });
      return;
    }

    const feedback = await parseFeedbackMessage(message, language, restaurantId, runId, authReq.db);
    res.json({ success: true, feedback });
  } catch (err: any) {
    console.error('Feedback parse error:', err);
    res.status(500).json({ error: 'FeedbackParseFailed', message: err.message });
  }
});

// ==========================================
// 6. Confirm and Save Feedback
// ==========================================
router.post('/feedback/confirm', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { feedback } = req.body;
    if (!feedback || !feedback.dishName) {
      res.status(400).json({ error: 'InvalidInput', message: 'valid feedback object is required.' });
      return;
    }

    const saveResult = await saveConfirmedFeedback(feedback, restaurantId, authReq.db);
    res.json(saveResult);
  } catch (err: any) {
    console.error('Feedback confirm error:', err);
    res.status(500).json({ error: 'FeedbackConfirmFailed', message: err.message });
  }
});

// ==========================================
// 7. Sales Ingest Parser
// ==========================================
router.post('/ingest/parse', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { message, language, runId } = req.body;
    if (!message) {
      res.status(400).json({ error: 'InvalidInput', message: 'message is required.' });
      return;
    }

    const ingestResult = await parseIngestSales(message, language, restaurantId, runId, authReq.db);
    res.json({ success: true, ingest: ingestResult });
  } catch (err: any) {
    console.error('Ingest parse error:', err);
    res.status(500).json({ error: 'IngestParseFailed', message: err.message });
  }
});

// ==========================================
// 8. Full Conversational Chat Route
// Integrates triage, routing, specialized agents, and observability
// ==========================================
router.post('/chat', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { message, targetDate, languagePreference } = req.body;
    if (!message) {
      res.status(400).json({ error: 'InvalidInput', message: 'message string is required.' });
      return;
    }

    const runId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. Run Triage Agent
    const triage = await triageMessage(message, restaurantId, runId, authReq.db);
    // If triage detects Hindi or Telugu in the message itself, reply in that language; otherwise use preference or triage language
    const activeLanguage =
      triage.language && triage.language !== 'en'
        ? triage.language
        : languagePreference || triage.language || 'en';

    let dateToUse = targetDate;
    if (!dateToUse) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateToUse = tomorrow.toISOString().slice(0, 10);
    }

    let reply = '';
    let actionType: string | null = null;
    let actionData: any = null;

    // If confidence is low or clarifying question is present
    if (triage.confidence < 0.70 && triage.clarifyingQuestion) {
      reply = triage.clarifyingQuestion;
      res.json({
        success: true,
        runId,
        triage,
        reply,
        actionType: null,
        actionData: null,
      });
      return;
    }

    // Route dispatch
    switch (triage.route) {
      case 'plan': {
        const planStart = Date.now();
        const idempotencyKey = `${restaurantId}_${dateToUse}_${Math.floor(Date.now() / 30000)}`;
        const { resultPromise } = getOrStartPlanningPipeline({
          restaurantId,
          targetDate: dateToUse,
          idempotencyKey,
          serviceLevelSlider: 0.85,
          db: authReq.db,
        });
        const orchResult = await resultPromise;

        await agentObservability.recordStep(
          {
            runId,
            restaurantId,
            agent: 'orchestrator',
            step: 'run_planning_pipeline',
            input: { targetDate: dateToUse, idempotencyKey },
            output: {
              targetDate: dateToUse,
              dishCount: orchResult.plan.summary.totalDishesCount,
              totalPortions: orchResult.plan.summary.totalPlannedPortions,
              orderCost: orchResult.plan.summary.totalEstimatedOrderCost,
              criticPassed: orchResult.criticReport.passed,
            },
            latencyMs: Date.now() - planStart,
            tokenCounts: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
            model: 'planning_orchestrator',
            toolCalls: [
              { name: 'get_weather', args: { targetDate: dateToUse } },
              { name: 'get_events', args: { targetDate: dateToUse } },
              { name: 'get_inventory', args: { restaurantId } },
              { name: 'run_forecast', args: { targetDate: dateToUse } },
              { name: 'build_plan', args: { targetDate: dateToUse } },
              { name: 'run_critic', args: { targetDate: dateToUse, passed: orchResult.criticReport.passed } },
            ],
          },
          authReq.db
        );

        actionType = 'trigger_plan';
        actionData = {
          targetDate: dateToUse,
          orchestrated: true,
          summary: orchResult.plan.summary,
          criticPassed: orchResult.criticReport.passed,
          retries: orchResult.retries,
          topDishes: orchResult.plan.prepItems.slice(0, 4).map((p) => ({
            dishName: p.dishName,
            plannedPortions: p.plannedPortions,
          })),
        };

        if (activeLanguage === 'hi') {
          reply = `मैंने कल (${dateToUse}) के लिए ऑर्केस्ट्रेटर प्लान सफलतापूर्वक चलाया है: कुल ${orchResult.plan.summary.totalDishesCount} डिशें (${orchResult.plan.summary.totalPlannedPortions} भाग) और अनुमानित ऑर्डर लागत ₹${orchResult.plan.summary.totalEstimatedOrderCost}। क्रिटिक जाँच: ${orchResult.criticReport.passed ? 'सफल' : 'चेतावनी'}।`;
        } else if (activeLanguage === 'te') {
          reply = `నేను రేపటి (${dateToUse}) కోసం ప్లానింగ్ ఆర్కెస్ట్రేటర్‌ను రన్ చేసాను: మొత్తం ${orchResult.plan.summary.totalDishesCount} వంటకాలు (${orchResult.plan.summary.totalPlannedPortions} భాగాలు) మరియు ఆర్డర్ ఖర్చు ₹${orchResult.plan.summary.totalEstimatedOrderCost}. క్రిటిక్ తనిఖీ: ${orchResult.criticReport.passed ? 'పాస్' : 'హెచ్చరిక'}.`;
        } else {
          reply = `Orchestrator pipeline completed for ${dateToUse}: ${orchResult.plan.summary.totalDishesCount} dishes planned (${orchResult.plan.summary.totalPlannedPortions} total portions) with ₹${orchResult.plan.summary.totalEstimatedOrderCost} in supplier orders. Critic audit: ${orchResult.criticReport.passed ? 'Passed all invariants' : 'Flagged warnings'}.`;
        }
        break;
      }

      case 'explain': {
        const explanation = await explainDishPortion(
          {
            restaurantId,
            dishNameOrQuery: message,
            targetDate: dateToUse,
            language: activeLanguage,
            runId,
          },
          authReq.db
        );
        reply = explanation.explanation;
        actionType = 'explanation_card';
        actionData = explanation;
        break;
      }

      case 'what_if': {
        const parsed = await parseWhatIfOverrides(message, activeLanguage, restaurantId, runId, authReq.db);
        // Compute simulation so owner can inspect overrides, confirm them, and view computed delta
        const simulation = await simulateWhatIf({
          restaurantId,
          targetDate: dateToUse,
          overrides: parsed.overrides,
          scenarioTitle: parsed.scenarioTitle,
          language: activeLanguage,
          runId,
          db: authReq.db,
        });

        reply = simulation.explanation;
        actionType = 'what_if_card';
        actionData = {
          targetDate: dateToUse,
          parsed,
          simulation,
        };
        break;
      }

      case 'feedback': {
        const feedback = await parseFeedbackMessage(message, activeLanguage, restaurantId, runId, authReq.db);
        actionType = 'feedback_card';
        actionData = feedback;
        if (activeLanguage === 'hi') {
          reply = `स्टॉकआउट/बचत दर्ज की गई: ${feedback.dishName} (${feedback.type === 'stockout' ? 'खत्म' : 'बचा हुआ'})। पुष्टि करने के लिए नीचे 'Confirm' दबाएं।`;
        } else if (activeLanguage === 'te') {
          reply = `ఫీడ్‌బ్యాక్ గుర్తించబడింది: ${feedback.dishName} (${feedback.type === 'stockout' ? 'అయిపోయింది' : 'మిగిలింది'}). నిర్ధారించడానికి క్రింది 'Confirm' నొక్కండి.`;
        } else {
          reply = `Detected ${feedback.type}: ${feedback.dishName} at ${feedback.occurredAtTime || 'service'}. Confirm below to save this feedback and apply a ${feedback.suggestedDelta > 0 ? '+' : ''}${feedback.suggestedDelta} portion adjustment to future forecasts.`;
        }
        break;
      }

      case 'ingest': {
        const ingest = await parseIngestSales(message, activeLanguage, restaurantId, runId, authReq.db);
        actionType = 'ingest_card';
        actionData = ingest;
        reply = ingest.summaryText;
        break;
      }

      case 'other':
      default: {
        if (activeLanguage === 'hi') {
          reply = 'नमस्ते! मैं CraveCast किचन असिस्टेंट हूँ। आप मुझसे कल की प्लानिंग चलाने, किसी डिश का कारण पूछने (जैसे "बिरयानी 45 क्यों?"), व्हाट-इफ सिमुलेशन ("बारिश हुई तो क्या होगा?"), या स्टॉकआउट दर्ज करने को कह सकते हैं।';
        } else if (activeLanguage === 'te') {
          reply = 'నమస్కారం! నేను CraveCast కిచెన్ అసిస్టెంట్. మీరు నన్ను రేపటి ప్లాన్ రన్ చేయమని, డిష్ భాగాల వివరణలు ("రేపు 45 బిర్యానీ ఎందుకు?"), వాట్-ఇఫ్ పరీక్షలు ("వర్షం పడితే?"), లేదా స్టాక్ వివరాలు నమోదు చేయమని అడగవచ్చు.';
        } else {
          reply = 'Hello! I am your CraveCast Kitchen Assistant. You can ask me to run tomorrow\'s plan, explain portion forecasts (e.g. "why 45 biryanis tomorrow?"), simulate what-if scenarios ("what if it rains?"), record stockouts, or ingest sales numbers.';
        }
        break;
      }
    }

    res.json({
      success: true,
      runId,
      triage,
      reply,
      actionType,
      actionData,
    });
  } catch (err: any) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: 'ChatFailed', message: err.message });
  }
});

// ==========================================
// 9. Observability: Get Agent Steps
// ==========================================
router.get('/traces', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;
  const runId = req.query.runId as string | undefined;

  const steps = await agentObservability.listStepsWithDb(restaurantId, runId, authReq.db);
  res.json({ success: true, steps });
});

// ==========================================
// 10. Observability: Live SSE Stream
// ==========================================
router.get('/traces/stream', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial recent steps
  const initialSteps = (await agentObservability.listStepsWithDb(restaurantId, undefined, authReq.db)).slice(0, 15);
  for (const step of initialSteps.reverse()) {
    try {
      res.write(`data: ${JSON.stringify(step)}\n\n`);
    } catch {}
  }

  const onStep = (step: AgentRunStep) => {
    if (!step.restaurantId || step.restaurantId === restaurantId) {
      try {
        res.write(`data: ${JSON.stringify(step)}\n\n`);
      } catch {}
    }
  };

  agentObservability.on('step', onStep);

  req.on('close', () => {
    agentObservability.off('step', onStep);
  });
});

export default router;
