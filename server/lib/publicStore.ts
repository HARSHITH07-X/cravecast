import crypto from 'crypto';
import { createFirestoreClient, type FirestoreClient } from './firestoreRest.js';
import { adminDb } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

export interface PublicDishItem {
  id: string;
  name: string;
  category: string;
  price: number;
  tags: string[];
  description: string;
  allergens: string[];
  embedding?: number[] | null;
}

export interface PublicRestaurantInfo {
  id: string;
  name: string;
  city: string;
  currency: string;
  serviceHours?: {
    lunchStart: string;
    lunchEnd: string;
    dinnerStart: string;
    dinnerEnd: string;
  };
}

export interface StoredMoodEvent {
  id: string;
  restaurantId: string;
  moodText: string;
  moodSummary: string;
  moodTags: string[];
  language: string;
  weatherContext?: string;
  suggestedDishIds: string[];
  suggestedDishes: string[];
  orderedDishIds: string[];
  orderedDishes: string[];
  createdAt: string;
  timestamp: string;
  syncedToFirestore?: boolean;
}

// Server-side registry bridging authenticated owner sessions and server-mediated public endpoints
const ownerTokenRegistry = new Map<string, string>();
const restaurantInfoCache = new Map<string, PublicRestaurantInfo>();
const menuItemsMirror = new Map<string, any[]>();
const moodEventsMirror = new Map<string, Map<string, StoredMoodEvent>>();

/**
 * Called by requireAuth and menu routes whenever an owner is active,
 * allowing server-mediated public routes to access the restaurant's Firestore collections.
 */
export function registerOwnerRestaurantSession(
  restaurantId: string,
  idToken: string,
  restaurantData?: any
): void {
  if (!restaurantId) return;
  if (idToken) {
    ownerTokenRegistry.set(restaurantId, idToken);
  }
  if (restaurantData) {
    restaurantInfoCache.set(restaurantId, {
      id: restaurantId,
      name: restaurantData.name || 'CraveCast Kitchen',
      city: restaurantData.city || 'Bengaluru',
      currency: restaurantData.currency || 'INR',
      serviceHours: restaurantData.serviceHours,
    });
  }
}

/**
 * Updates the server-side mirror when menu items are listed or mutated.
 */
export function syncMenuItemsMirror(restaurantId: string, items: any[]): void {
  if (!restaurantId || !Array.isArray(items)) return;
  menuItemsMirror.set(restaurantId, items);
}

/**
 * Returns a FirestoreClient for the given restaurant if an owner token is registered.
 */
export function getServerFirestoreClient(restaurantId: string): FirestoreClient | null {
  const token = ownerTokenRegistry.get(restaurantId);
  if (!token) return null;
  return createFirestoreClient(token);
}

/**
 * Fetches restaurant info and public menu items (where showToCustomers is on and isActive !== false).
 * Strictly server-mediated; browser never touches Firestore.
 */
