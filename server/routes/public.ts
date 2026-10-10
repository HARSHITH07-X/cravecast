import { Router, Request, Response } from 'express';
import { createRateLimiter, verifyBotCheck } from '../lib/ratelimit.js';
import {
  getPublicMenuForRestaurant,
  saveMoodEventRecord,
  confirmMoodOrderRecord,
  listMoodEventsForOwner,
} from '../lib/publicStore.js';
import { runCustomerMoodAgent } from '../agents/moodAgent.js';
import { requireAuth, requireRestaurant, AuthenticatedRequest } from '../lib/authMiddleware.js';

const router = Router();

const MAX_MOOD_MESSAGE_LENGTH = 300;

const menuRateLimiter = createRateLimiter(30, 60, 120);
const chatRateLimiter = createRateLimiter(15, 60, 60);
const orderRateLimiter = createRateLimiter(20, 60, 80);

// ==========================================================
// 1. GET /api/public/menu/:id
// Returns only dishes where "show to customers" is on, with
// name, price, tags, description, and owner-entered allergens.
// ==========================================================
router.get('/menu/:id', menuRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const restaurantId = String(req.params.id || '').trim();
  if (!restaurantId) {
    res.status(400).json({ error: 'InvalidRestaurantId', message: 'Restaurant ID is required.' });
    return;
  }

  try {
    const { restaurant, publicDishes } = await getPublicMenuForRestaurant(restaurantId);

    // Strip any internal properties (e.g. embedding) before sending to browser
    const sanitizedDishes = publicDishes.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      price: d.price,
      tags: d.tags,
      description: d.description,
      allergens: d.allergens,
    }));

    const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
    const recaptchaSiteKey = process.env.VITE_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || '';

    res.json({
      restaurant: restaurant || {
        id: restaurantId,
        name: 'CraveCast Partner Kitchen',
        city: '',
        currency: 'INR',
      },
      menuComingSoon: sanitizedDishes.length === 0,
      dishes: sanitizedDishes,
      botProtection: {
        turnstileSiteKey: turnstileSiteKey || null,
        recaptchaSiteKey: recaptchaSiteKey || null,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/public/menu/:id] Error:', err);
    res.status(500).json({
      error: 'PublicMenuFailed',
      message: 'Unable to load the public menu right now.',
    });
  }
});

// ==========================================================
// 2. POST /api/public/chat
// Runs the Customer Mood Agent, verifies 3 real menu item IDs,
// and saves mood_events without personal data.
// ==========================================================
router.post('/chat', chatRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Bot & Honeypot Verification
    const botCheck = await verifyBotCheck(req);
    if (!botCheck.allowed) {
      res.status(400).json({
        error: 'BotCheckFailed',
        message: botCheck.reason || 'Automated request blocked.',
      });
      return;
    }

    const restaurantId = String(req.body?.restaurantId || '').trim();
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message : '';

    if (!restaurantId) {
      res.status(400).json({ error: 'InvalidInput', message: 'restaurantId is required.' });
      return;
    }

    const trimmedMessage = rawMessage.trim();
    if (!trimmedMessage) {
      res.status(400).json({ error: 'EmptyMessage', message: 'Please tell us how you are feeling today.' });
      return;
    }

    // 2. Cap message length strictly
    if (trimmedMessage.length > MAX_MOOD_MESSAGE_LENGTH) {
      res.status(400).json({
        error: 'MessageTooLong',
        message: `Please keep your message under ${MAX_MOOD_MESSAGE_LENGTH} characters.`,
      });
      return;
    }

    // 3. Load public menu for restaurant
    const { restaurant, publicDishes } = await getPublicMenuForRestaurant(restaurantId);

    if (publicDishes.length === 0) {
      res.status(200).json({
        menuComingSoon: true,
        greeting: 'Our public menu is coming soon! Please ask your server for today’s specials.',
        suggestions: [],
      });
      return;
    }

    // 4. Run Mood Agent
    const agentResult = await runCustomerMoodAgent({
      restaurantId,
      restaurantName: restaurant?.name || 'our kitchen',
      city: restaurant?.city || 'Bengaluru',
      currency: restaurant?.currency || 'INR',
      customerMessage: trimmedMessage,
      publicDishes,
    });

    // 5. Save mood_events record (trimmed mood text, tags, suggested dishes; no PII)
    const savedEvent = await saveMoodEventRecord(restaurantId, {
      moodText: trimmedMessage.slice(0, MAX_MOOD_MESSAGE_LENGTH),
      moodSummary: agentResult.moodSummary,
      moodTags: agentResult.moodTags,
      language: agentResult.language,
      weatherContext: agentResult.weatherContext,
      suggestedDishIds: agentResult.suggestions.map((s) => s.id),
      suggestedDishes: agentResult.suggestions.map((s) => s.name),
      orderedDishIds: [],
      orderedDishes: [],
    });

    res.json({
      success: true,
      eventId: savedEvent.id,
      greeting: agentResult.greeting,
      moodSummary: agentResult.moodSummary,
      moodTags: agentResult.moodTags,
      language: agentResult.language,
      weatherContext: agentResult.weatherContext,
      suggestions: agentResult.suggestions,
    });
  } catch (err: any) {
    console.error('[POST /api/public/chat] Error:', err);
    res.status(500).json({
      error: 'MoodChatFailed',
      message: 'Could not generate dish recommendations right now. Please try again.',
    });
  }
});

