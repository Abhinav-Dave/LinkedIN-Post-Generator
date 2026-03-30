import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Shared secret for Apify → `/api/ingestion/corpus`. PRD §18: header-based; we also accept
 * query params so webhook URLs can be configured without custom headers on Apify.
 * Never log the resolved secret or raw header values.
 */
export function extractApifyWebhookSecretCandidate(req: NextRequest): string {
  const q = req.nextUrl.searchParams;
  const fromQuery =
    q.get("secret")?.trim() || q.get("token")?.trim() || q.get("webhookSecret")?.trim();
  if (fromQuery) return fromQuery;

  const h =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-apify-webhook-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return (h || "").trim();
}

function secretsEqualConstantTime(received: string, expected: string): boolean {
  try {
    const a = Buffer.from(received, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * When `APIFY_WEBHOOK_SECRET` is non-empty, request must present the same value (header or query).
 * When unset (local dev), validation is skipped — configure the secret before production.
 */
export function apifyWebhookSecretOk(req: NextRequest): boolean {
  const expected = process.env.APIFY_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const got = extractApifyWebhookSecretCandidate(req);
  if (!got) return false;
  return secretsEqualConstantTime(got, expected);
}
