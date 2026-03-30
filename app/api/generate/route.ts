import { NextRequest, NextResponse } from "next/server";
import { runGenerateFlow } from "@/lib/pipeline";
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
      {
        error: "rate_limited",
        message: "Too many generate requests; try again later.",
        retryAfterSec: rl.retryAfterSec,
      },
      { status: 429 },
    );
  }

  try {
    const result = await runGenerateFlow(req);
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
