# Agent handoffs — LinkedIN Post Generator

Use **one chat per agent**. Paste the **Global prefix** (below) at the top, then the section for that agent.

**Rules for every coding agent**

- Read only the **PRD sections** listed in your handoff (`docs/PRD.md`).
- **Do not** edit files outside **Allowed paths**.
- **Do not** modify `lib/pipeline.ts` unless you are **Agent F** (Pipeline).
- Prefer **small commits**; run `npm run build` and `npm test` before saying done.

---

## Global prefix (paste first)

```text
Repo: LinkedIN Post Generator (Next.js 14 App Router, SQLite via better-sqlite3, Gemini, Python ingestion).

Read docs/STATUS.md for current state. Read docs/PRD.md only in the sections listed below for this agent.

Follow docs/AGENT_HANDOFFS.md for this agent only. Do not edit files outside Allowed paths. Only Agent F may edit lib/pipeline.ts.

After changes: npm run build && npm test. Report what you changed and how to verify.
```

---

## Research (no code)

**Role:** Curate LinkedIn corpus sources for Module A.

**PRD:** §6.1 (corpus targets, archetypes).

**Instructions**

- Find **10–15** B2B / tech creators aligned with default industry + topic focus in PRD.
- Per person: **full LinkedIn profile URL**, **archetype**, **one-line rationale**, follower tier if visible.
- Output a markdown table.

**Deliverable:** Append or create `docs/CREATORS.md` (human edits OK).

**Forbidden:** TypeScript/Python app code (unless you are only committing `docs/CREATORS.md`).

---

## Agent A — Ingestion (Python + GitHub Actions)

**Role:** Scheduled / CLI ingestion — trends + corpus; no Next UI.

**PRD:** §7, §12 `ingestion/`, §15, Appendix ingest notes.

**Allowed paths**

- `ingestion/*.py`
- `ingestion/apify_config.json`
- `.github/workflows/ingest_trends.yml`
- `.github/workflows/ingest_corpus.yml`
- `requirements.txt` (create/update)
- `docs/INGESTION.md` (optional runbook)

**Forbidden**

- `app/**`, `lib/**` (except read-only peek at `lib/db.ts` for table/column names), `prompts/**`

**Depends on**

- SQLite path `data/corpus.db`; schema matches PRD §13 / `lib/db.ts`.

**Done when**

- `python ingestion/trend_ingestor.py` runs; workflows use correct script paths and Python 3.11+.

---

## Agent B — Data layer (SQLite)

**Role:** DB connection, schema, migrations/bootstrap.

**PRD:** §13 Data Models, §12 `lib/db.ts`, `data/`.

**Allowed paths**

- `lib/db.ts`
- `lib/migrations.ts` (if present)
- `tests/unit/db.test.ts` (if owned here)

**Forbidden**

- `lib/pipeline.ts`, `lib/generator.ts`, `app/**`, `ingestion/**`

**Done when**

- DB file created with PRD tables; stable exports for readers/writers.

**Note:** Vercel + ephemeral FS — document limitation in code comment.

---

## Agent C — Reads (trends + style guide)

**Role:** Trend brief from DB + TTL; style guide files for prompts; sanitization.

**PRD:** §7.2–7.3, §8 context, §16, §18 prompt injection.

**Allowed paths**

- `lib/trend_brief.ts`
- `lib/style_guide.ts`
- `lib/sanitize.ts`
- `lib/trend_ttl.ts` (if present)
- `lib/types.ts` — **append-only** for row/view types

**Forbidden**

- `lib/generator.ts`, `lib/prompt_builder.ts`, `lib/pipeline.ts`, `app/**`

**Depends on**

- Agent B: tables exist.

**Done when**

- Single place owns TTL / 7-day rules; exports for pipeline consumption.

---

## Agent D — Lint + similarity (deterministic)

**Role:** BLOCK rules, trigram similarity, deterministic linter entry.

**PRD:** §10.1–10.3, §9 output fields used by lint.

