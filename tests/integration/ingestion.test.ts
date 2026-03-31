import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apifyWebhookSecretOk, extractApifyWebhookSecretCandidate } from "@/lib/webhook_secret";
import { ingestCorpusFromWebhook } from "@/lib/corpus_ingestion";

describe("Apify webhook secret (lib/webhook_secret)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts candidate from query param secret", () => {
    const req = new NextRequest("http://localhost/api/ingestion/corpus?secret=from-query");
    expect(extractApifyWebhookSecretCandidate(req)).toBe("from-query");
  });

  it("extracts candidate from x-webhook-secret header", () => {
    const req = new NextRequest("http://localhost/api/ingestion/corpus", {
      headers: { "x-webhook-secret": "hdr-val" },
    });
    expect(extractApifyWebhookSecretCandidate(req)).toBe("hdr-val");
  });

  it("extracts Bearer from Authorization", () => {
    const req = new NextRequest("http://localhost/api/ingestion/corpus", {
      headers: { Authorization: "Bearer token-abc" },
    });
    expect(extractApifyWebhookSecretCandidate(req)).toBe("token-abc");
  });

  it("skips validation when APIFY_WEBHOOK_SECRET is unset", () => {
    delete process.env.APIFY_WEBHOOK_SECRET;
    const req = new NextRequest("http://localhost/api/ingestion/corpus");
    expect(apifyWebhookSecretOk(req)).toBe(true);
  });

  it("requires secret when APIFY_WEBHOOK_SECRET is set", () => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", "expected");
    const missing = new NextRequest("http://localhost/api/ingestion/corpus");
    expect(apifyWebhookSecretOk(missing)).toBe(false);

    const wrong = new NextRequest("http://localhost/api/ingestion/corpus?secret=nope");
    expect(apifyWebhookSecretOk(wrong)).toBe(false);

    const ok = new NextRequest("http://localhost/api/ingestion/corpus?secret=expected");
    expect(apifyWebhookSecretOk(ok)).toBe(true);
  });

  it("accepts matching Bearer when secret is set", () => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", "s3cret");
    const req = new NextRequest("http://localhost/api/ingestion/corpus", {
      headers: { Authorization: "Bearer s3cret" },
    });
    expect(apifyWebhookSecretOk(req)).toBe(true);
  });
});

describe("ingestCorpusFromWebhook — inline posts", () => {
  let tmpDir: string;

  beforeAll(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lpg-ingest-"));
    process.env.CORPUS_DB_PATH = path.join(tmpDir, "corpus.db");
  });

  afterAll(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    delete process.env.CORPUS_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  beforeEach(async () => {
    const { closeDb, clearCorpusPostsForTests } = await import("@/lib/db");
    closeDb();
    await clearCorpusPostsForTests();
  });

  it("inserts rows from inline posts array", async () => {
    const { countCorpusPosts } = await import("@/lib/db");
    expect(await countCorpusPosts()).toBe(0);

    const { posts_ingested, source } = await ingestCorpusFromWebhook({
      posts: [
        { raw_text: "First post body", creator_url: "https://linkedin.com/in/a" },
        { text: "Second post", profileUrl: "https://linkedin.com/in/b" },
      ],
    });

    expect(source).toBe("inline");
    expect(posts_ingested).toBe(2);
    expect(await countCorpusPosts()).toBe(2);
  });

  it("returns zero when inline posts array is empty and no run id", async () => {
    const { countCorpusPosts } = await import("@/lib/db");
    const r = await ingestCorpusFromWebhook({});
    expect(r.posts_ingested).toBe(0);
    expect(await countCorpusPosts()).toBe(0);
  });
});

describe("ingestCorpusFromWebhook — Apify dataset (mock fetch)", () => {
  let tmpDir: string;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lpg-apify-"));
    process.env.CORPUS_DB_PATH = path.join(tmpDir, "corpus.db");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    delete process.env.CORPUS_DB_PATH;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  beforeEach(async () => {
    vi.stubEnv("APIFY_API_TOKEN", "test-token");
    fetchMock.mockReset();
    const { closeDb, clearCorpusPostsForTests } = await import("@/lib/db");
    closeDb();
    await clearCorpusPostsForTests();
  });

  it("fetches dataset items and inserts mapped posts", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { postText: "Scraped content one", authorUrl: "https://linkedin.com/in/x" },
        { raw_text: "Two", creator_url: "https://linkedin.com/in/y" },
      ],
    });

    const { countCorpusPosts } = await import("@/lib/db");
    expect(await countCorpusPosts()).toBe(0);

    const { posts_ingested, source } = await ingestCorpusFromWebhook({
      eventData: { actorRunId: "run-123" },
    });

    expect(source).toBe("apify_dataset");
    expect(posts_ingested).toBe(2);
    expect(await countCorpusPosts()).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("actor-runs/run-123/dataset/items");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });
});
