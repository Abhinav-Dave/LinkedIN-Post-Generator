# Project status (one screen)

**Branch:** `main` (tracking `origin/main`). **Doc sync:** 2026-03-31 — run `git log -1 -- docs/STATUS.md` for the commit that last touched this file. Run `git status` before agents pick up new local edits.

**Agent implementation log:** [docs/Agent_status.md](Agent_status.md) (A–I rollout; J later).

## Latest milestone (Humanization + plain_spartan voice preset)

- Prompt humanization pass in `prompts/generation_v1.txt` and `prompts/directive_v1.txt` to reduce robotic cadence and ban common AI-ish template phrasing.
- Added optional `plain_spartan` voice overlay (`prompts/plain_spartan_overlay_v1.txt`) and wired `voice_preset` through `lib/types.ts`, `lib/prompt_builder.ts`, `lib/generator.ts`, `lib/pipeline.types.ts`, and `lib/pipeline.ts`.
- UI wiring in `app/page.tsx` now sends `voice_preset` during generation requests.
- Deterministic WARN heuristics expanded in `lib/linter.ts` with new `ai_voice_*` flags (WARN-only, no BLOCK rule changes).
- Unit coverage expanded: `tests/unit/prompt_builder.test.ts` and `tests/unit/linter.test.ts` now assert voice/humanization behavior and new WARN triggers.
- Agent execution log updated in `docs/Agent_status.md` for Agents D/E/F/H/I updates.

## Verified locally (2026-03-31)

| Check | Result |
| ----- | ------ |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | Clean |
| `npm test` | **38** tests passed (8 files; incl. voice/humanization coverage in prompt/linter tests) |
| `npm run build` | Re-run recommended after this milestone before release tagging |

**Live smoke (`npm run start -p 3010`):** `GET /api/trends` → **200** with items after `python ingestion/trend_ingestor.py`. `POST /api/generate` reaches Gemini; response depends on **quota** (e.g. **429** / `generation_failed` on free tier limits — not an app bug).

## What exists in repo

- **Spec:** [docs/PRD.md](PRD.md)
- **Corpus targets:** [docs/CREATORS.md](CREATORS.md)
- **Ingestion runbook:** [docs/INGESTION.md](INGESTION.md)
- **Agent routing:** [docs/AGENT_HANDOFFS.md](AGENT_HANDOFFS.md)
- **Stack:** Next.js 14 App Router, `better-sqlite3` → `data/corpus.db` (or `CORPUS_DB_PATH`), Gemini, Python `ingestion/` + GitHub Actions

## Environment quick reference

See [.env.example](../.env.example): `GEMINI_API_KEY` (required for real generate), optional `CORPUS_DB_PATH` (same path for Node and Python), `APIFY_*` for corpus webhook/dataset. **Default model** (no env): `gemini-2.5-flash` — `gemini-2.0-flash` returns **404** for new API projects; override with `GEMINI_MODEL_MAIN` if needed.

## What’s next (priority)

1. **Gemini:** ensure billing / model quota if `POST /api/generate` should succeed in demos.
2. **Production:** set `APIFY_WEBHOOK_SECRET` before exposing `POST /api/ingestion/corpus`.
3. **Voice QA:** run sample generation sweeps per preset (`human_balanced`, `sharp_sarcastic`, `professional_warm`, `plain_spartan`) and tune prompt constraints if fluency drops.
4. **Optional:** PRD doc cleanup as needed. **`POST /api/trends/refresh`** runs `python ingestion/trend_ingestor.py` on the Node host (local dev; not for serverless without a worker).
5. **Later:** Agent J (hosted DB) if serverless SQLite is insufficient.

## Quick verify commands

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

---

*Update this file when you merge a milestone — paste `docs/STATUS.md` into the agent prompt.*