**Allowed paths**

- `lib/trigram.ts`
- `lint/block_rules.ts`
- `lib/linter.ts`
- `lint/similarity.py` — **only if** owning Python path; avoid duplicating TS logic
- `lib/types.ts` — lint flags, append-only

**Forbidden**

- `lib/generator.ts`, `lib/prompt_builder.ts`, `prompts/**`, `app/**`

**Done when**

- BLOCK rules match PRD; similarity threshold 0.40; clear docs on word vs char trigrams if relevant.

---

## Agent E — LLM (Gemini) + prompts

**Role:** Prompt layers, Gemini client, JSON parsing, retries.

**PRD:** §8–9, Appendix §26, `.env.example` Gemini vars.

**Allowed paths**

- `lib/prompt_builder.ts`
- `lib/generator.ts`
- `prompts/**`
- `lib/types.ts` — Zod/output types, append-only

**Forbidden**

- `lib/pipeline.ts`, `app/api/**`, `ingestion/**`

**Depends on**

- `GEMINI_API_KEY`; Agent C supplies context **via parameters** (avoid tight coupling to DB inside generator if possible).

**Done when**

- Batch generation + hook retry (max 2) per PRD; no secrets in repo.

---

## Agent F — Pipeline (orchestration only)

**Role:** Wire C → E → D → persistence; single entry for API.

**PRD:** §5 workflow, §14 `POST /api/generate` behavior.

**Allowed paths**

- `lib/pipeline.ts` **only** (optional `lib/pipeline.types.ts` if strictly needed)

**Forbidden**

- Rewriting internals of other modules except import/export fixes.

**Depends on**

- Agents B, C, D, E merged; project builds.

**Done when**

- One exported function used by `app/api/generate/route.ts`; returns PRD-shaped batch + failures.

**Critical:** **Only this agent** edits `lib/pipeline.ts`.

---

## Agent G — API routes (thin HTTP)

**Role:** Route handlers, webhook auth, rate limits.

**PRD:** §14 API, §18 security.

**Allowed paths**

- `app/api/**/route.ts`
- `lib/rate_limit.ts`

**Forbidden**

- Heavy logic (belongs in `lib/pipeline.ts` / `lib/*`)

**Depends on**

- Agent F.

**Done when**

- `POST /api/generate`, `GET /api/trends`, refresh if any, `POST /api/ingestion/corpus` per PRD; Apify secret via query or header.

---

## Agent H — UI

**Role:** Generate button, trends sidebar, post list, WARN display.

**PRD:** §16 state, Phase 3 UI, manual QA list.

**Allowed paths**

- `app/page.tsx`
- `app/layout.tsx`
- `tailwind.config.ts`, `app/globals.css`

**Forbidden**

- Implementing pipeline logic; use `fetch('/api/...')` only.

**Depends on**

- Agent G.

---

## Agent I — Tests + QA

**Role:** Vitest unit/integration tests, fixtures.

**PRD:** §20.

**Allowed paths**

- `tests/**`
- `vitest.config.ts`
- `tests/fixtures/**` (create)

**Forbidden**

- Changing production behavior except testability exports.

**Done when**

- Linter, prompt builder (if testable), generate integration with **mocked LLM**.

---

## Agent J (later) — Supabase / hosted DB

**Role:** Replace file SQLite with hosted Postgres; preserve semantics.

**PRD:** Phase 2 / your migration notes.

**Allowed paths**

- `lib/db.ts`, new `lib/supabase*.ts`, `.env.example`, `README.md` (short note)

**Forbidden**

- Rewriting prompts/UI unless required by breakage.

**Done when**

- Same consumer API for pipeline; env documented.

---

## Suggested merge order

1. B → C → D (can parallel C/D after B)  
2. E  
3. F  
4. G → H  
5. I anytime after modules exist  
6. A in parallel with B once schema is stable  
7. J when you leave “demo SQLite on disk” behind
