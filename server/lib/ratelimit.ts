import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    tokens: number;
    lastRefill: number;
  };
}

const store: RateLimitStore = {};
const restaurantStore: RateLimitStore = {};

function consumeToken(
  bucketStore: RateLimitStore,
  key: string,
  maxRequests: number,
  windowMs: number,
  now: number
): { allowed: boolean; remaining: number } {
  if (!bucketStore[key]) {
    bucketStore[key] = {
      tokens: maxRequests - 1,
      lastRefill: now,
    };
    return { allowed: true, remaining: maxRequests - 1 };
  }

  const elapsed = now - bucketStore[key].lastRefill;
  const tokensToAdd = (elapsed / windowMs) * maxRequests;
  bucketStore[key].tokens = Math.min(maxRequests, bucketStore[key].tokens + tokensToAdd);
  bucketStore[key].lastRefill = now;

  if (bucketStore[key].tokens < 1) {
    return { allowed: false, remaining: 0 };
  }

  bucketStore[key].tokens -= 1;
  return { allowed: true, remaining: Math.floor(bucketStore[key].tokens) };
}

/**
 * Creates a rate limiting middleware for public-facing endpoints (e.g. public customer chat).
 * Enforces both per-IP and per-restaurant rate limits.
 *
 * @param maxRequests Maximum allowed requests per IP per window
 * @param windowSeconds Window length in seconds
 * @param maxPerRestaurant Maximum allowed requests per restaurant per window
 */
export function createRateLimiter(
  maxRequests: number = 30,
  windowSeconds: number = 60,
  maxPerRestaurant: number = maxRequests * 3
) {
  const windowMs = windowSeconds * 1000;

  // Background cleanup for stale IP and restaurant records
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const ip in store) {
      if (now - store[ip].lastRefill > windowMs * 2) {
        delete store[ip];
      }
    }
    for (const rId in restaurantStore) {
      if (now - restaurantStore[rId].lastRefill > windowMs * 2) {
        delete restaurantStore[rId];
      }
    }
  }, windowMs);
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown-client';
    const restaurantId =
      req.params?.id ||
      req.params?.restaurantId ||
      req.body?.restaurantId ||
      (typeof req.query?.restaurantId === 'string' ? req.query.restaurantId : '') ||
      'global';
    const now = Date.now();

    const ipCheck = consumeToken(store, ip, maxRequests, windowMs, now);
    if (!ipCheck.allowed) {
      res.setHeader('Retry-After', Math.ceil(windowSeconds));
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded for your IP address. Please wait a moment before retrying.',
      });
      return;
    }

    if (restaurantId && restaurantId !== 'global') {
      const restCheck = consumeToken(
        restaurantStore,
        String(restaurantId),
        maxPerRestaurant,
        windowMs,
        now
      );
      if (!restCheck.allowed) {
        res.setHeader('Retry-After', Math.ceil(windowSeconds));
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'This restaurant chat is currently busy. Please wait a moment before retrying.',
        });
        return;
      }
      res.setHeader('X-RateLimit-Restaurant-Remaining', restCheck.remaining);
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', ipCheck.remaining);
    next();
  };
}

/**
 * Verifies honeypot field and optional Cloudflare Turnstile or Google reCAPTCHA token if configured.
 */
export async function verifyBotCheck(req: Request): Promise<{
  allowed: boolean;
  reason?: string;
  provider?: 'turnstile' | 'recaptcha' | 'honeypot_only';
}> {
  const honeypot = req.body?.honeypot || req.body?.website || req.body?.company_url;
  if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
    return { allowed: false, reason: 'Bot check failed (honeypot field populated).' };
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  const botToken = typeof req.body?.botToken === 'string' ? req.body.botToken.trim() : '';

  if (turnstileSecret) {
    if (!botToken) {
      return {
        allowed: false,
        reason: 'Please complete the Cloudflare Turnstile verification.',
        provider: 'turnstile',
      };
    }
    try {
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: botToken,
        }),
      });
      const data = await verifyRes.json();
      if (!data.success) {
        return { allowed: false, reason: 'Cloudflare Turnstile verification failed.', provider: 'turnstile' };
      }
      return { allowed: true, provider: 'turnstile' };
    } catch (err) {
      console.warn('Turnstile verification network error:', err);
      return { allowed: true, provider: 'turnstile' };
    }
  }

  if (recaptchaSecret) {
    if (!botToken) {
      return {
        allowed: false,
        reason: 'Please complete the reCAPTCHA verification.',
        provider: 'recaptcha',
      };
    }
    try {
      const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: recaptchaSecret,
          response: botToken,
        }),
      });
      const data = await verifyRes.json();
      if (!data.success) {
        return { allowed: false, reason: 'reCAPTCHA verification failed.', provider: 'recaptcha' };
      }
      return { allowed: true, provider: 'recaptcha' };
    } catch (err) {
      console.warn('reCAPTCHA verification network error:', err);
      return { allowed: true, provider: 'recaptcha' };
    }
  }

  return { allowed: true, provider: 'honeypot_only' };
}

