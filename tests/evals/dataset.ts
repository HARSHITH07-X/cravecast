import { TriageRoute, SupportedLanguage } from '../../server/agents/triage.js';

export interface EvalSample {
  id: string;
  message: string;
  expectedRoute: TriageRoute;
  language: SupportedLanguage;
  description: string;
  isTypoOrColloquial?: boolean;
}

/**
 * Benchmark evaluation dataset with at least 25 labelled routing messages
 * across English, Hindi (Devanagari & Hinglish), Telugu (Script & Telugish),
 * and common owner typos/slang.
 * Live strictly in /tests as required.
 */
export const ROUTING_EVAL_DATASET: EvalSample[] = [
  // --- 1. PLAN ROUTE (English, Hindi, Telugu, typos) ---
  {
    id: 'plan_en_1',
    message: "Generate tomorrow's plan",
    expectedRoute: 'plan',
    language: 'en',
    description: 'Direct English command to generate tomorrow plan',
  },
  {
    id: 'plan_en_2',
    message: 'run the kitchen planning pipeline for tomorrow',
    expectedRoute: 'plan',
    language: 'en',
    description: 'English technical command for planning pipeline',
  },
  {
    id: 'plan_en_typo',
    message: 'plann tomorrows kitchen sheet pls',
    expectedRoute: 'plan',
    language: 'en',
    description: 'English typo "plann" and colloquial request',
    isTypoOrColloquial: true,
  },
  {
    id: 'plan_hi_dev',
    message: 'कल का किचन प्लान बनाओ',
    expectedRoute: 'plan',
    language: 'hi',
    description: 'Hindi Devanagari plan command',
  },
  {
    id: 'plan_hi_hinglish',
    message: 'kal ki taiyari karo aur plan banao',
    expectedRoute: 'plan',
    language: 'hi',
    description: 'Hinglish request to prepare tomorrow plan',
  },
  {
    id: 'plan_te_script',
    message: 'రేపటి ప్లాన్ చేయండి',
    expectedRoute: 'plan',
    language: 'te',
    description: 'Telugu script polite command to create tomorrow plan',
  },
  {
    id: 'plan_te_telugish',
    message: 'repati planning cheyandi kitchen kosam',
    expectedRoute: 'plan',
    language: 'te',
    description: 'Romanized Telugu (Telugish) command for planning',
  },

  // --- 2. EXPLAIN ROUTE (English, Hindi, Telugu, typos) ---
  {
    id: 'explain_en_1',
    message: 'why 45 biryanis tomorrow?',
    expectedRoute: 'explain',
    language: 'en',
    description: 'Standard prompt benchmark question for portion explanation',
  },
  {
    id: 'explain_en_2',
    message: 'why is butter chicken down compared to last week?',
    expectedRoute: 'explain',
    language: 'en',
    description: 'English question inquiring why forecast dropped',
  },
  {
    id: 'explain_en_typo',
    message: 'whyy so many naans tomorrow??',
    expectedRoute: 'explain',
    language: 'en',
    description: 'English typo "whyy" with portion question',
    isTypoOrColloquial: true,
  },
  {
    id: 'explain_hi_dev',
    message: 'कल 50 पनीर बटर मसाला क्यों?',
    expectedRoute: 'explain',
    language: 'hi',
    description: 'Hindi Devanagari question asking why 50 portions',
  },
  {
    id: 'explain_hi_hinglish',
    message: 'biryani ka portion itna kam kyun hai kal?',
    expectedRoute: 'explain',
    language: 'hi',
    description: 'Hinglish query asking why biryani forecast is low',
  },
  {
    id: 'explain_te_script',
    message: 'రేపు 45 బిర్యానీలు ఎందుకు?',
    expectedRoute: 'explain',
    language: 'te',
    description: 'Telugu script asking why 45 biryanis',
  },
  {
    id: 'explain_te_telugish',
    message: 'repu 30 paneer enduku planned?',
    expectedRoute: 'explain',
    language: 'te',
    description: 'Romanized Telugu asking rationale for 30 paneer',
  },

  // --- 3. WHAT-IF ROUTE (English, Hindi, Telugu, typos) ---
  {
    id: 'whatif_en_1',
    message: 'what if it rains tomorrow?',
    expectedRoute: 'what_if',
    language: 'en',
    description: 'Standard prompt benchmark: rain scenario',
  },
  {
    id: 'whatif_en_2',
    message: 'we have a 40-person booking tomorrow lunch',
    expectedRoute: 'what_if',
    language: 'en',
    description: 'Standard prompt benchmark: 40-person booking',
  },
  {
    id: 'whatif_en_typo',
    message: 'whatif rainn happens tomorow?',
    expectedRoute: 'what_if',
    language: 'en',
    description: 'English typo "whatif" and "rainn"',
    isTypoOrColloquial: true,
  },
  {
    id: 'whatif_hi_dev',
    message: 'अगर कल बारिश हुई तो क्या होगा?',
    expectedRoute: 'what_if',
    language: 'hi',
    description: 'Hindi Devanagari counterfactual what-if rain',
  },
  {
    id: 'whatif_hi_hinglish',
    message: 'agar 50 logo ki party aa gayi toh kitna extra chahiye?',
    expectedRoute: 'what_if',
    language: 'hi',
    description: 'Hinglish counterfactual 50 people party simulation',
  },
  {
    id: 'whatif_te_script',
    message: 'రేపు వర్షం పడితే ఏమి అవుతుంది?',
    expectedRoute: 'what_if',
    language: 'te',
    description: 'Telugu script what if it rains simulation',
  },
  {
    id: 'whatif_te_telugish',
    message: '40 mandi booking vasthe em avtundi?',
    expectedRoute: 'what_if',
    language: 'te',
    description: 'Romanized Telugu 40 people booking what-if',
  },

  // --- 4. FEEDBACK ROUTE (Stockouts, leftovers post-service) ---
  {
    id: 'fb_en_1',
    message: 'we ran out of naan at 8pm',
    expectedRoute: 'feedback',
    language: 'en',
    description: 'Standard prompt benchmark: stockout report',
  },
  {
    id: 'fb_en_2',
    message: 'had 12 portions of biryani leftover at closing',
    expectedRoute: 'feedback',
    language: 'en',
    description: 'English leftover/waste reporting',
  },
  {
    id: 'fb_hi_hinglish',
    message: 'paneer khatam ho gaya raat ko 9 baje',
    expectedRoute: 'feedback',
    language: 'hi',
    description: 'Hinglish stockout notification',
  },
  {
    id: 'fb_te_script',
    message: 'రాత్రి 8 గంటలకు రోటీ అయిపోయింది',
    expectedRoute: 'feedback',
    language: 'te',
    description: 'Telugu script roti stockout at 8pm',
  },

  // --- 5. INGEST ROUTE (Sales data ingestion) ---
  {
    id: 'ingest_en_1',
    message: 'yesterday we sold 45 biryanis and 30 naans',
    expectedRoute: 'ingest',
    language: 'en',
    description: 'English sales intake for Phase 3 confirm flow',
  },
  {
    id: 'ingest_hi_hinglish',
    message: 'kal 40 chicken biryani aur 25 butter naan bika',
    expectedRoute: 'ingest',
    language: 'hi',
    description: 'Hinglish sales recording with "bika"',
  },
  {
    id: 'ingest_te_script',
    message: 'నిన్న 50 బిర్యానీలు అమ్మారు మరియు 20 రోటీలు',
    expectedRoute: 'ingest',
    language: 'te',
    description: 'Telugu sales recording with "ammaru"',
  },

  // --- 6. OTHER ROUTE (Greetings, Help, Ambiguous) ---
  {
    id: 'other_en_help',
    message: 'what can you do for my kitchen?',
    expectedRoute: 'other',
    language: 'en',
    description: 'Capability and help inquiry',
  },
  {
    id: 'other_hi_greet',
    message: 'नमस्ते आप कैसे मदद कर सकते हैं?',
    expectedRoute: 'other',
    language: 'hi',
    description: 'Hindi greeting and general assistance query',
  },
];
