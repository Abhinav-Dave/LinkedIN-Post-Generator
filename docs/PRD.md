# 🧠 PRD: LinkedIn Post Generation System

**Product:** B2B LinkedIn Post Generation System
**Version:** 1.1 — Build-Ready
**Status:** Final Draft
**Author:** Internship Engineering Candidate
**Reviewer:** Erica — Pronexus AI
**Created:** March 2026
**Default Industry:** Computer Science / B2B SaaS
**Default Topic Focus:** Claude + Excel Workflows; AI Tooling

> The top 1% of LinkedIn posts capture 80% of total distribution. Generic AI-generated content does not reach that threshold — it actively suppresses reach via LinkedIn's quality signals. This system is engineered from the ground up to produce posts that compete at the top tier.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Target Users & Personas](#4-target-users--personas)
5. [Workflow Architecture Overview](#5-workflow-architecture-overview)
6. [Module A: LinkedIn Performance Learning Engine](#6-module-a-linkedin-performance-learning-engine)
7. [Module B: Trend Intelligence Feed](#7-module-b-trend-intelligence-feed)
8. [Module C: Prompt Engineering Strategy](#8-module-c-prompt-engineering-strategy)
9. [Module D: Post Generation & Output Spec](#9-module-d-post-generation--output-spec)
10. [Module E: Post Linting & Quality Gates](#10-module-e-post-linting--quality-gates)
11. [Tech Stack & Justification](#11-tech-stack--justification)
12. [File & Folder Structure](#12-file--folder-structure)
13. [Data Models & Schemas](#13-data-models--schemas)
14. [API Design](#14-api-design)
15. [Data Ingestion Cadence](#15-data-ingestion-cadence)
16. [State Management Strategy](#16-state-management-strategy)
17. [Performance Considerations](#17-performance-considerations)
18. [Security Considerations](#18-security-considerations)
19. [Edge Cases & Failure Handling](#19-edge-cases--failure-handling)
20. [Testing Strategy](#20-testing-strategy)
21. [Observability](#21-observability)
22. [Milestone Breakdown](#22-milestone-breakdown)
23. [Prioritized Feature Roadmap](#23-prioritized-feature-roadmap)
24. [Risks & Tradeoffs](#24-risks--tradeoffs)
25. [Open Questions](#25-open-questions)
26. [Appendix: Prompt Templates](#26-appendix-prompt-templates)

---

## 1. Executive Summary

This document specifies the full build-ready requirements for a LinkedIn post generation system that produces authentic, high-signal B2B content tuned to compete in the top 1% of LinkedIn distribution.

The system:
- Learns structural and tonal patterns from high-performing LinkedIn creators via Apify scraping
- Tracks live industry trends from Hacker News, Reddit, and GitHub Trending
- Generates weekly batches of 5–7 posts per industry × topic focus pair
- Applies deterministic + LLM-assisted quality gates before output
- Is deployable as a Next.js app (Vercel) with a Python ingestion backend

**Primary deliverable for this phase:** A complete, AI-agent-ready PRD that a solo developer can hand directly to Cursor and begin building in under one week.

---

## 2. Problem Statement

Most AI-generated LinkedIn content fails for three structural reasons:

1. **Template mimicry, not pattern learning** — generic systems use hardcoded templates rather than extracting what actually performs from real creator data
2. **Stale context** — content is generated without awareness of what is trending this week, making it feel disconnected and generic
3. **No credibility signals** — high-performing B2B posts rely on specific numbers, named tools, and concrete workflows; AI defaults to vague advice

The result: LinkedIn's algorithm deprioritizes the content, and human readers ignore it. Both outcomes compound — low early engagement suppresses distribution, which makes the post invisible even to followers.

**This system solves all three problems** by grounding generation in real corpus data, live trend signals, and enforced credibility requirements.

---

## 3. Goals & Success Metrics

### Primary Goals

- Produce a weekly batch of 5–7 LinkedIn posts per industry × topic focus pair
- Enforce measurable post quality via a deterministic linter before output
- Keep generation cost under $0.15 per post at steady state
- Support a deployable demo accessible via URL — no local install required

### Success Metrics

| Metric | Target |
|--------|--------|
| Post quality gate pass rate | ≥90% of generated posts pass linter without manual edits |
| Hook specificity score | Average ≥7/10 across generated batch |
| Trend freshness | ≥4 of 5 trend items dated within last 7 days |
| Cost per post | ≤$0.15 including all API calls |
| p99 generation latency | ≤25 seconds per Generate call |
| Style guide coverage | ≥5 distinct hook archetypes captured from corpus |
| Corpus similarity guardrail | No generated post shares >40% trigram overlap with corpus post |

---

## 4. Target Users & Personas

### Persona 1: Demo Evaluator (Primary for MVP)

| Field | Value |
|-------|-------|
| Who | Erica / Pronexus AI hiring team |
| Goal | Click Generate, see fresh posts, immediately judge quality |
| Pain | Having to read a manual, wait too long, or see generic output |
| Success | Sees 5 sharp, specific, credible posts within 25 seconds of clicking Generate |

### Persona 2: LinkedIn Post Reader (End Audience)

| Field | Value |
|-------|-------|
| Industry | Computer Science / B2B SaaS (default); Investment Banking (switchable via config) |
| Seniority | Mid-to-senior ICs, founders, PMs |
| What they reward | Concrete workflows, named tools, real numbers, honest takes |
| What they punish | Vague advice, listicles without substance, obvious AI phrasing |

### Brand Voice (Default)

- Founder/practitioner voice — first-person, direct, opinionated
- Confident without being preachy; curious without being naive
- Shares specific workflows, not generic advice
- Occasionally uses light humor or counterintuitive framing as a hook

---

## 5. Workflow Architecture Overview

The system is composed of five loosely coupled modules that run in sequence:

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCHEDULED (Daily/Weekly)                  │
│                                                                   │
│  ┌──────────────┐         ┌──────────────────────────────────┐  │
│  │   Module A   │         │           Module B               │  │
│  │  Corpus +    │         │  Trend Intelligence Feed         │  │
│  │  Style Guide │         │  (HN + Reddit + GitHub)          │  │
│  └──────┬───────┘         └────────────────┬─────────────────┘  │
│         │                                  │                      │
└─────────┼──────────────────────────────────┼──────────────────────┘
          │                                  │
          ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ON GENERATE CLICK (On-Demand)                 │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Module C: Prompt Assembly                               │    │
│  │  Style Guide Summary + Trend Brief + Directives          │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Module D: Post Generation                               │    │
│  │  5–7 posts as JSON array (structured output)             │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Module E: Linting & Quality Gate                        │    │
│  │  Deterministic BLOCK rules + LLM-assisted WARN rules     │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                     │
│                             ▼                                     │
│                    Final Output (JSON → UI)                       │
└─────────────────────────────────────────────────────────────────┘
```

**Module cadence:**
- Module A: Weekly (Monday 07:00 UTC) via GitHub Actions
- Module B: Daily (08:00 UTC) via GitHub Actions
- Modules C–E: On-demand per Generate click

---

## 6. Module A: LinkedIn Performance Learning Engine

### 6.1 Corpus Collection via Apify

**Service:** Apify — use the `linkedin-post-scraper` actor (pay-per-run, no subscription required).

**Why Apify over PhantomBuster:**
- Pay-per-run pricing is cheaper for low-frequency weekly scrapes (no monthly subscription)
- Native actor ecosystem with LinkedIn-specific scrapers maintained by the community
- Webhook support for triggering downstream pipeline steps after scrape completion

**Corpus targets:**
- 10–15 verified B2B LinkedIn creator profiles
- ≥30 posts per creator; 300–500 posts total in initial corpus
- Curation criteria: ≥10K followers, primarily text-forward posts, B2B/tech niche

**Creator archetypes to seed (validate at collection time):**

| Archetype | Content Theme |
|-----------|---------------|
| B2B SaaS founder | Workflow tips, product learnings, honest startup takes |
| AI/ML practitioner | Tool comparisons, prompt engineering, model benchmarks |
| VC / investor | Market signals, investment thesis, portfolio learnings |
| Enterprise sales | Deal stories, objection handling, pipeline metrics |
| PM / product leader | Prioritization frameworks, launch postmortems, user research |

**Apify actor config (stored as `/ingestion/apify_config.json`):**

```json
{
  "actor": "apify/linkedin-post-scraper",
  "input": {
    "profileUrls": ["<list of 10-15 creator profile URLs>"],
    "maxPostsPerProfile": 50,
    "proxy": { "useApifyProxy": true }
  },
  "webhook": {
    "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
    "requestUrl": "<backend /api/ingestion/corpus webhook endpoint>"
  }
}
```

**Assumption:** The Apify LinkedIn scraper returns post text, approximate engagement signals (reactions count if public), and post date. If engagement data is unavailable, manually label a sample of 30–50 posts as High/Medium/Low before style guide extraction.

### 6.2 Pattern Extraction Schema

For each post in the corpus, extract the following fields into a structured record stored in SQLite:

| Field | Type | Description |
|-------|------|-------------|
| `post_id` | string (uuid) | Unique identifier |
| `creator_url` | string | Source LinkedIn profile URL |
| `raw_text` | string | Full post text |
| `hook_type` | enum | Question / Counterintuitive / Specific number / Mini-story / List tease |
| `hook_length_chars` | int | Character count of first line |
| `post_length_chars` | int | Total character count |
| `line_break_density` | float | Single-line-break separations per 100 chars |
| `uses_bullets` | bool | Numbered or bulleted list present |
| `credibility_signal` | string | Named tool / specific metric / named company / dated event |
| `cta_type` | enum | none / soft / direct / link |
| `engagement_tier` | enum | high / medium / low |
| `scraped_at` | ISO 8601 | Timestamp of ingestion |

### 6.3 Style Guide Output

The extraction step (run via Claude using the prompt in Section 26.1) produces a Style Guide artifact stored as:
- `/data/style_guide.json` — machine-readable, used by Module C at generation time
- `/data/style_guide_summary.md` — human-readable, git-tracked and diffable between versions

**Style Guide contains:**
1. **Hook archetypes** — 5+ named patterns with example structures (no copied text from corpus)
2. **Optimal length range** — P25–P75 character count distribution for high-tier posts
3. **Rhythm rules** — line break density norms, paragraph length norms
4. **Credibility move taxonomy** — how top creators signal authority
5. **CTA patterns** — what CTAs appear in high vs. low engagement posts
6. **Anti-patterns** — 10+ phrases/structures to avoid

---

## 7. Module B: Trend Intelligence Feed

### 7.1 Data Sources (v1)

| Source | Method | Rationale |
|--------|---------|-----------|
| Hacker News | Public API (`https://hacker-news.firebaseio.com/v0/`) | Free, no auth, reliable. Filter top 100 stories daily by keyword match to industry + topic focus. Surfaces high-signal technical trends 1–3 days before mainstream media. |
| Reddit | Public Reddit JSON API (`reddit.com/r/<sub>.json`) | Free, no auth for read-only. Subreddits: `r/LocalLLaMA`, `r/MachineLearning`, `r/cscareerquestions`. Filter: top posts, score ≥100, last 7 days. |
| GitHub Trending | Scrape `github.com/trending?since=daily` | Free, no auth. Filter by language tag (Python, JavaScript). Surfaces emerging tooling 1–2 weeks before blog coverage. |

**Excluded from v1:**
- X/Twitter — paid API, compliance risk for demo
- Vendor changelogs (Anthropic/OpenAI RSS) — deprioritized for <1 week build; add in Phase 2
- Paywalled content — cannot reliably ingest

### 7.2 Trend Brief Format

Each item in the Trend Brief (stored in SQLite, cached with 24h TTL):

| Field | Type | Description |
|-------|------|-------------|
| `trend_id` | string (uuid) | Unique identifier |
| `headline` | string | One-sentence summary (<15 words) |
| `source_url` | string | Original URL |
| `source_name` | enum | hackernews / reddit / github |
| `published_at` | ISO 8601 | Must be within last 7 days |
| `relevance_score` | int (1–5) | How directly this maps to target industry + topic |
| `content_angle` | string | Suggested LinkedIn post framing (one sentence) |
| `cached_at` | ISO 8601 | When this item was ingested |

### 7.3 Ingestion Logic (Python script)

```python
# ingestion/trend_ingestor.py

# HN: fetch top 100 story IDs → fetch each story item → filter by keyword list
# Reddit: fetch /r/<sub>/top.json?t=week → filter score ≥100 → extract title + url
# GitHub: scrape /trending → extract repo name + description + language
# For each item: run relevance scoring via keyword match against INDUSTRY + TOPIC_FOCUS
# Store qualifying items (relevance ≥3) in SQLite trends table
# Mark items older than 7 days as expired
```

**Keyword filter list (configurable in `/config/topics.json`):**

```json
{
  "industry": "Computer Science / B2B SaaS",
  "topic_focus": ["Claude", "Excel", "AI workflows", "LLM", "MCP", "automation"],
  "relevance_keywords": ["AI", "LLM", "Claude", "GPT", "workflow", "SaaS", "B2B", "automation", "agent"]
}
```

---

## 8. Module C: Prompt Engineering Strategy

### 8.1 Three-Layer Prompt Architecture

| Layer | Content | Source |
|-------|---------|--------|
| Layer 1: System Prompt | Persona, brand voice, hard constraints | Static file `/prompts/system_v1.txt`, loaded once |
| Layer 2: Context Block | Style Guide summary + Trend Brief (top 5–7 items by relevance) | Dynamic — refreshed each Generate call from SQLite |
| Layer 3: Generation Directive | Industry, topic focus, post count, format constraints, self-evaluation rubric | Dynamic — parameterized per request |

### 8.2 Hook Clarity Self-Evaluation Rubric

The model self-scores its own hook before finalizing each post. Posts scoring below 7 are regenerated (max 2 retries):

| Dimension | Max Score | Criteria |
|-----------|-----------|---------|
| Specificity | 4 | 4: specific number/name/date. 3: concrete claim, no number. 2: moderately concrete. 1: vague. 0: generic opener. |
| Curiosity gap | 3 | 3: strong open loop. 2: mildly intriguing. 1: predictable. 0: no gap. |
| No banned phrases | 3 | 3: zero banned phrases. 2: one borderline phrase. 0: any banned phrase. |

**Minimum passing score: 7/10.**

### 8.3 Prompt Versioning

- All prompt files in `/prompts/` with semantic versioning (`v1.0`, `v1.1`)
- Each version git-tagged; README links to active version
- Promotion criteria: run 10 generation calls; manually score 20 posts; promote if avg hook score ≥7 and pass rate ≥90%

---

## 9. Module D: Post Generation & Output Spec

### 9.1 Output JSON Schema

```json
{
  "post_id": "<uuid>",
  "industry": "<string>",
  "topic_focus": "<string>",
  "hook_archetype": "<string — one of the named archetypes from style guide>",
  "hook_clarity_score": "<integer 1–10>",
  "body": "<full post text — no markdown, use line breaks as in LinkedIn>",
  "char_count": "<integer>",
  "credibility_signals": ["<signal 1>", "<signal 2>"],
  "trend_source": "<URL or 'none'>",
  "post_type": "trend_reaction | workflow | contrarian | mini_case_study | question",
  "cta_type": "none | soft | direct | link",
  "lint_flags": [],
  "generated_at": "<ISO 8601 timestamp>"
}
```

### 9.2 Post Length Guidelines

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Minimum | 600 chars | Below this, insufficient substance for dwell time signal |
| Target sweet spot | 900–1,300 chars | Optimal B2B dwell time based on corpus analysis |
| Maximum | 2,000 chars | Above this, B2B completion rate drops sharply |
| Hook line | ≤120 chars | Must fit in LinkedIn preview before 'see more' truncation |

### 9.3 Weekly Batch Composition (5 posts default)

| Post Type | Count | Description |
|-----------|-------|-------------|
| Trend reaction | 1–2 | Direct response to a specific item from the Trend Brief |
| Workflow / how-to | 1–2 | Step-by-step or 'here's how I do X' format |
| Contrarian take | 1 | Challenges a common assumption in the industry |
| Mini case study | 0–1 | Specific outcome with numbers from real or plausible scenario |
| Community question | 0–1 | Soft CTA designed to generate comments |

---

## 10. Module E: Post Linting & Quality Gates

### 10.1 BLOCK Rules (Deterministic — no LLM required)

Posts triggering any BLOCK rule are regenerated automatically (max 2 retries). After 2 failed retries, the post slot is marked as `failed` and surfaced to the user with the flag reason.

| Rule | Definition |
|------|------------|
| Banned opener phrases | Starts with: 'In today's world', 'Excited to share', 'Hot take:', 'Game changer', 'Let that sink in', 'I'm humbled', 'Unpopular opinion:' (when not followed by genuinely contrarian content) |
| Below minimum length | Post body < 600 characters |
| No credibility signal | No specific number, named tool, or verifiable claim found in body |
| Hook score < 7 | Self-reported hook clarity score below threshold |
| High corpus similarity | Trigram overlap with any corpus post > 40% |

### 10.2 WARN Rules (LLM-assisted — surfaced in UI, not blocking)

| Rule | Definition |
|------|------------|
| Vague CTA | CTA is generic ('thoughts?') without specificity |
| Passive voice density | >25% of sentences in passive voice |
| Excessive bullet density | >60% of post body is bullet points |
| Missing trend link | Post claims to be trend-reactive but `trend_source` is 'none' |

### 10.3 Similarity Checker

```python
# lint/similarity.py

def check_similarity(generated_post: str, corpus: list[str]) -> float:
    """
    Extract trigrams from generated_post.
    Compute Jaccard similarity against each corpus post.
    Return max similarity score across all corpus posts.
    BLOCK if score > 0.40
    WARN if score > 0.25
    """
```

---

## 11. Tech Stack & Justification

**Design principle:** Lowest cost, fastest solo build, zero local install for demo.

| Component | Choice | Justification |
|-----------|--------|---------------|
| Frontend | Next.js 14 (App Router) on Vercel | Zero-config deploy, free hobby tier, URL shareable instantly. No backend server to manage for UI. |
| Backend / API | Next.js API routes (no separate FastAPI) | Eliminates a second service for MVP. All API routes co-located with frontend. Sufficient for on-demand generation calls. |
| Ingestion scripts | Python 3.11 (httpx, BeautifulSoup4, feedparser) | Python is best for scraping ecosystem; runs as GitHub Actions on schedule, zero hosting cost. |
| LLM | Cursor auto-selects best model for generation; cheaper model equivalent for linting WARN pass | Cursor agent picks best model — no hardcoding needed. Linting uses cheaper model for cost control. |
| Database | SQLite (local file, committed to repo for demo) | Zero cost, zero infra, no connection string needed. Sufficient for <500 corpus posts + trend brief cache. Swap to Supabase/PlanetScale in Phase 2. |
| Corpus scraping | Apify (pay-per-run, `linkedin-post-scraper` actor) | No subscription. Pay only when scraping. ~$1–3 per run of 300–500 posts. |
| Trend caching | SQLite with `cached_at` + TTL check in code | Avoids Redis dependency for MVP. TTL enforced in application logic, not infra. |
| Auth | None for demo | API keys in Vercel environment variables. Never client-exposed. |
| Scheduling | GitHub Actions (cron) | Free, no additional infra. Triggers Python ingestion scripts on schedule. |

**Cost estimate per week (steady state):**

| Item | Cost |
|------|------|
| 5 posts × $0.15 | $0.75 |
| Apify scrape (weekly, 300 posts) | ~$1.50 |
| GitHub Actions (free tier) | $0.00 |
| Vercel (hobby tier) | $0.00 |
| **Total/week** | **~$2.25** |

---

## 12. File & Folder Structure

```
linkedin-post-gen/
├── README.md                          # Setup, prompt version links, demo URL
├── .env.example                       # Template for required env vars (no secrets)
├── .github/
│   └── workflows/
│       ├── ingest_trends.yml          # Daily: runs trend_ingestor.py at 08:00 UTC
│       └── ingest_corpus.yml          # Weekly: runs corpus_ingestor.py Monday 07:00 UTC
│
├── config/
│   └── topics.json                    # Industry, topic focus, relevance keywords
│
├── prompts/
│   ├── system_v1.txt                  # Layer 1: persona + brand voice + constraints
│   ├── directive_v1.txt               # Layer 3: generation directive template
│   ├── style_extraction_v1.txt        # Module A: style guide extraction prompt
│   ├── trend_brief_v1.txt             # Module B: trend brief synthesis prompt
│   └── lint_v1.txt                    # Module E: LLM-assisted WARN lint prompt
│
├── ingestion/
│   ├── apify_config.json              # Apify actor configuration
│   ├── corpus_ingestor.py             # Triggers Apify run, stores corpus to SQLite
│   └── trend_ingestor.py              # Fetches HN + Reddit + GitHub, stores trend brief
│
├── lib/
│   ├── db.ts                          # SQLite client (via better-sqlite3)
│   ├── style_guide.ts                 # Reads style_guide.json, exposes summary
│   ├── trend_brief.ts                 # Reads trend brief from SQLite with TTL check
│   ├── prompt_builder.ts              # Assembles 3-layer prompt from components
│   ├── generator.ts                   # Calls LLM API, parses JSON output
│   └── linter.ts                      # Deterministic BLOCK rules + similarity check
│
├── data/
│   ├── corpus.db                      # SQLite DB (corpus posts + trend brief)
│   ├── style_guide.json               # Current style guide (machine-readable)
│   └── style_guide_summary.md         # Current style guide (human-readable, diffable)
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # Main UI: Generate button + post display
│   └── api/
│       ├── generate/
│       │   └── route.ts               # POST /api/generate — runs Modules C–E
│       ├── trends/
│       │   └── route.ts               # GET /api/trends — returns current trend brief
│       └── ingestion/
│           └── corpus/
│               └── route.ts           # POST /api/ingestion/corpus — Apify webhook
│
├── lint/
│   ├── similarity.py                  # Trigram Jaccard similarity checker
│   └── block_rules.ts                 # Deterministic BLOCK rule implementations
│
└── tests/
    ├── unit/
    │   ├── linter.test.ts
    │   └── prompt_builder.test.ts
    └── integration/
        └── generate.test.ts           # Full pipeline test with mocked LLM response
```

---

## 13. Data Models & Schemas

### 13.1 `corpus_posts` table (SQLite)

```sql
CREATE TABLE corpus_posts (
  post_id TEXT PRIMARY KEY,
  creator_url TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  hook_type TEXT,                    -- enum: question|counterintuitive|specific_number|mini_story|list_tease
  hook_length_chars INTEGER,
  post_length_chars INTEGER,
  line_break_density REAL,
  uses_bullets INTEGER,              -- 0 or 1
  credibility_signal TEXT,
  cta_type TEXT,                     -- enum: none|soft|direct|link
  engagement_tier TEXT,              -- enum: high|medium|low
  scraped_at TEXT NOT NULL           -- ISO 8601
);
```

### 13.2 `trend_items` table (SQLite)

```sql
CREATE TABLE trend_items (
  trend_id TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,         -- enum: hackernews|reddit|github
  published_at TEXT NOT NULL,        -- ISO 8601
  relevance_score INTEGER NOT NULL,  -- 1–5
  content_angle TEXT,
  cached_at TEXT NOT NULL,           -- ISO 8601
  expired INTEGER DEFAULT 0          -- 0 or 1 (set to 1 after 7 days)
);
```

### 13.3 `generated_posts` table (SQLite)

```sql
CREATE TABLE generated_posts (
  post_id TEXT PRIMARY KEY,
  industry TEXT NOT NULL,
  topic_focus TEXT NOT NULL,
  hook_archetype TEXT,
  hook_clarity_score INTEGER,
  body TEXT NOT NULL,
  char_count INTEGER,
  credibility_signals TEXT,          -- JSON array stored as string
  trend_source TEXT,
  post_type TEXT,
  cta_type TEXT,
  lint_flags TEXT,                   -- JSON array stored as string
  generated_at TEXT NOT NULL         -- ISO 8601
);
```

### 13.4 `style_guide` (JSON file — not SQLite)

```json
{
  "version": "1.0",
  "generated_at": "<ISO 8601>",
  "hook_archetypes": [
    {
      "name": "<archetype name>",
      "structure": "<example structure — no copied text>",
      "example_scaffold": "<fill-in-the-blank template>"
    }
  ],
  "length_range": { "p25": 850, "p75": 1280 },
  "line_break_density_norm": 2.3,
  "credibility_moves": ["<move 1>", "<move 2>"],
  "cta_patterns": { "high_engagement": [], "low_engagement": [] },
  "anti_patterns": ["<phrase 1>", "<phrase 2>"]
}
```

---

## 14. API Design

### `POST /api/generate`

Triggers Modules C–E. Returns a batch of linted posts.

**Request:**
```json
{
  "industry": "Computer Science / B2B SaaS",
  "topic_focus": "Claude + Excel Workflows",
  "num_posts": 5,
  "voice_preset": "founder"
}
```

**Response (200):**
```json
{
  "batch_id": "<uuid>",
  "generated_at": "<ISO 8601>",
  "prompt_version": "v1.0",
  "posts": [
    {
      "post_id": "<uuid>",
      "industry": "Computer Science / B2B SaaS",
      "topic_focus": "Claude + Excel Workflows",
      "hook_archetype": "Specific number opener",
      "hook_clarity_score": 8,
      "body": "<full post text>",
      "char_count": 1124,
      "credibility_signals": ["Claude API", "87% reduction in manual steps"],
      "trend_source": "https://news.ycombinator.com/item?id=...",
      "post_type": "workflow",
      "cta_type": "soft",
      "lint_flags": [
        { "rule": "WARN: vague_cta", "severity": "WARN", "suggestion": "..." }
      ],
      "generated_at": "<ISO 8601>"
    }
  ],
  "failed_slots": 0,
  "trend_brief_freshness": "2026-03-28T08:00:00Z"
}
```

**Response (500):**
```json
{
  "error": "generation_failed",
  "message": "<human-readable description>",
  "retries_exhausted": true
}
```

---

### `GET /api/trends`

Returns the current cached trend brief.

**Response (200):**
```json
{
  "cached_at": "<ISO 8601>",
  "items": [
    {
      "trend_id": "<uuid>",
      "headline": "<string>",
      "source_url": "<string>",
      "source_name": "hackernews",
      "published_at": "<ISO 8601>",
      "relevance_score": 4,
      "content_angle": "<string>"
    }
  ]
}
```

---

### `POST /api/ingestion/corpus`

Receives Apify run completion webhook, processes raw posts, stores to SQLite.

**Request (from Apify):**
```json
{
  "eventType": "ACTOR.RUN.SUCCEEDED",
  "eventData": { "actorRunId": "<string>" }
}
```

**Response (200):**
```json
{ "status": "ok", "posts_ingested": 47 }
```

---

## 15. Data Ingestion Cadence

| Component | Cadence | Trigger | Notes |
|-----------|---------|---------|-------|
| Corpus (Apify) | Weekly — Monday 07:00 UTC | GitHub Actions cron | Incremental: only new posts since last run. Full re-extraction quarterly. |
| Style Guide | Weekly — after corpus update | Triggered by corpus webhook | Git-tracked — each version is diffable. |
| Trend Brief (HN) | Daily — 08:00 UTC | GitHub Actions cron | 24h TTL in SQLite. |
| Trend Brief (Reddit) | Daily — 08:30 UTC | GitHub Actions cron | Separate entry per subreddit. |
| Trend Brief (GitHub) | Daily — 09:00 UTC | GitHub Actions cron | Language filter: Python, JavaScript. |
| Post Generation | On-demand | Generate button click | Uses latest cached Style Guide + Trend Brief. |
| Force refresh | On-demand | Admin/demo UI button | Bypasses TTL, re-fetches trend brief immediately. |

---

## 16. State Management Strategy

**Frontend (Next.js):**
- React `useState` for UI state (loading, posts, error)
- No global state manager needed at MVP scale
- Trend brief fetched on page load via `GET /api/trends`; displayed in sidebar
- Generate results replace current post list on each call (no pagination in v1)

**Backend:**
- All persistent state in SQLite (`corpus.db`)
- Style guide loaded from flat JSON file at request time (fast file read, no DB query)
- Trend brief assembled from SQLite query filtered by `expired = 0` and `published_at > 7 days ago`
- Generated posts optionally persisted to `generated_posts` table for audit trail

**Prompt context assembly (stateless per request):**

```
prompt = system_prompt + style_guide_summary (≤500 tokens) + trend_brief_top7 + directive
```

No conversation history carried between Generate calls — each call is fully self-contained.

---

## 17. Performance Considerations

| Bottleneck | Mitigation |
|------------|------------|
| LLM API latency | Use streaming response for generation. Frontend shows posts as they stream in rather than waiting for full batch. p99 target: ≤25s. |
| Style guide context size | Cap style guide summary at 500 tokens. Full extraction stored separately; only summary injected into prompt. |
| Trend brief staleness | 24h TTL with force-refresh button. SQLite query is fast (<10ms) for <1000 rows. |
| Similarity check at scale | For MVP corpus of <500 posts, trigram Jaccard runs in <1s in Python. No optimization needed until corpus exceeds 5K posts. |
| Apify scrape cost | Weekly cadence limits to ~4 runs/month. Incremental update (only new posts) reduces rows processed per run. |
| Linting retries | Max 2 retries per post. If both fail, slot is marked `failed` — never blocks the UI. |

---

## 18. Security Considerations

| Risk | Mitigation |
|------|------------|
| API key exposure | All keys (LLM provider, Apify) in Vercel environment variables. Never in client-side code or committed to repo. `.env.example` in repo with placeholder values. |
| Apify webhook spoofing | Validate webhook requests with a shared secret token passed as a header. Reject requests missing or mismatching the token. |
| Corpus copyright | Trigram similarity gate (>40% = BLOCK) prevents surface-reproducing creator content. Raw corpus text stored locally only; never exposed via API. |
| Prompt injection via trend items | Sanitize trend item text before injecting into prompts. Strip any tokens that could alter prompt structure (e.g., `###`, `<s>`). |
| Fabricated statistics | Linter cross-references any specific number in the post against trend brief items. Flag if number cannot be traced to a source. |
| Competitor disparagement | Linter flags posts naming a competitor with a negative comparative claim. |
| Rate limiting | Add basic rate limiting on `/api/generate` (max 10 calls/hour per IP) to prevent abuse and runaway API costs. |

---

## 19. Edge Cases & Failure Handling

| Scenario | Handling |
|----------|----------|
| Trend brief is empty (no items scored ≥3 relevance) | Fall back to style-guide-only generation. Log a warning. Surface "No fresh trends found — posts generated from style guide only" in UI. |
| All 5 post slots fail linting after 2 retries | Return partial batch (however many passed). Surface failure count and flag reasons in UI. Never return an empty response without explanation. |
| Apify run fails or times out | Retry once after 5 minutes via GitHub Actions. If still failing, log to Actions output. Style guide update skipped for that week; previous version used. |
| LLM API returns malformed JSON | Parse defensively with try/catch. If JSON cannot be parsed, retry the generation call once. If second attempt also fails, return 500 with `generation_failed` error. |
| GitHub Trending page layout changes | Wrap scraper in try/catch. Log scrape failure. Skip GitHub items for that day; HN + Reddit items still used. |
| Reddit rate limiting | Use exponential backoff (1s, 2s, 4s) for Reddit API calls. Reddit allows ~60 requests/minute without auth. |
| Hook score self-report inconsistency | If model reports hook score ≥7 but deterministic checker detects a banned opener phrase, the BLOCK rule takes precedence over the self-report. |
| Style guide file missing | If `style_guide.json` is not found at startup, fall back to a hardcoded minimal style guide (3 hook archetypes, basic length norms). Log a critical error. |

---

## 20. Testing Strategy

### Unit Tests (`/tests/unit/`)

| Test | What it covers |
|------|----------------|
| `linter.test.ts` | Each BLOCK rule fires correctly on synthetic bad posts |
| `prompt_builder.test.ts` | Prompt assembly produces correct layer structure; no injection vectors |
| `similarity.test.ts` | Trigram Jaccard returns correct scores for known overlapping/non-overlapping strings |
| `trend_brief.test.ts` | TTL expiry logic correctly filters items older than 7 days |

### Integration Tests (`/tests/integration/`)

| Test | What it covers |
|------|----------------|
| `generate.test.ts` | Full `/api/generate` pipeline with mocked LLM response returns valid JSON conforming to output schema |
| `ingestion.test.ts` | Corpus webhook handler correctly stores a sample Apify response to SQLite |

### Manual QA Checklist (before demo submission)

- [ ] Click Generate — receive 5 posts within 25 seconds
- [ ] All 5 posts have hook clarity score ≥7
- [ ] All 5 posts have at least one credibility signal
- [ ] No post starts with a banned opener phrase
- [ ] Trend brief shows ≥4 items from last 7 days
- [ ] Force refresh button updates trend brief
- [ ] No API keys visible in browser network tab or page source
- [ ] Demo URL accessible without login

---

## 21. Observability

| Signal | Implementation |
|--------|---------------|
| Generation latency | Log start + end timestamps for each Generate call. Console in dev; Vercel function logs in prod. |
| Hook score distribution | Log array of hook scores per batch. Alert (console.error) if avg drops below 7. |
| Lint pass/fail rate | Log BLOCK + WARN counts per batch. Alert if pass rate <80%. |
| Trend brief freshness | Log oldest and newest item date at each generation call. Surface in UI for demo. |
| Apify run status | GitHub Actions log captures run ID and post count ingested per weekly run. |
| Cost tracking | Log estimated token count per generation call (input + output tokens). Calculate estimated cost at rate for model used. |
| Error tracking | All caught errors logged with context (module name, input parameters, error message). In MVP: console.error. In Phase 2: Sentry or LogTail. |

---

## 22. Milestone Breakdown

### Phase 1 — Foundation (Days 1–2)

- [ ] Repo setup: Next.js 14, SQLite, folder structure per Section 12
- [ ] Apify config + manual corpus collection (10 creators, 300+ posts)
- [ ] `corpus_ingestor.py`: store raw posts to SQLite
- [ ] Style guide extraction: run Module A prompt against corpus, store `style_guide.json`
- [ ] `trend_ingestor.py`: fetch HN + Reddit + GitHub, store to SQLite
- [ ] Verify trend brief has ≥5 items with relevance ≥3

### Phase 2 — Generation Pipeline (Days 3–4)

- [ ] `prompt_builder.ts`: assemble 3-layer prompt from style guide + trend brief + directive
- [ ] `generator.ts`: call LLM API, parse JSON output, handle malformed response
- [ ] `linter.ts`: implement all BLOCK rules deterministically
- [ ] `similarity.py`: trigram Jaccard similarity checker
- [ ] `POST /api/generate` route: full Modules C–E pipeline
- [ ] Return valid JSON batch conforming to output schema

### Phase 3 — UI + Deploy (Day 5)

- [ ] `app/page.tsx`: Generate button, post display, WARN flag display, trend brief sidebar
- [ ] `GET /api/trends` route
- [ ] Deploy to Vercel; set environment variables
- [ ] Manual QA checklist pass
- [ ] README with demo URL, prompt version links, setup instructions

### Phase 4 — Polish (Day 6, if time permits)

- [ ] A/B hook variants: generate 2 hook options per post, display both in UI
- [ ] Force refresh trends button in UI
- [ ] Prompt version display in UI
- [ ] Full WARN lint rules + LLM-assisted lint prompt (Module E)
- [ ] Brand voice toggle (founder vs. company)

---

## 23. Prioritized Feature Roadmap

### Priority 1 — MVP (Required for Submission)

1. Module A: Corpus collection (Apify) + style guide extraction (5+ hook archetypes)
2. Module B: Trend brief from HN + 1 Reddit subreddit + GitHub Trending
3. Modules C–D: End-to-end generation of 5 posts per Generate click, conforming to output schema
4. Module E: Deterministic linter enforcing all BLOCK rules
5. Deployed demo URL (Vercel); GitHub repo with versioned prompt files

### Priority 2 — Strong Submission (High Value, Low Effort)

1. A/B hook variants — 2 hook options per post, displayed in UI for selection
2. Full WARN lint rules + surface in UI with fix suggestions
3. Brand voice presets — founder voice vs. company voice (toggle in UI)
4. Force refresh trends button in UI
5. Prompt version display in each output

### Priority 3 — Bonus / Scaling (If Time Permits)

1. Corpus similarity score displayed per post in UI
2. Auto-generated comment reply pack (3–5 suggested replies per post)
3. Multi-industry dropdown (switch without redeploying)
4. Vendor changelog ingestion (Anthropic/OpenAI RSS feeds)
5. Cost dashboard — token usage + estimated cost per Generate call in UI
6. Performance feedback loop — thumbs up/down per post, feeds back into style guide weighting

---

## 24. Risks & Tradeoffs

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Apify LinkedIn scraper breaks (LinkedIn changes DOM) | Medium | High | Pre-seed corpus manually if scraper fails. Check actor health before first run. |
| LLM returns malformed JSON | Low | Medium | Parse defensively; retry once. Return partial batch if second attempt fails. |
| Trend brief has <3 relevant items for niche topic | Medium | Low | Fall back to style-guide-only generation. Post quality still acceptable without trend grounding. |
| Hook self-scoring inconsistency (model over-scores) | Medium | Medium | Deterministic banned-phrase check overrides self-report. Manual QA of first 3 batches. |
| SQLite not suitable for concurrent requests | Low (MVP) | Low | MVP is single-user demo. Phase 2: migrate to Supabase if concurrent usage needed. |
| 25s p99 latency exceeded | Low | High | Use streaming. Generate and stream posts one at a time rather than waiting for full batch. |
| Apify cost overrun | Low | Low | Weekly cadence = ~4 runs/month. Cap by setting Apify actor memory + timeout limits. |

**Key tradeoff — SQLite vs. hosted DB:**
Chose SQLite for MVP because it eliminates all infra setup time. For a solo dev with <1 week, this saves 2–4 hours. The tradeoff is no concurrent write safety and no easy cloud inspection. Acceptable for a demo; swap to Supabase in Phase 2.

---

## 25. Open Questions

| Question | Owner | Notes |
|----------|-------|-------|
| Which specific LinkedIn creator profiles to seed in corpus? | Dev | Must be validated manually before Apify run. Aim for 10–15 across 3–4 archetypes. |
| Does Apify `linkedin-post-scraper` return engagement data (reaction counts)? | Dev | Validate before relying on it for engagement_tier labeling. If not, manually label a 50-post sample. |
| What is the actual LLM cost per generation call with current prompt size? | Dev | Estimate: ~3,000 input tokens + ~2,500 output tokens × 5 posts. Validate against usage dashboard after first 10 runs. |
| Should generated posts be stored persistently for audit? | Dev | Recommended yes (adds ~5 min of work). Enables debugging and quality tracking. |
| Is a secondary industry (Investment Banking) required for the demo? | Erica / Pronexus | Current spec defaults to CS/B2B SaaS. IB support is a config change, not an architecture change. |

---

## 26. Appendix: Prompt Templates

All prompt files stored in `/prompts/`, version-controlled, linked from README.

### 26.1 Style Guide Extraction Prompt (Module A)

```
# /prompts/style_extraction_v1.txt

You are a LinkedIn content analyst. I will give you a set of high-performing B2B LinkedIn posts.
For each post, extract the following fields as a JSON object:
hook_type, hook_length_chars, post_length_chars, line_break_density, uses_bullets,
credibility_signal, cta_type.

Then, across ALL posts, synthesize a Style Guide with:
- 5+ named hook archetypes (with example structures — no copied text from source posts)
- Optimal length range (P25/P75 character counts)
- Rhythm rules (line break density norms, paragraph length norms)
- Credibility move taxonomy (how top creators signal authority)
- CTA patterns (what CTAs appear in high vs. low engagement posts)
- A list of 10+ anti-patterns to avoid

Output: { "posts": [...], "style_guide": {...} }
JSON only. No preamble. No markdown.
```

### 26.2 Trend Brief Synthesis Prompt (Module B)

```
# /prompts/trend_brief_v1.txt

You are a trend analyst. Here are the top stories from Hacker News, Reddit, and GitHub Trending
from the last 7 days: [RAW_ITEMS]

Industry: [INDUSTRY]
Topic focus: [TOPIC_FOCUS]

Select the 5–10 most relevant items. For each, output:
- headline (<15 words)
- source_url
- published_at (date)
- relevance_score (1–5, where 5 = directly maps to industry + topic focus)
- content_angle (one sentence: how this could become a LinkedIn post)

Exclude any items older than 7 days.
Output: { "trend_brief": [...] }
JSON only. No preamble. No markdown.
```

### 26.3 Post Generation Prompt (Modules C–D)

```
# /prompts/generation_v1.txt

STYLE GUIDE SUMMARY:
[STYLE_GUIDE_SUMMARY — max 500 tokens]

TREND BRIEF (top 7 by relevance):
[TREND_BRIEF_JSON]

TASK: Generate [N] LinkedIn posts.
Industry: [INDUSTRY]
Topic focus: [TOPIC_FOCUS]
Audience: Mid-to-senior ICs, founders, PMs in B2B SaaS. Skeptical of hype. Reward specificity.

For each post:
1. Choose a hook archetype from the style guide. Label it in the output.
2. Include at least one credibility signal: a specific number, named tool, or dated event.
3. Keep body between [MIN_CHARS] and [MAX_CHARS] characters.
4. Assign a post type: trend_reaction | workflow | contrarian | mini_case_study | question
5. Self-score the hook on this rubric:
   - Specificity (0–4): 4=specific number/name/date, 3=concrete claim, 2=moderately concrete, 1=vague, 0=generic
   - Curiosity gap (0–3): 3=strong open loop, 2=mildly intriguing, 1=predictable, 0=none
   - No banned phrases (0–3): 3=zero, 2=one borderline, 0=any banned phrase
   If total < 7, regenerate the hook before including in output.
6. Do not use banned phrases: 'In today's world', 'Excited to share', 'Game changer',
   'Let that sink in', 'I'm humbled', 'Hot take:', 'Unpopular opinion:' (unless genuinely contrarian)
7. Use only trend data from the provided Trend Brief. Do not invent trend data.

Output: JSON array conforming to this schema:
{
  "post_id": "<uuid>",
  "industry": "<string>",
  "topic_focus": "<string>",
  "hook_archetype": "<string>",
  "hook_clarity_score": <integer 1-10>,
  "body": "<full post text — no markdown, line breaks as in LinkedIn>",
  "char_count": <integer>,
  "credibility_signals": ["<signal 1>"],
  "trend_source": "<URL or 'none'>",
  "post_type": "<string>",
  "cta_type": "none | soft | direct | link",
  "lint_flags": [],
  "generated_at": "<ISO 8601>"
}

JSON array only. No preamble. No markdown.
```

### 26.4 Lint Prompt — WARN Rules Only (Module E)

```
# /prompts/lint_v1.txt

You are a LinkedIn post editor. Review the following post for WARN-level issues only.
BLOCK rules are handled deterministically upstream — do not re-check them here.

Check for:
1. Vague CTA: generic 'thoughts?' without specificity (e.g., 'have you tried X?' is better)
2. Passive voice density: >25% of sentences in passive voice
3. Excessive bullet density: >60% of post body is bullet points

For each issue found, output:
{ "rule": "<rule name>", "severity": "WARN", "excerpt": "<offending text>", "suggestion": "<fix>" }

If no issues found: []
JSON array only. No preamble. No markdown.

POST TO REVIEW:
[POST_BODY]
```

---

*End of Document — v1.1 Build-Ready*
*Next step: Phase 1 milestone (repo setup + corpus collection). See Section 22.*