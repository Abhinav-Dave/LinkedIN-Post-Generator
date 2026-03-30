import fs from "fs";
import path from "path";

function readPromptFile(name: string): string {
  const p = path.join(process.cwd(), "prompts", name);
  return fs.readFileSync(p, "utf8");
}

export type BuildPromptParams = {
  industry: string;
  topicFocus: string;
  numPosts: number;
  /** Injected by caller (e.g. pipeline) — keeps this module free of DB reads. */
  styleSummary: string;
  trendBriefJson: string;
  minChars?: number;
  maxChars?: number;
};

export function buildPrompt(params: BuildPromptParams): { system: string; user: string } {
  const system = readPromptFile("system_v1.txt");
  const summary = params.styleSummary;
  const trendBriefJson = params.trendBriefJson;
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

export type BuildRegenerateOnePromptArgs = {
  industry: string;
  topicFocus: string;
  errors: string[];
  styleSummary: string;
  trendBriefJson: string;
  minChars?: number;
  maxChars?: number;
};

/**
 * Same contract as `buildPrompt` (generation_v1 + directive_v1) with N=1, plus a regeneration
 * suffix so repaired posts follow the full template, not a thin inline retry.
 */
export function buildRegenerateOnePrompt(args: BuildRegenerateOnePromptArgs): { system: string; user: string } {
  const minC = args.minChars ?? 600;
  const maxC = args.maxChars ?? 2000;
  const { system, user: baseUser } = buildPrompt({
    industry: args.industry,
    topicFocus: args.topicFocus,
    numPosts: 1,
    styleSummary: args.styleSummary,
    trendBriefJson: args.trendBriefJson,
    minChars: minC,
    maxChars: maxC,
  });

  let suffix = readPromptFile("regenerate_single_suffix_v1.txt");
  suffix = suffix.replaceAll("[REGENERATION_ERRORS]", args.errors.map((e) => `- ${e}`).join("\n"));

  const user = `${baseUser}\n\n${suffix}`;
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
