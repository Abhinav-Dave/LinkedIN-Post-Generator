import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

let sqliteSingleton: Database.Database | null = null;
let supabaseSingleton: SupabaseClient | null = null;

function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase(): SupabaseClient {
  if (supabaseSingleton) return supabaseSingleton;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase backend");
  }
  supabaseSingleton = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseSingleton;
}

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
  if (hasSupabaseConfig()) {
    throw new Error("getDb() is unavailable when using Supabase backend");
  }
  if (sqliteSingleton) return sqliteSingleton;

  const file = getDbPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  runMigrations(db);

  sqliteSingleton = db;
  return sqliteSingleton;
}

/** @deprecated Prefer getDb() — kept for existing call sites. */
export function openDb(): Database.Database {
  return getDb();
}

export function closeDb(): void {
  if (sqliteSingleton) {
    sqliteSingleton.close();
    sqliteSingleton = null;
  }
  supabaseSingleton = null;
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

export async function insertCorpusPost(row: CorpusPostInsert): Promise<void> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { error } = await sb.from("corpus_posts").upsert(
      {
        post_id: row.post_id,
        creator_url: row.creator_url,
        raw_text: row.raw_text,
        hook_type: row.hook_type ?? null,
        hook_length_chars: row.hook_length_chars ?? null,
        post_length_chars: row.post_length_chars ?? null,
        line_break_density: row.line_break_density ?? null,
        uses_bullets: row.uses_bullets ?? 0,
        credibility_signal: row.credibility_signal ?? null,
        cta_type: row.cta_type ?? null,
        engagement_tier: row.engagement_tier ?? "medium",
        scraped_at: row.scraped_at,
      },
      { onConflict: "post_id" },
    );
    if (error) throw error;
    return;
  }
  const db = getDb();
  db.prepare(insertCorpusSql).run(
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

export async function insertCorpusPosts(rows: CorpusPostInsert[]): Promise<void> {
  if (rows.length === 0) return;
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const payload = rows.map((row) => ({
      post_id: row.post_id,
      creator_url: row.creator_url,
      raw_text: row.raw_text,
      hook_type: row.hook_type ?? null,
      hook_length_chars: row.hook_length_chars ?? null,
      post_length_chars: row.post_length_chars ?? null,
      line_break_density: row.line_break_density ?? null,
      uses_bullets: row.uses_bullets ?? 0,
      credibility_signal: row.credibility_signal ?? null,
      cta_type: row.cta_type ?? null,
      engagement_tier: row.engagement_tier ?? "medium",
      scraped_at: row.scraped_at,
    }));
    const { error } = await sb.from("corpus_posts").upsert(payload, { onConflict: "post_id" });
    if (error) throw error;
    return;
  }
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

export async function getCorpusPost(postId: string): Promise<CorpusPostRow | undefined> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("corpus_posts").select("*").eq("post_id", postId).maybeSingle();
    if (error) throw error;
    return (data as CorpusPostRow | null) ?? undefined;
  }
  const db = getDb();
  return db.prepare(`SELECT * FROM corpus_posts WHERE post_id = ?`).get(postId) as
    | CorpusPostRow
    | undefined;
}

export async function listCorpusPosts(limit = 500): Promise<CorpusPostRow[]> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const cap = Math.min(Math.max(limit, 1), 10_000);
    const { data, error } = await sb
      .from("corpus_posts")
      .select("*")
      .order("scraped_at", { ascending: false })
      .limit(cap);
    if (error) throw error;
    return (data as CorpusPostRow[]) ?? [];
  }
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM corpus_posts ORDER BY scraped_at DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 10_000)) as CorpusPostRow[];
}

export async function listCorpusTexts(): Promise<string[]> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("corpus_posts").select("raw_text");
    if (error) throw error;
    return (data ?? [])
      .map((r: unknown) => String((r as { raw_text?: string }).raw_text ?? ""))
      .filter((v: string) => v.trim().length > 0);
  }
  const db = getDb();
  const rows = db
    .prepare(`SELECT raw_text FROM corpus_posts WHERE length(trim(raw_text)) > 0`)
    .all() as { raw_text: string }[];
  return rows.map((r) => r.raw_text);
}

