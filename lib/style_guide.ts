import fs from "fs";
import path from "path";
import { z } from "zod";

const styleGuideSchema = z.object({
  version: z.string(),
  generated_at: z.string(),
  hook_archetypes: z.array(
    z.object({
      name: z.string(),
      structure: z.string().optional(),
      example_scaffold: z.string().optional(),
    }),
  ),
  length_range: z.object({ p25: z.number(), p75: z.number() }),
  line_break_density_norm: z.number().optional(),
  credibility_moves: z.array(z.string()),
  cta_patterns: z.object({
    high_engagement: z.array(z.string()),
    low_engagement: z.array(z.string()),
  }),
  anti_patterns: z.array(z.string()),
});

export type StyleGuide = z.infer<typeof styleGuideSchema>;

const MINIMAL_FALLBACK: StyleGuide = {
  version: "fallback-1.0",
  generated_at: new Date().toISOString(),
  hook_archetypes: [
    {
      name: "Specific number opener",
      structure: "[Metric] in [timeframe] — what we learned",
      example_scaffold: "We cut [X] by [Y%] in [Z weeks] using [tool].",
    },
    {
      name: "Counterintuitive framing",
      structure: "Everyone says X. In practice, Y wins because…",
      example_scaffold: "Everyone automates [X]. We got speed from [Y] instead.",
    },
    {
      name: "Question + constraint",
      structure: "What would you do if [constraint]? Here's what we tried.",
      example_scaffold: "What if you could only use [tool A] + [tool B]?",
    },
  ],
  length_range: { p25: 850, p75: 1280 },
  line_break_density_norm: 2.3,
  credibility_moves: [
    "Name the tool",
    "Quote a measured outcome",
    "Reference a dated rollout or benchmark",
  ],
  cta_patterns: { high_engagement: ["Ask a specific question"], low_engagement: ["Thoughts?"] },
  anti_patterns: [
    "In today's world",
    "Excited to share",
    "Game changer",
    "Let that sink in",
    "Generic advice without an example",
  ],
};

export function getStyleGuidePath(): string {
  return path.join(process.cwd(), "data", "style_guide.json");
}

export function loadStyleGuide(): StyleGuide {
  const p = getStyleGuidePath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const r = styleGuideSchema.safeParse(parsed);
    if (r.success && r.data.hook_archetypes.length >= 1) return r.data;
  } catch (e) {
    console.error("[style_guide] missing or invalid; using fallback", e);
  }
  return MINIMAL_FALLBACK;
}

/** Compact text for prompt injection (target ≤ ~500 tokens — heuristic char cap). */
export function styleGuideSummary(g: StyleGuide, maxChars = 2800): string {
  const hooks = g.hook_archetypes
    .map((h) => `- ${h.name}: ${h.structure ?? ""} ${h.example_scaffold ?? ""}`.trim())
    .join("\n");
  const anti = g.anti_patterns.slice(0, 12).join("; ");
  const moves = g.credibility_moves.join("; ");
  const len = `Target length P25–P75 chars: ${g.length_range.p25}–${g.length_range.p75}`;
  const parts = [
    `Style guide v${g.version}. ${len}.`,
    `Hook archetypes:\n${hooks}`,
    `Credibility moves: ${moves}.`,
    `Anti-patterns to avoid: ${anti}.`,
  ];
  let s = parts.join("\n\n");
  if (s.length > maxChars) s = s.slice(0, maxChars) + "\n…";
  return s;
}
