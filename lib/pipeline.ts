import { v4 as uuidv4 } from "uuid";
import { buildPrompt, buildRegenerateOnePrompt, getDefaultIndustryTopic } from "@/lib/prompt_builder";
import { styleGuideSummary, loadStyleGuide } from "@/lib/style_guide";
import { topTrendsForPrompt, markExpiredTrends, fetchTrendBrief } from "@/lib/trend_brief";
import { generatePostsBatch, generateSinglePost } from "@/lib/generator";
import { insertGeneratedPost, listCorpusTexts } from "@/lib/db";
import { lintPostDeterministic, lintPostWarnLlm } from "@/lib/linter";
import type { GeneratedPost } from "@/lib/types";

export type PipelineResult = {
  batch_id: string;
  generated_at: string;
  prompt_version: string;
  posts: GeneratedPost[];
  failed_slots: number;
  trend_brief_freshness: string | null;
  style_guide_only: boolean;
  warning_message?: string;
};

async function refinePost(
  post: GeneratedPost,
  corpus: string[],
  industry: string,
  topicFocus: string,
  styleSummary: string,
  trendBriefJson: string,
): Promise<GeneratedPost | null> {
  let current = post;
  for (let i = 0; i < 3; i++) {
    const { blockReasons } = lintPostDeterministic(current, corpus);
    if (blockReasons.length === 0) return current;
    if (i === 2) return null;
    const { system, user } = buildRegenerateOnePrompt({
      industry,
      topicFocus,
      errors: blockReasons,
      styleSummary,
      trendBriefJson,
    });
    const next = await generateSinglePost(system, user, industry, topicFocus);
    if (!next) return null;
    current = next;
  }
  return null;
}

async function fillShortBatch(
  system: string,
  industry: string,
  topicFocus: string,
  need: number,
  styleSummary: string,
  trendBriefJson: string,
): Promise<GeneratedPost[]> {
  const extra: GeneratedPost[] = [];
  for (let i = 0; i < need; i++) {
    const { system: s2, user: u2 } = buildRegenerateOnePrompt({
      industry,
      topicFocus,
      errors: [`Generate an additional distinct post (${i + 1}/${need}) for the same batch.`],
      styleSummary,
      trendBriefJson,
    });
    const p = await generateSinglePost(s2, u2, industry, topicFocus);
    if (p) extra.push(p);
  }
  return extra;
}

export async function runGenerationPipeline(opts: {
  industry?: string;
  topic_focus?: string;
  num_posts?: number;
  runWarnLint?: boolean;
}): Promise<PipelineResult> {
  markExpiredTrends();
  const { industry: dInd, topicFocus: dTop } = getDefaultIndustryTopic();
  const industry = opts.industry?.trim() || dInd;
  const topicFocus = opts.topic_focus?.trim() || dTop;
  const numPosts = Math.min(12, Math.max(1, opts.num_posts ?? 5));

  const trends = topTrendsForPrompt(3, 12);
  const warning =
    trends.length === 0
      ? "No fresh trends found — posts generated from style guide only."
      : undefined;

  const { system, user } = buildPrompt({
    industry,
    topicFocus,
    numPosts,
    minChars: 600,
    maxChars: 2000,
  });

  let posts = await generatePostsBatch(system, user, industry, topicFocus);
  if (posts.length === 0) {
    throw new Error("Model returned no parseable posts");
  }

  if (posts.length < numPosts) {
    const more = await fillShortBatch(
      system,
      industry,
      topicFocus,
      numPosts - posts.length,
      styleGuideSummary(loadStyleGuide()),
      JSON.stringify(topTrendsForPrompt(3, 7)),
    );
    posts = [...posts, ...more];
  }

  posts = posts.slice(0, numPosts);

  const corpus = listCorpusTexts();
  const styleSummary = styleGuideSummary(loadStyleGuide());
  const trendBriefJson = JSON.stringify(topTrendsForPrompt(3, 7));

  const final: GeneratedPost[] = [];
  let failed = 0;

  const refined: GeneratedPost[] = [];
  for (const p of posts) {
    const ok = await refinePost(p, corpus, industry, topicFocus, styleSummary, trendBriefJson);
    if (!ok) {
      failed += 1;
      continue;
    }
    const det = lintPostDeterministic(ok, corpus);
    refined.push({
      ...ok,
      lint_flags: [...(ok.lint_flags ?? []), ...det.warnFlags],
    });
  }

  const withWarns =
    opts.runWarnLint === false
      ? refined
      : await Promise.all(
          refined.map(async (ok) => {
            const warns = await lintPostWarnLlm(ok);
            return {
              ...ok,
              lint_flags: [...(ok.lint_flags ?? []), ...warns],
            };
          }),
        );

  for (const merged of withWarns) {
    insertGeneratedPost({
      post_id: merged.post_id || uuidv4(),
      industry,
      topic_focus: topicFocus,
      hook_archetype: merged.hook_archetype,
      hook_clarity_score: merged.hook_clarity_score,
      body: merged.body,
      char_count: merged.char_count ?? merged.body.length,
      credibility_signals: merged.credibility_signals,
      trend_source: merged.trend_source,
      post_type: merged.post_type,
      cta_type: merged.cta_type,
      lint_flags: merged.lint_flags,
      generated_at: merged.generated_at,
    });
    final.push(merged);
  }

  const batch_id = uuidv4();
  const generated_at = new Date().toISOString();
  const guide = loadStyleGuide();
  const { cached_at: trendCache } = fetchTrendBrief(1, 500);

  return {
    batch_id,
    generated_at,
    prompt_version: guide.version || "v1.0",
    posts: final,
    failed_slots: failed,
    trend_brief_freshness: trendCache,
    style_guide_only: trends.length === 0,
    warning_message: warning,
  };
}
