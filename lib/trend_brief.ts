import { listTrendItems, markExpiredTrendsBefore } from "@/lib/db";
import { sanitizeForPromptInjection } from "@/lib/sanitize";
import type { ActiveTrendsBrief, TrendBriefItem, TrendItemRow } from "@/lib/types";
import {
  isActiveTrendRow,
  isCacheFresh,
  maxIsoTimestamp,
  TREND_PUBLISHED_TTL_MS,
} from "@/lib/trend_ttl";

const DEFAULT_ITEM_LIMIT = 7;
const FETCH_CAP = 500;

async function listEligibleTrendRows(args: {
  minRelevance: number;
  fetchCap: number;
  nowMs: number;
}): Promise<TrendItemRow[]> {
  const rows = await listTrendItems(args.minRelevance, args.fetchCap);

  return rows.filter((r) => isActiveTrendRow(r, args.nowMs));
}

/**
 * Marks DB rows whose `published_at` is older than the 7-day window (see `trend_ttl`).
 * Call before reads when you want `expired` flags aligned with TTL (e.g. cron or API).
 */
export async function markExpiredTrends(nowMs: number = Date.now()): Promise<void> {
  const cutoffIso = new Date(nowMs - TREND_PUBLISHED_TTL_MS).toISOString();
  await markExpiredTrendsBefore(cutoffIso);
}

/**
 * Raw rows for APIs — TTL + relevance filter; does not apply prompt sanitization
 * (callers may use `sanitizeTrendText`).
 */
export async function fetchTrendBrief(
  minRelevance: number,
  maxItems: number,
  nowMs: number = Date.now(),
): Promise<{ items: TrendItemRow[]; cached_at: string | null }> {
  const cap = Math.min(Math.max(maxItems, 1), 500);
  const eligible = await listEligibleTrendRows({
    minRelevance,
    fetchCap: FETCH_CAP,
    nowMs,
  });
  const items = eligible.slice(0, cap);
  const cached_at = maxIsoTimestamp(items.map((r) => r.cached_at));
  return { items, cached_at };
}

/** Top trends for prompt JSON — sanitized, same TTL rules as `fetchTrendBrief`. */
export async function topTrendsForPrompt(
  minRelevance: number,
  limit: number,
  nowMs: number = Date.now(),
): Promise<TrendBriefItem[]> {
  const brief = await getActiveTrends({ limit, minRelevance, nowMs });
  return brief.items;
}

/**
 * Active trend brief for prompts: DB rows with `expired = 0`, `published_at` inside 7-day window
 * (see `trend_ttl`), optional min relevance, top-N by relevance, text fields sanitized.
 */
export async function getActiveTrends(options?: {
  limit?: number;
  nowMs?: number;
  minRelevance?: number;
}): Promise<ActiveTrendsBrief> {
  const nowMs = options?.nowMs ?? Date.now();
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_ITEM_LIMIT, 1), 50);
  const minRelevance = options?.minRelevance ?? 1;

  const eligible = await listEligibleTrendRows({
    minRelevance,
    fetchCap: FETCH_CAP,
    nowMs,
  });
  const top = eligible.slice(0, limit);

  const items: TrendBriefItem[] = top.map((r) => toBriefItem(r));
  const briefCachedAt = maxIsoTimestamp(items.map((i) => i.cached_at));
  const cacheFresh = briefCachedAt !== null && isCacheFresh(briefCachedAt, nowMs);

  return {
    items,
    totalActiveInWindow: eligible.length,
    briefCachedAt,
    cacheFresh,
  };
}

function toBriefItem(r: TrendItemRow): TrendBriefItem {
  return {
    trend_id: r.trend_id,
    headline: sanitizeForPromptInjection(r.headline),
    source_url: sanitizeForPromptInjection(r.source_url, { maxLength: 2048 }),
    source_name: sanitizeForPromptInjection(r.source_name, { maxLength: 128 }),
    published_at: r.published_at,
    relevance_score: r.relevance_score,
    content_angle: r.content_angle ? sanitizeForPromptInjection(r.content_angle) : null,
    cached_at: r.cached_at,
  };
}

/**
 * JSON string for prompt layers that expect a block (not the full API envelope).
 */
export function serializeTrendBriefForPrompt(brief: ActiveTrendsBrief): string {
  return JSON.stringify(
    {
      items: brief.items,
      totalActiveInWindow: brief.totalActiveInWindow,
      briefCachedAt: brief.briefCachedAt,
      cacheFresh: brief.cacheFresh,
    },
    null,
    0,
  );
}

export const __trendBriefTestHooks = {
  DEFAULT_ITEM_LIMIT,
  FETCH_CAP,
  listEligibleTrendRows,
  toBriefItem,
};
