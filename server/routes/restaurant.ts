import { Router, Response } from 'express';
import { requireAuth, requireRestaurant, AuthenticatedRequest } from '../lib/authMiddleware.js';
import { RestaurantSettingsSchema } from '../../src/lib/types.js';
import { getRestaurantTokenUsageSummary } from '../lib/llm.js';
import { CONFIG } from '../config.js';

const router = Router();

// ==========================================
// 1. Current User & Restaurant Status
// ==========================================
router.get('/me', requireAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    uid: authReq.uid,
    email: authReq.user.email,
    restaurant: authReq.restaurant,
  });
});

// ==========================================
// 2. Onboarding (First login setup)
// ==========================================
router.post('/onboarding', requireAuth, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  // Idempotency: if restaurant already exists, return it
  if (authReq.restaurant) {
    res.json({
      success: true,
      message: 'Restaurant already exists for this owner.',
      restaurant: authReq.restaurant,
    });
    return;
  }

  try {
    const rawData = req.body;
    const validatedData = RestaurantSettingsSchema.parse({
      ...rawData,
      ownerUid: authReq.uid,
      ownerEmail: authReq.user.email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const docRef = authReq.db.collection('restaurants').doc();
    const payload = {
      ...validatedData,
      id: docRef.id,
    };

    await docRef.set(payload);

    res.status(201).json({
      success: true,
      restaurant: payload,
    });
  } catch (err: any) {
    console.error('Onboarding creation error:', err);
    res.status(400).json({
      error: 'ValidationError',
      message: err.message,
    });
  }
});

// ==========================================
// 3. Token Usage & Daily Budget Panel (Settings)
// ==========================================
router.get('/token-usage', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const summary = await getRestaurantTokenUsageSummary(restaurantId, authReq.db);

    // Also aggregate token usage from agent_runs so historical agent runs before today or without separate docs are reflected accurately
    const runsSnap = await authReq.db
      .collection(`restaurants/${restaurantId}/agent_runs`)
      .limit(100)
      .get();

    const agentFeatures: Record<
      string,
      { tokensIn: number; tokensOut: number; totalTokens: number; cachedTokens: number; calls: number }
    > = { ...summary.features };

    let agentRunsTotal = 0;
    for (const doc of runsSnap.docs) {
      const r = doc.data();
      const featKey = `agent_${r.agent || 'assistant'}`;
      const tIn = Number(r.tokensIn) || 0;
      const tOut = Number(r.tokensOut) || 0;
      const tot = tIn + tOut;
      if (tot > 0 && !summary.features[featKey]) {
        if (!agentFeatures[featKey]) {
          agentFeatures[featKey] = {
            tokensIn: 0,
            tokensOut: 0,
            totalTokens: 0,
            cachedTokens: 0,
            calls: 0,
          };
        }
        agentFeatures[featKey].tokensIn += tIn;
        agentFeatures[featKey].tokensOut += tOut;
        agentFeatures[featKey].totalTokens += tot;
        agentFeatures[featKey].calls += 1;
        agentRunsTotal += tot;
      }
    }

    const restDoc = await authReq.db.collection('restaurants').doc(restaurantId).get();
    const customBudget = Number(restDoc.data()?.dailyTokenBudget) || summary.dailyBudget || CONFIG.defaultDailyTokenBudget;

    res.json({
      success: true,
      usage: {
        ...summary,
        dailyBudget: customBudget,
        totalTokens: Math.max(summary.totalTokens, agentRunsTotal),
        remainingTokens: Math.max(0, customBudget - Math.max(summary.totalTokens, agentRunsTotal)),
        features: agentFeatures,
      },
    });
  } catch (err: any) {
    console.error('Token usage fetch error:', err);
    res.status(500).json({ error: 'TokenUsageFailed', message: err.message });
  }
});

router.post('/token-budget', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const dailyTokenBudget = Math.max(10_000, Math.min(5_000_000, Number(req.body?.dailyTokenBudget) || CONFIG.defaultDailyTokenBudget));
    await authReq.db.collection('restaurants').doc(restaurantId).set(
      {
        dailyTokenBudget,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const today = new Date().toISOString().slice(0, 10);
    await authReq.db
      .collection(`restaurants/${restaurantId}/token_usage`)
      .doc(today)
      .set({ dailyBudget: dailyTokenBudget }, { merge: true });

    res.json({
      success: true,
      dailyTokenBudget,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'BudgetUpdateFailed', message: err.message });
  }
});

// ==========================================
// 4. Export Data (JSON Archive)
// ==========================================
router.get('/export-data', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const restDoc = await authReq.db.collection('restaurants').doc(restaurantId).get();
    const data: Record<string, any> = {
      restaurant: restDoc.data(),
      exportedAt: new Date().toISOString(),
    };

    const subcollections = [
      'menu_items',
      'sales',
      'sales_import_batches',
      'recipes',
      'ingredients',
      'suppliers',
      'inventory',
      'forecasts',
      'plans',
      'feedback',
      'events',
      'mood_events',
      'token_usage',
    ];

    for (const sub of subcollections) {
      const snap = await authReq.db.collection(`restaurants/${restaurantId}/${sub}`).get();
      data[sub] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cravecast-export-${restaurantId}.json"`);
    res.json(data);
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'ExportFailed', message: error.message });
  }
});

// ==========================================
// 5. Delete Account & All Data (Privacy Purge)
// ==========================================
router.delete('/delete-account', requireAuth, requireRestaurant, async (req, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const subcollections = [
      'menu_items',
      'sales',
      'sales_import_batches',
      'recipes',
      'ingredients',
      'suppliers',
      'inventory',
      'forecasts',
      'plans',
      'feedback',
      'events',
      'mood_events',
      'weather_cache',
      'agent_runs',
      'token_usage',
    ];

    // Delete all documents in each subcollection
    for (const sub of subcollections) {
      const snap = await authReq.db.collection(`restaurants/${restaurantId}/${sub}`).limit(500).get();
      const batch = authReq.db.batch();
      snap.docs.forEach((d: any) => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete parent restaurant document
    await authReq.db.collection('restaurants').doc(restaurantId).delete();

    res.json({
      success: true,
      message: 'Restaurant profile and all associated data have been permanently deleted.',
    });
  } catch (error: any) {
    console.error('Delete data error:', error);
    res.status(500).json({ error: 'DeleteFailed', message: error.message });
  }
});

export default router;
