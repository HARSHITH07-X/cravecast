/**
 * CraveCast Model & System Configuration
 * Use the latest stable Gemini models available in AI Studio.
 * Never hardcode model names anywhere else in the codebase.
 */

export const MODEL_FAST = 'gemini-3.8-flash';
export const MODEL_REASONING = 'gemini-3.8-flash';
export const MODEL_EMBED = 'gemini-embedding-2-preview';

export const CONFIG = {
  appName: 'CraveCast',
  defaultLocale: 'en-IN',
  defaultCurrency: 'INR',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  port: Number(process.env.PORT) || 3000,
  defaultDailyTokenBudget: Number(process.env.DAILY_TOKEN_BUDGET) || 250_000,
};