export async function getPublicMenuForRestaurant(restaurantId: string): Promise<{
  restaurant: PublicRestaurantInfo | null;
  publicDishes: PublicDishItem[];
}> {
  let restaurant: PublicRestaurantInfo | null = restaurantInfoCache.get(restaurantId) || null;
  let rawMenuItems: any[] = [];
  let loadedFromDb = false;

  const client = getServerFirestoreClient(restaurantId);

  // 1. Try Firestore REST via registered owner token
  if (client) {
    try {
      if (!restaurant) {
        const restSnap = await client.collection('restaurants').doc(restaurantId).get();
        if (restSnap.exists) {
          const d = restSnap.data();
          restaurant = {
            id: restaurantId,
            name: d.name || 'Restaurant',
            city: d.city || 'Bengaluru',
            currency: d.currency || 'INR',
            serviceHours: d.serviceHours,
          };
          restaurantInfoCache.set(restaurantId, restaurant);
        }
      }

      const menuSnap = await client.collection(`restaurants/${restaurantId}/menu_items`).get();
      rawMenuItems = menuSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      menuItemsMirror.set(restaurantId, rawMenuItems);
      loadedFromDb = true;
    } catch (err) {
      console.warn('[publicStore] Owner token Firestore read fallback:', (err as Error)?.message);
    }
  }

  // 2. Try Firebase Admin SDK if not loaded yet
  if (!loadedFromDb) {
    try {
      if (!restaurant) {
        const adminRestSnap = await adminDb.collection('restaurants').doc(restaurantId).get();
        if (adminRestSnap.exists) {
          const d = adminRestSnap.data() || {};
          restaurant = {
            id: restaurantId,
            name: d.name || 'Restaurant',
            city: d.city || 'Bengaluru',
            currency: d.currency || 'INR',
            serviceHours: d.serviceHours,
          };
          restaurantInfoCache.set(restaurantId, restaurant);
        }
      }

      const adminMenuSnap = await adminDb
        .collection(`restaurants/${restaurantId}/menu_items`)
        .get();
      rawMenuItems = adminMenuSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (rawMenuItems.length > 0) {
        menuItemsMirror.set(restaurantId, rawMenuItems);
        loadedFromDb = true;
      }
    } catch {
      // Admin SDK may not have cross-project ADC in preview environment; fall back to mirror
    }
  }

  // 3. Fall back to server mirror if needed
  if (!loadedFromDb && menuItemsMirror.has(restaurantId)) {
    rawMenuItems = menuItemsMirror.get(restaurantId) || [];
  }

  // Filter strictly to dishes where "show to customers" is on and dish is active
  const publicDishes: PublicDishItem[] = rawMenuItems
    .filter((item) => item && item.isActive !== false && item.showToCustomers !== false)
    .map((item) => ({
      id: String(item.id),
      name: String(item.name || '').trim(),
      category: String(item.category || 'Main Course').trim(),
      price: typeof item.price === 'number' ? item.price : Number(item.price) || 0,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      description: String(item.description || '').trim(),
      allergens: Array.isArray(item.allergens) ? item.allergens.map(String) : [],
      embedding: Array.isArray(item.embedding) ? item.embedding : null,
    }))
    .filter((item) => item.name.length > 0);

  // Sort alphabetically by category then name
  publicDishes.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return { restaurant, publicDishes };
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

/**
 * Runs Firestore findNearest combined with tag filters and allergen exclusions.
 * Returns ranked candidate public dishes.
 */
export async function findNearestPublicDishes(
  restaurantId: string,
  publicDishes: PublicDishItem[],
  queryVector: number[] | null,
  desiredTags: string[],
  avoidAllergens: string[],
  limitCount: number = 8
): Promise<Array<PublicDishItem & { similarityScore: number; matchedTags: string[] }>> {
  if (publicDishes.length === 0) return [];

  const publicMap = new Map<string, PublicDishItem>();
  for (const d of publicDishes) {
    publicMap.set(d.id, d);
  }

  const normalizedAvoid = avoidAllergens.map((a) => a.toLowerCase().trim()).filter(Boolean);
  const normalizedTags = desiredTags.map((t) => t.toLowerCase().trim()).filter(Boolean);

  // Step 1: Exclude dishes that contain any allergen the customer asked to avoid
  const allergenSafeDishes = publicDishes.filter((dish) => {
    if (normalizedAvoid.length === 0) return true;
    const dishAllergens = (dish.allergens || []).map((a) => a.toLowerCase().trim());
    return !normalizedAvoid.some((avoid) =>
      dishAllergens.some((da) => da.includes(avoid) || avoid.includes(da))
    );
  });

  const workingDishes = allergenSafeDishes.length > 0 ? allergenSafeDishes : publicDishes;

  // Step 2: Try native Firestore findNearest via Admin SDK if queryVector is present
  const nativeNearestIds = new Set<string>();
  if (queryVector && queryVector.length > 0 && process.env.NODE_ENV !== 'test') {
    try {
      const coll = adminDb
        .collection(`restaurants/${restaurantId}/menu_items`)
        .where('showToCustomers', '==', true);
      if (typeof (coll as any).findNearest === 'function') {
        const vectorQuery = (coll as any).findNearest('embedding', FieldValue.vector(queryVector), {
          limit: limitCount,
          distanceMeasure: 'COSINE',
        });
        const snap = await vectorQuery.get();
        snap.docs.forEach((doc: any) => nativeNearestIds.add(doc.id));
      }
    } catch {
      // Native vector index or Admin ADC not active; use exact cosine similarity on embeddings below
    }
  }

  // Step 3: Combine vector similarity + tag filter overlap + keyword relevance
  const scored = workingDishes.map((dish) => {
    const vectorSim =
      queryVector && dish.embedding ? cosineSimilarity(queryVector, dish.embedding) : 0;
    const nativeBoost = nativeNearestIds.has(dish.id) ? 0.15 : 0;

    const dishTagsLower = (dish.tags || []).map((t) => t.toLowerCase());
    const dishTextLower = `${dish.name} ${dish.category} ${dish.description} ${dishTagsLower.join(' ')}`.toLowerCase();

    const matchedTags: string[] = [];
    let tagScore = 0;

    for (const desired of normalizedTags) {
      if (dishTagsLower.some((t) => t.includes(desired) || desired.includes(t))) {
        matchedTags.push(desired);
        tagScore += 0.25;
      } else if (dishTextLower.includes(desired)) {
        matchedTags.push(desired);
        tagScore += 0.12;
      }
    }

    const combinedScore = vectorSim * 0.65 + Math.min(0.5, tagScore) + nativeBoost;

    return {
      ...dish,
      similarityScore: Math.round(combinedScore * 1000) / 1000,
      matchedTags,
    };
  });

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, limitCount);
}

