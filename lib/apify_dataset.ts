/**
 * Server-only Apify REST helpers. Do not import from Edge or client bundles.
 * Avoid logging tokens or full API error bodies in production logs.
 */

const APIFY_BASE = "https://api.apify.com/v2";

export async function fetchActorRunDatasetItems(runId: string): Promise<unknown[]> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not set; cannot fetch dataset for actor run");
  }

  const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}/dataset/items?clean=true&format=json`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 200);
    throw new Error(`Apify dataset fetch failed: HTTP ${res.status} ${snippet}`);
  }

  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : [];
}
