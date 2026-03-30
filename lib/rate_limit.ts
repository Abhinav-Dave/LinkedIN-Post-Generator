type Entry = { count: number; resetAt: number };

const WINDOW_MS = 60 * 60 * 1000;
const MAX = 10;
const store = new Map<string, Entry>();

export function rateLimitGenerate(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let e = store.get(ip);
  if (!e || now >= e.resetAt) {
    e = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, e);
  }
  if (e.count >= MAX) {
    return { ok: false, retryAfterSec: Math.ceil((e.resetAt - now) / 1000) };
  }
  e.count += 1;
  return { ok: true };
}

/** Test helper */
export function resetRateLimitStore(): void {
  store.clear();
}
