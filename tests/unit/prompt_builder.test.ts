import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompt_builder";

describe("prompt_builder", () => {
  it("assembles system and user layers", () => {
    const { system, user } = buildPrompt({
      industry: "Computer Science / B2B SaaS",
      topicFocus: "Claude + Excel",
      numPosts: 3,
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
});
