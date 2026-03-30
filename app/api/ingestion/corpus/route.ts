import { NextRequest, NextResponse } from "next/server";
import { ingestCorpusFromWebhook, type ApifyWebhookBody } from "@/lib/corpus_ingestion";
import { apifyWebhookSecretOk } from "@/lib/webhook_secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!apifyWebhookSecretOk(req)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid or missing webhook secret" },
      { status: 401 },
    );
  }

  let body: ApifyWebhookBody = {};
  try {
    body = (await req.json()) as ApifyWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON" }, {
      status: 400,
    });
  }

  try {
    const { posts_ingested } = await ingestCorpusFromWebhook(body);
    return NextResponse.json({ status: "ok", posts_ingested });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/ingestion/corpus]", message);
    return NextResponse.json(
      { error: "ingestion_failed", message },
      { status: 502 },
    );
  }
}
