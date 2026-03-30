import { NextResponse } from "next/server";

/**
 * v1: Trend data is refreshed by GitHub Actions or `python ingestion/trend_ingestor.py`.
 * This endpoint is a no-op placeholder for a future in-process fetch.
 */
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({
    ok: true,
    message:
      "Run trend ingestion locally: `python ingestion/trend_ingestor.py` or wait for the scheduled GitHub Action.",
  });
}
