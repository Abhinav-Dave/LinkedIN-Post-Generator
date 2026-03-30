# Agent status

Rolling record of **what each agent implemented**. Cross-check **`docs/AGENT_HANDOFFS.md`** for roles and allowed paths. Update **only your agent’s section** when you finish work.

| Agent | Role (short)                         | Status in this file      |
| ----- | ------------------------------------ | ------------------------ |
| **A** | Ingestion (Python + GitHub Actions)  | Documented below          |
| **B** | Data layer (SQLite)                  | Documented below          |
| **C** | Reads (trends + style guide)         | Documented below          |
| **D** | Lint + similarity                    | Documented below          |
| **E** | LLM (Gemini) + prompts               | Documented below          |
| **F** | Pipeline orchestration               | Documented below          |
| **G** | API routes                           | Documented below          |
| **H** | UI                                   | Documented below          |
| **I** | Tests + QA                           | Documented below          |
| **J** | Supabase / hosted DB (later)        | Placeholder — add entry   |

---

## Agent A — Ingestion (Python + GitHub Actions)

**Handoff:** `docs/AGENT_HANDOFFS.md` → Agent A. **Scope:** `ingestion/*`, `ingest_*.yml`, `requirements.txt`, `docs/INGESTION.md`, `config/topics.json` (subreddits list only). **Not in scope:** `app/**`, `lib/**` TypeScript, `prompts/**` (except read-only `lib/db.ts` for schema names).

### Summary

- Trend rows → SQLite `trend_items`; corpus → Apify actor trigger + app webhook (unchanged pattern).
- Config-driven Reddit subs + `CORPUS_DB_PATH` parity with Node; corpus CLI skips cleanly without token; workflows wired for env/secrets; runbook added.

### Files touched

| Path | Change |
| ---- | ------ |
| `ingestion/paths.py` | **New** — `get_corpus_db_path()` (`CORPUS_DB_PATH` or `data/corpus.db`). |
| `ingestion/__init__.py` | **New** — package marker. |
| `ingestion/trend_ingestor.py` | `sys.path` bootstrap; `topics.json` + fallback; `reddit_subreddits`; `get_corpus_db_path()`; 0-row stderr note. |
| `ingestion/corpus_ingestor.py` | Missing `APIFY_API_TOKEN` → SKIP + exit 0; truncated Apify errors; security/doc notes. |
| `config/topics.json` | **`reddit_subreddits`** array (was hardcoded in Python). |
| `.github/workflows/ingest_trends.yml` | `CORPUS_DB_PATH` on step. |
| `.github/workflows/ingest_corpus.yml` | `secrets.APIFY_API_TOKEN` in `env`. |
| `docs/INGESTION.md` | **New** — runbook (actor id, LinkedIn URLs for `profileUrls`, CI). |

### Baseline from others (not Agent A edits)

HN/Reddit/GitHub trend sources, Apify POST `corpus_ingestor`, `apify_config.json`, corpus webhook route existed before this pass.

### Notes for downstream agents

- Bare **`python`** does **not** load `.env`; `corpus_ingestor` uses **`os.environ` only**. CI uses **GitHub Secrets**, not local `.env`.
- **`ingest_trends`** DB on the runner is **ephemeral** unless you add persistence.
- Trends need **no** Apify token; corpus trigger **does**.

### Concerns / follow-ups

- `npm audit` issues (Next/eslint chain) — **out of Agent A scope**.
- Reddit/GitHub HTML parsers may **break** if sites change.
- Corpus **exit 0** when token missing → watch logs for **`SKIP`** so missing secrets are not silent forever.

### Verification (Agent A)

`compileall` on `ingestion/`; `trend_ingestor.py` wrote rows locally; `corpus_ingestor.py` with empty token → exit 0 + SKIP; `npm run lint` + `tsc --noEmit` clean (no TS edits in scope).

---

## Agent B — Data layer (SQLite)

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent B. **Scope:** `lib/db.ts`, `lib/migrations.ts`, `tests/unit/db.test.ts` only (no `app/**`, `ingestion/**`, `lib/pipeline.ts`, `lib/generator.ts`).

### Summary

