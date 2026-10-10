import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';
import { MODEL_FAST, CONFIG } from '../config.js';
import { agentObservability } from '../lib/observability.js';
import type { FirestoreClient } from '../lib/firestoreRest.js';

export type TriageRoute = 'plan' | 'explain' | 'what_if' | 'feedback' | 'ingest' | 'other';
export type SupportedLanguage = 'en' | 'hi' | 'te';

export interface TriageResult {
  route: TriageRoute;
  confidence: number;
  language: SupportedLanguage;
  clarifyingQuestion?: string;
  reasoning?: string;
}

export const TriageResultSchema = z.object({
  route: z.enum(['plan', 'explain', 'what_if', 'feedback', 'ingest', 'other']),
  confidence: z.number().min(0).max(1),
  language: z.enum(['en', 'hi', 'te']),
  clarifyingQuestion: z.string().optional(),
  reasoning: z.string().optional(),
});

/**
 * Robust heuristic/pattern matcher for multi-lingual routing and typos.
 * Handles English, Hindi (Devanagari & Hinglish), and Telugu (Script & Telugish).
 * Used both as a fallback when Gemini is offline and as high-confidence prior.
 */
export function classifyMessageDeterministically(rawText: string): TriageResult {
  const text = (rawText || '').trim().toLowerCase();

  // 1. Detect Language
  let language: SupportedLanguage = 'en';
  // Telugu Unicode range \u0C00-\u0C7F or characteristic Telugu romanized keywords
  if (
    /[\u0C00-\u0C7F]/.test(rawText) ||
    /\b(cheyi|cheyandi|enti|enduku|ammamu|ammamu|pettandi|unte|avtundi|ninna|repu|ayipoindi|migilipoyayi|kavala|vasthe)\b/i.test(text)
  ) {
    language = 'te';
  }
  // Devanagari Unicode range \u0900-\u097F or characteristic Hindi romanized keywords
  else if (
    /[\u0900-\u097F]/.test(rawText) ||
    /\b(karo|kijiye|kyun|kyu|batao|bataiye|barish|bika|bacha|bachi|khatam|hua|hogi|kal|aaj|raat|ko|ka|ki|baje)\b/i.test(text)
  ) {
    language = 'hi';
  }

  // 2. Ambiguity checks (low confidence -> clarify)
  const isAmbiguous =
    /^(kal|repu|tomorrow|kya|enti|hello|hi|hey|sun|batao)$/i.test(text) ||
    (text.length < 5 && !/(plan|sold|bika)/i.test(text));

  if (isAmbiguous) {
    let clarifyingQuestion = "Would you like me to generate tomorrow's daily plan, or explain a specific dish's portions?";
    if (language === 'hi') {
      clarifyingQuestion = 'क्या आप कल का किचन प्लान बनाना चाहते हैं, या किसी डिश का कारण जानना चाहते हैं?';
    } else if (language === 'te') {
      clarifyingQuestion = 'మీరు రేపటి కిచెన్ ప్లాన్ చేయాలనుకుంటున్నారా, లేదా ఏదైనా వంటకం వివరాలు తెలుసుకోవాలనుకుంటున్నారా?';
    }
    return {
      route: 'other',
      confidence: 0.45,
      language,
      clarifyingQuestion,
      reasoning: 'Input message is too brief or ambiguous between plan, explain, or other.',
    };
  }

  // 3. Match 'plan'
  // English: plan, pipeline, generate plan, tomorrow prep list, run plan
  // Hindi: plan karo, planning, kal ki taiyari, taiyari karo, plan banao
  // Telugu: plan cheyi, planning cheyandi, tayari cheyi, repati plan
  if (
    /\b(generate|run|start|build|create)?\s*(tomorrow('?s)?\s*(plan|sheet|kitchen\s*sheet)|daily\s*plan|kitchen\s*plan|kitchen\s*sheet|pipeline)\b/i.test(text) ||
    /\b(plan|plann|planning)\b.*\b(kitchen|sheet|tomorrow|prep|pls|please)\b/i.test(text) ||
    /\b(plan\s*karo|planning\s*karo|plan\s*banao|plan\s*kijiye|kal\s*ki\s*planning|taiyari\s*karo)\b/i.test(text) ||
    /\b(plan\s*cheyi|plan\s*cheyandi|planning\s*cheyandi|repati\s*plan|tayari\s*cheyandi)\b/i.test(text) ||
    /^(plan|plann|planning|generate\s*plan)$/i.test(text) ||
    /ప్లాన్\s*(చేయి|చేయండి)/.test(rawText) ||
    /प्लान\s*(करो|बनाओ|कीजिये)/.test(rawText)
  ) {
    return {
      route: 'plan',
      confidence: 0.95,
      language,
      reasoning: 'Message requests generating or running tomorrow daily plan / kitchen pipeline.',
    };
  }

  // 4. Match 'what_if' (counterfactual simulations, weather changes, bookings)
  // English: what if, what-if, rains, booking, catering, covers, party
  // Hindi: agar barish hui, barish ho toh, booking aa jaye, party ho
  // Telugu: varsham padithe, booking vasthe, party unte, em avtundi
  if (
    /\b(what\s*if|whatif|suppose|scenario|if\s*it\s*rains|what\s*happens\s*if|what\s*if\s*it\s*rains)\b/i.test(text) ||
    /\b(\d+\s*[- ]*(person|people|guest|guests|pax|cover|covers)\s*(booking|party|event|catering))\b/i.test(text) ||
    /\b(agar|yadi)\s+.*(barish|booking|party|mehman|log)/i.test(text) ||
    /\b(barish\s*hui\s*toh|booking\s*aa\s*gayi\s*toh|party\s*hai)\b/i.test(text) ||
    /\b(varsham\s*padithe|party\s*unte|booking\s*vasthe|em\s*avtundi)\b/i.test(text) ||
    /अगर.*(बारिश|बुकिंग|पार्टी)/.test(rawText) ||
    /(వర్షం|పార్టీ|బుకింగ్)/.test(rawText)
  ) {
    return {
      route: 'what_if',
      confidence: 0.94,
      language,
      reasoning: 'Counterfactual simulation condition detected (weather, booking, party).',
    };
  }

  // 5. Match 'explain' (asking why a dish portion is chosen or why it is up/down)
  // English: why 45 biryanis, why is naan down, why butter chicken, reason for
  // Hindi: kyun, kyu, kyu 45, kyu itna, wajah, kaaran
  // Telugu: enduku, endhuku, 45 biryani enduku, karanam
  if (
    /\b(why\s+\d+|why\s+is|why\s+did|why\s+are|reason\s+for|explain\s+why|why\s+so\s+many|whyy|whyyy)\b/i.test(text) ||
    /\b(kyun|kyu|kaaran|wajah|itna\s+kyun|kyu\s+hai)\b/i.test(text) ||
    /\b(enduku|endhuku|karanam\s*enti|enduku\s*ila)\b/i.test(text) ||
    /क्यों|क्यौं|कारण/.test(rawText) ||
    /ఎందుకు|ఎందుకు\s*\d+|కారణం/.test(rawText)
  ) {
    return {
      route: 'explain',
      confidence: 0.93,
      language,
      reasoning: 'Inquiry asking for rationale or explanation behind planned portions or forecast factors.',
    };
  }

  // 6. Match 'feedback' (stockout, ran out, leftovers, wastage post-service)
  // English: ran out, stockout, finished, sold out early, leftover, wasted, bach gaya
  // Hindi: khatam ho gaya, khatam ho gayi, bach gaya, bach gayi, bachi hai, waste hua
  // Telugu: aypoindi, ayipoindi, migilipoyindi, migilipoyayi, khatham ayindi
  if (
    /\b(ran\s*out|run\s*out|stockout|stocked\s*out|sold\s*out\s*at|leftover|leftovers|wasted|waste|surplus)\b/i.test(text) ||
    /\b(khatam\s*ho\s*gaya|khatam\s*ho\s*gayi|khatam|bach\s*gaya|bach\s*gayi|bachi\s*hai|bacha\s*hai|waste\s*hua)\b/i.test(text) ||
    /\b(ayipoindi|aypoindi|theeripoindi|migilindi|migilipoyindi|migilipoyayi)\b/i.test(text) ||
    /खत्म\s*(हो\s*गया|हो\s*गयी)|बच\s*(गया|गई)/.test(rawText) ||
    /అయిపోయింది|మిగిలిపోయింది|మిగిలాయి/.test(rawText)
  ) {
    return {
      route: 'feedback',
      confidence: 0.94,
      language,
      reasoning: 'Operational feedback regarding stockout or leftover post-service.',
    };
  }

  // 7. Match 'ingest' (sales entry, sold numbers)
  // English: sold 45, we sold, sales: 40 biryani, yesterday sales
  // Hindi: bika, becha, kal 40 biryani bika, sales hui
  // Telugu: ammamu, ammaru, ninna 40 ammamu, sales ayindi
  if (
    /\b(sold|we\s*sold|sales\s*were|sell|solld)\b/i.test(text) ||
    /\b(bika|bike|becha|bechi|sales\s*hua|sale\s*hua)\b/i.test(text) ||
    /\b(ammamu|ammamu|ammaru|sale\s*ayindi)\b/i.test(text) ||
    /बिका|बेचा|बिकी/.test(rawText) ||
    /అమ్మాము|అమ్మారు/.test(rawText)
  ) {
    return {
      route: 'ingest',
      confidence: 0.92,
      language,
      reasoning: 'Owner message reporting actual sales quantities to ingest into history.',
    };
  }

  // 8. Default to 'other' (help, greetings, general)
  let generalHelpReply = 'I can help you run daily plans, explain portion forecasts, test what-if scenarios, record stockouts, or ingest sales.';
  if (language === 'hi') {
    generalHelpReply = 'मैं डेली प्लान बनाने, डिश के भाग समझाने, व्हाट-इफ सिमुलेशन चलाने, या स्टॉकआउट रिकॉर्ड करने में मदद कर सकता हूँ।';
  } else if (language === 'te') {
    generalHelpReply = 'నేను రోజువారీ ప్లాన్లు రన్ చేయడం, డిష్ భాగాల వివరణలు, వాట్-ఇఫ్ పరీక్షలు లేదా స్టాక్ఔట్ వివరాలు నమోదు చేయడంలో సహాయం చేయగలను.';
  }

  return {
    route: 'other',
    confidence: 0.85,
    language,
    reasoning: 'General conversational inquiry, help request, or greeting.',
    clarifyingQuestion: text.includes('help') || text.includes('madad') || text.includes('sahayam') ? generalHelpReply : undefined,
  };
}

/**
 * Triage Agent: Classifies owner messages using MODEL_FAST with structured output.
 * Retries and falls back gracefully to deterministic pattern matching.
 */
export async function triageMessage(
  message: string,
  restaurantId: string,
  runId: string = `run_${Date.now()}`,
  db?: FirestoreClient
): Promise<TriageResult> {
  const startTime = Date.now();
  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;

  // Fallback / deterministic baseline
  const deterministicFallback = classifyMessageDeterministically(message);

  if (!apiKey) {
    // Observability record
    await agentObservability.recordStep(
      {
        runId,
        restaurantId,
        agent: 'triage',
        step: 'deterministic_classification',
        input: { message },
        output: deterministicFallback,
        latencyMs: Date.now() - startTime,
        tokenCounts: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
        model: 'code_classifier',
      },
      db
    );
    return deterministicFallback;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `You are CraveCast Triage Agent for restaurant kitchen operations.
Classify the owner message into exactly one of six operational routes:
1. "plan": User wants to generate or run the tomorrow planning pipeline, kitchen prep sheet, or schedule.
2. "explain": User asks "why X portions?" or questions why a dish forecast is high/low/different.
3. "what_if": Counterfactual simulation (e.g. "what if it rains?", "40-person booking", large party).
4. "feedback": Post-service feedback about stockouts ("ran out of naan at 8pm") or leftover/waste.
5. "ingest": Dictated or typed sales numbers from service ("yesterday we sold 45 biryanis").
6. "other": General greetings, help queries, or unclassifiable questions.

Language detection:
- "en" for English.
- "hi" for Hindi (including Devanagari and Hinglish / Romanized Hindi).
- "te" for Telugu (including Telugu script and Telugish / Romanized Telugu).

Confidence and Clarifying Questions:
- If the intent is clear, return confidence between 0.80 and 0.99.
- If confidence is low (< 0.70) or the message is brief and ambiguous (e.g. "kal ka batao", "repu"), formulate exactly one polite clarifying question in the owner's detected language.`;

    const { sanitizeUntrustedInput } = await import('../lib/guards.js');
    const safeMsg = sanitizeUntrustedInput(message, 1500, 'owner_message');
    const prompt = `Owner Message: ${safeMsg}`;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            route: {
              type: Type.STRING,
              enum: ['plan', 'explain', 'what_if', 'feedback', 'ingest', 'other'],
            },
            confidence: {
              type: Type.NUMBER,
            },
            language: {
              type: Type.STRING,
              enum: ['en', 'hi', 'te'],
            },
            clarifyingQuestion: {
              type: Type.STRING,
            },
            reasoning: {
              type: Type.STRING,
            },
          },
          required: ['route', 'confidence', 'language'],
        },
        temperature: 0.1,
      },
    });

    const parsedJson = JSON.parse(response.text?.trim() || '{}');
    const validated = TriageResultSchema.parse(parsedJson);

    // If confidence is low, ensure a clarifying question is present
    if (validated.confidence < 0.7 && !validated.clarifyingQuestion) {
      validated.clarifyingQuestion = deterministicFallback.clarifyingQuestion ||
        (validated.language === 'hi'
          ? 'क्या आप कल का प्लान बनाना चाहते हैं या किसी डिश का कारण जानना चाहते हैं?'
          : validated.language === 'te'
          ? 'మీరు రేపటి ప్లాన్ చేయాలనుకుంటున్నారా లేదా ఏదైనా వంటకం వివరాలు తెలుసుకోవాలనుకుంటున్నారా?'
          : "Would you like me to generate tomorrow's daily plan, or explain a specific dish's portions?");
    }

    const latencyMs = Date.now() - startTime;
    const usage = (response as any).usageMetadata || {};

    if (restaurantId) {
      const { recordFeatureTokenUsage } = await import('../lib/llm.js');
      await recordFeatureTokenUsage(
        restaurantId,
        'ask_cravecast_triage',
        usage.promptTokenCount || Math.ceil(prompt.length / 4),
        usage.candidatesTokenCount || 40,
        usage.cachedContentTokenCount || 0,
        MODEL_FAST,
        db
      );
    }

    await agentObservability.recordStep(
      {
        runId,
        restaurantId,
        agent: 'triage',
        step: 'llm_triage',
        input: { message },
        output: validated,
        latencyMs,
        tokenCounts: {
          promptTokens: usage.promptTokenCount || 0,
          candidateTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        model: MODEL_FAST,
      },
      db
    );

    return validated;
  } catch (err: any) {
    console.warn('Triage LLM call failed, falling back to deterministic classifier:', err.message);

    await agentObservability.recordStep(
      {
        runId,
        restaurantId,
        agent: 'triage',
        step: 'fallback_classifier',
        input: { message, error: err.message },
        output: deterministicFallback,
        latencyMs: Date.now() - startTime,
        tokenCounts: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
        model: 'code_classifier_fallback',
      },
      db
    );

    return deterministicFallback;
  }
}
