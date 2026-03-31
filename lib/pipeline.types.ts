import type { GeneratedPost } from "@/lib/types";

/**
 * Options for the full generate flow (API body or programmatic call).
 * Field names match `POST /api/generate` (PRD §14).
 */
export type RunGenerationPipelineOptions = {
  industry?: string;
  topic_focus?: string;
  num_posts?: number;
  /** When false, skip `lintPostWarnLlm` (faster / cheaper). Default: true */
  runWarnLint?: boolean;
  /** Passed to `generateBatch` when set (positive integers only). */
  min_chars?: number;
  max_chars?: number;
  /**
   * PRD §14 `voice_preset`. Only `"plain_spartan"` is applied (see `VOICE_PRESET_PLAIN_SPARTAN`);
   * other values are ignored (no overlay).
   */
  voice_preset?: string;
};

/**
 * PRD §14 — `POST /api/generate` 200 JSON shape, plus optional operational fields.
 */
export type GenerateFlowResult = {
  batch_id: string;
  generated_at: string;
  prompt_version: string;
  posts: GeneratedPost[];
  failed_slots: number;
  trend_brief_freshness: string | null;
  style_guide_only: boolean;
  warning_message?: string;
};
