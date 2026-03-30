import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { runBlockRules } from "../lint/block_rules";
import { maxCorpusSimilarity } from "@/lib/trigram";
import type { GeneratedPost, LintFlag } from "@/lib/types";
import { lintFlagSchema } from "@/lib/types";

export type LintResult = {
  blockReasons: string[];
  warnFlags: LintFlag[];
  maxSimilarity: number;
};

function getApiKey(): string | null {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return k?.trim() || null;
}

function cheapModel(): string {
  return process.env.GEMINI_MODEL_CHEAP?.trim() || process.env.GEMINI_MODEL_MAIN?.trim() || "gemini-2.0-flash";
}

export function lintPostDeterministic(
  post: GeneratedPost,
  corpusTexts: string[],
): LintResult {
  const maxSim = corpusTexts.length ? maxCorpusSimilarity(post.body, corpusTexts) : 0;
  const blockReasons = runBlockRules(post.body, {
    hookClarityScore: post.hook_clarity_score,
    maxCorpusSimilarity: maxSim,
    postType: post.post_type,
  });

  const warnFlags: LintFlag[] = [];

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

