import { GoogleGenAI, Type } from '@google/genai';
import { MODEL_FAST, CONFIG } from '../config.js';
import { generateEmbedding } from '../lib/llm.js';
import { sanitizeUntrustedInput, verifyNumberGuard } from '../lib/guards.js';
import { executeGetWeather } from '../tools/get_weather.js';
import {
  PublicDishItem,
  findNearestPublicDishes,
  getServerFirestoreClient,
} from '../lib/publicStore.js';
import { agentObservability } from '../lib/observability.js';

export interface MoodExtractResult {
  moodSummary: string;
  moodTags: string[];
  avoidAllergens: string[];
  language: string;
}

export interface SuggestedMenuDish {
  id: string;
  name: string;
  category: string;
  price: number;
  tags: string[];
  description: string;
  allergens: string[];
  reason: string;
}

export interface MoodAgentResponse {
  greeting: string;
  moodSummary: string;
  moodTags: string[];
  language: string;
  weatherContext: string;
  suggestions: SuggestedMenuDish[];
}

function detectLanguageHeuristic(text: string): 'en' | 'hi' | 'te' {
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  const lower = text.toLowerCase();
  if (/\b(manchi|vediga|akali|kavali|emaina|cheppandi|potta|ruchiga)\b/.test(lower)) return 'te';
  if (/\b(mujhe|kuch|accha|garam|thanda|chatpata|bhookh|thaka|khana)\b/.test(lower)) return 'hi';
  return 'en';
}

function extractMoodHeuristic(text: string): MoodExtractResult {
  const lower = text.toLowerCase();
  const lang = detectLanguageHeuristic(text);
  const tags: string[] = [];
  const avoidAllergens: string[] = [];

  let moodSummary = 'Looking for Something Delicious';

  if (/(tired|exhausted|long day|stressed|comfort|cozy|thaka|homely|soothing)/.test(lower)) {
    moodSummary = 'Tired & Seeking Comfort';
    tags.push('Comforting', 'Warm', 'Rich', 'Homestyle');
  } else if (/(rain|rainy|cold|chilly|monsoon|weather|wet|barish|garam|vediga)/.test(lower)) {
    moodSummary = 'Rainy Day Warmth';
    tags.push('Warm', 'Spicy', 'Crispy', 'Comforting');
  } else if (/(celebrat|happy|party|treat|special|excited|promotion|birthday|feast)/.test(lower)) {
    moodSummary = 'Celebratory & Indulgent';
    tags.push('Chef Signature', 'Rich', 'Indulgent', 'Special');
  } else if (/(light|healthy|gym|workout|fresh|protein|low|fit|clean|diet)/.test(lower)) {
    moodSummary = 'Light & Energizing';
    tags.push('Light', 'High Protein', 'Fresh', 'Healthy');
  } else if (/(spicy|kick|bold|fiery|chili|chatpata|masala|teekha|karam)/.test(lower)) {
    moodSummary = 'Craving Bold & Spicy';
    tags.push('Spicy', 'Bold', 'Street Food', 'Flavorful');
  } else if (/(sweet|dessert|sugar|chocolate|meetha)/.test(lower)) {
    moodSummary = 'Sweet Tooth Craving';
    tags.push('Sweet', 'Dessert', 'Rich');
  } else if (/(hungry|starving|famished|filling|heavy|hearty|bhookh|akali)/.test(lower)) {
    moodSummary = 'Hearty & Filling';
    tags.push('Hearty', 'Filling', 'Comforting', 'Main Course');
  } else {
    tags.push('Chef Signature', 'Popular', 'Flavorful');
  }

  if (/\b(veg|vegetarian|shakahari)\b/.test(lower) && !/\bnon[\s-]?veg\b/.test(lower)) {
    tags.push('Vegetarian');
  }
  if (/\b(vegan|plant[\s-]?based)\b/.test(lower)) {
    tags.push('Vegan', 'Vegetarian');
  }

  const allergenKeywords: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\b(no dairy|dairy[\s-]?free|lactose|milk allergy)\b/, name: 'Dairy' },
    { pattern: /\b(no gluten|gluten[\s-]?free|celiac|wheat allergy)\b/, name: 'Gluten' },
    { pattern: /\b(no nuts|nut[\s-]?free|tree nut)\b/, name: 'Tree Nuts' },
    { pattern: /\b(no peanut|peanut[\s-]?free|peanut allergy)\b/, name: 'Peanuts' },
    { pattern: /\b(no egg|egg[\s-]?free|eggless)\b/, name: 'Eggs' },
    { pattern: /\b(no soy|soy[\s-]?free)\b/, name: 'Soy' },
    { pattern: /\b(no shellfish|shellfish allergy)\b/, name: 'Shellfish' },
  ];
  for (const ak of allergenKeywords) {
    if (ak.pattern.test(lower)) {
      avoidAllergens.push(ak.name);
    }
  }

  return {
    moodSummary,
    moodTags: Array.from(new Set(tags)),
    avoidAllergens,
    language: lang,
  };
}

