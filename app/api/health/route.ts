import fs from "fs";
import { spawnSync } from "child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hasPythonRuntime(): boolean {
  const candidates = process.platform === "win32" ? ["python"] : ["python3", "python"];

  for (const cmd of candidates) {
    const r = spawnSync(cmd, ["--version"], {
      encoding: "utf8",
      timeout: 1500,
    });
    if (!r.error && r.status === 0) {
      return true;
    }
  }

  return false;
}

async function canReachSupabase(): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  const endpoint = `${base}/rest/v1/trend_items?select=trend_id&limit=1`;
  try {
    const r = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const usingSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const dbPath = process.env.CORPUS_DB_PATH || "data/corpus.db";
  const dbExists = fs.existsSync(dbPath);
  const supabaseReachable = await canReachSupabase();

  const requiredEnv = {
    NODE_ENV: Boolean(process.env.NODE_ENV),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  return NextResponse.json(
    {
      ok: true,
      service: "linkedin-post-generator",
      runtime: {
        node: process.version,
        env: process.env.NODE_ENV || "development",
      },
      checks: {
        db_backend: usingSupabase ? "supabase" : "sqlite",
        db_path: dbPath,
        db_exists: dbExists,
        supabase_reachable: supabaseReachable,
        python_runtime_present: hasPythonRuntime(),
        required_env_present: requiredEnv,
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
