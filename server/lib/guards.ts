/**
 * CraveCast Security & Data Integrity Guards
 * 
 * Non-Negotiable Tenets:
 * 1. Number Guard: Reject any LLM sentence containing a number not present in the code-supplied input.
 * 2. Untrusted Input Sanitization: Length-limit, escape, and delimit user input to prevent prompt injection.
 */

export interface NumberGuardResult {
  valid: boolean;
  rejectedSentences: string[];
  sanitizedText: string;
}

/**
 * Extracts all numeric values (integers, decimals, percentages, currency) from a string.
 */
export function extractNumbers(text: string): number[] {
  // Matches integers and decimals (e.g., "12", "14.5", "1,200")
  const matches = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g);
  if (!matches) return [];
  return matches.map((m) => parseFloat(m.replace(/,/g, ''))).filter((n) => !isNaN(n));
}

/**
 * Validates that every number produced in the LLM text exists within the allowed numeric inputs.
 * If any sentence hallucinates an unauthorized number, that sentence is flagged and replaced with a fallback.
 */
export function verifyNumberGuard(
  llmText: string,
  allowedNumbers: number[],
  tolerance: number = 0.01,
  fallbackTemplate?: (sentence: string) => string
): NumberGuardResult {
  if (!llmText || typeof llmText !== 'string') {
    return { valid: true, rejectedSentences: [], sanitizedText: '' };
  }

  // Split into sentences using common punctuation
  const sentences = llmText.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [llmText];
  const rejectedSentences: string[] = [];
  const cleanedSentences: string[] = [];

  for (const sentence of sentences) {
    const numbersInSentence = extractNumbers(sentence);
    let isSentenceValid = true;

    for (const num of numbersInSentence) {
      // Check if num is close to any allowed number
      const found = allowedNumbers.some((allowed) => Math.abs(allowed - num) <= tolerance);
      if (!found) {
        isSentenceValid = false;
        break;
      }
    }

    if (!isSentenceValid) {
      rejectedSentences.push(sentence.trim());
      if (fallbackTemplate) {
        cleanedSentences.push(fallbackTemplate(sentence.trim()));
      }
    } else {
      cleanedSentences.push(sentence.trim());
    }
  }

  return {
    valid: rejectedSentences.length === 0,
    rejectedSentences,
    sanitizedText: cleanedSentences.filter(Boolean).join(' '),
  };
}

/**
 * Sanitizes and bounds untrusted user text inputs (prompts, voice transcripts, OCR notes).
 * Wraps inputs into clear XML-like delimiters to prevent prompt injection.
 */
export function sanitizeUntrustedInput(
  rawInput: string,
  maxLength: number = 2000,
  tag: string = 'user_input'
): string {
  if (!rawInput || typeof rawInput !== 'string') return '';

  // Truncate to maximum allowed length
  const truncated = rawInput.slice(0, maxLength);

  // Strip control characters, null bytes, and malicious delimiter attempts
  const cleaned = truncated
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(new RegExp(`</?${tag}>`, 'gi'), '');

  // Wrap in safe tag boundary
  return `<${tag}>\n${cleaned.trim()}\n</${tag}>`;
}
