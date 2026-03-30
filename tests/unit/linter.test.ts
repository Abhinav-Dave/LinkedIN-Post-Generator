import { describe, expect, it } from "vitest";
import { lintPostDeterministic } from "@/lib/linter";
import { generatedPostSchema } from "@/lib/types";
import { runBlockRules, hasCredibilitySignal } from "../../lint/block_rules";

const filler = (n: number) => "word ".repeat(Math.ceil(n / 5));

describe("lintPostDeterministic", () => {
  it("adds WARN when trend_reaction has trend_source none", () => {
    const body = `${filler(700)} We use Claude and cut latency by 15%.`;
    const post = generatedPostSchema.parse({
      body,
      hook_clarity_score: 8,
      post_type: "trend_reaction",
      trend_source: "none",
    });
    const { blockReasons, warnFlags } = lintPostDeterministic(post, []);
    expect(blockReasons).toEqual([]);
    expect(warnFlags.some((w) => w.rule.includes("missing_trend"))).toBe(true);
  });
});

describe("block_rules", () => {
  it("flags banned opener", () => {
    const body = `Excited to share something important.\n\n${filler(650)} We used Claude and cut manual steps by 40%.`;
    const r = runBlockRules(body, { hookClarityScore: 9, maxCorpusSimilarity: 0 });
    expect(r.some((x) => x.includes("banned_opener"))).toBe(true);
  });

  it("flags short posts", () => {
    const body = "Claude plus Excel saved us 12 hours this week.";
    const r = runBlockRules(body, { hookClarityScore: 8, maxCorpusSimilarity: 0 });
    expect(r.some((x) => x.includes("below_min_length"))).toBe(true);
  });

  it("flags low hook score", () => {
    const body = `${filler(700)} Claude API`;
    const r = runBlockRules(body, { hookClarityScore: 5, maxCorpusSimilarity: 0 });
    expect(r.some((x) => x.includes("hook_score"))).toBe(true);
  });

  it("flags high corpus similarity", () => {
    const body = `${filler(700)} with Claude and 25% faster reviews.`;
    const r = runBlockRules(body, { hookClarityScore: 8, maxCorpusSimilarity: 0.55 });
    expect(r.some((x) => x.includes("similarity"))).toBe(true);
  });

  it("detects credibility signals", () => {
    expect(hasCredibilitySignal("We shipped in 2024 with Claude.")).toBe(true);
    expect(hasCredibilitySignal("vague advice with no anchors")).toBe(false);
  });
});
