# Project status (one screen)

**Last known commit:** `4a6e61a` — feat: add LinkedIn batch post generator (Next.js 14, SQLite, Gemini)

**Branch:** `main` (tracking `origin/main`) — run `git status` for uncommitted work.

**Agent implementation log:** [docs/Agent_status.md](Agent_status.md) (A–I rollout; J later).

## Verified locally (plan run, 2026-03-30)

| Check | Result |
| ----- | ------ |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | Clean |
| `npm test` | **31** tests passed (incl. ingestion webhook + inline Apify mock) |
| `npm run build` | Clean |

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

1. **Commit** any pending changes; push when ready.
2. **Gemini:** ensure billing / model quota if `POST /api/generate` should succeed in demos.
3. **Production:** set `APIFY_WEBHOOK_SECRET` before exposing `POST /api/ingestion/corpus`.
4. **Optional:** wire `voice_preset`; PRD doc cleanup (`lint/similarity.py` removed — TS trigrams only). **`POST /api/trends/refresh`** runs `python ingestion/trend_ingestor.py` on the Node host (local dev; not for serverless without a worker).
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