- **`getDb()`** — singleton open, `data/corpus.db` (mkdir parent), WAL, then **`runMigrations()`**.
- **Migrations** — `PRAGMA user_version`; v1 = PRD §13 tables (`corpus_posts`, `trend_items`, `generated_posts`) + trend indexes. Idempotent for existing DBs.
- **Env:** **`CORPUS_DB_PATH`** — optional absolute or cwd-relative path (aligns with Python `ingestion/paths.py`; tests use a temp file via dynamic import).
- **Exports:** `openDb()` = alias of `getDb()`; `closeDb()`; row/insert types; accessors for corpus / trends / generated (incl. `upsertTrendItem` matching Python `ON CONFLICT`).
- **Docs in code:** `db.ts` header — Node-only (`better-sqlite3`), **Vercel/serverless ephemeral FS** warning.

### Files touched

| Path | Change |
| ---- | ------ |
| `lib/migrations.ts` | **New** — `runMigrations`, `SCHEMA_VERSION`, DDL v1. |
| `lib/db.ts` | Migrated bootstrap to migrations module; added `getDb`, types, accessors; kept `insertGeneratedPost` try/catch for brittle FS. |
| `tests/unit/db.test.ts` | **New** — tmp `CORPUS_DB_PATH`, `user_version`, table list, round-trip sample rows. |

### Notes for downstream agents

- Import DB from **`@/lib/db`** — prefer **`getDb()`**; **`openDb()`** still valid.
- **`TrendItemRow`** reads use `@/lib/types`; **`getTrendItem`** returns that type.
- **`insertCorpusPost` / `insertCorpusPosts`** — corpus webhook uses **`insertCorpusPosts`** via **`lib/corpus_ingestion.ts`** (Agent G).

### Concerns / follow-ups

- SQLite on **serverless** = no durable local DB across deploys/instances — PRD/J may move to Supabase/hosted store.
- **`insertGeneratedPost`** swallows errors and logs — intentional for read-only FS; callers don’t get failure signal.
- New schema changes → add **`migrations.ts`** step and bump **`SCHEMA_VERSION`**; keep **Python `trend_ingestor` / PRD** in sync if DDL diverges.

### Verification (Agent B)

`npm test` (incl. `db.test.ts`), `npm run lint` clean.

---

## Agent C — Reads (trends + style guide)

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent C. **Scope:** `lib/trend_ttl.ts`, `lib/trend_brief.ts`, `lib/style_guide.ts`, `lib/sanitize.ts`, `lib/types.ts` (append-only trends/style types). **Not in scope:** `lib/generator.ts`, `lib/prompt_builder.ts`, `lib/pipeline.ts`, `app/**`.

### Summary

- **Single TTL owner:** `lib/trend_ttl.ts` — 7-day `published_at` window, 24h `cached_at` freshness, `isActiveTrendRow`, helpers + `__trendTtlTestHooks` (clock inject via `nowMs` on public APIs where exposed).
- **Trend reads:** `listEligibleTrendRows` (SQL: `expired=0`, `relevance_score >= min`, then JS filter by TTL) → `getActiveTrends`, `fetchTrendBrief` (raw rows for API), `topTrendsForPrompt` (sanitized items for prompts), `markExpiredTrends` (`UPDATE … published_at < cutoff`), `serializeTrendBriefForPrompt`.
- **Style guide:** `loadStyleGuide()` → parsed `StyleGuide` (zod); `loadStyleGuideMeta()` adds `fromFile`; `getStyleGuideSummary` + alias **`styleGuideSummary`**; missing/invalid JSON → minimal fallback (logged); optional env **`STYLE_GUIDE_PATH`**.
- **Sanitize:** `sanitizeForPromptInjection` (headings/tags/control chars); **`sanitizeTrendText`** = legacy name for `app/api/trends`.
- **Types (append):** `styleGuideSchema`, `StyleGuide`, `TrendBriefItem`, `ActiveTrendsBrief`.

### Files touched

| Path | Change |
| ---- | ------ |
| `lib/trend_ttl.ts` | **New** — TTL constants + rules only. |
| `lib/trend_brief.ts` | **New** — DB reads + compat exports (see below). |
| `lib/style_guide.ts` | **New** — JSON load, summary, fallback. |
| `lib/sanitize.ts` | **New** — prompt-oriented sanitization. |
| `lib/types.ts` | **Append** — style guide + brief types/schemas. |

