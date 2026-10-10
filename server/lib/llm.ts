import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { MODEL_FAST, MODEL_REASONING, MODEL_EMBED, CONFIG } from '../config.js';
import type { FirestoreClient } from './firestoreRest.js';

// Initialize the Google Gen AI client using GEMINI_API_KEY from environment
const ai = new GoogleGenAI({
  apiKey: CONFIG.geminiApiKey || process.env.GEMINI_API_KEY,
});

// ==========================================
// 1. Exponential Backoff Retry Wrapper
// ==========================================
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 400
): Promise<T> {
  let attempt = 0;
  let lastError: any;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      attempt++;
      if (attempt > maxRetries) break;

      const status = err?.status || err?.statusCode || 0;
      const msg = String(err?.message || '').toLowerCase();
      const isRetriable =
        status === 429 ||
        status >= 500 ||
        msg.includes('rate') ||
        msg.includes('quota') ||
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('fetch');

      const delay = isRetriable
        ? baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150)
        : 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ==========================================
// 2. Context Caching for Repeated Large Prompts
// ==========================================
interface PromptContextCacheEntry {
  cacheKey: string;
  cacheName?: string;
  systemInstruction: string;
  estimatedTokens: number;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

const promptContextCache = new Map<string, PromptContextCacheEntry>();

export async function getOrCreateContextCache(
  cacheKey: string,
  model: string,
  systemInstruction: string,
  ttlSeconds: number = 1800
): Promise<{ cacheName?: string; cachedTokens: number; cacheHit: boolean }> {
  const now = Date.now();
  const existing = promptContextCache.get(cacheKey);
  if (existing && existing.expiresAt > now) {
    existing.hitCount += 1;
    return {
      cacheName: existing.cacheName,
      cachedTokens: existing.estimatedTokens,
      cacheHit: true,
    };
  }

  const estimatedTokens = Math.ceil(systemInstruction.length / 4);
  let cacheName: string | undefined;

  // Attempt Gemini server-side context cache creation for large repeated system instructions (>= 4096 chars)
  if (systemInstruction.length >= 4096 && (CONFIG.geminiApiKey || process.env.GEMINI_API_KEY)) {
    try {
      const cachesApi = (ai as any).caches;
      if (cachesApi && typeof cachesApi.create === 'function') {
        const created = await cachesApi.create({
          model,
          config: {
            systemInstruction,
            ttl: `${ttlSeconds}s`,
          },
        });
        cacheName = created?.name;
      }
    } catch {
      // Fallback to local context cache tracking if model/tier does not require remote cache handle
    }
  }

  promptContextCache.set(cacheKey, {
    cacheKey,
    cacheName,
    systemInstruction,
    estimatedTokens,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
    hitCount: 0,
  });

  return {
    cacheName,
    cachedTokens: 0,
    cacheHit: false,
  };
}

// ==========================================
// 3. Per-Restaurant Daily Token Budget & Per-Feature Usage Accounting
// ==========================================
export interface FeatureTokenMetric {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cachedTokens: number;
  calls: number;
}

interface DailyRestaurantTokenRecord {
  date: string;
  dailyBudget: number;
  totalTokens: number;
  features: Record<string, FeatureTokenMetric>;
}

const memoryTokenUsage = new Map<string, DailyRestaurantTokenRecord>();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkDailyTokenBudget(
  restaurantId: string,
  db?: FirestoreClient
): Promise<{
  allowed: boolean;
  date: string;
  totalTokens: number;
  dailyBudget: number;
  remainingTokens: number;
}> {
  const date = getTodayKey();
  const memKey = `${restaurantId}__${date}`;
  let record = memoryTokenUsage.get(memKey);

  if (!record) {
    record = {
      date,
      dailyBudget: CONFIG.defaultDailyTokenBudget,
      totalTokens: 0,
      features: {},
    };

    if (db && restaurantId) {
      try {
        const doc = await db.collection(`restaurants/${restaurantId}/token_usage`).doc(date).get();
        if (doc.exists) {
          const data = doc.data() || {};
          record.dailyBudget = Number(data.dailyBudget) || CONFIG.defaultDailyTokenBudget;
          record.totalTokens = Number(data.totalTokens) || 0;
          record.features = data.features || {};
        }
      } catch {
        // Ignore read error and use memory record
      }
    }
    memoryTokenUsage.set(memKey, record);
  }

  const remainingTokens = Math.max(0, record.dailyBudget - record.totalTokens);
  return {
    allowed: record.totalTokens < record.dailyBudget,
    date,
    totalTokens: record.totalTokens,
    dailyBudget: record.dailyBudget,
    remainingTokens,
  };
}

export async function recordFeatureTokenUsage(
  restaurantId: string,
  feature: string,
  tokensIn: number,
  tokensOut: number,
  cachedTokens: number = 0,
  model: string = MODEL_FAST,
  db?: FirestoreClient
): Promise<void> {
  if (!restaurantId) return;
  const date = getTodayKey();
  const memKey = `${restaurantId}__${date}`;

  let record = memoryTokenUsage.get(memKey);
  if (!record) {
    record = {
      date,
      dailyBudget: CONFIG.defaultDailyTokenBudget,
      totalTokens: 0,
      features: {},
    };
    memoryTokenUsage.set(memKey, record);
  }

  const safeIn = Math.max(0, Math.round(tokensIn));
  const safeOut = Math.max(0, Math.round(tokensOut));
  const safeCached = Math.max(0, Math.round(cachedTokens));
  const callTotal = safeIn + safeOut;

  if (!record.features[feature]) {
    record.features[feature] = {
      tokensIn: 0,
      tokensOut: 0,
      totalTokens: 0,
      cachedTokens: 0,
      calls: 0,
    };
  }

  record.features[feature].tokensIn += safeIn;
  record.features[feature].tokensOut += safeOut;
  record.features[feature].totalTokens += callTotal;
  record.features[feature].cachedTokens += safeCached;
  record.features[feature].calls += 1;
  record.totalTokens += callTotal;

  if (db) {
    try {
      await db
        .collection(`restaurants/${restaurantId}/token_usage`)
        .doc(date)
        .set(
          {
            restaurantId,
            date,
            dailyBudget: record.dailyBudget,
            totalTokens: record.totalTokens,
            features: record.features,
            lastModel: model,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    } catch {
      // Non-blocking persistence
    }
  }
}

export async function getRestaurantTokenUsageSummary(
  restaurantId: string,
  db?: FirestoreClient
): Promise<{
  date: string;
  dailyBudget: number;
  totalTokens: number;
  remainingTokens: number;
  budgetExceeded: boolean;
  contextCacheActiveCount: number;
  features: Record<string, FeatureTokenMetric>;
}> {
  const budgetCheck = await checkDailyTokenBudget(restaurantId, db);
  const memKey = `${restaurantId}__${budgetCheck.date}`;
  const record = memoryTokenUsage.get(memKey);

  return {
    date: budgetCheck.date,
    dailyBudget: budgetCheck.dailyBudget,
    totalTokens: budgetCheck.totalTokens,
    remainingTokens: budgetCheck.remainingTokens,
    budgetExceeded: !budgetCheck.allowed,
    contextCacheActiveCount: promptContextCache.size,
    features: record?.features || {},
  };
}

// ==========================================
// 4. Structured Output Generator with Retry, Context Cache & Token Accounting
// ==========================================
export interface GenerateStructuredOptions<T extends z.ZodTypeAny> {
  prompt: string;
  systemInstruction?: string;
  schema: T;
  model?: typeof MODEL_FAST | typeof MODEL_REASONING;
  thinkingBudget?: number;
  temperature?: number;
  inlineData?: {
    mimeType: string;
    data: string; // base64 string
  };
  restaurantId?: string;
  feature?: string;
  db?: FirestoreClient;
}

export async function generateStructured<T extends z.ZodTypeAny>(
  options: GenerateStructuredOptions<T>
): Promise<z.infer<T>> {
  const selectedModel = options.model || MODEL_FAST;

  if (options.restaurantId) {
    const budget = await checkDailyTokenBudget(options.restaurantId, options.db);
    if (!budget.allowed) {
      throw new Error(
        `Daily AI token budget (${budget.dailyBudget.toLocaleString()} tokens) reached for this restaurant today.`
      );
    }
  }

  let attempt = 0;
  let lastError: Error | null = null;
  let currentPrompt = options.prompt;

  while (attempt < 2) {
    try {
      const config: Record<string, unknown> = {
        responseMimeType: 'application/json',
      };

      let cachedTokens = 0;
      if (options.systemInstruction) {
        const cacheRes = await getOrCreateContextCache(
          `sys_${selectedModel}_${options.feature || 'default'}`,
          selectedModel,
          options.systemInstruction
        );
        cachedTokens = cacheRes.cachedTokens;
        if (cacheRes.cacheName) {
          config.cachedContent = cacheRes.cacheName;
        } else {
          config.systemInstruction = options.systemInstruction;
        }
      }

      if (typeof options.temperature === 'number') {
        config.temperature = options.temperature;
      }

      if (options.thinkingBudget !== undefined && selectedModel === MODEL_REASONING) {
        config.thinkingConfig = {
          thinkingBudget: options.thinkingBudget,
        };
      }

      const contents: any[] = [];
      if (options.inlineData) {
        contents.push({
          inlineData: {
            mimeType: options.inlineData.mimeType,
            data: options.inlineData.data,
          },
        });
      }
      contents.push(currentPrompt);

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents,
          config: config as any,
        })
      );

      const responseText = response.text?.trim() || '{}';
      const usage = (response as any).usageMetadata;
      const tokensIn = usage?.promptTokenCount || Math.ceil(currentPrompt.length / 4);
      const tokensOut = usage?.candidatesTokenCount || Math.ceil(responseText.length / 4);
      const effectiveCached = usage?.cachedContentTokenCount || cachedTokens;

      if (options.restaurantId) {
        await recordFeatureTokenUsage(
          options.restaurantId,
          options.feature || 'structured_generation',
          tokensIn,
          tokensOut,
          effectiveCached,
          selectedModel,
          options.db
        );
      }

      const parsedJson = JSON.parse(responseText);
      const validated = options.schema.parse(parsedJson);
      return validated;
    } catch (err: any) {
      lastError = err;
      attempt++;

      if (attempt < 2) {
        currentPrompt = `${options.prompt}\n\n[SYSTEM NOTICE: Your previous output failed schema validation: ${err.message}. Provide ONLY valid JSON matching the exact required schema.]`;
      }
    }
  }

