/**
 * Strip patterns that could alter multi-part prompts (injection hardening).
 */
export function sanitizeTrendText(input: string, maxLen = 2000): string {
  let s = input.replace(/\r/g, "");
  s = s.replace(/###+/g, " ");
  s = s.replace(/<\/?s>/gi, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  if (s.length > maxLen) s = s.slice(0, maxLen) + "…";
  return s.trim();
}
