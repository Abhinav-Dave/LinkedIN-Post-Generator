import { describe, expect, it } from "vitest";
import { __trendTtlTestHooks } from "@/lib/trend_ttl";

describe("trend_ttl timestamp normalization", () => {
  it("parses postgres-style timestamp with microseconds", () => {
    const ms = __trendTtlTestHooks.parseIsoToUtcMs("2026-03-31 19:33:49.646754+00");
    expect(ms).not.toBeNull();
  });

  it("treats active row when expired is serialized as string", () => {
    const nowMs = Date.now();
    const publishedAt = new Date(nowMs - 60_000).toISOString();
    const active = __trendTtlTestHooks.isActiveTrendRow(
      { published_at: publishedAt, expired: "0" as unknown as number },
      nowMs,
    );
    expect(active).toBe(true);
  });
});
