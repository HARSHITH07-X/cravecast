import { Request, Response, NextFunction } from 'express';
import { adminAuth } from './firebaseAdmin.js';
import { createFirestoreClient, API_KEY, type FirestoreClient } from './firestoreRest.js';
import { registerOwnerRestaurantSession } from './publicStore.js';
import type { RestaurantSettings } from '../../src/lib/types.js';

export interface AuthenticatedRequest extends Request {
  uid: string;
  user: any;
  idToken: string;
  db: FirestoreClient;
  restaurantId: string | null;
  restaurant: (RestaurantSettings & { id: string }) | null;
}

/**
 * Middleware that validates the Firebase ID token from the Authorization header.
 * Strictly derives the authenticated user UID and their owned restaurant document.
 * NEVER accepts or relies on a client-supplied restaurant ID.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  let idToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split('Bearer ')[1].trim();
  } else if (queryToken) {
    idToken = queryToken;
  }

  if (!idToken) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. A valid Firebase Bearer token is required.',
    });
    return;
  }

  let uid = '';
  let userPayload: any = null;

  // 1. Verify ID token via Admin SDK with Google Identity Toolkit fallback
  try {
    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      uid = decodedToken.uid;
      userPayload = decodedToken;
    } catch (adminErr: any) {
      console.warn('adminAuth.verifyIdToken verification failed, attempting Google identity lookup:', adminErr?.message);
      const lookupRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!lookupRes.ok) {
        throw new Error('Identity lookup rejected the token.');
      }
      const data = await lookupRes.json();
      const firstUser = data.users?.[0];
      if (!firstUser || !firstUser.localId) {
        throw new Error('No user record found for this token.');
      }
      uid = firstUser.localId;
      userPayload = { uid, email: firstUser.email };
    }
  } catch (error: any) {
    console.error('ID Token verification failed:', error?.message);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Failed to verify Firebase ID token.',
    });
    return;
  }

  const authReq = req as AuthenticatedRequest;
  authReq.uid = uid;
  authReq.user = userPayload;
  authReq.idToken = idToken;
  authReq.db = createFirestoreClient(idToken);

  // 2. Derive restaurant document directly from Firestore where ownerUid == uid
  try {
    const snap = await authReq.db
      .collection('restaurants')
      .where('ownerUid', '==', uid)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      authReq.restaurantId = doc.id;
      authReq.restaurant = { id: doc.id, ...(doc.data() as RestaurantSettings) };
      registerOwnerRestaurantSession(doc.id, idToken, authReq.restaurant);
    } else {
      authReq.restaurantId = null;
      authReq.restaurant = null;
    }
  } catch (dbErr: any) {
    console.warn('Failed to query restaurant for ownerUid:', uid, dbErr?.message);
    authReq.restaurantId = null;
    authReq.restaurant = null;
  }

  next();
}

/**
 * Middleware that asserts the restaurant document exists.
 * Used for routes that require an onboarded restaurant.
 */
export function requireRestaurant(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.restaurantId || !authReq.restaurant) {
    res.status(404).json({
      error: 'RestaurantNotFound',
      message: 'No restaurant registered for this owner. Complete onboarding first.',
    });
    return;
  }
  next();
}
