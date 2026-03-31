import { describe, expect, it } from "vitest";
import { buildPrompt, buildRegenerateOnePrompt } from "@/lib/prompt_builder";
import { VOICE_PRESET_PLAIN_SPARTAN } from "@/lib/types";

describe("prompt_builder", () => {
  it("assembles system and user layers", () => {
    const { system, user } = buildPrompt({
      industry: "Computer Science / B2B SaaS",
      topicFocus: "Claude + Excel",
      numPosts: 3,
      styleSummary: "Hook archetypes: test opener | Length p25–p75: 800–1200",
      trendBriefJson: JSON.stringify({ items: [] }),
      minChars: 600,
      maxChars: 2000,
    });
    expect(system.length).toBeGreaterThan(20);
    expect(user).toContain("Computer Science / B2B SaaS");
    expect(user).toContain("Claude + Excel");
    expect(user).toContain("600");
    expect(user).toContain("2000");
    expect(user).not.toContain("[STYLE_GUIDE_SUMMARY]");
    expect(user).not.toContain("[TREND_BRIEF_JSON]");
  });

  it("buildRegenerateOnePrompt uses full generation contract + regeneration suffix", () => {
    const { system, user } = buildRegenerateOnePrompt({
      industry: "B2B",
      topicFocus: "APIs",
      errors: ["BLOCK: below_min_length", "BLOCK: no_credibility_signal"],
      styleSummary: "Summary line",
      trendBriefJson: "[]",
    });
    expect(system.length).toBeGreaterThan(10);
    expect(user).toContain("BLOCK: below_min_length");
    expect(user).toContain("Summary line");
    expect(user).toContain("Generate exactly 1 LinkedIn posts");
    expect(user).toContain("REGENERATION");
    expect(user).not.toContain("[REGENERATION_ERRORS]");
    expect(user).not.toContain("[STYLE_GUIDE_SUMMARY]");
    expect(user).not.toContain("[TREND_BRIEF_JSON]");
  });

  it("replaces all generation template placeholders (no stray hooks)", () => {
    const { user } = buildPrompt({
      industry: 'Computer / B2B "; synthetic',
      topicFocus: "<extra>edge</extra>",
      numPosts: 2,
      styleSummary: "safe summary",
      trendBriefJson: "{}",
    });
    expect(user).not.toContain("[INDUSTRY]");
    expect(user).not.toContain("[TOPIC_FOCUS]");
    expect(user).not.toContain("[N]");
    expect(user).not.toContain("[MIN_CHARS]");
    expect(user).not.toContain("[MAX_CHARS]");
    expect(user).toContain('Computer / B2B "; synthetic');
    expect(user).toContain("<extra>edge</extra>");
  });

  it("includes anti-AI and human-voice directives in the assembled prompt", () => {
    const { user } = buildPrompt({
      industry: "Computer Science / B2B SaaS",
      topicFocus: "Claude + Excel",
      numPosts: 2,
      styleSummary: "style summary",
      trendBriefJson: "[]",
      minChars: 600,
      maxChars: 2000,
    });

    // Anti-generic / anti-templated voice directives.
    expect(user).toContain("Do not produce generic, vague, repetitive, or advice-blog-style content.");
    expect(user).toContain("Do not drift into generic advice-blog language");
    expect(user).toContain("Do not use fake citation-style phrasing");

    // Human cadence directives.
    expect(user).toContain("Concrete is required, but delivery should feel human, not robotic or over-formal.");
    expect(user).toContain("Use conversational cadence with mixed sentence lengths");
    expect(user).toContain("Do not produce generic, vague, repetitive, or templated posts.");
  });

  it("appends plain_spartan overlay when voicePreset is plain_spartan", () => {
    const { user } = buildPrompt({
      industry: "B2B",
      topicFocus: "APIs",
      numPosts: 2,
      styleSummary: "summary",
      trendBriefJson: "[]",
      voicePreset: VOICE_PRESET_PLAIN_SPARTAN,
    });
    expect(user).toContain("VOICE PRESET: plain_spartan");
    expect(user).toContain("BANNED WORDS AND PHRASES");
    expect(user).toContain("em dash");
  });

  it("buildRegenerateOnePrompt includes plain_spartan overlay when requested", () => {
    const { user } = buildRegenerateOnePrompt({
      industry: "B2B",
      topicFocus: "APIs",
      errors: ["BLOCK: test"],
      styleSummary: "S",
      trendBriefJson: "[]",
      voicePreset: VOICE_PRESET_PLAIN_SPARTAN,
    });
    expect(user).toContain("VOICE PRESET: plain_spartan");
    expect(user).toContain("BLOCK: test");
  });
});
