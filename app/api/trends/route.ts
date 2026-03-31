import { NextResponse } from "next/server";
import { listTrendItems } from "@/lib/db";
import { fetchTrendBrief, markExpiredTrends } from "@/lib/trend_brief";
import { sanitizeTrendText } from "@/lib/sanitize";
import { isActiveTrendRow } from "@/lib/trend_ttl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await markExpiredTrends();
    const { items, cached_at } = await fetchTrendBrief(1, 100);
    if (items.length === 0) {
      const nowMs = Date.now();
      const raw = await listTrendItems(1, 500);
      const active = raw.filter((r) => isActiveTrendRow(r, nowMs));
      return NextResponse.json({
        cached_at,
        items: [],
        debug: {
          now_iso: new Date(nowMs).toISOString(),
          raw_count: raw.length,
          active_count: active.length,
          sample_raw: raw[0]
            ? {
                trend_id: raw[0].trend_id,
                published_at: raw[0].published_at,
                cached_at: raw[0].cached_at,
                expired: raw[0].expired,
                relevance_score: raw[0].relevance_score,
              }
            : null,
        },
      });
    }
    return NextResponse.json({
      cached_at,
      items: items.map((t) => ({
        trend_id: t.trend_id,
        headline: sanitizeTrendText(t.headline, 400),
        source_url: t.source_url,
        source_name: t.source_name,
        published_at: t.published_at,
        relevance_score: t.relevance_score,
        content_angle: t.content_angle ? sanitizeTrendText(t.content_angle, 500) : "",
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/trends]", e);
    return NextResponse.json(
      { error: "trends_unavailable", message },
      { status: 500 },
    );
  }
}
