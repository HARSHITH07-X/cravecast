import { Router, Response } from 'express';
import { requireAuth, requireRestaurant, AuthenticatedRequest } from '../lib/authMiddleware.js';
import {
  executeDailyPlan,
  enhancePlanWithGeminiReasons,
  DailyPlanOutput,
  PlannerExecutionInput,
} from '../planner.js';
import { executeForecastPipeline, buildFeatureDictionary } from '../forecast/engine.js';
import { ForecastResult } from '../forecast/types.js';
import { DishBiasAdjustment, FeedbackLoopRecord } from '../forecast/learningLoop.js';
import {
  getOrStartPlanningPipeline,
  OrchestrationInput,
} from '../agents/orchestrator.js';
import { computeChangeSummary } from '../agents/changeSummary.js';

const router = Router();

// ==========================================
// 1. Get Daily Kitchen Plan
// ==========================================
router.get('/daily', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const targetDateQuery = req.query.date as string;
    const serviceLevelQuery = Number(req.query.serviceLevel) || 0.85;
    const skipGemini = req.query.skipGemini === 'true';

    // 1. Determine target date (tomorrow by default)
    let targetDate = targetDateQuery;
    if (!targetDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = tomorrow.toISOString().slice(0, 10);
    }

    // 2. Fetch Restaurant info
    const restDoc = await authReq.db.collection('restaurants').doc(restaurantId).get();
    const restaurantName = restDoc.exists ? restDoc.data()?.name || 'Kitchen' : 'Kitchen';

    // 3. Fetch Menu Items
    const menuSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/menu_items`)
      .limit(100)
      .get();
    const menuItems = menuSnap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    // 4. Fetch Recipes
    const recipesSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/recipes`)
      .limit(100)
      .get();
    const recipes = recipesSnap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    // 5. Fetch Ingredients
    const ingSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/ingredients`)
      .limit(200)
      .get();
    const ingredients = ingSnap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    // 6. Fetch Suppliers
    const supSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/suppliers`)
      .limit(50)
      .get();
    const suppliers = supSnap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    // 7. Fetch Inventory
    const invSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/inventory`)
      .limit(200)
      .get();
    const inventory = invSnap.docs.map((d: any) => ({
      ingredientId: d.id,
      ...d.data(),
    }));

    // 8. Fetch Weather & Events
    const weatherSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/weather_cache`)
      .limit(200)
      .get();
    const weatherList = weatherSnap.docs.map((d: any) => d.data());

    const eventsSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/events`)
      .limit(100)
      .get();
    const eventsList = eventsSnap.docs.map((d: any) => d.data());

    // 9. Fetch 4-week feedback records for learning loop
    const feedbackSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/feedback`)
      .limit(300)
      .get();

    const feedbackRecords: FeedbackLoopRecord[] = feedbackSnap.docs.map((d: any) => {
      const data = d.data();
      return {
        id: d.id,
        date: data.date || '',
        menuItemId: data.menuItemId || '',
        dishName: data.dishName || '',
        feedbackType: data.feedbackType || (data.ranOutAt ? 'ran_out' : 'leftover'),
        ranOutAt: data.ranOutAt,
        leftoverQty: typeof data.leftoverQty === 'number' ? data.leftoverQty : undefined,
        plannedPortions: typeof data.plannedPortions === 'number' ? data.plannedPortions : undefined,
      };
    });

    // 10. Run forecast pipeline with 4-week feedback learning loop
    const salesSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/sales`)
      .limit(500)
      .get();

    const salesRecords = salesSnap.docs.map((d: any) => {
      const data = d.data();
      return {
        date: data.date,
        dishName: data.dishName,
        menuItemId: data.menuItemId,
        quantitySold: Number(data.quantitySold) || 0,
        soldOut: Boolean(data.soldOut),
        isClosed: Boolean(data.isClosed),
      };
    });

    const pipeline = executeForecastPipeline({
      salesRecords,
      menuItems: menuItems.map((m: any) => ({
        id: m.id,
        name: m.name,
        category: m.category || 'Mains',
        embedding: m.embedding,
      })),
      weatherList,
      eventsList,
      feedbackRecords,
      targetDate,
    });

    const forecasts: ForecastResult[] = pipeline.forecasts;
    const learningAdjustments: Record<string, DishBiasAdjustment> = pipeline.learningAdjustments || {};

    // Build features for targetDate
    const allFeatures = buildFeatureDictionary([targetDate], weatherList, eventsList);
    const dayFeatures = allFeatures[0];

    // Check plan doc in Firestore for saved status
    let currentStatus: 'draft' | 'approved' = 'draft';
    const planDocRef = authReq.db
      .collection(`restaurants/${restaurantId}/plans`)
      .doc(targetDate);
    const planDoc = await planDocRef.get();
    if (planDoc.exists && planDoc.data()?.status) {
      currentStatus = planDoc.data()?.status;
    }

    // 11. Execute pure code planner engine
    // Note: pipeline.forecasts already have p10/p50/p90 shifted by verified learning adjustments,
    // so we pass dishFeedbackAdjustment: {} to avoid double-adding, while passing feedbackDetailsByDishId
    // so the reason line displays the exact adjustment!
    const plannerInput: PlannerExecutionInput = {
      restaurantId,
      restaurantName,
      targetDate,
      serviceLevelSlider: serviceLevelQuery,
      forecasts,
      menuItems,
      recipes,
      ingredients,
      suppliers,
      inventory,
      dayFeatures,
      dishFeedbackAdjustment: {},
      feedbackDetailsByDishId: learningAdjustments,
      status: currentStatus,
    };

    let dailyPlan = executeDailyPlan(plannerInput);

    // 12. Enhance with Gemini reason lines if not skipped
    if (!skipGemini) {
      dailyPlan = await enhancePlanWithGeminiReasons(dailyPlan, dayFeatures);
    }

    res.json({
      success: true,
      plan: dailyPlan,
      learningAdjustments,
      backtest: pipeline.backtest,
    });
  } catch (err: any) {
    console.error('Daily plan generation error:', err);
    res.status(500).json({
      error: 'PlanGenerationFailed',
      message: err.message || 'Failed to generate daily kitchen plan.',
    });
  }
});

// ==========================================
// 2. End-of-Day Dish Feedback (Ran Out / Leftover)
// ==========================================
router.get('/feedback', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const dateQuery = req.query.date as string;
    const snap = await authReq.db
      .collection(`restaurants/${restaurantId}/feedback`)
      .limit(200)
      .get();

    let records = snap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    if (dateQuery) {
      records = records.filter((r: any) => r.date === dateQuery);
    }

    records.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

    res.json({
      success: true,
      feedback: records,
    });
  } catch (err: any) {
    console.error('Get feedback error:', err);
    res.status(500).json({ error: 'FeedbackFetchFailed', message: err.message });
  }
});

router.post('/feedback', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const {
      date,
      menuItemId,
      dishName,
      feedbackType,
      ranOutAt,
      leftoverQty,
      plannedPortions,
      notes,
    } = req.body || {};

    if (!date || !menuItemId || !dishName || !['ran_out', 'leftover', 'on_target'].includes(feedbackType)) {
      res.status(400).json({
        error: 'InvalidInput',
        message: 'date, menuItemId, dishName, and valid feedbackType (ran_out | leftover | on_target) are required.',
      });
      return;
    }

    const docId = `fb_${date}_${menuItemId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const feedbackRef = authReq.db
      .collection(`restaurants/${restaurantId}/feedback`)
      .doc(docId);

    const payload: Record<string, any> = {
      id: docId,
      restaurantId,
      date,
      menuItemId,
      dishName,
      feedbackType,
      plannedPortions: typeof plannedPortions === 'number' ? plannedPortions : 0,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    if (feedbackType === 'ran_out') {
      payload.ranOutAt = ranOutAt || '20:00';
      payload.leftoverQty = 0;
    } else if (feedbackType === 'leftover') {
      payload.leftoverQty = Math.max(0, Number(leftoverQty) || 0);
      payload.ranOutAt = '';
    }

    await feedbackRef.set(payload, { merge: true });

    // Requirement 1: "Ran-out writes the sold-out flag used by the forecaster."
    let salesUpdated = false;
    if (feedbackType === 'ran_out') {
      const salesCol = authReq.db.collection(`restaurants/${restaurantId}/sales`);
      const existingSnap = await salesCol.where('date', '==', date).get();
      const matchingDocs = existingSnap.docs.filter((d: any) => {
        const s = d.data();
        return (
          s.menuItemId === menuItemId ||
          (typeof s.dishName === 'string' && s.dishName.toLowerCase() === String(dishName).toLowerCase())
        );
      });

      if (matchingDocs.length > 0) {
        for (const sDoc of matchingDocs) {
          await sDoc.ref.set(
            {
              soldOut: true,
              soldOutTime: payload.ranOutAt,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
        salesUpdated = true;
      } else {
        // Create or upsert a sales record with soldOut: true so the forecaster's censoring adjustment sees it
        const salesId = `sales_soldout_${date}_${menuItemId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        await salesCol.doc(salesId).set(
          {
            id: salesId,
            restaurantId,
            date,
            menuItemId,
            dishName,
            quantitySold: typeof plannedPortions === 'number' && plannedPortions > 0 ? plannedPortions : 0,
            soldOut: true,
            soldOutTime: payload.ranOutAt,
            source: 'end_of_day_feedback',
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
        salesUpdated = true;
      }
    }

    res.json({
      success: true,
      feedback: payload,
      salesUpdated,
    });
  } catch (err: any) {
    console.error('Save feedback error:', err);
    res.status(500).json({ error: 'FeedbackSaveFailed', message: err.message });
  }
});

// ==========================================
// 3. Update Plan Status (Draft / Approved)
// ==========================================
router.post('/status', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { targetDate, status } = req.body;
    if (!targetDate || !['draft', 'approved'].includes(status)) {
      res.status(400).json({ error: 'InvalidInput', message: 'targetDate and valid status required.' });
      return;
    }

    const planDocRef = authReq.db
      .collection(`restaurants/${restaurantId}/plans`)
      .doc(targetDate);

    await planDocRef.set(
      {
        restaurantId,
        targetDate,
        status,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    res.json({ success: true, targetDate, status });
  } catch (err: any) {
    console.error('Plan status update error:', err);
    res.status(500).json({ error: 'UpdateStatusFailed', message: err.message });
  }
});

// ==========================================
// 4. Update Inventory Stock (Editable Stock)
// ==========================================
router.post('/inventory', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { ingredientId, currentStock, ingredientName, unit } = req.body;
    if (!ingredientId || typeof currentStock !== 'number') {
      res.status(400).json({ error: 'InvalidInput', message: 'ingredientId and numeric currentStock are required.' });
      return;
    }

    const invRef = authReq.db
      .collection(`restaurants/${restaurantId}/inventory`)
      .doc(ingredientId);

    const payload = {
      ingredientId,
      restaurantId,
      currentStock: Math.max(0, currentStock),
      ingredientName: ingredientName || '',
      unit: unit || 'kg',
      updatedAt: new Date().toISOString(),
    };

    await invRef.set(payload, { merge: true });

    res.json({ success: true, inventory: payload });
  } catch (err: any) {
    console.error('Inventory update error:', err);
    res.status(500).json({ error: 'InventoryUpdateFailed', message: err.message });
  }
});

// ==========================================
// 5. Batch Inventory Stock Update
// ==========================================
router.post('/inventory/batch', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'InvalidInput', message: 'items array is required.' });
      return;
    }

    const batch = authReq.db.batch();
    for (const item of items) {
      if (!item.ingredientId) continue;
      const invRef = authReq.db
        .collection(`restaurants/${restaurantId}/inventory`)
        .doc(item.ingredientId);

      batch.set(
        invRef,
        {
          ingredientId: item.ingredientId,
          restaurantId,
          currentStock: Math.max(0, Number(item.currentStock) || 0),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    console.error('Batch inventory update error:', err);
    res.status(500).json({ error: 'BatchUpdateFailed', message: err.message });
  }
});

// ==========================================
// 6. Orchestrate Planning Pipeline (POST)
// Supports idempotency key, parallel tools, critic retries, and SSE streaming
// ==========================================
router.post('/orchestrate', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { targetDate, serviceLevelSlider, idempotencyKey, testNegativeStock } = req.body;
    if (!targetDate) {
      res.status(400).json({ error: 'InvalidInput', message: 'targetDate is required.' });
      return;
    }

    const effectiveIdempotencyKey =
      idempotencyKey || `${restaurantId}_${targetDate}_${Math.floor(Date.now() / 60000)}`;

    const wantsStream =
      req.query.stream === 'true' ||
      (req.headers.accept && req.headers.accept.includes('text/event-stream'));

    const orchestrationInput: OrchestrationInput = {
      restaurantId,
      targetDate,
      idempotencyKey: effectiveIdempotencyKey,
      serviceLevelSlider: Number(serviceLevelSlider) || 0.85,
      testNegativeStock: Boolean(testNegativeStock),
      db: authReq.db,
    };

    const { emitter, resultPromise } = getOrStartPlanningPipeline(orchestrationInput);

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const onProgress = (event: any) => {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {}
      };

      emitter.on('progress', onProgress);

      req.on('close', () => {
        emitter.off('progress', onProgress);
      });

      resultPromise
        .then((result) => {
          try {
            res.write(`data: ${JSON.stringify({ type: 'pipeline_completed', ...result })}\n\n`);
            res.end();
          } catch {}
        })
        .catch((err) => {
          try {
            res.write(`data: ${JSON.stringify({ type: 'pipeline_failed', error: err.message })}\n\n`);
            res.end();
          } catch {}
        })
        .finally(() => {
          emitter.off('progress', onProgress);
        });

      return;
    }

    // Standard JSON response
    const result = await resultPromise;
    res.json({
      ...result,
    });
  } catch (err: any) {
    console.error('Orchestration endpoint error:', err);
    res.status(500).json({
      error: 'OrchestrationFailed',
      message: err.message || 'Pipeline orchestration failed.',
    });
  }
});

// ==========================================
// 7. Orchestrate SSE Stream Endpoint (GET EventSource)
// ==========================================
router.get('/orchestrate/stream', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  const targetDate = req.query.date as string;
  const idempotencyKey = (req.query.idempotencyKey as string) || `${restaurantId}_${targetDate || 'tomorrow'}_${Date.now()}`;
  const serviceLevelSlider = Number(req.query.serviceLevel) || 0.85;
  const testNegativeStock = req.query.testNegativeStock === 'true';

  let dateToUse = targetDate;
  if (!dateToUse) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateToUse = tomorrow.toISOString().slice(0, 10);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const orchestrationInput: OrchestrationInput = {
    restaurantId,
    targetDate: dateToUse,
    idempotencyKey,
    serviceLevelSlider,
    testNegativeStock,
    db: authReq.db,
  };

  const { emitter, resultPromise } = getOrStartPlanningPipeline(orchestrationInput);

  const onProgress = (event: any) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {}
  };

  emitter.on('progress', onProgress);

  req.on('close', () => {
    emitter.off('progress', onProgress);
  });

  resultPromise
    .then((result) => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'pipeline_completed', ...result })}\n\n`);
        res.end();
      } catch {}
    })
    .catch((err) => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'pipeline_failed', error: err.message })}\n\n`);
        res.end();
      } catch {}
    })
    .finally(() => {
      emitter.off('progress', onProgress);
    });
});

// ==========================================
// 8. Change Summary Endpoint (GET)
// ==========================================
router.get('/change-summary', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const targetDateQuery = req.query.date as string;
    let targetDate = targetDateQuery;
    if (!targetDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = tomorrow.toISOString().slice(0, 10);
    }

    const planDoc = await authReq.db.collection(`restaurants/${restaurantId}/plans`).doc(targetDate).get();
    if (!planDoc.exists) {
      res.status(404).json({ error: 'PlanNotFound', message: `No generated plan found for ${targetDate}.` });
      return;
    }

    const planData = planDoc.data() as DailyPlanOutput;
    const summary = await computeChangeSummary(planData, restaurantId, authReq.db);

    res.json({
      success: true,
      targetDate,
      summary,
    });
  } catch (err: any) {
    console.error('Change summary error:', err);
    res.status(500).json({ error: 'ChangeSummaryFailed', message: err.message });
  }
});

export default router;
