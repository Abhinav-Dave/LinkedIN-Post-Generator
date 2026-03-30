import { describe, expect, it } from "vitest";
import { runDeterministicLint } from "@/lib/linter";
import { generatedPostSchema } from "@/lib/types";

const filler = (n: number) => "word ".repeat(Math.ceil(n / 5));

function post(overrides: Record<string, unknown>) {
  return generatedPostSchema.parse({
    body: `${filler(700)} We measured 25% faster reviews with Claude.`,
    hook_clarity_score: 8,
    post_type: "workflow",
    trend_source: "none",
    ...overrides,
  });
}

describe("runDeterministicLint", () => {
  it("returns no BLOCK when corpus empty and body passes rules", () => {
    const p = post({});
    const { blockReasons, maxSimilarity } = runDeterministicLint(p, { corpusTexts: [] });
    expect(maxSimilarity).toBe(0);
    expect(blockReasons).toEqual([]);
  });

  it("includes high_corpus_similarity when max trigram Jaccard exceeds 40%", () => {
    const p = post({});
    const duplicate = p.body;
    const { blockReasons } = runDeterministicLint(p, { corpusTexts: [duplicate] });
    expect(blockReasons.some((r) => r.includes("high_corpus_similarity"))).toBe(true);
  });

  it("blocks Unpopular opinion: opener when post_type is not contrarian", () => {
    const p = post({
      body: `Unpopular opinion: most dashboards lie.\n\n${filler(650)} We use Claude and saved 12 hours.`,
      post_type: "workflow",
    });
    const { blockReasons } = runDeterministicLint(p, { corpusTexts: [] });
    expect(blockReasons.some((r) => r.includes("unpopular_opener"))).toBe(true);
  });

  it("allows Unpopular opinion: when post_type is contrarian", () => {
    const p = post({
      body: `Unpopular opinion: most dashboards lie.\n\n${filler(650)} We use Claude and saved 12 hours.`,
      post_type: "contrarian",
    });
    const { blockReasons } = runDeterministicLint(p, { corpusTexts: [] });
    expect(blockReasons.some((r) => r.includes("unpopular_opener"))).toBe(false);
  });
});
