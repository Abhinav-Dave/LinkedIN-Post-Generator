import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { openDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ApifyWebhookBody = {
  eventType?: string;
  eventData?: { actorRunId?: string };
  posts?: Array<{ text?: string; raw_text?: string; creator_url?: string; profileUrl?: string }>;
};

export async function POST(req: NextRequest) {
  const expected = process.env.APIFY_WEBHOOK_SECRET?.trim();
  if (expected) {
    const h =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-apify-webhook-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (h !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: ApifyWebhookBody = {};
  try {
    body = (await req.json()) as ApifyWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = openDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO corpus_posts (
      post_id, creator_url, raw_text, hook_type, hook_length_chars, post_length_chars,
      line_break_density, uses_bullets, credibility_signal, cta_type, engagement_tier, scraped_at
    ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, 'medium', ?)
  `);

  let n = 0;
  const now = new Date().toISOString();
  const rows = body.posts ?? [];

  for (const row of rows) {
    const raw = (row.text || row.raw_text || "").trim();
    if (!raw) continue;
    const creator = (row.creator_url || row.profileUrl || "unknown").trim();
    insert.run(uuidv4(), creator, raw, now);
    n += 1;
  }

  return NextResponse.json({ status: "ok", posts_ingested: n });
}
