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
