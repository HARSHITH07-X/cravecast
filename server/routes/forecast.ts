import { Router, Response } from 'express';
import { requireAuth, requireRestaurant, AuthenticatedRequest } from '../lib/authMiddleware.js';
import { executeForecastPipeline } from '../forecast/engine.js';
import { FeedbackLoopRecord } from '../forecast/learningLoop.js';

const router = Router();

// ==========================================
// 1. Get Forecast & Backtest Pipeline Output
// ==========================================
router.post('/generate', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const { targetDate } = req.body || {};

    // 1. Fetch sales records for restaurant
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

    // 2. Fetch menu items
    const menuSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/menu_items`)
      .limit(100)
      .get();

    const menuItems = menuSnap.docs.map((d: any) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        category: data.category || 'Mains',
        embedding: data.embedding,
      };
    });

    // 3. Fetch weather cache
    const weatherSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/weather_cache`)
      .limit(500)
      .get();

    const weatherList = weatherSnap.docs.map((d: any) => d.data());

    // 4. Fetch events
    const eventsSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/events`)
      .limit(100)
      .get();

    const eventsList = eventsSnap.docs.map((d: any) => d.data());

    // 5. Fetch 4-week feedback records for learning loop
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

    // Execute Forecast & Backtest Engine (with 4-week feedback learning loop)
    const pipeline = executeForecastPipeline({
      salesRecords,
      menuItems,
      weatherList,
      eventsList,
      feedbackRecords,
      targetDate,
    });

    // Save forecast snapshot to Firestore
    if (pipeline.forecasts.length > 0) {
      try {
        const forecastDocRef = authReq.db
          .collection(`restaurants/${restaurantId}/forecasts`)
          .doc(pipeline.targetDate);

        await forecastDocRef.set({
          restaurantId,
          date: pipeline.targetDate,
          calculatedAt: new Date().toISOString(),
          dishForecasts: pipeline.forecasts.map((f) => ({
            menuItemId: f.menuItemId,
            dishName: f.dishName,
            category: f.category,
            p10: f.p10,
            p50: f.p50,
            p90: f.p90,
            confidence: f.confidence,
            confidenceReason: f.confidenceReason,
            factorContributions: f.factorContributions,
            modelWeights: f.modelWeights,
            baselineSeasonalNaive: f.baselineSeasonalNaive,
          })),
          learningAdjustments: pipeline.learningAdjustments || {},
        });
      } catch (saveErr) {
        console.warn('Could not persist forecast snapshot:', saveErr);
      }
    }

    res.json({
      success: true,
      targetDate: pipeline.targetDate,
      forecasts: pipeline.forecasts,
      backtest: pipeline.backtest,
      learningAdjustments: pipeline.learningAdjustments || {},
    });
  } catch (err: any) {
    console.error('Forecast generation error:', err);
    res.status(500).json({
      error: 'ForecastError',
      message: err.message || 'Failed to compute forecast pipeline.',
    });
  }
});

// ==========================================
// 2. Fetch Latest Backtest Summary
// ==========================================
router.get('/backtest', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
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

    const menuSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/menu_items`)
      .limit(100)
      .get();

    const menuItems = menuSnap.docs.map((d: any) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        category: data.category || 'Mains',
        embedding: data.embedding,
      };
    });

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

    const pipeline = executeForecastPipeline({
      salesRecords,
      menuItems,
      feedbackRecords,
    });

    res.json({
      success: true,
      backtest: pipeline.backtest,
      learningAdjustments: pipeline.learningAdjustments || {},
      totalSalesRecords: salesRecords.length,
    });
  } catch (err: any) {
    console.error('Backtest error:', err);
    res.status(500).json({
      error: 'BacktestError',
      message: err.message || 'Failed to execute walk-forward backtest.',
    });
  }
});

export default router;
