import { describe, expect, it } from "vitest";
import { maxCorpusSimilarity, trigramJaccard } from "@/lib/trigram";

describe("trigram", () => {
  it("returns 1 for identical text", () => {
    const s = "one two three four five six seven eight";
    expect(trigramJaccard(s, s)).toBeGreaterThan(0.9);
  });

  it("returns low score for unrelated strings", () => {
    const a = "alpha beta gamma delta epsilon zeta eta theta";
    const b = "completely different vocabulary here for sure ok";
    expect(trigramJaccard(a, b)).toBeLessThan(0.2);
  });

  it("maxCorpusSimilarity picks highest", () => {
    const g = "foo bar baz qux quux corge grault garply waldo fred plugh";
    const corpus = ["xxx yyy zzz", "foo bar baz qux quux corge grault garply waldo fred plugh"];
    expect(maxCorpusSimilarity(g, corpus)).toBeGreaterThan(0.5);
  });
});