### Backward compatibility (no edits to forbidden paths)

Existing **`pipeline`**, **`prompt_builder`**, **`app/api/trends`**, and **`tests/unit/trend_brief.test.ts`** expect: `fetchTrendBrief`, `topTrendsForPrompt`, `markExpiredTrends`, `styleGuideSummary`, `loadStyleGuide(): StyleGuide`, `sanitizeTrendText` — all wired from Agent C modules.

### Notes for downstream agents

- **Prefer** `getActiveTrends()` + `getStyleGuideSummary()` / `loadStyleGuide()` for new code; use `trend_ttl` for any new trend-age logic — **do not re-declare 7d/24h constants elsewhere.**
- **`fetchTrendBrief`** returns **unsanitized** rows; API layer may apply **`sanitizeTrendText`** again (intentional double-path).
- **`ActiveTrendsBrief`:** `totalActiveInWindow` = count before `limit` slice; `briefCachedAt` = max `cached_at` among returned **items**; `cacheFresh` uses 24h rule from `trend_ttl`.

### Concerns / follow-ups

- **`markExpiredTrends`** relies on `published_at` ISO sortability; skewed/invalid ISO rows may behave oddly (`Date.parse`).
- **`npm audit --audit-level=high`** still flags transitive Next/vitest/eslint issues — **not introduced here**; upgrade track is separate.
- Agent **I** can extend tests via `__*` test hooks; minimal coverage today.

### Verification (Agent C)

`npm run lint`, `npx tsc --noEmit`, `npm test` — all passed after compat surface.

---

## Agent D — Lint + similarity

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent D. **Scope:** `lib/trigram.ts`, `lint/block_rules.ts`, `lib/linter.ts`, `lib/types.ts` (lint flags only — **no** edits made), `tests/unit/deterministic_lint.test.ts`. **Not in scope:** `lib/generator.ts`, `lib/prompt_builder.ts`, `prompts/**`, `app/**`.

### Summary

- **Entry API:** `runDeterministicLint(post, { corpusTexts })` → `{ blockReasons, maxSimilarity }` (PRD §10.1 deterministic BLOCK + trigram Jaccard vs corpus; BLOCK if similarity **strictly > 0.4**).
- **`lintPostDeterministic`** now delegates BLOCK/similarity to that helper; still adds deterministic WARN (e.g. `trend_reaction` + `trend_source === "none"`).
- **Similarity:** implemented only in **`lib/trigram.ts`** (word/token trigrams, not character n-grams — one-line comment in file). **`lint/similarity.py` deleted** to avoid duplicate logic; **`README.md`** “Lint / similarity” notes TS-only.
- **BLOCK rules** in `lint/block_rules.ts`: PRD-exact banned openers doc comment; `BANNED_STARTS` `as const`; min length **600**; credibility + hook `< 7` + corpus sim unchanged from prior impl.

### Files touched

| Path | Change |
| ---- | ------ |
| `lib/linter.ts` | **`runDeterministicLint`**, `DeterministicLintContext`; `lintPostDeterministic` wraps it. |
| `lib/trigram.ts` | Comment clarifying **word** trigrams; Javadoc tweak on `trigramJaccard`. |
| `lint/block_rules.ts` | PRD §10.1 comment on openers + `SIM_BLOCK` comment. |
| `lint/similarity.py` | **Removed** (use TS). |
| `README.md` | TS-only similarity note. |
| `tests/unit/deterministic_lint.test.ts` | **New** — empty corpus pass, duplicate corpus BLOCK, `Unpopular opinion:` × `contrarian`. |

### Notes for downstream agents

- Import **`runDeterministicLint`** or **`lintPostDeterministic`** from **`@/lib/linter`** (`pipeline.ts` already uses `lintPostDeterministic`).
- **WARN LLM** path unchanged (`lintPostWarnLlm`); needs `GEMINI_*` + `prompts/lint_v1.txt`.
- **`docs/PRD.md`** still lists `similarity.py` in tree/checklist — **stale** vs repo; align in a docs pass if desired.

### Concerns / follow-ups

