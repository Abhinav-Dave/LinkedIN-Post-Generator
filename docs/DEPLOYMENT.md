# Deployment Guide (Supabase Full Cutover)

This project now supports a Supabase-backed production path for both Render and Vercel.

## 1) Create Supabase project and schema

1. Create a Supabase project.
2. Open SQL editor and run `supabase/schema.sql`.
3. Copy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only secret; never expose to client).

## 2) Required environment variables

Set these in your host:

- `GEMINI_API_KEY` (required for `/api/generate`)
- `SUPABASE_URL` (required for Supabase backend)
- `SUPABASE_SERVICE_ROLE_KEY` (required for Supabase backend)
- `APIFY_API_TOKEN` (required for Apify trend ingestion)
- `APIFY_WEBHOOK_SECRET` (recommended for `/api/ingestion/corpus`)

Optional:
- `CORPUS_DB_PATH` (only used when Supabase vars are missing and app falls back to SQLite)

## 3) Deploy on Render (Docker)

1. Push repository.
2. Create Render Web Service using `render.yaml`.
3. Configure env vars listed above.
4. Deploy and verify:
   - `GET /api/health` returns `checks.db_backend = "supabase"` and `checks.supabase_reachable = true`.

Notes:
- Docker image still includes Python runtime for manual refresh route.
- With Supabase configured, persistent disk is optional.

## 4) Deploy on Vercel

1. Import repo in Vercel.
2. Add env vars listed above.
3. Deploy with `vercel.json`.
4. Verify:
   - `GET /api/health` shows Supabase backend reachable.
   - `POST /api/trends/refresh` returns `501 unsupported_runtime` by design on Vercel.

For Vercel trend updates, rely on scheduled ingestion (`.github/workflows/ingest_trends.yml`) writing into Supabase.

## 5) Smoke-test checklist (both hosts)

1. `GET /api/health` -> `ok: true`, Supabase reachable.
2. `GET /api/trends` -> 200 with trend items.
3. `POST /api/generate` with valid payload -> generated posts.
4. `POST /api/ingestion/corpus` with valid secret + test body -> 200 and `posts_ingested`.

Detailed reviewer handoff flow is in `docs/REVIEWER_SMOKE_TEST.md`.

## 6) Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code.
- Keep webhook secret enabled in production.
- Health endpoint exposes only boolean/env presence checks, not secret values.
