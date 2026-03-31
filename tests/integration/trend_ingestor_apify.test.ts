import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

const pythonBin = process.env.PYTHON_BIN || "python";
type PythonEnv = Record<string, string | undefined>;

function runPython(script: string, env: PythonEnv = {}): string {
  const result = spawnSync(pythonBin, ["-c", script], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`python failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

function parseLastJsonLine(stdout: string): unknown {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) {
    throw new Error("python output was empty");
  }
  return JSON.parse(last);
}

describe("trend_ingestor Apify phase (offline)", () => {
  it("maps sample Apify item to expected trend row fields", () => {
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/apify_trends/sample_item.json",
    );

    const script = `
import json
from pathlib import Path
from ingestion import trend_ingestor as ti

fixture = json.loads(Path(r"${fixturePath.replace(/\\/g, "\\\\")}").read_text(encoding="utf-8"))

class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
    def raise_for_status(self):
        return None
    def json(self):
        return self._payload

class FakeClient:
    def post(self, *args, **kwargs):
        return FakeResponse({"data": {"status": "SUCCEEDED", "defaultDatasetId": "ds1"}})
    def get(self, *args, **kwargs):
        return FakeResponse([fixture])

rows = ti.fetch_apify_trends(
    FakeClient(),
    {"topic_focus": ["enterprise ai"], "relevance_keywords": ["quality checks", "triage", "enterprise ai"]},
    "2026-03-31T00:00:00+00:00",
)

print(json.dumps(rows[0], separators=(",", ":")))
`;

    const row = parseLastJsonLine(runPython(script, { APIFY_API_TOKEN: "offline-token" })) as {
      trend_id: string;
      headline: string;
      source_url: string;
      source_name: string;
      published_at: string;
      relevance_score: number;
      content_angle: string;
      cached_at: string;
    };

    expect(row.source_name).toBe("linkedin_apify");
    expect(row.source_url).toContain("linkedin.com/posts/example");
    expect(row.published_at).toBe("2026-03-30T08:15:00+00:00");
    expect(row.relevance_score).toBeGreaterThanOrEqual(3);
    expect(row.cached_at).toBe("2026-03-31T00:00:00+00:00");
    expect(row.content_angle).toContain("LinkedIn operator takeaway:");
    expect(row.trend_id).toMatch(/^[a-f0-9]{32}$/);
  });

  it("missing APIFY_API_TOKEN does not crash ingest path", () => {
    const script = `
import json
import os
import tempfile
from pathlib import Path
from ingestion import trend_ingestor as ti

tmpdir = Path(tempfile.mkdtemp(prefix="lpg-trend-"))
db_path = tmpdir / "corpus.db"

class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
    def raise_for_status(self):
        return None
    def json(self):
        return self._payload

class FakeHttpClient:
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        return False
    def get(self, url, *args, **kwargs):
        if "topstories" in url:
            return FakeResponse([])
        if "/item/" in url:
            return FakeResponse({})
        if "reddit.com" in url:
            return FakeResponse({"data": {"children": []}})
        if "github.com/trending" in url:
            return FakeResponse("<html></html>")
        return FakeResponse({})
    def post(self, *args, **kwargs):
        return FakeResponse({})

ti.httpx.Client = FakeHttpClient
ti.fetch_reddit_sub = lambda *args, **kwargs: 0
ti.fetch_github_trending = lambda *args, **kwargs: 0
os.environ["CORPUS_DB_PATH"] = str(db_path)
os.environ.pop("APIFY_API_TOKEN", None)

ti.main()

print(json.dumps({"ok": True, "db_exists": db_path.exists()}, separators=(",", ":")))
`;

    const output = parseLastJsonLine(runPython(script, { APIFY_API_TOKEN: "" })) as {
      ok: boolean;
      db_exists: boolean;
    };

    expect(output.ok).toBe(true);
    expect(output.db_exists).toBe(true);
  });

  it("upsert keeps one row for repeated trend_id", () => {
    const script = `
import json
import sqlite3
from ingestion import trend_ingestor as ti

conn = sqlite3.connect(":memory:")
ti.ensure_db(conn)

ti.upsert_trend(
    conn,
    trend_id="repeat-id",
    headline="First headline",
    source_url="https://example.com/1",
    source_name="linkedin_apify",
    published_at="2026-03-31T00:00:00+00:00",
    score=4,
    content_angle="angle one",
    cached_at="2026-03-31T00:00:00+00:00",
)
ti.upsert_trend(
    conn,
    trend_id="repeat-id",
    headline="Updated headline",
    source_url="https://example.com/2",
    source_name="linkedin_apify",
    published_at="2026-03-31T01:00:00+00:00",
    score=5,
    content_angle="angle two",
    cached_at="2026-03-31T01:00:00+00:00",
)

count = conn.execute("SELECT COUNT(*) FROM trend_items WHERE trend_id = 'repeat-id'").fetchone()[0]
headline = conn.execute("SELECT headline FROM trend_items WHERE trend_id = 'repeat-id'").fetchone()[0]
score = conn.execute("SELECT relevance_score FROM trend_items WHERE trend_id = 'repeat-id'").fetchone()[0]
print(json.dumps({"count": count, "headline": headline, "score": score}, separators=(",", ":")))
`;

    const output = parseLastJsonLine(runPython(script)) as {
      count: number;
      headline: string;
      score: number;
    };

    expect(output.count).toBe(1);
    expect(output.headline).toBe("Updated headline");
    expect(output.score).toBe(5);
  });
});
