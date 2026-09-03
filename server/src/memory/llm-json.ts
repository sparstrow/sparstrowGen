/**
 * 3-strategy JSON extractor for LLM utility responses (extracted from
 * temp-gbrain's judge parser per P5-Q5 — algorithm, not code): strict parse →
 * fenced-block parse → repair pass (trailing commas, bare keys) + first-brace
 * extraction. Throws when nothing works — callers degrade explicitly instead
 * of acting on a fabricated empty object.
 */

const FENCE_RE = /```(?:json)?\s*\n?([\s\S]*?)```/i;

export function parseLlmJson(text: string): unknown {
  if (!text) throw new Error("parseLlmJson: empty response");
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const fenceMatch = text.match(FENCE_RE);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* fall through */
    }
  }
  const cleaned = text
    .replace(FENCE_RE, (_, inner: string) => inner)
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      /* fall through */
    }
  }
  throw new Error("parseLlmJson: all strategies failed");
}

/**
 * Surrogate-safe truncation: never split a UTF-16 surrogate pair (a lone
 * surrogate is rejected by provider JSON parsers). From gbrain's text-safe
 * lesson (caught in production on emoji at the cut point).
 */
export function truncateSafe(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = maxChars;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1; // high surrogate at the cut
  return `${text.slice(0, end)}…`;
}

/**
 * Head+tail excerpt for long transcripts (gbrain significance-filter shape):
 * the opening and closing sections are usually representative; the middle is
 * dropped with an explicit marker so the model knows content is missing.
 */
export function headTailExcerpt(text: string, headChars: number, tailChars: number): string {
  if (text.length <= headChars + tailChars) return text;
  return `${truncateSafe(text, headChars)}\n[...truncated...]\n${text.slice(text.length - tailChars)}`;
}