export async function countCorpusPosts(): Promise<number> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { count, error } = await sb.from("corpus_posts").select("*", { head: true, count: "exact" });
    if (error) throw error;
    return count ?? 0;
  }
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS c FROM corpus_posts`).get() as { c: number };
  return row.c;
}

// --- trend_items ------------------------------------------------------------

export async function upsertTrendItem(row: TrendItemInsert): Promise<void> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { error } = await sb.from("trend_items").upsert(
      {
        trend_id: row.trend_id,
        headline: row.headline,
        source_url: row.source_url,
        source_name: row.source_name,
        published_at: row.published_at,
        relevance_score: row.relevance_score,
        content_angle: row.content_angle,
        cached_at: row.cached_at,
        expired: row.expired ?? 0,
      },
      { onConflict: "trend_id" },
    );
    if (error) throw error;
    return;
  }
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

export async function getTrendItem(trendId: string): Promise<TrendItemRow | undefined> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("trend_items")
      .select("trend_id,headline,source_url,source_name,published_at,relevance_score,content_angle,cached_at,expired")
      .eq("trend_id", trendId)
      .maybeSingle();
    if (error) throw error;
    return (data as TrendItemRow | null) ?? undefined;
  }
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

export async function insertGeneratedPost(row: GeneratedPostInsert): Promise<void> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { error } = await sb.from("generated_posts").upsert(
      {
        post_id: row.post_id,
        industry: row.industry,
        topic_focus: row.topic_focus,
        hook_archetype: row.hook_archetype,
        hook_clarity_score: row.hook_clarity_score,
        body: row.body,
        char_count: row.char_count,
        credibility_signals: JSON.stringify(row.credibility_signals),
        trend_source: row.trend_source,
        post_type: row.post_type,
        cta_type: row.cta_type,
        lint_flags: JSON.stringify(row.lint_flags),
        generated_at: row.generated_at,
      },
      { onConflict: "post_id" },
    );
    if (error) throw error;
    return;
  }
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

export async function getGeneratedPost(postId: string): Promise<GeneratedPostRow | undefined> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("generated_posts").select("*").eq("post_id", postId).maybeSingle();
    if (error) throw error;
    return (data as GeneratedPostRow | null) ?? undefined;
  }
  const db = getDb();
  return db.prepare(`SELECT * FROM generated_posts WHERE post_id = ?`).get(postId) as
    | GeneratedPostRow
    | undefined;
}

export async function listGeneratedPosts(limit = 100): Promise<GeneratedPostRow[]> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const cap = Math.min(Math.max(limit, 1), 5_000);
    const { data, error } = await sb
      .from("generated_posts")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(cap);
    if (error) throw error;
    return (data as GeneratedPostRow[]) ?? [];
  }
  const db = getDb();
  return db
    .prepare(`SELECT * FROM generated_posts ORDER BY generated_at DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 5_000)) as GeneratedPostRow[];
}

export async function listTrendItems(minRelevance: number, limit: number): Promise<TrendItemRow[]> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("trend_items")
      .select("trend_id,headline,source_url,source_name,published_at,relevance_score,content_angle,cached_at,expired")
      .eq("expired", 0)
      .gte("relevance_score", minRelevance)
      .order("relevance_score", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as TrendItemRow[]) ?? [];
  }
  const db = getDb();
  return db
    .prepare(
      `SELECT trend_id, headline, source_url, source_name, published_at,
              relevance_score, content_angle, cached_at, expired
       FROM trend_items
       WHERE expired = 0 AND relevance_score >= ?
       ORDER BY relevance_score DESC, published_at DESC
       LIMIT ?`,
    )
    .all(minRelevance, limit) as TrendItemRow[];
}

export async function markExpiredTrendsBefore(cutoffIso: string): Promise<void> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { error } = await sb.from("trend_items").update({ expired: 1 }).lt("published_at", cutoffIso);
    if (error) throw error;
    return;
  }
  const db = getDb();
  db.prepare(`UPDATE trend_items SET expired = 1 WHERE published_at < ?`).run(cutoffIso);
}

/** Test helper for deterministic cleanup across backends. */
export async function clearCorpusPostsForTests(): Promise<void> {
  if (hasSupabaseConfig()) {
    const sb = getSupabase();
    const { error } = await sb.from("corpus_posts").delete().neq("post_id", "");
    if (error) throw error;
    return;
  }
  const db = getDb();
  db.prepare("DELETE FROM corpus_posts").run();
}
