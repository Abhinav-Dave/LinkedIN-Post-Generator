import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import type { GeneratedPost } from "@/lib/types";
import { generatedPostSchema } from "@/lib/types";

function getApiKey(): string {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!k?.trim()) throw new Error("Missing GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)");
  return k.trim();
}

function getModelName(): string {
  return process.env.GEMINI_MODEL_MAIN?.trim() || "gemini-2.0-flash";
}

function stripJsonFence(text: string): string {
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

export async function generatePostsBatch(
  system: string,
  user: string,
  industry: string,
  topicFocus: string,
): Promise<GeneratedPost[]> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: system,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const text = result.response.text();
  const items = parsePostArray(text);
  const out: GeneratedPost[] = [];

  for (const item of items) {
    const p = itemToPost(item, industry, topicFocus);
    if (p) out.push(p);
  }

  return out;
}

export async function generateSinglePost(
  system: string,
  user: string,
  industry: string,
  topicFocus: string,
): Promise<GeneratedPost | null> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: system,
  });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    return null;
  }
  return itemToPost(parsed, industry, topicFocus);
}
