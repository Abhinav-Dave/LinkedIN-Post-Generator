# Project status (one screen)

**Last known commit:** `3ac8891` — docs: refresh STATUS for 3db765e milestone and verification

**Branch:** `main` (tracking `origin/main`) — working tree clean as of last update; run `git status` before agents pick up new local edits.

**Agent implementation log:** [docs/Agent_status.md](Agent_status.md) (A–I rollout; J later).

## Latest milestone (`3db765e`; STATUS synced in `3ac8891`)

- TS corpus path: Apify dataset helper, webhook verification, `lib/migrations.ts`, richer `db` layer, `corpus_ingestion.ts`, `trend_ttl`, `pipeline.types`
- API/UI: stronger `/api/ingestion/corpus`, `/api/trends` + `/refresh`, generate route tweaks; dashboard refresh in `app/page.tsx`
- Python: `ingestion/paths.py`, package layout, updated corpus/trend ingestors
- **Lint:** `lint/similarity.py` removed — deterministic trigram/Jaccard lint is **TypeScript-only** (`lint/block_rules.ts`, `lib/trigram.ts`, `lib/linter.ts`)
- Prompts: broad v1 updates + `regenerate_single_suffix_v1.txt`
- Docs: this file, `INGESTION.md`, `AGENT_HANDOFFS.md`, `Agent_status.md`; README lint note
- Tests: `tests/fixtures`, `db.test.ts`, `deterministic_lint.test.ts`, expanded generate/ingestion integration
- CI: ingest workflows + `.env.example` + `config/topics.json`; local `corpus.db` revision in repo

## Verified locally (2026-03-30)

| Check | Result |
| ----- | ------ |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | Clean |
| `npm test` | **31** tests passed (8 files; incl. ingestion webhook + Apify mock path) |
| `npm run build` | Clean (re-run after large edits) |

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
3. **Optional:** wire `voice_preset`; PRD doc cleanup as needed. **`POST /api/trends/refresh`** runs `python ingestion/trend_ingestor.py` on the Node host (local dev; not for serverless without a worker).
4. **Later:** Agent J (hosted DB) if serverless SQLite is insufficient.

## Quick verify commands

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

---

*Update this file when you merge a milestone — paste `docs/STATUS.md` into the agent prompt.*
