import { NextResponse } from "next/server";
import { fetchTrendBrief, markExpiredTrends } from "@/lib/trend_brief";
import { sanitizeTrendText } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    markExpiredTrends();
    const { items, cached_at } = fetchTrendBrief(1, 100);
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
