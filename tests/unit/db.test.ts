import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("lib/db", () => {
  let tmpDir: string;
  let getDb: typeof import("@/lib/db").getDb;
  let closeDb: typeof import("@/lib/db").closeDb;
  let insertCorpusPost: typeof import("@/lib/db").insertCorpusPost;
  let upsertTrendItem: typeof import("@/lib/db").upsertTrendItem;
  let insertGeneratedPost: typeof import("@/lib/db").insertGeneratedPost;
  let getCorpusPost: typeof import("@/lib/db").getCorpusPost;
  let getGeneratedPost: typeof import("@/lib/db").getGeneratedPost;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lpg-db-"));
    process.env.CORPUS_DB_PATH = path.join(tmpDir, "corpus.db");
    const mod = await import("@/lib/db");
    getDb = mod.getDb;
    closeDb = mod.closeDb;
    insertCorpusPost = mod.insertCorpusPost;
    upsertTrendItem = mod.upsertTrendItem;
    insertGeneratedPost = mod.insertGeneratedPost;
    getCorpusPost = mod.getCorpusPost;
    getGeneratedPost = mod.getGeneratedPost;
  });

  afterAll(() => {
    closeDb();
    delete process.env.CORPUS_DB_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("first open creates DB file, runs migrations, sets user_version", () => {
    const db = getDb();
    const ver = db.pragma("user_version", { simple: true });
    expect(ver).toBe(1);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(["corpus_posts", "generated_posts", "trend_items"]);
  });

  it("typed accessors round-trip corpus, trends, generated", async () => {
    await insertCorpusPost({
      post_id: "p1",
      creator_url: "https://example.com/in/creator",
      raw_text: "Hello corpus",
      scraped_at: new Date().toISOString(),
    });
    expect((await getCorpusPost("p1"))?.raw_text).toBe("Hello corpus");

    await upsertTrendItem({
      trend_id: "t1",
      headline: "HN: SQLite rocks",
      source_url: "https://news.ycombinator.com/item?id=1",
      source_name: "hackernews",
      published_at: new Date().toISOString(),
      relevance_score: 4,
      content_angle: "dev",
      cached_at: new Date().toISOString(),
    });

    await insertGeneratedPost({
      post_id: "g1",
      industry: "tech",
      topic_focus: "databases",
      hook_archetype: "question",
      hook_clarity_score: 8,
      body: "Post body",
      char_count: 9,
      credibility_signals: ["stat"],
      trend_source: "hackernews",
      post_type: "trend_reaction",
      cta_type: "soft",
      lint_flags: [],
      generated_at: new Date().toISOString(),
    });
    expect((await getGeneratedPost("g1"))?.body).toBe("Post body");
  });
});
