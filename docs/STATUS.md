# Project status (one screen)

**Branch:** `main` (tracking `origin/main`). **Doc sync:** 2026-03-31 — run `git log -1 -- docs/STATUS.md` for the commit that last touched this file. Run `git status` before agents pick up new local edits.

**Agent implementation log:** [docs/Agent_status.md](Agent_status.md) (A–I rollout; J later).

## Latest milestone (Apify trends source + offline integration coverage)

- `ingestion/trend_ingestor.py` now includes an Apify LinkedIn trend phase:
  - triggers actor `Wpp1BZ6yGWjySadk3` with fixed LinkedIn search/profile inputs
  - fetches up to 500 dataset items
  - maps items into `trend_items` rows with stable IDs, normalized timestamps, and relevance filtering
  - safely skips when `APIFY_API_TOKEN` is missing or API calls fail
- `.github/workflows/ingest_trends.yml` now runs **2x daily** and injects `APIFY_API_TOKEN` from repo secrets.
- `docs/INGESTION.md` expanded with Apify trend phase details, payload, and workflow/env notes.
- `docs/CREATORS.md` refreshed formatting and corpus target presentation.
- `docs/Agent_status.md` updated with Agent I’s 2026-03-31 entry for Apify trend phase test coverage.
- New offline tests for ingestion mapping and dedup/upsert behavior:
  - `tests/integration/trend_ingestor_apify.test.ts`
  - `tests/fixtures/apify_trends/sample_item.json`

## Verified locally (2026-03-31)

| Check | Result |
| ----- | ------ |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | Clean |
| `npm test` | **41** tests passed (9 files; includes offline Apify trend ingestion integration tests) |
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
3. **Apify trends ops:** monitor actor schema drift (field names in dataset items) and adjust mapping keys in `trend_ingestor.py` if the actor output changes.
4. **Voice QA:** run sample generation sweeps per preset (`human_balanced`, `sharp_sarcastic`, `professional_warm`, `plain_spartan`) and tune prompt constraints if fluency drops.
5. **Optional:** PRD doc cleanup as needed. **`POST /api/trends/refresh`** runs `python ingestion/trend_ingestor.py` on the Node host (local dev; not for serverless without a worker).
6. **Later:** Agent J (hosted DB) if serverless SQLite is insufficient.

## Quick verify commands

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

---

*Update this file when you merge a milestone — paste `docs/STATUS.md` into the agent prompt.*
