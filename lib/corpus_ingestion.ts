import { v4 as uuidv4 } from "uuid";
import { fetchActorRunDatasetItems } from "@/lib/apify_dataset";
import { insertCorpusPosts, type CorpusPostInsert } from "@/lib/db";

export type ApifyWebhookBody = {
  eventType?: string;
  eventData?: {
    actorRunId?: string;
    resource?: { id?: string; defaultDatasetId?: string };
  };
  posts?: Array<{
    text?: string;
    raw_text?: string;
    creator_url?: string;
    profileUrl?: string;
    /** Common Apify / scraper field names */
    url?: string;
    authorUrl?: string;
    author?: { profileUrl?: string };
  }>;
};

function rowFromLooseItem(row: Record<string, unknown>): CorpusPostInsert | null {
  const raw = String(row.text ?? row.raw_text ?? row.postText ?? "").trim();
  if (!raw) return null;
  const creatorRaw =
    row.creator_url ??
    row.profileUrl ??
    row.authorUrl ??
    (typeof row.author === "object" && row.author !== null
      ? (row.author as Record<string, unknown>).profileUrl
      : undefined) ??
    row.url ??
    "unknown";
  const creator = String(creatorRaw).trim() || "unknown";
  return {
    post_id: uuidv4(),
    creator_url: creator,
    raw_text: raw,
    scraped_at: new Date().toISOString(),
  };
}

function postsFromPayloadRows(rows: unknown[]): CorpusPostInsert[] {
  const out: CorpusPostInsert[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const mapped = rowFromLooseItem(row as Record<string, unknown>);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * PRD §14 `POST /api/ingestion/corpus`: Apify completion webhook and dev samples.
 * - Inline `posts` array (local tests) is ingested as-is.
 * - Otherwise `eventData.actorRunId` + `APIFY_API_TOKEN` loads dataset items from Apify.
 */
export async function ingestCorpusFromWebhook(body: ApifyWebhookBody): Promise<{
  posts_ingested: number;
  source: "inline" | "apify_dataset";
}> {
  const now = new Date().toISOString();
  const inline = body.posts ?? [];

  if (inline.length > 0) {
    const rows = postsFromPayloadRows(inline as unknown[]);
    for (const r of rows) {
      r.scraped_at = now;
    }
    insertCorpusPosts(rows);
    return { posts_ingested: rows.length, source: "inline" };
  }

  const runId =
    body.eventData?.actorRunId?.trim() ||
    body.eventData?.resource?.id?.trim() ||
    "";
  if (!runId) {
    return { posts_ingested: 0, source: "inline" };
  }

  const items = await fetchActorRunDatasetItems(runId);
  const rows = postsFromPayloadRows(items as Record<string, unknown>[]);
  for (const r of rows) {
    r.scraped_at = now;
  }
  insertCorpusPosts(rows);
  return { posts_ingested: rows.length, source: "apify_dataset" };
}
