import { openDb } from "@/lib/db";
import type { TrendItemRow } from "@/lib/types";
import { sanitizeTrendText } from "@/lib/sanitize";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getTrendTTLHours(): number {
  return 24;
}

function cutoffIso(): string {
  return new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
}

/** Active trends: not expired, within 7 days, optional min relevance. */
export function fetchTrendBrief(minRelevance = 1, limit = 12): {
  items: TrendItemRow[];
  cached_at: string | null;
} {
  const db = openDb();
  const rows = db
    .prepare(
      `
    SELECT trend_id, headline, source_url, source_name, published_at,
           relevance_score, content_angle, cached_at, expired
    FROM trend_items
    WHERE expired = 0
      AND published_at >= ?
      AND relevance_score >= ?
    ORDER BY relevance_score DESC, published_at DESC
    LIMIT ?
  `,
    )
    .all(cutoffIso(), minRelevance, limit) as TrendItemRow[];

  const cached =
    rows.length > 0
      ? rows.reduce((a, b) => (a.cached_at > b.cached_at ? a : b)).cached_at
      : null;

  return { items: rows, cached_at: cached };
}

export function topTrendsForPrompt(minRelevance = 3, limit = 7): unknown[] {
  const { items } = fetchTrendBrief(minRelevance, limit);
  return items.map((t) => ({
    trend_id: t.trend_id,
    headline: sanitizeTrendText(t.headline, 400),
    source_url: t.source_url,
    source_name: t.source_name,
    published_at: t.published_at,
    relevance_score: t.relevance_score,
    content_angle: t.content_angle ? sanitizeTrendText(t.content_angle, 500) : "",
  }));
}

export function markExpiredTrends(): void {
  const db = openDb();
  const cutoff = cutoffIso();
  db.prepare(`UPDATE trend_items SET expired = 1 WHERE published_at < ?`).run(cutoff);
}
