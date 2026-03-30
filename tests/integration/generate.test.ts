import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll, afterEach } from "vitest";
import { z } from "zod";
import { rateLimitGenerate, resetRateLimitStore } from "@/lib/rate_limit";
import { generatedPostSchema } from "@/lib/types";
import { makeMockPostBatch } from "../fixtures/mock_llm_posts";
import type { GenerateBatchInput } from "@/lib/types";

vi.mock("@/lib/generator", () => ({
  generateBatch: vi.fn(),
  generateSinglePost: vi.fn(),
}));

import { generateBatch, generateSinglePost } from "@/lib/generator";

const generateFlowResultSchema = z.object({
  batch_id: z.string().min(1),
  generated_at: z.string(),
  prompt_version: z.string(),
  posts: z.array(generatedPostSchema).min(1),
  failed_slots: z.number().int().nonnegative(),
  trend_brief_freshness: z.string().nullable(),
  style_guide_only: z.boolean(),
  warning_message: z.string().optional(),
});

describe("generate API — rate limit (deterministic)", () => {
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

describe("POST /api/generate — pipeline + mocked LLM (PRD §20)", () => {
  let tmpDir: string;
  let POST: typeof import("@/app/api/generate/route").POST;

  beforeAll(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lpg-generate-int-"));
    process.env.CORPUS_DB_PATH = path.join(tmpDir, "corpus.db");
    process.env.GEMINI_API_KEY = "";

    const route = await import("@/app/api/generate/route");
    POST = route.POST;
  });

  afterAll(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    delete process.env.CORPUS_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp cleanup best-effort */
    }
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    resetRateLimitStore();
    vi.mocked(generateBatch).mockImplementation(async (input: GenerateBatchInput) =>
      makeMockPostBatch(input.numPosts, input.industry, input.topicFocus),
    );
    vi.mocked(generateSinglePost).mockImplementation(
      async (_s, _u, industry, topicFocus) =>
        makeMockPostBatch(1, industry, topicFocus)[0] ?? null,
    );
  });

  it("returns 200 and JSON matching output schema with mocked Gemini", async () => {
    const res = await POST(
      ipRequest("10.0.0.42", {
        industry: "Computer Science / B2B SaaS",
        topic_focus: "Claude + Excel Workflows",
        num_posts: 5,
        skip_warn_lint: true,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = generateFlowResultSchema.safeParse(json);
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
    if (parsed.success) {
      expect(parsed.data.posts).toHaveLength(5);
      for (const p of parsed.data.posts) {
        expect(p.body.length).toBeGreaterThanOrEqual(600);
        expect(p.hook_clarity_score).toBeGreaterThanOrEqual(7);
      }
    }
    expect(vi.mocked(generateBatch)).toHaveBeenCalled();
  });

  it("passes industry and topic_focus into generateBatch", async () => {
    await POST(
      ipRequest("10.0.0.43", {
        industry: "Healthcare IT",
        topic_focus: "FHIR automation",
        num_posts: 2,
        skip_warn_lint: true,
      }),
    );

    expect(vi.mocked(generateBatch)).toHaveBeenCalledWith(
      expect.objectContaining({
        industry: "Healthcare IT",
        topicFocus: "FHIR automation",
        numPosts: 2,
      }),
    );
  });
});

function ipRequest(ip: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}
