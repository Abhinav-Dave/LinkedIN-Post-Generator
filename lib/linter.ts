import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { runBlockRules } from "../lint/block_rules";
import { maxCorpusSimilarity } from "@/lib/trigram";
import type { GeneratedPost, LintFlag } from "@/lib/types";
import { lintFlagSchema } from "@/lib/types";

export type DeterministicLintContext = {
  corpusTexts: string[];
};

export type LintResult = {
  blockReasons: string[];
  warnFlags: LintFlag[];
  maxSimilarity: number;
};

const GENERIC_CTA_RE =
  /\b(thoughts\??|agree\??|what do you think\??|let me know\??|comment below|drop your thoughts)\b/i;

const TEMPLATED_OPENER_RE =
  /^(here(?:'s| is| are)|in this post|today,?\s+i(?:'ll| will)|let'?s (?:break down|dive in)|if you(?:'re| are) (?:struggling|looking to))/i;

function extractVoiceWarnFlags(body: string): LintFlag[] {
  const warns: LintFlag[] = [];
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "";
  const tail = lines.slice(-2).join(" ");
  const numberedListLines = lines.filter((l) => /^\d+[.)]\s+\S+/.test(l)).length;

  // Strong combo to keep false positives low.
  if (
    TEMPLATED_OPENER_RE.test(firstLine) &&
    numberedListLines >= 3 &&
    GENERIC_CTA_RE.test(tail)
  ) {
    warns.push({
      rule: "WARN: ai_voice_templated_opener_list_cta_combo",
      severity: "WARN",
      suggestion:
        "Rewrite the opener with a specific claim and replace the generic CTA with a concrete question tied to your example.",
      excerpt: firstLine.slice(0, 180),
    });
  }

  // Placeholder artifacts usually indicate template leakage.
  if (/\[[^\]]{1,30}\]|<[^>]{1,30}>|\b(?:insert|replace)\s+\w+/i.test(body)) {
    warns.push({
      rule: "WARN: ai_voice_template_placeholder_artifact",
      severity: "WARN",
      suggestion:
        "Replace template placeholders/tokens with concrete details before publishing.",
    });
  }

  // Buzzword stack + no concrete numbers often reads synthetic.
  const buzzwords = [
    "synergy",
    "unlock",
    "leverage",
    "game-changing",
    "revolutionize",
    "supercharge",
    "seamless",
    "cutting-edge",
  ];
  const buzzwordHits = buzzwords.filter((w) =>
    new RegExp(`\\b${w.replace("-", "[- ]")}\\b`, "i").test(body),
  ).length;
  if (buzzwordHits >= 3 && !/\b\d+(?:\.\d+)?%?\b/.test(body)) {
    warns.push({
      rule: "WARN: ai_voice_buzzword_stacking_no_specifics",
      severity: "WARN",
      suggestion:
        "Reduce buzzwords and add one concrete metric, named tool, or dated event.",
    });
  }

  // Engagement bait stack commonly seen in low-quality AI drafts.
  const hashtagCount = (body.match(/(^|\s)#[A-Za-z][\w-]*/g) ?? []).length;
  if (/\b(follow for more|smash that like|share this post)\b/i.test(body) && hashtagCount >= 4) {
    warns.push({
      rule: "WARN: ai_voice_engagement_bait_stack",
      severity: "WARN",
      suggestion:
        "Use one focused CTA and limit hashtags to the most relevant 1-3 tags.",
    });
  }

  return warns;
}

/**
 * PRD §10.1 deterministic BLOCK rules + corpus trigram similarity (threshold > 0.4).
 * Returns human-readable BLOCK reason strings for retries and UI.
 */
export function runDeterministicLint(
  post: GeneratedPost,
  ctx: DeterministicLintContext,
): { blockReasons: string[]; maxSimilarity: number } {
  const maxSimilarity = ctx.corpusTexts.length
    ? maxCorpusSimilarity(post.body, ctx.corpusTexts)
    : 0;
  const blockReasons = runBlockRules(post.body, {
    hookClarityScore: post.hook_clarity_score,
    maxCorpusSimilarity: maxSimilarity,
    postType: post.post_type,
  });
  return { blockReasons, maxSimilarity };
}

function getApiKey(): string | null {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return k?.trim() || null;
}

function cheapModel(): string {
  return process.env.GEMINI_MODEL_CHEAP?.trim() || process.env.GEMINI_MODEL_MAIN?.trim() || "gemini-2.5-flash";
}

export function lintPostDeterministic(
  post: GeneratedPost,
  corpusTexts: string[],
): LintResult {
  const { blockReasons, maxSimilarity: maxSim } = runDeterministicLint(post, {
    corpusTexts,
  });

  const warnFlags: LintFlag[] = [...extractVoiceWarnFlags(post.body)];

  if (post.post_type === "trend_reaction" && post.trend_source === "none") {
    warnFlags.push({
      rule: "WARN: missing_trend_link",
      severity: "WARN",
      suggestion: "Link trend_source to a URL from the trend brief or clarify it is not trend-reactive.",
    });
  }

  return { blockReasons, warnFlags, maxSimilarity: maxSim };
}

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```json")) t = t.slice(7);
  else if (t.startsWith("```")) t = t.slice(3);
  if (t.endsWith("```")) t = t.slice(0, -3);
  return t.trim();
}

export async function lintPostWarnLlm(post: GeneratedPost): Promise<LintFlag[]> {
  const key = getApiKey();
  if (!key) return [];

  const templatePath = path.join(process.cwd(), "prompts", "lint_v1.txt");
  let template = fs.readFileSync(templatePath, "utf8");
  template = template.replace("[POST_BODY]", post.body.slice(0, 12000));

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: cheapModel() });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: template }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });
    const text = result.response.text();
    const parsed = JSON.parse(stripJsonFence(text) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const flags: LintFlag[] = [];
    for (const x of parsed) {
      const r = lintFlagSchema.safeParse(x);
      if (r.success && r.data.severity === "WARN") flags.push(r.data);
    }
    return flags;
  } catch (e) {
    console.error("[linter] WARN LLM lint failed", e);
    return [];
  }
}

