import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { rateLimitGenerate, resetRateLimitStore } from "@/lib/rate_limit";

describe("generate API contract (smoke)", () => {
  beforeEach(() => {
    resetRateLimitStore();
    vi.stubEnv("GEMINI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rate limits after many calls", () => {
    for (let i = 0; i < 10; i++) {
      expect(rateLimitGenerate("1.2.3.4").ok).toBe(true);
    }
    const last = rateLimitGenerate("1.2.3.4");
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.retryAfterSec).toBeGreaterThan(0);
  });
});