- **`Unpopular opinion:`** BLOCK uses **`post_type !== "contrarian"`** only; PRD also mentions “genuinely contrarian content” — no NLP check.
- **Credibility** heuristic (`hasCredibilitySignal`) is pattern-based; edge cases may false positive/negative vs human editor.
- Trigram normalization differs slightly from old Python (`\p{L}\p{N}` vs `\w`); scores can differ on odd unicode — acceptable for MVP.

### Verification (Agent D)

`npm run lint`, `npx tsc --noEmit`, `npm test` (incl. new unit tests).

---

## Agent E — LLM (Gemini) + prompts

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent E. **Scope:** `lib/prompt_builder.ts`, `lib/generator.ts`, `prompts/**` (unchanged content), `lib/types.ts` (append-only batch/hook constants + Zod). **Not in scope:** primary ownership of `lib/pipeline.ts` (minimal glue only — F owns orchestration).

### Summary

- **`generateBatch(input)`** — Single entry: Zod-validates `GenerateBatchInput` → `buildPrompt` → Gemini JSON batch → **one retry** if batch parse/call fails (PRD §770) → **per-post hook retries** (max **2**) when `hook_clarity_score < 7` via `buildRegenerateOnePrompt` + `generateSinglePost` (PRD §8.2). Hook passes run **sequentially** (rate limits).
- **`generatePostsBatch` / `generateSinglePost`** — Lower-level; batch + single each **retry once** on malformed JSON. Keys: **`GEMINI_API_KEY`** or **`GOOGLE_GENERATIVE_AI_API_KEY`**; model: **`GEMINI_MODEL_MAIN`** default `gemini-2.5-flash` (see `.env.example`).
- **`prompt_builder`** — **`buildPrompt`** now requires **`styleSummary`** + **`trendBriefJson`** (callers inject; **no DB imports** here). **`buildRegenerateOnePrompt`** unchanged (used for deterministic pipeline regen + hook regen).
- **`types.ts` (append):** `HOOK_CLARITY_MIN_SCORE` (7), `HOOK_SCORE_MAX_RETRIES` (2), `GenerateBatchInput`, `generateBatchInputSchema`.

### Files touched

| Path | Change |
| ---- | ------ |
| `lib/types.ts` | Append — batch input type + Zod + hook constants. |
| `lib/prompt_builder.ts` | Injected `styleSummary` / `trendBriefJson`; removed `style_guide` / `trend_brief` imports. |
| `lib/generator.ts` | `generateBatch`, shared Gemini call, batch + single JSON retries, `ensureHookClarity`; exported `stripJsonFence`. |
| `lib/pipeline.ts` | Calls `generateBatch` with `styleGuideSummary(loadStyleGuide())` + `JSON.stringify(topTrendsForPrompt(3, 7))`; trimmed `fillShortBatch` args. |
| `tests/unit/prompt_builder.test.ts` | Passes dummy injected style/trend strings. |

### Notes for downstream agents

- **API / F:** Prefer **`generateBatch({ industry, topicFocus, numPosts, styleSummary, trendBriefJson, minChars?, maxChars? })`** for raw posts; still run **deterministic lint + DB** after (see `pipeline` pattern). **`buildPrompt`** alone needs the two injected strings from Agent C reads.
- **Pipeline** still does **separate** deterministic refine (`refinePost`, up to 3 iterations) — that is **not** the same as generator hook retries; both can run on a post.
- Prompt files stay versioned under **`prompts/*_v1.txt`**; no secrets in repo.

### Concerns / follow-ups

- **Hook self-score vs deterministic lint:** PRD says banned opener / BLOCK rules **override** optimistic hook scores; posts can exit generator with score ≥7 and still **BLOCK** in `lintPostDeterministic`.
- **`npm audit`:** Next/Vitest/eslint transitive issues unchanged by this work.
- **Parallelism:** Only batch posts are parallelized implicitly (one request); hook regen is **serial per post** — increase concurrency only if quotas allow.
- **Observability:** No structured logging of retry counts/costs yet — optional for Agent I/G.

### Verification (Agent E)

`npm run lint`, `npx tsc --noEmit`, `npm test` — all passed after changes.

---

## Agent F — Pipeline (orchestration)

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent F. **Primary scope:** `lib/pipeline.ts`, `lib/pipeline.types.ts`. **Also touched (wiring):** `app/api/generate/route.ts` — single call to `runGenerateFlow(req)` so JSON body is read once in the pipeline (not duplicated in the route). **Not edited:** `lib/generator.ts`, `lib/db.ts`, `lib/linter.ts` bodies (consume exports only).

