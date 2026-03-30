import { z } from "zod";

export const lintFlagSchema = z.object({
  rule: z.string(),
  severity: z.enum(["WARN", "BLOCK"]),
  suggestion: z.string().optional(),
  excerpt: z.string().optional(),
});

export type LintFlag = z.infer<typeof lintFlagSchema>;

const POST_TYPES = [
  "trend_reaction",
  "workflow",
  "contrarian",
  "mini_case_study",
  "question",
] as const;

const CTAS = ["none", "soft", "direct", "link"] as const;

const postTypeEnum = z.enum(POST_TYPES);
const ctaEnum = z.enum(CTAS);

function coercePostType(val: unknown): (typeof POST_TYPES)[number] {
  if (typeof val === "string" && (POST_TYPES as readonly string[]).includes(val)) {
    return val as (typeof POST_TYPES)[number];
  }
  return "workflow";
}

function coerceCta(val: unknown): (typeof CTAS)[number] {
  if (typeof val === "string" && (CTAS as readonly string[]).includes(val)) {
    return val as (typeof CTAS)[number];
  }
  return "soft";
}

export const generatedPostSchema = z.object({
  post_id: z.string().default(""),
  industry: z.string().default(""),
  topic_focus: z.string().default(""),
  hook_archetype: z.string().default(""),
  hook_clarity_score: z.coerce.number().int().min(1).max(10),
  body: z.string(),
  char_count: z.coerce.number().int().nonnegative().optional(),
  credibility_signals: z.array(z.string()).default([]),
  trend_source: z.string().default("none"),
  post_type: z.preprocess(coercePostType, postTypeEnum),
  cta_type: z.preprocess(coerceCta, ctaEnum),
  lint_flags: z.array(lintFlagSchema).default([]),
  generated_at: z.string().default(""),
});

export type GeneratedPost = z.infer<typeof generatedPostSchema>;

export type TrendItemRow = {
  trend_id: string;
  headline: string;
  source_url: string;
  source_name: string;
  published_at: string;
  relevance_score: number;
  content_angle: string | null;
  cached_at: string;
  expired: number;
};

export type GenerateRequestBody = {
  industry?: string;
  topic_focus?: string;
  num_posts?: number;
  voice_preset?: string;
};

// --- Style guide (PRD §13.4) — machine-readable JSON ----------------------------

const hookArchetypeSchema = z.object({
  name: z.string(),
  structure: z.string(),
  example_scaffold: z.string(),
});

export const styleGuideSchema = z.object({
  version: z.string(),
  generated_at: z.string(),
  hook_archetypes: z.array(hookArchetypeSchema),
  length_range: z.object({
    p25: z.number(),
    p75: z.number(),
  }),
  line_break_density_norm: z.number(),
  credibility_moves: z.array(z.string()),
  cta_patterns: z.object({
    high_engagement: z.array(z.string()),
    low_engagement: z.array(z.string()),
  }),
  anti_patterns: z.array(z.string()),
});

export type StyleGuide = z.infer<typeof styleGuideSchema>;

/** Sanitized row safe to embed in prompts (after TTL + `sanitizeForPromptInjection`). */
export type TrendBriefItem = {
  trend_id: string;
  headline: string;
  source_url: string;
  source_name: string;
  published_at: string;
  relevance_score: number;
  content_angle: string | null;
  cached_at: string;
};

/** Result of `getActiveTrends()` for downstream prompt/API layers. */
export type ActiveTrendsBrief = {
  /** Top-N by relevance for prompts (e.g. 5–7). */
  items: TrendBriefItem[];
  /** All rows matching TTL + `expired = 0` before applying `limit` (for ≥4 freshness checks). */
  totalActiveInWindow: number;
  /** ISO 8601 — max `cached_at` among returned `items`, or null if empty. */
  briefCachedAt: string | null;
  /** True when `briefCachedAt` is within 24h (see `trend_ttl`). */
  cacheFresh: boolean;
};

// --- LLM batch generation (PRD §8.2 hook self-score + retries) -----------------

/** Minimum self-reported hook clarity before we skip generator-side retries. */
export const HOOK_CLARITY_MIN_SCORE = 7 as const;

/** Regeneration attempts after the first model output (max 2 retries = 3 tries total). */
export const HOOK_SCORE_MAX_RETRIES = 2 as const;

export type GenerateBatchInput = {
  industry: string;
  topicFocus: string;
  numPosts: number;
  /** From `getStyleGuideSummary` / `styleGuideSummary` — no DB reads in prompt_builder. */
  styleSummary: string;
  /** JSON string of trend brief items or envelope for prompts. */
  trendBriefJson: string;
  minChars?: number;
  maxChars?: number;
};

export const generateBatchInputSchema = z.object({
  industry: z.string().min(1),
  topicFocus: z.string().min(1),
  numPosts: z.number().int().min(1).max(12),
  styleSummary: z.string(),
  trendBriefJson: z.string(),
  minChars: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});
