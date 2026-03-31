# Reviewer Smoke Test Runbook

Use this checklist after deployment to verify the public reviewer link.

## Preconditions

- Deployment is live (Render or Vercel).
- Required env vars are set:
  - `GEMINI_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Optional but recommended:
  - `APIFY_API_TOKEN`
  - `APIFY_WEBHOOK_SECRET`

## 1) Health check

`GET /api/health`

Expected:
- `ok: true`
- `checks.db_backend = "supabase"`
- `checks.supabase_reachable = true`
- `checks.required_env_present.GEMINI_API_KEY = true`

## 2) Trends check

`GET /api/trends`

Expected:
- HTTP 200
- JSON with `items` array
- Each item has `headline`, `source_name`, and `published_at`

## 3) Generate check

`POST /api/generate` with:

```json
{
  "num_posts": 3,
  "industry": "Computer Science",
  "topic_focus": "AI workflows",
  "voice_preset": "plain_spartan"
}
```

Expected:
- HTTP 200
- Non-empty `posts` array
- Each post contains `body`, `hook_clarity_score`, and `lint_flags`

## 4) Manual refresh behavior by host

- **Render:** `POST /api/trends/refresh` should run Python ingestion and return `ok: true` or structured failure details.
- **Vercel:** `POST /api/trends/refresh` should return `501 unsupported_runtime` (expected). Trend freshness comes from scheduled ingestion workflow writing to Supabase.

## 5) Webhook check (optional)

`POST /api/ingestion/corpus` with valid secret and sample payload should return:

```json
{ "status": "ok", "posts_ingested": <number> }
```

## 6) UI acceptance

Open app root URL:
- Trends list loads
- Generate button works
- Generated cards render with lint flags
- No API-key errors visible in UI