### Summary

- **Orchestration order:** (C) `markExpiredTrends` + `styleGuideSummary(loadStyleGuide())` + `topTrendsForPrompt` → JSON string for prompts → (E) **`generateBatch({ industry, topicFocus, numPosts, styleSummary, trendBriefJson, minChars?, maxChars? })`** → short-batch top-up via `generateSinglePost` + `buildRegenerateOnePrompt` if needed → deterministic **refine** loop (BLOCK → regenerate) → (D) `lintPostDeterministic` + optional `lintPostWarnLlm` (`skip_warn_lint` / `runWarnLint: false`) → **persistence** `insertGeneratedPost` per surviving post.
- **Exports:** `runGenerateFlow(req: Request)` — parses body (no logging of payload); `runGenerationPipeline(opts)` — same flow for tests/scripts. Types: `GenerateFlowResult`, `RunGenerationPipelineOptions` from `pipeline.types.ts`; `PipelineResult` = deprecated alias.
- **Defaults:** `minChars`/`maxChars` for batch → **600 / 2000** if `min_chars` / `max_chars` omitted or invalid on the wire; only **positive integers** accepted from JSON.
- **Response shape:** PRD §14 (`batch_id`, `generated_at`, `prompt_version`, `posts`, `failed_slots`, `trend_brief_freshness`) plus `style_guide_only`, `warning_message` when no fresh trends.

### Files touched

| Path | Change |
| ---- | ------ |
| `lib/pipeline.types.ts` | **New** — options + `GenerateFlowResult`. |
| `lib/pipeline.ts` | Module docstring (flow for agents); implementation + `runGenerateFlow`. |
| `app/api/generate/route.ts` | Uses `runGenerateFlow(req)` after rate limit; removed duplicate `req.json()` block. |

### Notes for downstream agents

- **Agent G** may own further route behavior; pipeline entry point is stable: **`runGenerateFlow`** or **`runGenerationPipeline`**.
- **`failed_slots`** counts posts dropped after refine (deterministic BLOCK could not clear in 3 tries), not Gemini outage.

### Concerns / follow-ups

- **`batch_id`** is generated at end of run and returned to client; **not** stored on rows (`generated_posts` has no batch FK) — OK for PRD snapshot; grouping would need schema/work from **B/J**.
- **`fillShortBatch`** uses single-post generation only — does not pass explicit min/max char args (defaults live inside single-post path).
- Original handoff said **pipeline-only** paths; route one-liner was added so `runGenerateFlow(req)` is actually used — coordinate with **G** if ownership splits.

### Verification (Agent F)

`npm run lint`, `npx tsc --noEmit`, `npx vitest run` — all green after changes.

---

## Agent G — API routes

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent G. **Scope:** Thin HTTP only in `app/api/**/route.ts`; **`lib/rate_limit.ts`** (already present); **`lib/webhook_secret.ts`**, **`lib/apify_dataset.ts`**, **`lib/corpus_ingestion.ts`** (new). **Not here:** pipeline/LLM/business logic (stays `lib/pipeline.ts`, `lib/*`).

### Summary

- **`POST /api/generate`** — Rate limit (10/hr per IP via `x-forwarded-for` / `x-real-ip`), delegates to **`runGenerateFlow`**; PRD §14 **500** shape unchanged; **429** adds `message` for clarity.
- **`GET /api/trends`** — Unchanged contract vs PRD §14; **`try/catch`** → **500** `{ error: "trends_unavailable", message }`.
- **`POST /api/ingestion/corpus`** — **401** if `APIFY_WEBHOOK_SECRET` set and secret missing/wrong; accepts **headers** (`x-webhook-secret`, `x-apify-webhook-secret`, `Authorization: Bearer`) **or** query **`secret` / `token` / `webhookSecret`**; **timing-safe** compare. Body: PRD Apify shape OR dev **`posts`** array. **Inline `posts`** → `insertCorpusPosts`; else **`eventData.actorRunId`** or **`eventData.resource.id`** → **`fetchActorRunDatasetItems`** (needs **`APIFY_API_TOKEN`**) → map loose scraper fields → DB. Errors: **400** `invalid_json`, **502** `ingestion_failed`.
- **If `APIFY_WEBHOOK_SECRET` unset** — webhook auth **skipped** (local/dev); **must set before public deploy**.

