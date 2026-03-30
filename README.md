# LinkedIn Post Generation System

B2B LinkedIn batch generator (Next.js 14 App Router + SQLite + Gemini) aligned with the project PRD: style guide + trend brief → generation → deterministic BLOCK linter + optional WARN (Gemini).

## Quick start

1. Copy `.env.example` → `.env` and set `GEMINI_API_KEY` (Google AI Studio).
2. `npm install` then `npm run dev` → open [http://localhost:3000](http://localhost:3000).
3. Optional: `pip install -r requirements.txt` then `python ingestion/trend_ingestor.py` to populate `data/corpus.db` trend rows (creates DB/tables if missing).

## Scripts

| Command        | Purpose                          |
| -------------- | -------------------------------- |
| `npm run dev`  | Local Next dev server            |
| `npm run build`| Production build                 |
| `npm test`     | Vitest unit/integration tests    |

## API

- `POST /api/generate` — body: `{ industry?, topic_focus?, num_posts?, skip_warn_lint? }`. Rate limit: 10/hour/IP.
- `GET /api/trends` — cached trend brief from SQLite.
- `POST /api/ingestion/corpus` — Apify webhook or dev payload; optional header `x-webhook-secret` matching `APIFY_WEBHOOK_SECRET`.

## Deploy notes

- `better-sqlite3` is native; if Vercel build/runtime fails, switch to a hosted DB (e.g. Turso) or run the app on a Node server with a writable `data/corpus.db`.
- Do not expose API keys to the client; generation runs only in API routes.

## Prompts

Versioned under `prompts/` (e.g. `system_v1.txt`, `generation_v1.txt`). Active style guide: `data/style_guide.json`.
