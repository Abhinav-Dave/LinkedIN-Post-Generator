import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrations";
import type { TrendItemRow } from "@/lib/types";

/**
 * SQLite data layer — Node.js server only. Do not import from Client Components or the Edge
 * runtime; `better-sqlite3` is native-bound and will not bundle for Edge.
 *
 * Filesystem note: on Vercel and typical serverless hosts the filesystem is ephemeral and not
 * shared across instances. `data/corpus.db` (or CORPUS_DB_PATH) will not survive deploys or
 * scale-out unless you attach persistent storage or use an external database. Plan accordingly.
 */

let singleton: Database.Database | null = null;

/** Optional override for tests or custom deploy layout (absolute or cwd-relative path). */
export function getDbPath(): string {
  const override = process.env.CORPUS_DB_PATH?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), "data", "corpus.db");
}

/** Canonical accessor — opens DB, runs migrations, returns singleton. */
export function getDb(): Database.Database {
  if (singleton) return singleton;

  const file = getDbPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  runMigrations(db);

  singleton = db;
  return db;
}

/** @deprecated Prefer getDb() — kept for existing call sites. */
export function openDb(): Database.Database {
  return getDb();
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

// --- Row types (PRD §13) ----------------------------------------------------

export type CorpusPostRow = {
  post_id: string;
  creator_url: string;
  raw_text: string;
  hook_type: string | null;
  hook_length_chars: number | null;
  post_length_chars: number | null;
  line_break_density: number | null;
  uses_bullets: number;
  credibility_signal: string | null;
  cta_type: string | null;
  engagement_tier: string | null;
  scraped_at: string;
};

export type CorpusPostInsert = {
  post_id: string;
  creator_url: string;
  raw_text: string;
  scraped_at: string;
  hook_type?: string | null;
  hook_length_chars?: number | null;
  post_length_chars?: number | null;
  line_break_density?: number | null;
  uses_bullets?: number | null;
  credibility_signal?: string | null;
  cta_type?: string | null;
  engagement_tier?: string | null;
};

export type TrendItemInsert = {
  trend_id: string;
  headline: string;
  source_url: string;
  source_name: string;
  published_at: string;
  relevance_score: number;
  content_angle: string | null;
  cached_at: string;
  expired?: number;
};

export type GeneratedPostRow = {
  post_id: string;
  industry: string;
  topic_focus: string;
  hook_archetype: string | null;
  hook_clarity_score: number | null;
  body: string;
  char_count: number | null;
  credibility_signals: string;
  trend_source: string | null;
  post_type: string | null;
  cta_type: string | null;
  lint_flags: string;
  generated_at: string;
};

export type GeneratedPostInsert = {
  post_id: string;
  industry: string;
  topic_focus: string;
  hook_archetype: string | null;
  hook_clarity_score: number | null;
  body: string;
  char_count: number;
  credibility_signals: string[];
  trend_source: string | null;
  post_type: string | null;
  cta_type: string | null;
  lint_flags: unknown[];
  generated_at: string;
};

// --- corpus_posts -----------------------------------------------------------

const insertCorpusSql = `
  INSERT OR REPLACE INTO corpus_posts (
    post_id, creator_url, raw_text, hook_type, hook_length_chars, post_length_chars,
    line_break_density, uses_bullets, credibility_signal, cta_type, engagement_tier, scraped_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export function insertCorpusPost(row: CorpusPostInsert): void {
  const db = getDb();
  const stmt = db.prepare(insertCorpusSql);
  stmt.run(
    row.post_id,
    row.creator_url,
    row.raw_text,
    row.hook_type ?? null,
    row.hook_length_chars ?? null,
    row.post_length_chars ?? null,
    row.line_break_density ?? null,
    row.uses_bullets ?? 0,
    row.credibility_signal ?? null,
    row.cta_type ?? null,
    row.engagement_tier ?? "medium",
    row.scraped_at,
  );
}

export function insertCorpusPosts(rows: CorpusPostInsert[]): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(insertCorpusSql);
  const tx = db.transaction((batch: CorpusPostInsert[]) => {
    for (const row of batch) {
      stmt.run(
        row.post_id,
        row.creator_url,
        row.raw_text,
        row.hook_type ?? null,
        row.hook_length_chars ?? null,
        row.post_length_chars ?? null,
        row.line_break_density ?? null,
        row.uses_bullets ?? 0,
        row.credibility_signal ?? null,
        row.cta_type ?? null,
        row.engagement_tier ?? "medium",
        row.scraped_at,
      );
    }
  });
  tx(rows);
}

export function getCorpusPost(postId: string): CorpusPostRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM corpus_posts WHERE post_id = ?`).get(postId) as
    | CorpusPostRow
    | undefined;
}

export function listCorpusPosts(limit = 500): CorpusPostRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM corpus_posts ORDER BY scraped_at DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 10_000)) as CorpusPostRow[];
}

export function listCorpusTexts(): string[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT raw_text FROM corpus_posts WHERE length(trim(raw_text)) > 0`)
    .all() as { raw_text: string }[];
  return rows.map((r) => r.raw_text);
}

export function countCorpusPosts(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS c FROM corpus_posts`).get() as { c: number };
  return row.c;
}

// --- trend_items ------------------------------------------------------------

export function upsertTrendItem(row: TrendItemInsert): void {
  const db = getDb();
  const expired = row.expired ?? 0;
  db.prepare(
    `
    INSERT INTO trend_items (
      trend_id, headline, source_url, source_name, published_at,
      relevance_score, content_angle, cached_at, expired
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trend_id) DO UPDATE SET
      headline = excluded.headline,
      source_url = excluded.source_url,
      source_name = excluded.source_name,
      published_at = excluded.published_at,
      relevance_score = excluded.relevance_score,
      content_angle = excluded.content_angle,
      cached_at = excluded.cached_at,
      expired = excluded.expired
    `,
  ).run(
    row.trend_id,
    row.headline,
    row.source_url,
    row.source_name,
    row.published_at,
    row.relevance_score,
    row.content_angle,
    row.cached_at,
    expired,
  );
}

export function getTrendItem(trendId: string): TrendItemRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT trend_id, headline, source_url, source_name, published_at,
              relevance_score, content_angle, cached_at, expired
       FROM trend_items WHERE trend_id = ?`,
    )
    .get(trendId) as TrendItemRow | undefined;
}

// --- generated_posts --------------------------------------------------------

export function insertGeneratedPost(row: GeneratedPostInsert): void {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO generated_posts (
        post_id, industry, topic_focus, hook_archetype, hook_clarity_score,
        body, char_count, credibility_signals, trend_source, post_type, cta_type, lint_flags, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      row.post_id,
      row.industry,
      row.topic_focus,
      row.hook_archetype,
      row.hook_clarity_score,
      row.body,
      row.char_count,
      JSON.stringify(row.credibility_signals),
      row.trend_source,
      row.post_type,
      row.cta_type,
      JSON.stringify(row.lint_flags),
      row.generated_at,
    );
  } catch (e) {
    console.error("[db] insertGeneratedPost failed (read-only or ephemeral FS)", e);
  }
}

export function getGeneratedPost(postId: string): GeneratedPostRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM generated_posts WHERE post_id = ?`).get(postId) as
    | GeneratedPostRow
    | undefined;
}

export function listGeneratedPosts(limit = 100): GeneratedPostRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM generated_posts ORDER BY generated_at DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 5_000)) as GeneratedPostRow[];
}
