import fs from "fs";
import path from "path";
import { styleGuideSummary, loadStyleGuide } from "@/lib/style_guide";
import { topTrendsForPrompt } from "@/lib/trend_brief";

function readPromptFile(name: string): string {
  const p = path.join(process.cwd(), "prompts", name);
  return fs.readFileSync(p, "utf8");
}

export type BuildPromptParams = {
  industry: string;
  topicFocus: string;
  numPosts: number;
  minChars?: number;
  maxChars?: number;
};

export function buildPrompt(params: BuildPromptParams): { system: string; user: string } {
  const system = readPromptFile("system_v1.txt");
  const guide = loadStyleGuide();
  const summary = styleGuideSummary(guide);
  const trends = topTrendsForPrompt(3, 7);
  const trendBriefJson = JSON.stringify(trends);
  const minC = params.minChars ?? 600;
  const maxC = params.maxChars ?? 2000;

  let generation = readPromptFile("generation_v1.txt");
  generation = generation
    .replaceAll("[STYLE_GUIDE_SUMMARY — max 500 tokens]", summary)
    .replaceAll("[STYLE_GUIDE_SUMMARY]", summary)
    .replaceAll("[TREND_BRIEF_JSON]", trendBriefJson)
    .replaceAll("[N]", String(params.numPosts))
    .replaceAll("[INDUSTRY]", params.industry)
    .replaceAll("[TOPIC_FOCUS]", params.topicFocus)
    .replaceAll("[MIN_CHARS]", String(minC))
    .replaceAll("[MAX_CHARS]", String(maxC));

  const directive = readPromptFile("directive_v1.txt")
    .replaceAll("[N]", String(params.numPosts))
    .replaceAll("[INDUSTRY]", params.industry)
    .replaceAll("[TOPIC_FOCUS]", params.topicFocus);

  const user = `${generation}\n\n---\n${directive}`;

  return { system, user };
}

export function buildRegenerateOnePrompt(args: {
  industry: string;
  topicFocus: string;
  errors: string[];
  styleSummary: string;
  trendBriefJson: string;
}): { system: string; user: string } {
  const system = readPromptFile("system_v1.txt");
  const user = `
STYLE GUIDE SUMMARY:
${args.styleSummary}

TREND BRIEF (top by relevance):
${args.trendBriefJson}

REGENERATE exactly ONE LinkedIn post. Previous version failed lint:
${args.errors.join("; ")}

Industry: ${args.industry}
Topic focus: ${args.topicFocus}

Rules: 600–2000 chars, hook clarity self-score >= 7, credibility signal, no banned openers.
Output a single JSON object (not array) matching the post schema with all fields.
JSON only. No markdown.
`.trim();
  return { system, user };
}

export function getDefaultIndustryTopic(): { industry: string; topicFocus: string } {
  const p = path.join(process.cwd(), "config", "topics.json");
  const topics = JSON.parse(fs.readFileSync(p, "utf8")) as {
    industry: string;
    topic_focus: string[] | string;
  };
  const industry = topics.industry;
  const topicFocus = Array.isArray(topics.topic_focus)
    ? topics.topic_focus.slice(0, 3).join(", ")
    : String(topics.topic_focus);
  return { industry, topicFocus };
}