/**
 * Saves a mood_events record on the server (no personal data, no accounts).
 */
export async function saveMoodEventRecord(
  restaurantId: string,
  payload: Omit<StoredMoodEvent, 'id' | 'restaurantId' | 'createdAt' | 'timestamp'> & { id?: string }
): Promise<StoredMoodEvent> {
  const id = payload.id || `mood_${crypto.randomBytes(8).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const record: StoredMoodEvent = {
    id,
    restaurantId,
    moodText: String(payload.moodText || '').trim().slice(0, 300),
    moodSummary: String(payload.moodSummary || 'General Craving').trim(),
    moodTags: Array.isArray(payload.moodTags) ? payload.moodTags.slice(0, 8) : [],
    language: String(payload.language || 'en'),
    weatherContext: payload.weatherContext || '',
    suggestedDishIds: Array.isArray(payload.suggestedDishIds) ? payload.suggestedDishIds : [],
    suggestedDishes: Array.isArray(payload.suggestedDishes) ? payload.suggestedDishes : [],
    orderedDishIds: Array.isArray(payload.orderedDishIds) ? payload.orderedDishIds : [],
    orderedDishes: Array.isArray(payload.orderedDishes) ? payload.orderedDishes : [],
    createdAt: nowIso,
    timestamp: nowIso,
    syncedToFirestore: false,
  };

  if (!moodEventsMirror.has(restaurantId)) {
    moodEventsMirror.set(restaurantId, new Map());
  }
  moodEventsMirror.get(restaurantId)!.set(id, record);

  // Persist to Firestore via owner token client or Admin SDK
  const client = getServerFirestoreClient(restaurantId);
  if (client) {
    try {
      await client
        .collection(`restaurants/${restaurantId}/mood_events`)
        .doc(id)
        .set(
          {
            id: record.id,
            restaurantId: record.restaurantId,
            moodText: record.moodText,
            moodSummary: record.moodSummary,
            moodTags: record.moodTags,
            language: record.language,
            weatherContext: record.weatherContext,
            suggestedDishIds: record.suggestedDishIds,
            suggestedDishes: record.suggestedDishes,
            orderedDishIds: record.orderedDishIds,
            orderedDishes: record.orderedDishes,
            createdAt: record.createdAt,
            timestamp: record.timestamp,
          },
          { merge: true }
        );
      record.syncedToFirestore = true;
    } catch (err) {
      console.warn('[publicStore] Could not write mood_event via owner token:', (err as Error)?.message);
    }
  } else {
    try {
      await adminDb
        .collection(`restaurants/${restaurantId}/mood_events`)
        .doc(id)
        .set(
          {
            id: record.id,
            restaurantId: record.restaurantId,
            moodText: record.moodText,
            moodSummary: record.moodSummary,
            moodTags: record.moodTags,
            language: record.language,
            weatherContext: record.weatherContext,
            suggestedDishIds: record.suggestedDishIds,
            suggestedDishes: record.suggestedDishes,
            orderedDishIds: record.orderedDishIds,
            orderedDishes: record.orderedDishes,
            createdAt: record.createdAt,
            timestamp: record.timestamp,
          },
          { merge: true }
        );
      record.syncedToFirestore = true;
    } catch {
      // Stored in moodEventsMirror and will flush on next owner session
    }
  }

  return record;
}

/**
 * Updates an existing mood_events record with confirmed customer order dishes,
 * or creates one if eventId was not previously saved.
 */
export async function confirmMoodOrderRecord(
  restaurantId: string,
  params: {
    eventId?: string;
    moodText?: string;
    moodSummary?: string;
    moodTags?: string[];
    suggestedDishIds?: string[];
    suggestedDishes?: string[];
    orderedDishIds: string[];
    orderedDishes: string[];
    weatherContext?: string;
  }
): Promise<StoredMoodEvent> {
  const restEvents = moodEventsMirror.get(restaurantId);
  const existing = params.eventId && restEvents ? restEvents.get(params.eventId) : undefined;

  const id = existing?.id || params.eventId || `mood_${crypto.randomBytes(8).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const updated: StoredMoodEvent = {
    id,
    restaurantId,
    moodText: (existing?.moodText || params.moodText || 'Table order selection').trim().slice(0, 300),
    moodSummary: existing?.moodSummary || params.moodSummary || 'Customer Pick',
    moodTags: existing?.moodTags || params.moodTags || [],
    language: existing?.language || 'en',
    weatherContext: existing?.weatherContext || params.weatherContext || '',
    suggestedDishIds: existing?.suggestedDishIds || params.suggestedDishIds || [],
    suggestedDishes: existing?.suggestedDishes || params.suggestedDishes || [],
    orderedDishIds: params.orderedDishIds,
    orderedDishes: params.orderedDishes,
    createdAt: existing?.createdAt || nowIso,
    timestamp: nowIso,
    syncedToFirestore: false,
  };

  if (!moodEventsMirror.has(restaurantId)) {
    moodEventsMirror.set(restaurantId, new Map());
  }
  moodEventsMirror.get(restaurantId)!.set(id, updated);

  const client = getServerFirestoreClient(restaurantId);
  if (client) {
    try {
      await client
        .collection(`restaurants/${restaurantId}/mood_events`)
        .doc(id)
        .set(
          {
            id: updated.id,
            restaurantId: updated.restaurantId,
            moodText: updated.moodText,
            moodSummary: updated.moodSummary,
            moodTags: updated.moodTags,
            language: updated.language,
            weatherContext: updated.weatherContext,
            suggestedDishIds: updated.suggestedDishIds,
            suggestedDishes: updated.suggestedDishes,
            orderedDishIds: updated.orderedDishIds,
            orderedDishes: updated.orderedDishes,
            createdAt: updated.createdAt,
            timestamp: updated.timestamp,
          },
          { merge: true }
        );
      updated.syncedToFirestore = true;
    } catch (err) {
      console.warn('[publicStore] Could not update mood_event order via owner token:', (err as Error)?.message);
    }
  } else {
    try {
      await adminDb
        .collection(`restaurants/${restaurantId}/mood_events`)
        .doc(id)
        .set(
          {
            id: updated.id,
            restaurantId: updated.restaurantId,
            moodText: updated.moodText,
            moodSummary: updated.moodSummary,
            moodTags: updated.moodTags,
            language: updated.language,
            weatherContext: updated.weatherContext,
            suggestedDishIds: updated.suggestedDishIds,
            suggestedDishes: updated.suggestedDishes,
            orderedDishIds: updated.orderedDishIds,
            orderedDishes: updated.orderedDishes,
            createdAt: updated.createdAt,
            timestamp: updated.timestamp,
          },
          { merge: true }
        );
      updated.syncedToFirestore = true;
    } catch {
      // Will flush on next owner session
    }
  }

  return updated;
}

/**
 * Lists all mood_events for a restaurant, merging Firestore records and any unsynced mirror records.
 */
export async function listMoodEventsForOwner(
  restaurantId: string,
  ownerDb: FirestoreClient
): Promise<StoredMoodEvent[]> {
  const merged = new Map<string, StoredMoodEvent>();

  // 1. Add mirror records and flush any unsynced ones to Firestore
  const mirrorMap = moodEventsMirror.get(restaurantId);
  if (mirrorMap) {
    for (const [id, ev] of mirrorMap.entries()) {
      merged.set(id, ev);
      if (!ev.syncedToFirestore) {
        try {
          await ownerDb
            .collection(`restaurants/${restaurantId}/mood_events`)
            .doc(id)
            .set(
              {
                id: ev.id,
                restaurantId: ev.restaurantId,
                moodText: ev.moodText,
                moodSummary: ev.moodSummary,
                moodTags: ev.moodTags,
                language: ev.language,
                weatherContext: ev.weatherContext,
                suggestedDishIds: ev.suggestedDishIds,
                suggestedDishes: ev.suggestedDishes,
                orderedDishIds: ev.orderedDishIds,
                orderedDishes: ev.orderedDishes,
                createdAt: ev.createdAt,
                timestamp: ev.timestamp,
              },
              { merge: true }
            );
          ev.syncedToFirestore = true;
        } catch {
          // ignore transient sync error
        }
      }
    }
  }

  // 2. Fetch stored records from Firestore mood_events
  try {
    const snap = await ownerDb
      .collection(`restaurants/${restaurantId}/mood_events`)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      const ev: StoredMoodEvent = {
        id: doc.id,
        restaurantId,
        moodText: String(d.moodText || d.moodNotes || '').trim(),
        moodSummary: String(d.moodSummary || (Array.isArray(d.moodTags) && d.moodTags[0]) || 'General Craving'),
        moodTags: Array.isArray(d.moodTags) ? d.moodTags : [],
        language: String(d.language || 'en'),
        weatherContext: String(d.weatherContext || ''),
        suggestedDishIds: Array.isArray(d.suggestedDishIds) ? d.suggestedDishIds : [],
        suggestedDishes: Array.isArray(d.suggestedDishes) ? d.suggestedDishes : [],
        orderedDishIds: Array.isArray(d.orderedDishIds) ? d.orderedDishIds : [],
        orderedDishes: Array.isArray(d.orderedDishes)
          ? d.orderedDishes
          : Array.isArray(d.requestedDishes)
          ? d.requestedDishes
          : [],
        createdAt: String(d.createdAt || d.timestamp || new Date().toISOString()),
        timestamp: String(d.timestamp || d.createdAt || new Date().toISOString()),
        syncedToFirestore: true,
      };
      // Prefer version with orderedDishes if mirror has newer order confirmation
      const existing = merged.get(doc.id);
      if (!existing || (ev.orderedDishIds.length >= existing.orderedDishIds.length)) {
        merged.set(doc.id, ev);
      }
    }
  } catch (err) {
    console.warn('[publicStore] Failed to list mood_events from Firestore:', (err as Error)?.message);
  }

  const list = Array.from(merged.values());
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}