// ==========================================================
// 3. POST /api/public/order
// Records the customer's tapped order list in mood_events
// (strictly verified against the public menu; no payment).
// ==========================================================
router.post('/order', orderRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const botCheck = await verifyBotCheck(req);
    if (!botCheck.allowed) {
      res.status(400).json({
        error: 'BotCheckFailed',
        message: botCheck.reason || 'Automated request blocked.',
      });
      return;
    }

    const restaurantId = String(req.body?.restaurantId || '').trim();
    const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : undefined;
    const rawOrderedIds: unknown[] = Array.isArray(req.body?.orderedDishIds) ? req.body.orderedDishIds : [];
    const rawItems: Array<{ dishId: string; quantity?: number }> = Array.isArray(req.body?.items)
      ? req.body.items
      : [];

    if (!restaurantId) {
      res.status(400).json({ error: 'InvalidInput', message: 'restaurantId is required.' });
      return;
    }

    // Load public menu to verify every ordered dish ID exists on the public menu
    const { publicDishes } = await getPublicMenuForRestaurant(restaurantId);
    const publicMenuMap = new Map(publicDishes.map((d) => [d.id, d]));

    const verifiedOrderIds: string[] = [];
    const verifiedOrderNames: string[] = [];
    const verifiedLineItems: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      allergens: string[];
    }> = [];

    if (rawItems.length > 0) {
      for (const entry of rawItems) {
        const id = String(entry?.dishId || '').trim();
        const qty = Math.max(1, Math.min(20, Math.round(Number(entry?.quantity) || 1)));
        const dish = publicMenuMap.get(id);
        if (!dish) continue; // Drop anything not on the public menu
        for (let i = 0; i < qty; i++) {
          verifiedOrderIds.push(dish.id);
          verifiedOrderNames.push(dish.name);
        }
        verifiedLineItems.push({
          id: dish.id,
          name: dish.name,
          price: dish.price,
          quantity: qty,
          allergens: dish.allergens,
        });
      }
    } else {
      const counts = new Map<string, number>();
      for (const rawId of rawOrderedIds) {
        const id = String(rawId || '').trim();
        const dish = publicMenuMap.get(id);
        if (!dish) continue; // Drop anything not on the public menu
        verifiedOrderIds.push(dish.id);
        verifiedOrderNames.push(dish.name);
        counts.set(dish.id, (counts.get(dish.id) || 0) + 1);
      }
      for (const [id, qty] of counts.entries()) {
        const dish = publicMenuMap.get(id)!;
        verifiedLineItems.push({
          id: dish.id,
          name: dish.name,
          price: dish.price,
          quantity: qty,
          allergens: dish.allergens,
        });
      }
    }

    if (verifiedOrderIds.length === 0) {
      res.status(400).json({
        error: 'NoValidDishes',
        message: 'Please select at least one dish from the public menu.',
      });
      return;
    }

    // Verify suggestedDishIds if passed
    const rawSuggestedIds: unknown[] = Array.isArray(req.body?.suggestedDishIds)
      ? req.body.suggestedDishIds
      : [];
    const verifiedSuggestedIds: string[] = [];
    const verifiedSuggestedNames: string[] = [];
    for (const sId of rawSuggestedIds) {
      const d = publicMenuMap.get(String(sId || '').trim());
      if (d) {
        verifiedSuggestedIds.push(d.id);
        verifiedSuggestedNames.push(d.name);
      }
    }

    const updatedRecord = await confirmMoodOrderRecord(restaurantId, {
      eventId,
      moodText: typeof req.body?.moodText === 'string' ? req.body.moodText.slice(0, MAX_MOOD_MESSAGE_LENGTH) : undefined,
      moodSummary: typeof req.body?.moodSummary === 'string' ? req.body.moodSummary.slice(0, 60) : undefined,
      moodTags: Array.isArray(req.body?.moodTags) ? req.body.moodTags.map(String).slice(0, 8) : undefined,
      suggestedDishIds: verifiedSuggestedIds.length > 0 ? verifiedSuggestedIds : undefined,
      suggestedDishes: verifiedSuggestedNames.length > 0 ? verifiedSuggestedNames : undefined,
      orderedDishIds: verifiedOrderIds,
      orderedDishes: verifiedOrderNames,
    });

    res.json({
      success: true,
      eventId: updatedRecord.id,
      confirmedItems: verifiedLineItems,
      timestamp: updatedRecord.timestamp,
    });
  } catch (err: any) {
    console.error('[POST /api/public/order] Error:', err);
    res.status(500).json({
      error: 'OrderSaveFailed',
      message: 'Could not save your order list right now.',
    });
  }
});

