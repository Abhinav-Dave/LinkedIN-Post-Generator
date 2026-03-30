import { spawnSync } from "child_process";
import path from "path";
import { NextResponse } from "next/server";

/**
 * Runs `python ingestion/trend_ingestor.py` against the same DB as the app (`CORPUS_DB_PATH` or default).
 * Requires Python 3 + deps from `requirements.txt` on the server machine (local dev / long-lived Node only).
 */
export const runtime = "nodejs";

const INGEST_TIMEOUT_MS = 120_000;

function pythonCmd(): string {
  return process.platform === "win32" ? "python" : "python3";
}

export async function POST() {
  const script = path.join(process.cwd(), "ingestion", "trend_ingestor.py");
  const bin = pythonCmd();
  const r = spawnSync(bin, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env },
    timeout: INGEST_TIMEOUT_MS,
  });

  if (r.error) {
    const msg = r.error.message;
    return NextResponse.json(
      {
        ok: false,
        error: "spawn_failed",
        message: `${bin} not found or failed to start (${msg}). Install Python 3 and pip install -r requirements.txt.`,
      },
      { status: 500 },
    );
  }

  if (r.status !== 0) {
    const detail = [r.stderr, r.stdout].filter(Boolean).join("\n").trim() || `exit code ${r.status}`;
    return NextResponse.json(
      { ok: false, error: "ingest_failed", message: detail.slice(0, 4000) },
      { status: 502 },
    );
  }

  const tail = (r.stdout ?? "").trim().slice(-2000);
  return NextResponse.json({
    ok: true,
    message: "Trend ingest finished. Trends API will show updated rows.",
    log_tail: tail || undefined,
  });
}