/**
 * Runs the full Customer Mood Agent pipeline:
 * 1. Extracts mood & preference tags + language
 * 2. Fetches today's weather from Open-Meteo
 * 3. Embeds customer mood + weather context using MODEL_EMBED
 * 4. Runs Firestore findNearest combined with tag filters and allergen exclusions
 * 5. Uses Gemini to pick 3 dishes (as menu item IDs) with a 1-line reason each in the customer's language
 * 6. Strictly verifies every ID exists on the public menu and drops anything else
 */
export async function runCustomerMoodAgent(params: {
  restaurantId: string;
  restaurantName: string;
  city: string;
  currency: string;
  customerMessage: string;
  publicDishes: PublicDishItem[];
}): Promise<MoodAgentResponse> {
  const startTime = Date.now();
  const { restaurantId, restaurantName, city, currency, customerMessage, publicDishes } = params;
  const sanitizedMessage = sanitizeUntrustedInput(customerMessage, 300, 'customer_mood');

  // Public menu lookup map (strict allowlist of public dishes)
  const publicMenuMap = new Map<string, PublicDishItem>();
  for (const dish of publicDishes) {
    publicMenuMap.set(dish.id, dish);
  }

  // 1. Extract initial mood heuristic + LLM refinement
  let moodInfo = extractMoodHeuristic(customerMessage);
  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;

  // 2. Get Today's Weather from Open-Meteo
  const todayStr = new Date().toISOString().split('T')[0];
  const dbClient = getServerFirestoreClient(restaurantId) || undefined;
  const weather = await executeGetWeather(restaurantId, todayStr, dbClient);
  const weatherContext = `${weather.condition}, ${weather.tempMin}°C–${weather.tempMax}°C`;

  // Enhance mood tags with weather context if appropriate
  const weatherTags: string[] = [];
  if (weather.isRain || weather.tempBucket === 'cold') {
    weatherTags.push('Warm', 'Comforting', 'Spicy', 'Crispy');
  } else if (weather.tempBucket === 'hot') {
    weatherTags.push('Light', 'Refreshing', 'Fresh');
  }

  // 3. Embed the message + mood tags + weather
  let queryVector: number[] | null = null;
  try {
    queryVector = await generateEmbedding(
      `${customerMessage.trim()} ${moodInfo.moodSummary} ${moodInfo.moodTags.join(' ')} ${weather.condition}`
    );
  } catch (err) {
    console.warn('[moodAgent] Embedding fallback:', (err as Error)?.message);
  }

  // 4. Run Firestore findNearest combined with tag filters
  const combinedDesiredTags = Array.from(new Set([...moodInfo.moodTags, ...weatherTags]));
  const nearestCandidates = await findNearestPublicDishes(
    restaurantId,
    publicDishes,
    queryVector,
    combinedDesiredTags,
    moodInfo.avoidAllergens,
    Math.min(10, publicDishes.length)
  );

  // Target count is 3 (or total public menu count if fewer than 3 exist)
  const targetCount = Math.min(3, publicDishes.length);

  let greeting =
    moodInfo.language === 'hi'
      ? `आपके मूड (${moodInfo.moodSummary}) और आज के मौसम (${weatherContext}) के अनुसार हमारे मेनू से ३ बेहतरीन व्यंजन:`
      : moodInfo.language === 'te'
      ? `మీ మూడ్ (${moodInfo.moodSummary}) మరియు నేటి వాతావరణం (${weatherContext}) ఆధారంగా మా మెనూ నుండి 3 ప్రత్యేక వంటకాలు:`
      : `Based on how you're feeling (${moodInfo.moodSummary}) and today's weather (${weatherContext}), here are ${targetCount} dishes from our menu picked for you:`;

  const pickedSuggestions: SuggestedMenuDish[] = [];
  const usedIds = new Set<string>();

  // 5. Ask Gemini to extract refined mood tags & pick 3 dishes from candidate IDs
  if (apiKey && process.env.NODE_ENV !== 'test' && nearestCandidates.length > 0) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const candidateCatalog = nearestCandidates.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        price: d.price,
        tags: d.tags,
        description: d.description,
        allergens: d.allergens,
      }));

      const prompt = `You are the warm, hospitable culinary concierge for "${restaurantName}".
A guest just told you how they are feeling:
${sanitizedMessage}

Today's local weather from Open-Meteo: ${weatherContext} (${weather.isRain ? 'Rainy' : weather.tempBucket}).

Candidate Public Menu Items (ONLY pick from these exact IDs):
${JSON.stringify(candidateCatalog, null, 2)}

Rules:
1. Extract a short moodSummary (2-4 words, e.g. "Tired & Seeking Comfort", "Rainy Day Craving", "Celebratory Mood") and 2-5 moodTags.
2. Detect the guest's language ("en" for English, "hi" for Hindi, "te" for Telugu, or their language) and write "greeting" and every "oneLineReason" in the guest's language.
3. Pick up to ${targetCount} distinct dishes from the Candidate Public Menu Items above that best match their mood, preferences, and today's weather.
4. Return each pick strictly by its exact "menuItemId" and a warm, specific "oneLineReason" (1 sentence max).
5. NEVER invent dishes, NEVER invent or mention prices in the reason, and NEVER make unverified allergen claims.`;

      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              moodSummary: { type: Type.STRING },
              moodTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              language: { type: Type.STRING },
              greeting: { type: Type.STRING },
              picks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    menuItemId: { type: Type.STRING },
                    oneLineReason: { type: Type.STRING },
                  },
                  required: ['menuItemId', 'oneLineReason'],
                },
              },
            },
            required: ['moodSummary', 'moodTags', 'language', 'greeting', 'picks'],
          },
        },
      });

      const usage = (response as any).usageMetadata;
      const tokensIn = usage?.promptTokenCount || Math.ceil(prompt.length / 4);
      const tokensOut = usage?.candidatesTokenCount || 80;
      const cachedTokens = usage?.cachedContentTokenCount || 0;
      const { recordFeatureTokenUsage } = await import('../lib/llm.js');
      await recordFeatureTokenUsage(
        restaurantId,
        'customer_mood_chat',
        tokensIn,
        tokensOut,
        cachedTokens,
        MODEL_FAST,
        dbClient
      );

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);

      if (typeof parsed.moodSummary === 'string' && parsed.moodSummary.trim()) {
        moodInfo.moodSummary = parsed.moodSummary.trim().slice(0, 60);
      }
      if (Array.isArray(parsed.moodTags) && parsed.moodTags.length > 0) {
        moodInfo.moodTags = parsed.moodTags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 6);
      }
      if (typeof parsed.language === 'string' && parsed.language.trim()) {
        moodInfo.language = parsed.language.trim();
      }
      if (typeof parsed.greeting === 'string' && parsed.greeting.trim()) {
        greeting = parsed.greeting.trim();
      }

      // 6. Server-side verification: verify every menuItemId exists in publicMenuMap and drop anything else!
      if (Array.isArray(parsed.picks)) {
        for (const pick of parsed.picks) {
          const itemId = String(pick?.menuItemId || '').trim();
          const verifiedDish = publicMenuMap.get(itemId);
          if (!verifiedDish || usedIds.has(itemId)) {
            // Drop any hallucinated, inactive, hidden, or duplicate ID
            continue;
          }

          let reason = String(pick?.oneLineReason || '').trim();
          // Verify number guard so LLM never invents arbitrary numbers or fake prices in the reason
          const allowedNums = [verifiedDish.price, weather.tempMin, weather.tempMax, 1, 2, 3];
          const guard = verifyNumberGuard(reason, allowedNums);
          if (!guard.valid || !reason) {
            reason = buildDeterministicReason(verifiedDish, moodInfo.moodSummary, weatherContext, moodInfo.language);
          }

          usedIds.add(itemId);
          pickedSuggestions.push({
            id: verifiedDish.id,
            name: verifiedDish.name,
            category: verifiedDish.category,
            price: verifiedDish.price,
            tags: verifiedDish.tags,
            description: verifiedDish.description,
            allergens: verifiedDish.allergens,
            reason,
          });

          if (pickedSuggestions.length >= targetCount) break;
        }
      }
    } catch (err) {
      console.warn('[moodAgent] Gemini selection fallback:', (err as Error)?.message);
    }
  }

  // Deterministic fill from findNearest + tag-filtered candidates so we always return 3 real dishes (when >=3 exist on menu)
  for (const candidate of nearestCandidates) {
    if (pickedSuggestions.length >= targetCount) break;
    if (usedIds.has(candidate.id)) continue;
    const verifiedDish = publicMenuMap.get(candidate.id);
    if (!verifiedDish) continue;

    usedIds.add(verifiedDish.id);
    pickedSuggestions.push({
      id: verifiedDish.id,
      name: verifiedDish.name,
      category: verifiedDish.category,
      price: verifiedDish.price,
      tags: verifiedDish.tags,
      description: verifiedDish.description,
      allergens: verifiedDish.allergens,
      reason: buildDeterministicReason(verifiedDish, moodInfo.moodSummary, weatherContext, moodInfo.language),
    });
  }

  // Final check if nearestCandidates had fewer than targetCount
  for (const dish of publicDishes) {
    if (pickedSuggestions.length >= targetCount) break;
    if (usedIds.has(dish.id)) continue;
    usedIds.add(dish.id);
    pickedSuggestions.push({
      id: dish.id,
      name: dish.name,
      category: dish.category,
      price: dish.price,
      tags: dish.tags,
      description: dish.description,
      allergens: dish.allergens,
      reason: buildDeterministicReason(dish, moodInfo.moodSummary, weatherContext, moodInfo.language),
    });
  }

  // Record observability trace
  await agentObservability.recordStep(
    {
      runId: `mood_${Date.now()}`,
      restaurantId,
      agent: 'CustomerMoodAgent',
      step: 'suggest_mood_dishes',
      input: {
        message: customerMessage.slice(0, 120),
        weather: weatherContext,
        publicMenuSize: publicDishes.length,
      },
      output: {
        moodSummary: moodInfo.moodSummary,
        moodTags: moodInfo.moodTags,
        suggestedDishIds: pickedSuggestions.map((s) => s.id),
        suggestedDishes: pickedSuggestions.map((s) => s.name),
      },
      latencyMs: Date.now() - startTime,
      tokenCounts: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
      model: MODEL_FAST,
      toolCalls: [
        { name: 'get_weather', args: { city } },
        { name: 'findNearest', args: { candidateCount: nearestCandidates.length } },
      ],
    },
    dbClient
  );

  return {
    greeting,
    moodSummary: moodInfo.moodSummary,
    moodTags: moodInfo.moodTags,
    language: moodInfo.language,
    weatherContext,
    suggestions: pickedSuggestions,
  };
}

function buildDeterministicReason(
  dish: PublicDishItem,
  moodSummary: string,
  weatherContext: string,
  language: string
): string {
  const tagText = dish.tags.length > 0 ? dish.tags.slice(0, 2).join(' & ').toLowerCase() : dish.category.toLowerCase();
  if (language === 'hi') {
    return `${dish.name} (${tagText}) आपके "${moodSummary}" मूड और आज के मौसम (${weatherContext}) के लिए एकदम सही चुनाव है।`;
  }
  if (language === 'te') {
    return `మీ "${moodSummary}" మూడ్ మరియు నేటి వాతావరణం (${weatherContext}) కోసం ${dish.name} (${tagText}) అద్భుతమైన ఎంపిక.`;
  }
  if (dish.description) {
    return `A ${tagText} favorite (${dish.description.slice(0, 75)}${dish.description.length > 75 ? '...' : ''}) well-suited for a ${moodSummary.toLowerCase()} mood in today's ${weatherContext.toLowerCase()} weather.`;
  }
  return `Our ${tagText} ${dish.name} is a comforting match for your ${moodSummary.toLowerCase()} mood and today's ${weatherContext.toLowerCase()} weather.`;
}
