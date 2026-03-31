# Ingestion runbook (Python + GitHub Actions)

This project keeps a local SQLite corpus at **`data/corpus.db`** (override with **`CORPUS_DB_PATH`**, same as `lib/db.ts`). Ingestion writes **`trend_items`** and triggers **`corpus_posts`** collection via Apify + webhook.

## Tables (see `lib/migrations.ts`)

| Table           | Written by                         |
|----------------|-------------------------------------|
| `trend_items`  | `python ingestion/trend_ingestor.py` |
| `corpus_posts` | Apify webhook → `POST /api/ingestion/corpus` |

## Trend ingest (2x daily)

**Config:** `config/topics.json`

- **`relevance_keywords`**, **`topic_focus`**: used to score headlines (relevance 1–5); rows with score **&lt; 3** are skipped.
- **`reddit_subreddits`**: list of subreddit names (no `r/` prefix). If missing or empty, the script falls back to `LocalLLaMA`, `MachineLearning`, `cscareerquestions`.

**Sources:** Hacker News top stories, Reddit weekly top posts per configured sub, GitHub Trending (Python daily HTML — best-effort), plus Apify LinkedIn trend scraping.

### Apify trends source

- **Actor ID:** `Wpp1BZ6yGWjySadk3`
- **Auth env:** `APIFY_API_TOKEN` (required to run the actor and fetch dataset rows)
- **Run mode:** Script starts a run with `waitForFinish`, then fetches up to **500** dataset items and maps them into `trend_items`.
- **Merge policy:** Apify rows are merged with HN/Reddit/GitHub using the existing `trend_id` upsert flow and the same relevance threshold (`relevance_score >= 3`).
- **Actor input payload:** the script sends this exact payload:

```json
{
  "deepScrape": false,
  "limitPerSource": 20,
  "rawData": false,
  "urls": [
    "https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=excel%20automation&origin=FACETED_SEARCH",
    "https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=power%20query&origin=FACETED_SEARCH",
    "https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=b2b%20saas&origin=FACETED_SEARCH",
    "https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=product%20led%20growth&origin=FACETED_SEARCH",
    "https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=enterprise%20ai&origin=FACETED_SEARCH",
    "https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=business%20intelligence&origin=FACETED_SEARCH",
    "https://www.linkedin.com/in/lennyrachitsky/",
    "https://www.linkedin.com/in/aagupta/",
    "https://www.linkedin.com/in/leilagharani/",
    "https://www.linkedin.com/in/purnaduggirala/",
    "https://www.linkedin.com/in/alexmarcus1/",
    "https://www.linkedin.com/in/abhatia23/",
    "https://www.linkedin.com/in/barrett-linburg-32070310/",
    "https://www.linkedin.com/in/bennstancil/"
  ]
}
```

**Run locally (repo root):**

```bash
pip install -r requirements.txt
python ingestion/trend_ingestor.py
```

**GitHub Actions:** `.github/workflows/ingest_trends.yml` (2 cron runs/day + `workflow_dispatch`), Python **3.11**, `CORPUS_DB_PATH=data/corpus.db`, `APIFY_API_TOKEN` from repo secret.

> **Note:** The DB in Actions is ephemeral unless you persist it (artifact, external store, or commit — not done by default).

## Corpus ingest (weekly Apify trigger)

**Script:** `python ingestion/corpus_ingestor.py`

- Reads **`ingestion/apify_config.json`**.
- Requires **`APIFY_API_TOKEN`** in the environment (set GitHub secret **`APIFY_API_TOKEN`** for `ingest_corpus.yml`).
- If the token is **missing**, the script **exits 0** and prints a **SKIP** message so the workflow stays green until you add the secret.

### Apify actor

| Field   | Value |
|--------|--------|
| **Default actor id** | `apify/linkedin-post-scraper` (overridable via `"actor"` in `apify_config.json`) |

### Source URLs (important)

The actor **`input.profileUrls`** (and any post URLs your actor expects) must be **real LinkedIn profile or post URLs** on `linkedin.com`, **not** your app’s URL and not localhost. Wrong URLs produce empty runs or actor errors.

**Flow:** CLI starts a run → on success, configure Apify’s webhook to **`POST`** your deployed app’s **`/api/ingestion/corpus`** with the shared secret headers expected by the route (see `.env.example`).

**Security:** Never commit tokens. Do not log `APIFY_API_TOKEN` or full Apify error bodies in public logs if they might echo credentials.

**GitHub Actions:** `.github/workflows/ingest_corpus.yml` (weekly cron + `workflow_dispatch`), Python **3.11**.
