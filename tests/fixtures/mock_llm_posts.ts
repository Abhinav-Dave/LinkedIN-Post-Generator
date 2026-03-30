import { generatedPostSchema, type GeneratedPost } from "@/lib/types";

/**
 * Bodies that satisfy deterministic BLOCK rules: ≥600 chars, hook ≥7, credibility signal, no banned opener.
 */
function mockBody(seed: number): string {
  const head =
    `We shipped a Claude plus Excel workflow in March 2024 and cut manual review time by 34%.\n\n` +
    `Sprint ${seed} covered MCP integrations, TypeScript services, and our SaaS API surface.\n\n`;
  const tail = `Operational detail ${seed}: `.repeat(80);
  return (head + tail).trim();
}

export function makeMockGeneratedPost(
  index: number,
  industry: string,
  topicFocus: string,
): GeneratedPost {
  const body = mockBody(index);
  return generatedPostSchema.parse({
    post_id: `fixture-mock-${index}-${body.length}`,
    industry,
    topic_focus: topicFocus,
    hook_archetype: "mini_case_study",
    hook_clarity_score: 8,
    body,
    char_count: body.length,
    credibility_signals: ["34% reduction in manual review"],
    trend_source: "none",
    post_type: "workflow",
    cta_type: "soft",
    lint_flags: [],
    generated_at: new Date().toISOString(),
  });
}

export function makeMockPostBatch(
  count: number,
  industry: string,
  topicFocus: string,
): GeneratedPost[] {
  return Array.from({ length: count }, (_, i) =>
    makeMockGeneratedPost(i, industry, topicFocus),
  );
}