### Files touched

| Path | Change |
| ---- | ------ |
| `lib/webhook_secret.ts` | **New** — extract secret (header/query); `apifyWebhookSecretOk`. |
| `lib/apify_dataset.ts` | **New** — `GET /v2/actor-runs/:id/dataset/items`; Bearer token; no token in logs. |
| `lib/corpus_ingestion.ts` | **New** — `ingestCorpusFromWebhook`; replaces inline SQL in route; uses **`insertCorpusPosts`**. |
| `app/api/ingestion/corpus/route.ts` | Thin: auth → JSON → ingest; JSON errors. |
| `app/api/generate/route.ts` | **429** body + human `message`. |
| `app/api/trends/route.ts` | DB/API **try/catch** + JSON error. |

**Unchanged by G:** `app/api/trends/refresh/route.ts` (still placeholder POST).

### Notes for downstream agents

- **H (UI):** call **`GET /api/trends`**, **`POST /api/generate`** per PRD; handle **429** / new **502** on corpus if you add admin ingest UI.
- **I (tests):** `tests/integration/ingestion.test.ts` still stub; good targets: webhook secret matrix, mock `fetch` for Apify dataset.
- **Apify not activated on webhook URL yet** (local); secret in `.env` is fine for dev — production needs matching Apify webhook config.
- **`voice_preset`** in PRD §14 body — **not** wired in `runGenerateFlow` (Agent F / later).

### Concerns / follow-ups

- **Rate limit** is in-memory **`Map`** — resets on cold start; ineffective across many serverless instances (PRD “basic” only).
- **502** on corpus may expose short Apify error snippet in **`message`** — avoid logging full responses in shared telemetry.
- Dataset field names from **`linkedin-post-scraper`** may drift; **`corpus_ingestion`** mapping is defensive but not exhaustive.

### Verification (Agent G)

`npm run lint`, `npx tsc --noEmit` passed after changes.

---

## Agent H — UI

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent H. **Scope:** `app/page.tsx`, `app/layout.tsx` only (allowed to touch `tailwind.config.ts` / `app/globals.css` if needed — **not** modified this pass except layout token class). **Forbidden:** `lib/pipeline.ts` (or any pipeline internals); client uses **`fetch('/api/...')`** only.

### Summary

- **Trend brief sidebar:** `GET /api/trends` on mount; **skeleton** when list empty + loading; **stale-while-refresh** (skeleton only if `trends.length === 0` so Refresh keeps prior rows). **`trendsError`** for failed GET. Per-item **Source** link (`source_url`, `noopener noreferrer`), date snippet from `published_at`.
- **Refresh:** `POST /api/trends/refresh` → reload trends; **`refreshingTrends`** disables control; errors → `trendsError`. (Route remains **no-op** per Agent G — UI still satisfies PRD “button triggers reload” behavior.)
- **Generate:** `POST /api/generate` with `{ num_posts }`; **`generateError`** separate from trends; handles **429** `rate_limited` + `retryAfterSec`; **generating** state with placeholder panel + disabled inputs.
- **Posts:** Renders `lint_flags` with **WARN** (amber) vs **BLOCK** (red) badges, rule, optional `suggestion` / `excerpt`. Shows **`style_guide_only`**, **`warning_message`**, batch meta line; **empty batch** message if `batch_id` but `posts.length === 0`.
- **Security:** No `process.env` or API keys in client code; only same-origin `/api/*`.

### Files touched

| Path | Change |
| ---- | ------ |
| `app/page.tsx` | Client UI: loading/error split, lint flag rows, generate + trend flows, accessibility-friendly alerts (`role="alert"` where needed). |
| `app/layout.tsx` | `body` classes: `bg-[var(--bg)] text-[var(--text)]` aligned with `globals.css` tokens. |

### Notes for downstream agents

