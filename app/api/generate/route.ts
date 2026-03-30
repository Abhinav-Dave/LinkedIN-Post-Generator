import { NextRequest, NextResponse } from "next/server";
import { runGenerationPipeline } from "@/lib/pipeline";
import { rateLimitGenerate } from "@/lib/rate_limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const rl = rateLimitGenerate(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body ok */
  }

  try {
    const result = await runGenerationPipeline({
      industry: typeof body.industry === "string" ? body.industry : undefined,
      topic_focus: typeof body.topic_focus === "string" ? body.topic_focus : undefined,
      num_posts: typeof body.num_posts === "number" ? body.num_posts : undefined,
      runWarnLint: body.skip_warn_lint !== true,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/generate]", e);
    return NextResponse.json(
      {
        error: "generation_failed",
        message,
        retries_exhausted: true,
      },
      { status: 500 },
    );
  }
}
