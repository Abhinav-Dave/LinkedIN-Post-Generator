import fs from "fs";
import path from "path";
import { styleGuideSchema, type StyleGuide } from "@/lib/types";

const MINIMAL_STYLE_GUIDE: StyleGuide = {
  version: "0.0-fallback",
  generated_at: "1970-01-01T00:00:00.000Z",
  hook_archetypes: [
    {
      name: "Specific number opener",
      structure: "[Metric] in [timeframe] — what changed",
      example_scaffold: "We improved [X] by [Y%] in [Z weeks] using [tool].",
    },
    {
      name: "Workflow story",
      structure: "Constraint → decision → outcome",
      example_scaffold: "We had [constraint]. We chose [approach]. Result: [outcome].",
    },
    {
      name: "Question with stakes",
      structure: "What would you do if [constraint]?",
      example_scaffold: "What would you ship if you could only use [one tool] this week?",
    },
  ],
  length_range: { p25: 850, p75: 1280 },
  line_break_density_norm: 2.3,
  credibility_moves: [
    "Name the exact tool or surface",
    "Include one measurable outcome or timeframe",
    "Reference a concrete scenario, not abstractions",
  ],
  cta_patterns: {
    high_engagement: ["Ask one specific follow-up tied to the reader's stack or team"],
    low_engagement: [],
  },
  anti_patterns: [
    "Generic hype with no example",
    "Buzzwords without a workflow",
    "Claims with no number, tool, or timeframe",
  ],
};

export function getStyleGuidePath(): string {
  const override = process.env.STYLE_GUIDE_PATH?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), "data", "style_guide.json");
}

export type LoadedStyleGuide = {
  guide: StyleGuide;
  /** False when JSON was missing/invalid and the minimal fallback was used. */
  fromFile: boolean;
};

function readStyleGuideFile(): LoadedStyleGuide {
  const file = getStyleGuidePath();
  try {
    const raw = fs.readFileSync(file, "utf8");
    const json: unknown = JSON.parse(raw);
    const guide = styleGuideSchema.parse(json);
    return { guide, fromFile: true };
  } catch (e) {
    console.error(
      "[style_guide] Missing or invalid style_guide.json — using minimal fallback. Path:",
      file,
      e,
    );
    return { guide: MINIMAL_STYLE_GUIDE, fromFile: false };
  }
}

/**
 * Read and validate `data/style_guide.json`. On missing file or parse errors,
 * returns PRD §14 minimal fallback and logs (stderr).
 */
export function loadStyleGuide(): StyleGuide {
  return readStyleGuideFile().guide;
}

/** Same as `loadStyleGuide` plus `fromFile` for diagnostics. */
export function loadStyleGuideMeta(): LoadedStyleGuide {
  return readStyleGuideFile();
}

/**
 * Compact, prompt-oriented summary (target ≤500 tokens is enforced upstream in prompt_builder).
 */
export function getStyleGuideSummary(guide?: StyleGuide): string {
  const g = guide ?? loadStyleGuide();
  const lines: string[] = [
    `Style guide v${g.version} (generated ${g.generated_at})`,
    "",
    "Hook archetypes:",
    ...g.hook_archetypes.map(
      (h) => `- ${h.name}: ${h.structure} | Scaffold: ${h.example_scaffold}`,
    ),
    "",
    `Length p25–p75 chars: ${g.length_range.p25}–${g.length_range.p75}; line breaks ~${g.line_break_density_norm} per post.`,
    "",
    "Credibility moves:",
    ...g.credibility_moves.map((c) => `- ${c}`),
    "",
    "CTA — high engagement:",
    ...g.cta_patterns.high_engagement.map((c) => `- ${c}`),
    "CTA — low engagement:",
    ...g.cta_patterns.low_engagement.map((c) => `- ${c}`),
    "",
    "Anti-patterns to avoid:",
    ...g.anti_patterns.map((a) => `- ${a}`),
  ];
  return lines.join("\n");
}

/** Alias for existing call sites (`prompt_builder`, `pipeline`). */
export const styleGuideSummary = getStyleGuideSummary;

/**
 * @internal — test hook for injecting path or guide without env.
 */
export const __styleGuideTestHooks = {
  MINIMAL_STYLE_GUIDE,
  styleGuideSchema,
};
