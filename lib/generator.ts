import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import { buildPrompt, buildRegenerateOnePrompt } from "@/lib/prompt_builder";
import type { GeneratedPost, GenerateBatchInput } from "@/lib/types";
import {
  generatedPostSchema,
  generateBatchInputSchema,
  HOOK_CLARITY_MIN_SCORE,
  HOOK_SCORE_MAX_RETRIES,
} from "@/lib/types";

function getApiKey(): string {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!k?.trim()) throw new Error("Missing GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)");
  return k.trim();
}

function getModelName(): string {
  return process.env.GEMINI_MODEL_MAIN?.trim() || "gemini-2.5-flash";
}

function getGenModel(system: string) {
  const genAI = new GoogleGenerativeAI(getApiKey());
  return genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: system,
  });
}

export function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```json")) t = t.slice(7);
  else if (t.startsWith("```")) t = t.slice(3);
  if (t.endsWith("```")) t = t.slice(0, -3);
  return t.trim();
}

function parsePostArray(raw: string): unknown[] {
  const cleaned = stripJsonFence(raw);
  const parsed = JSON.parse(cleaned) as unknown;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && "posts" in parsed) {
    const posts = (parsed as { posts: unknown }).posts;
    if (Array.isArray(posts)) return posts;
  }
  return [parsed];
}

function itemToPost(item: unknown, industry: string, topicFocus: string): GeneratedPost | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const body = String(o.body ?? "").trim();
  if (!body) return null;
  const candidate = {
    post_id: String(o.post_id || uuidv4()),
    industry: String(o.industry || industry),
    topic_focus: String(o.topic_focus || topicFocus),
    hook_archetype: String(o.hook_archetype || ""),
    hook_clarity_score: o.hook_clarity_score,
    body,
    char_count: body.length,
    credibility_signals: Array.isArray(o.credibility_signals)
      ? (o.credibility_signals as unknown[]).map(String)
      : [],
    trend_source: String(o.trend_source ?? "none"),
    post_type: o.post_type,
    cta_type: o.cta_type,
    lint_flags: [],
    generated_at: String(o.generated_at || new Date().toISOString()),
  };
  const r = generatedPostSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

function materializeBatch(text: string, industry: string, topicFocus: string): GeneratedPost[] {
  const items = parsePostArray(text);
  const out: GeneratedPost[] = [];
  for (const item of items) {
    const p = itemToPost(item, industry, topicFocus);
    if (p) out.push(p);
  }
  return out;
}

async function generateContentJson(system: string, user: string, temperature: number, maxTokens: number) {
  const model = getGenModel(system);
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  });
  return result.response.text();
}

/**
 * PRD §770 — malformed JSON: retry the generation call once.
 * Returns parseable posts or throws after the second failure.
 */
export async function generatePostsBatch(
  system: string,
  user: string,
  industry: string,
  topicFocus: string,
): Promise<GeneratedPost[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await generateContentJson(system, user, 0.75, 8192);
      return materializeBatch(text, industry, topicFocus);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * PRD §8.2 — if hook_clarity_score < 7, regenerate up to 2 times (generator layer, not API).
 */
async function ensureHookClarity(
  post: GeneratedPost,
  industry: string,
  topicFocus: string,
  styleSummary: string,
  trendBriefJson: string,
): Promise<GeneratedPost> {
  let current = post;
  if (current.hook_clarity_score >= HOOK_CLARITY_MIN_SCORE) {
    return current;
  }
  for (let r = 0; r < HOOK_SCORE_MAX_RETRIES; r++) {
    const { system, user } = buildRegenerateOnePrompt({
      industry,
      topicFocus,
      errors: [
        `hook_clarity_score was ${current.hook_clarity_score}; required minimum is ${HOOK_CLARITY_MIN_SCORE}. Rewrite the opening hook to be more specific (number, named tool, date, or concrete claim) and re-score using the rubric.`,
      ],
      styleSummary,
      trendBriefJson,
    });
    const next = await generateSinglePost(system, user, industry, topicFocus);
    if (!next) break;
    current = next;
    if (current.hook_clarity_score >= HOOK_CLARITY_MIN_SCORE) {
      return current;
    }
  }
  return current;
}

function firstPostFromParsed(parsed: unknown): unknown {
  if (Array.isArray(parsed)) {
    return parsed.length > 0 ? parsed[0] : null;
  }
  return parsed;
}

export async function generateSinglePost(
  system: string,
  user: string,
  industry: string,
  topicFocus: string,
): Promise<GeneratedPost | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await generateContentJson(system, user, 0.7, 4096);
      const parsed = JSON.parse(stripJsonFence(text)) as unknown;
      const one = firstPostFromParsed(parsed);
      if (one === null) continue;
      return itemToPost(one, industry, topicFocus);
    } catch {
      /* malformed JSON — retry once per PRD §770 */
    }
  }
  return null;
}

/**
 * Single entry for raw batch output: build versioned prompts, call Gemini, parse JSON (with one retry),
 * then per-post hook self-score retries per PRD §8.2.
 */
export async function generateBatch(input: GenerateBatchInput): Promise<GeneratedPost[]> {
  const parsed = generateBatchInputSchema.parse(input);
  const { system, user } = buildPrompt({
    industry: parsed.industry,
    topicFocus: parsed.topicFocus,
    numPosts: parsed.numPosts,
    styleSummary: parsed.styleSummary,
    trendBriefJson: parsed.trendBriefJson,
    minChars: parsed.minChars,
    maxChars: parsed.maxChars,
  });

  const batch = await generatePostsBatch(system, user, parsed.industry, parsed.topicFocus);

  const withHooks: GeneratedPost[] = [];
  for (const p of batch) {
    withHooks.push(
      await ensureHookClarity(p, parsed.industry, parsed.topicFocus, parsed.styleSummary, parsed.trendBriefJson),
    );
  }
  return withHooks;
}