  throw new Error(`Failed to generate valid structured output after retry: ${lastError?.message}`);
}

export interface GroundedSearchResult {
  text: string;
  sources: Array<{ title: string; url: string }>;
}

/**
 * Calls Gemini with Google Search grounding for real-time external events.
 */
export async function generateWithSearchGrounding(
  prompt: string,
  systemInstruction?: string
): Promise<GroundedSearchResult> {
  try {
    const config: Record<string, unknown> = {
      tools: [{ googleSearch: {} }],
    };
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: config as any,
      })
    );

    const sources: Array<{ title: string; url: string }> = [];
    const chunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || 'Source',
            url: chunk.web.uri,
          });
        }
      }
    }

    return {
      text: response.text?.trim() || '',
      sources,
    };
  } catch (error: any) {
    console.error('Grounding search failed:', error);
    throw new Error(`Google Search grounding error: ${error.message}`);
  }
}

/**
 * Generates text embeddings using MODEL_EMBED for native vector search.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await withGeminiRetry(() =>
      ai.models.embedContent({
        model: MODEL_EMBED,
        contents: text,
      })
    );

    const values = (response as any).embedding?.values || (response as any).embeddings?.[0]?.values;
    if (!values || !Array.isArray(values)) {
      throw new Error('No embedding values returned from Gemini embedding API');
    }
    return values;
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}
