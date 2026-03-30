import { describe, expect, it, afterAll } from "vitest";
import { closeDb, openDb } from "@/lib/db";
import { fetchTrendBrief, markExpiredTrends } from "@/lib/trend_brief";

describe("trend_brief", () => {
  afterAll(() => {
    closeDb();
  });

  it("fetchTrendBrief returns an array", () => {
    openDb();
    markExpiredTrends();
    const { items, cached_at } = fetchTrendBrief(1, 10);
    expect(Array.isArray(items)).toBe(true);
    expect(cached_at === null || typeof cached_at === "string").toBe(true);
  });
});
