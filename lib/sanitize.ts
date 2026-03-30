const TAG_LIKE = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/g;
const HASH_HEADINGS = /#{3,}/g;
const CTRL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type SanitizeForPromptOptions = {
  /** Hard cap after normalization (default 8000). */
  maxLength?: number;
};

/**
 * Reduce prompt-injection surface for untrusted strings (e.g. trend headlines).
 * PRD: strip tokens that could alter prompt structure (e.g. ###, &lt;s&gt;).
 */
/** Legacy name used by `app/api/trends` — same rules as `sanitizeForPromptInjection`. */
export function sanitizeTrendText(text: string, maxLen?: number): string {
  return sanitizeForPromptInjection(text, { maxLength: maxLen ?? 8000 });
}

export function sanitizeForPromptInjection(input: string, options?: SanitizeForPromptOptions): string {
  const maxLength = options?.maxLength ?? 8000;
  let s = input.replace(/\r\n/g, "\n").replace(CTRL_CHARS, "");
  s = s.replace(TAG_LIKE, "");
  s = s.replace(HASH_HEADINGS, "");
  s = s.replace(/\n{4,}/g, "\n\n\n");
  if (s.length > maxLength) {
    s = s.slice(0, maxLength);
  }
  return s.trim();
}

/**
 * Test hook for deterministic checks.
 * @internal
 */
export const __sanitizeTestHooks = {
  TAG_LIKE,
  HASH_HEADINGS,
};
