/**
 * Agent F — Pipeline orchestration (Modules C → E → D → persistence).
 *
 * Flow:
 * 1. **C (context)** — `markExpiredTrends`, style guide summary, sanitized trend brief JSON.
 * 2. **E (generation)** — `generateBatch({ industry, topicFocus, numPosts, styleSummary, trendBriefJson, minChars?, maxChars? })`.
 * 3. **D (lint)** — deterministic `lintPostDeterministic`; optional `lintPostWarnLlm` per post.
 * 4. **Persistence** — `insertGeneratedPost` for each surviving post.
 */
import { v4 as uuidv4 } from "uuid";
import { buildRegenerateOnePrompt, getDefaultIndustryTopic } from "@/lib/prompt_builder";
import { styleGuideSummary, loadStyleGuide } from "@/lib/style_guide";
import { topTrendsForPrompt, markExpiredTrends, fetchTrendBrief } from "@/lib/trend_brief";
import { generateBatch, generateSinglePost } from "@/lib/generator";
import { insertGeneratedPost, listCorpusTexts } from "@/lib/db";
import { lintPostDeterministic, lintPostWarnLlm } from "@/lib/linter";
import type { GeneratedPost } from "@/lib/types";
import type { GenerateFlowResult, RunGenerationPipelineOptions } from "@/lib/pipeline.types";

export type { GenerateFlowResult, RunGenerationPipelineOptions } from "@/lib/pipeline.types";

/** @deprecated Prefer `GenerateFlowResult` from `@/lib/pipeline.types`. */
export type PipelineResult = GenerateFlowResult;

function optPositiveInt(n: unknown): number | undefined {
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

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

/**
 * Core orchestration: same inputs whether invoked from HTTP or tests.
 */
export async function runGenerationPipeline(opts: RunGenerationPipelineOptions): Promise<GenerateFlowResult> {
  markExpiredTrends();
  const { industry: dInd, topicFocus: dTop } = getDefaultIndustryTopic();
  const industry = opts.industry?.trim() || dInd;
  const topicFocus = opts.topic_focus?.trim() || dTop;
  const numPosts = Math.min(12, Math.max(1, opts.num_posts ?? 5));
  const minChars = optPositiveInt(opts.min_chars);
  const maxChars = optPositiveInt(opts.max_chars);

  const trends = topTrendsForPrompt(3, 12);
  const warning =
    trends.length === 0
      ? "No fresh trends found — posts generated from style guide only."
      : undefined;

  const styleSummary = styleGuideSummary(loadStyleGuide());
  const trendBriefJson = JSON.stringify(topTrendsForPrompt(3, 7));

  let posts = await generateBatch({
    industry,
    topicFocus,
    numPosts,
    styleSummary,
    trendBriefJson,
    minChars: minChars ?? 600,
    maxChars: maxChars ?? 2000,
  });
  if (posts.length === 0) {
    throw new Error("Model returned no parseable posts");
  }

  if (posts.length < numPosts) {
    const more = await fillShortBatch(
      industry,
      topicFocus,
      numPosts - posts.length,
      styleSummary,
      trendBriefJson,
    );
    posts = [...posts, ...more];
  }

  posts = posts.slice(0, numPosts);

  const corpus = listCorpusTexts();

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

/**
 * `POST /api/generate` entry: reads JSON body (never logged) and runs the full pipeline.
 * Accepts the standard Web `Request`; `NextRequest` is compatible.
 */
export async function runGenerateFlow(req: Request): Promise<GenerateFlowResult> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty or invalid JSON — defaults apply */
  }

  return runGenerationPipeline({
    industry: typeof body.industry === "string" ? body.industry : undefined,
    topic_focus: typeof body.topic_focus === "string" ? body.topic_focus : undefined,
    num_posts: typeof body.num_posts === "number" ? body.num_posts : undefined,
    runWarnLint: body.skip_warn_lint !== true,
    min_chars: optPositiveInt(body.min_chars),
    max_chars: optPositiveInt(body.max_chars),
  });
}
