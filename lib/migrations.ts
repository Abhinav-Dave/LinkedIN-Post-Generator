import type Database from "better-sqlite3";

/**
 * PRD §13 — incremental SQLite migrations via PRAGMA user_version.
 * Safe on existing DBs: DDL uses IF NOT EXISTS / idempotent steps.
 */
export const SCHEMA_VERSION = 1;

/** Initial schema — matches docs/PRD.md §13.1–13.3 plus helpful indexes. */
const MIGRATION_001 = `
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

export function runMigrations(db: Database.Database): void {
  const raw = db.pragma("user_version", { simple: true });
  let version = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(version)) version = 0;

  if (version < 1) {
    db.exec(MIGRATION_001);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}