// ==========================================================
// 4. GET /api/public/mood-trends (Owner Authenticated)
// Computes "Mood trends" (moods versus dishes this week)
// strictly from stored mood_events.
// ==========================================================
router.get('/mood-trends', requireAuth, requireRestaurant, async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const restaurantId = authReq.restaurantId!;

  try {
    const allEvents = await listMoodEventsForOwner(restaurantId, authReq.db);

    // Filter to the last 7 days ("this week")
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekEvents = allEvents.filter((ev) => {
      const ts = Date.parse(ev.createdAt || ev.timestamp);
      return Number.isNaN(ts) ? true : ts >= sevenDaysAgoMs;
    });

    let totalOrdersConfirmed = 0;
    const moodMap = new Map<
      string,
      {
        mood: string;
        sessions: number;
        orders: number;
        dishStats: Map<string, { dishName: string; suggestedCount: number; orderedCount: number }>;
      }
    >();

    for (const ev of weekEvents) {
      const primaryMood =
        ev.moodSummary ||
        (ev.moodTags && ev.moodTags.length > 0 ? ev.moodTags[0] : 'General Craving');

      if (!moodMap.has(primaryMood)) {
        moodMap.set(primaryMood, {
          mood: primaryMood,
          sessions: 0,
          orders: 0,
          dishStats: new Map(),
        });
      }

      const group = moodMap.get(primaryMood)!;
      group.sessions += 1;
      if (ev.orderedDishes && ev.orderedDishes.length > 0) {
        group.orders += 1;
        totalOrdersConfirmed += 1;
      }

      for (const sDish of ev.suggestedDishes || []) {
        if (!sDish) continue;
        const curr = group.dishStats.get(sDish) || {
          dishName: sDish,
          suggestedCount: 0,
          orderedCount: 0,
        };
        curr.suggestedCount += 1;
        group.dishStats.set(sDish, curr);
      }

      for (const oDish of ev.orderedDishes || []) {
        if (!oDish) continue;
        const curr = group.dishStats.get(oDish) || {
          dishName: oDish,
          suggestedCount: 0,
          orderedCount: 0,
        };
        curr.orderedCount += 1;
        group.dishStats.set(oDish, curr);
      }
    }

    const moodBreakdown = Array.from(moodMap.values())
      .map((g) => {
        const topDishes = Array.from(g.dishStats.values()).sort(
          (a, b) => b.orderedCount - a.orderedCount || b.suggestedCount - a.suggestedCount
        );
        return {
          mood: g.mood,
          sessions: g.sessions,
          orders: g.orders,
          topDishes: topDishes.slice(0, 5),
        };
      })
      .sort((a, b) => b.orders - a.orders || b.sessions - a.sessions);

    // Flattened mood-vs-dish rows for the owner table
    const dishByMoodRows: Array<{
      mood: string;
      dishName: string;
      suggestedCount: number;
      orderedCount: number;
    }> = [];
    for (const mb of moodBreakdown) {
      for (const d of mb.topDishes) {
        dishByMoodRows.push({
          mood: mb.mood,
          dishName: d.dishName,
          suggestedCount: d.suggestedCount,
          orderedCount: d.orderedCount,
        });
      }
    }

    res.json({
      restaurantId,
      windowDays: 7,
      totalSessionsThisWeek: weekEvents.length,
      totalOrdersConfirmedThisWeek: totalOrdersConfirmed,
      moodBreakdown,
      dishByMoodRows,
      recentEvents: weekEvents.slice(0, 10),
    });
  } catch (err: any) {
    console.error('[GET /api/public/mood-trends] Error:', err);
    res.status(500).json({
      error: 'MoodTrendsFailed',
      message: err.message || 'Failed to compute mood trends.',
    });
  }
});

export default router;