- **I (QA):** PRD checklist §796–805 maps here: Generate, trend list + Refresh, WARN/BLOCK visible, no secrets in **this** page source. Hook score / credibility / banned opener checks are **data validations** (manual or automated tests), not UI assertions.
- **G:** UI assumes **`GET /api/trends`** success shape `{ items, cached_at }` and error `{ error?, message? }`; generate success matches **`GenerateFlowResult`** (posts + optional `warning_message`, `style_guide_only`, etc.).
- **Types** in `page.tsx` are **local duplicates** of API contracts — if response schema changes, update page types or share a small `types/api-client.ts` (out of H scope unless agreed).

### Concerns / follow-ups

- **`npm audit --audit-level=high`:** Transitive **Next / vitest / eslint / glob** issues — **pre-existing**; not fixed in UI pass.
- **`aria-busy`** on list/button was **removed** — Edge Tools linter flagged expression form; **`disabled` + live region** used instead for generate placeholder.
- **True “force refresh”** of trend data still requires **ingestion** (Python/Cron); API refresh is **placeholder** until G/backend adds real fetch.

### Verification (Agent H)

`npm run lint`, `npx tsc --noEmit` — clean after changes.

---

## Agent I — Tests + QA

**Date:** 2026-03-29. **Handoff:** `docs/AGENT_HANDOFFS.md` → Agent I. **Scope:** `tests/**`, `vitest.config.ts`, `tests/fixtures/**`. **Production:** unchanged (mocks only — no new exports/hooks in `lib/**`).

### Summary

- **PRD §20 — `generate.test.ts`:** Full **`POST /api/generate`** path via **`NextRequest`**, isolated SQLite (`CORPUS_DB_PATH` temp dir + `closeDb()` before open), **`vi.mock("@/lib/generator")`** so no real Gemini. Asserts **`GenerateFlowResult`**-shaped JSON (Zod in test): `batch_id`, `posts[]`, `failed_slots`, etc.; **`generateBatch`** called with `industry` / `topicFocus` / `numPosts`. Integration sets **`skip_warn_lint: true`** to avoid WARN LLM calls (no key in test).
- **Fixtures:** `tests/fixtures/mock_llm_posts.ts` — bodies pass deterministic BLOCK rules (length, hook ≥7, credibility, opener).
- **Unit extensions:** `prompt_builder.test.ts` — `buildRegenerateOnePrompt`, no stray `[INDUSTRY]`/`[N]`/`[MIN_CHARS]` after `buildPrompt`; `linter.test.ts` — `lintPostDeterministic` WARN for `trend_reaction` + `trend_source: "none"`.
- **Existing:** `vitest.config.ts` (unchanged pattern): `tests/**/*.test.ts`, `@` → repo root.

### Files touched (Agent I only)

| Path | Change |
| ---- | ------ |
| `tests/fixtures/mock_llm_posts.ts` | **New** — `makeMockGeneratedPost` / `makeMockPostBatch`. |
| `tests/integration/generate.test.ts` | **Expanded** — rate-limit tests kept; added mocked-LLM integration + schema assertions; `NextRequest` for `tsc`. |
| `tests/unit/prompt_builder.test.ts` | **Expanded** — +2 tests (regenerate prompt, placeholder safety). |
| `tests/unit/linter.test.ts` | **Expanded** — +1 describe (`lintPostDeterministic` WARN). |

### Notes for downstream agents

- **Extending generate integration:** Adjust mock **`generateBatch`** return shape if **`GeneratedPost` / pipeline** changes; keep fixtures passing **`runBlockRules` + corpus similarity** (empty corpus = OK).
- **WARN LLM path:** Not covered end-to-end (would need env key or injector); deterministic lint + mocked batch is the stable baseline.
- **DB isolation:** Integration `beforeAll` calls **`closeDb()`** then sets **`CORPUS_DB_PATH`** — important if other tests share a worker and rely on singleton reset.

### Concerns / follow-ups

- **`npm audit --audit-level=high`:** Still reports transitive **Next / vitest→vite→esbuild / eslint→glob** issues; **not** remediated here (would bump majors / Next patch — coordinate with product owner).
- **Mock drift:** If **`runGenerateFlow`** stops calling **`generateBatch`** or args rename, integration test must follow.
- **E2E / Playwright:** Out of scope; manual PRD §796–805 checklist remains for H + human QA.

### Verification (Agent I)

`npm test` (23 tests), `npm run lint`, `npx tsc --noEmit` — all clean after Agent I changes.

---

## Agent J — Supabase / hosted DB (later)

*No entry yet.*
