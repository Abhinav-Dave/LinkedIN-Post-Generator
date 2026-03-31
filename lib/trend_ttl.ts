import type { TrendItemRow } from "@/lib/types";

/**
 * Single owner for trend freshness rules (PRD §7, §13.2, §14 sidebar).
 * Do not re-declare these windows elsewhere — import from here.
 */

/** Items must have `published_at` within this window (7 days). */
export const TREND_PUBLISHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Brief cache considered stale after this window (24h) for refresh / UX signals. */
export const TREND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Small clock-skew allowance for `published_at` slightly in the future. */
const FUTURE_SKEW_MS = 120_000;

export function parseIsoToUtcMs(iso: string): number | null {
  const normalized = normalizeTimestamp(iso);
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Accept both strict ISO and Postgres-style timestamptz strings.
 * Examples handled:
 * - 2026-03-31T19:33:18.927432+00:00
 * - 2026-03-31 19:33:18.927432+00
 */
function normalizeTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  let out = trimmed.replace(" ", "T");
  // Convert timezone suffix "+00" / "-07" into RFC3339 form "+00:00" / "-07:00".
  if (/[+-]\d{2}$/.test(out)) {
    out = `${out}:00`;
  }
  return out;
}

/**
 * `published_at` is valid for the active brief iff it falls within the last 7 days
 * (and is not far in the future).
 */
export function isPublishedWithinTtl(publishedAtIso: string, nowMs: number): boolean {
  const t = parseIsoToUtcMs(publishedAtIso);
  if (t === null) return false;
  if (t > nowMs + FUTURE_SKEW_MS) return false;
  return nowMs - t <= TREND_PUBLISHED_TTL_MS;
}

/** Ingestion row is eligible for prompts: not expired in DB and inside 7-day window. */
export function isActiveTrendRow(row: Pick<TrendItemRow, "published_at" | "expired">, nowMs: number): boolean {
  if (row.expired !== 0) return false;
  return isPublishedWithinTtl(row.published_at, nowMs);
}

/** `cached_at` is still within the 24h application TTL window. */
export function isCacheFresh(cachedAtIso: string, nowMs: number): boolean {
  const t = parseIsoToUtcMs(cachedAtIso);
  if (t === null) return false;
  if (t > nowMs + FUTURE_SKEW_MS) return false;
  return nowMs - t <= TREND_CACHE_TTL_MS;
}

/** Latest (max) timestamp among ISO strings; skips invalid. */
export function maxIsoTimestamp(isos: string[]): string | null {
  let best: { ms: number; iso: string } | null = null;
  for (const iso of isos) {
    const ms = parseIsoToUtcMs(iso);
    if (ms === null) continue;
    if (!best || ms > best.ms) best = { ms, iso };
  }
  return best?.iso ?? null;
}

/**
 * Test hook: evaluate TTL rules with a fixed clock.
 * @internal
 */
export const __trendTtlTestHooks = {
  parseIsoToUtcMs,
  isPublishedWithinTtl,
  isActiveTrendRow,
  isCacheFresh,
};
