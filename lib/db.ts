import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS corpus_posts (
  post_id TEXT PRIMARY KEY,
  creator_url TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  hook_type TEXT,
  hook_length_chars INTEGER,
  post_length_chars INTEGER,
  line_break_density REAL,
  uses_bullets INTEGER,
  credibility_signal TEXT,
  cta_type TEXT,
  engagement_tier TEXT,
  scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trend_items (
  trend_id TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  published_at TEXT NOT NULL,
  relevance_score INTEGER NOT NULL,
  content_angle TEXT,
  cached_at TEXT NOT NULL,
  expired INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS generated_posts (
  post_id TEXT PRIMARY KEY,
  industry TEXT NOT NULL,
  topic_focus TEXT NOT NULL,
  hook_archetype TEXT,
  hook_clarity_score INTEGER,
  body TEXT NOT NULL,
  char_count INTEGER,
  credibility_signals TEXT,
  trend_source TEXT,
  post_type TEXT,
  cta_type TEXT,
  lint_flags TEXT,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trend_published ON trend_items(published_at);
CREATE INDEX IF NOT EXISTS idx_trend_expired ON trend_items(expired);
`;

let singleton: Database.Database | null = null;

export function getDbPath(): string {
  return path.join(process.cwd(), "data", "corpus.db");
}

export function openDb(): Database.Database {
  if (singleton) return singleton;
  const dir = path.dirname(getDbPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  singleton = db;
  return db;
}

/** Reset singleton (tests). */
export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

export function insertGeneratedPost(row: {
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
}): void {
  try {
    const db = openDb();
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
    console.error("[db] insertGeneratedPost failed (read-only FS ok on serverless)", e);
  }
}

export function listCorpusTexts(): string[] {
  const db = openDb();
  const rows = db
    .prepare(`SELECT raw_text FROM corpus_posts WHERE length(trim(raw_text)) > 0`)
    .all() as { raw_text: string }[];
  return rows.map((r) => r.raw_text);
}
