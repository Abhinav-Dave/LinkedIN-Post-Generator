"""
Fetch Hacker News, Reddit, and GitHub Trending into SQLite `trend_items`.

Keywords and Reddit subs come from ``config/topics.json`` (see ``reddit_subreddits``,
``relevance_keywords``, ``topic_focus``). DB path matches Node ``lib/db.ts`` via
``CORPUS_DB_PATH`` or default ``data/corpus.db``.

Run from repo root: ``python ingestion/trend_ingestor.py``
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import httpx
from bs4 import BeautifulSoup

from ingestion.paths import ROOT, get_corpus_db_path

CONFIG_PATH = ROOT / "config" / "topics.json"

DEFAULT_TOPICS: dict[str, Any] = {
    "industry": "general",
    "topic_focus": ["AI", "LLM", "SaaS", "automation"],
    "relevance_keywords": ["AI", "LLM", "workflow", "SaaS", "automation", "agent"],
    "reddit_subreddits": ["LocalLLaMA", "MachineLearning", "cscareerquestions"],
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS trend_items (
  trend_id TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  published_at TEXT NOT NULL,
  relevance_score INTEGER NOT NULL,
  content_angle TEXT,
  cached_at TEXT NOT NULL,
  expired INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trend_published ON trend_items(published_at);
CREATE INDEX IF NOT EXISTS idx_trend_expired ON trend_items(expired);
"""


def load_topics() -> dict[str, Any]:
    """Load industry, keywords, and Reddit subreddits from config; fallback if missing or invalid."""
    if not CONFIG_PATH.is_file():
        print(f"topics config missing at {CONFIG_PATH}; using built-in fallback.", file=sys.stderr)
        return dict(DEFAULT_TOPICS)
    try:
        with CONFIG_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"topics config unreadable ({exc}); using built-in fallback.", file=sys.stderr)
        return dict(DEFAULT_TOPICS)
    if not isinstance(data, dict):
        print("topics config must be a JSON object; using built-in fallback.", file=sys.stderr)
        return dict(DEFAULT_TOPICS)
    merged = dict(DEFAULT_TOPICS)
    merged.update(data)
    subs = merged.get("reddit_subreddits")
    if not isinstance(subs, list) or not subs:
        merged["reddit_subreddits"] = list(DEFAULT_TOPICS["reddit_subreddits"])
    else:
        merged["reddit_subreddits"] = [str(s).strip() for s in subs if str(s).strip()]
    return merged


def stable_id(*parts: str) -> str:
    """Deterministic short id from URL/source."""
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return h[:32]


def relevance_score(title: str, cfg: dict[str, Any]) -> int:
    """Map keyword overlap to 1–5."""
    blob = (title or "").lower()
    keys = [k.lower() for k in cfg.get("relevance_keywords", [])]
    focus = cfg.get("topic_focus", [])
    if isinstance(focus, list):
        keys.extend(str(x).lower() for x in focus)
    hits = sum(1 for k in keys if k and k in blob)
    if hits >= 5:
        return 5
    if hits >= 3:
        return 4
    if hits >= 2:
        return 3
    if hits >= 1:
        return 2
    return 1


def ensure_db(conn: sqlite3.Connection) -> None:
    """Create trend tables and indexes if they do not exist."""
    conn.executescript(SCHEMA)


def mark_expired(conn: sqlite3.Connection) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    conn.execute("UPDATE trend_items SET expired = 1 WHERE published_at < ?", (cutoff,))


def upsert_trend(
    conn: sqlite3.Connection,
    *,
    trend_id: str,
    headline: str,
    source_url: str,
    source_name: str,
    published_at: str,
    score: int,
    content_angle: str,
    cached_at: str,
) -> None:
    conn.execute(
        """
        INSERT INTO trend_items (
          trend_id, headline, source_url, source_name, published_at,
          relevance_score, content_angle, cached_at, expired
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(trend_id) DO UPDATE SET
          headline=excluded.headline,
          source_url=excluded.source_url,
          source_name=excluded.source_name,
          published_at=excluded.published_at,
          relevance_score=excluded.relevance_score,
          content_angle=excluded.content_angle,
          cached_at=excluded.cached_at,
          expired=0
        """,
        (trend_id, headline, source_url, source_name, published_at, score, content_angle, cached_at),
    )


def fetch_reddit_sub(
    client: httpx.Client,
    conn: sqlite3.Connection,
    cfg: dict[str, Any],
    sub: str,
    cached_at: str,
) -> int:
    url = f"https://www.reddit.com/r/{sub}/top.json?t=week&limit=50"
    headers = {"User-Agent": "LinkedINPostGenerator/1.1 (trend ingest)"}
    n = 0
    data = None
    for attempt in (0, 1, 2):
        try:
            r = client.get(url, headers=headers, timeout=30.0)
            r.raise_for_status()
            data = r.json()
            break
        except httpx.HTTPError:
            time.sleep(1 * (2**attempt))
    if not data:
        return 0
    posts = data.get("data", {}).get("children", [])
    for child in posts:
        p = child.get("data") or {}
        title = p.get("title") or ""
        score_r = int(p.get("score") or 0)
        if score_r < 100:
            continue
        permalink = p.get("permalink") or ""
        link = f"https://www.reddit.com{permalink}" if permalink else "https://www.reddit.com"
        created = float(p.get("created_utc") or 0)
        published = datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
        rel = relevance_score(title, cfg)
        if rel < 3:
            continue
        tid = stable_id("reddit", sub, permalink or title)
        angle = f"Translate this discussion for operators/ICs: {title[:100]}"
        upsert_trend(
            conn,
            trend_id=tid,
            headline=title[:500],
            source_url=link,
            source_name="reddit",
            published_at=published,
            score=rel,
            content_angle=angle,
            cached_at=cached_at,
        )
        n += 1
    return n


def fetch_github_trending(client: httpx.Client, conn: sqlite3.Connection, cfg: dict[str, Any], cached_at: str) -> int:
    """Best-effort parse of github.com/trending (HTML may change)."""
    url = "https://github.com/trending/python?since=daily"
    headers = {"User-Agent": "LinkedINPostGenerator/1.1"}
    try:
        r = client.get(url, headers=headers, timeout=30.0)
        r.raise_for_status()
    except httpx.HTTPError:
        return 0
    soup = BeautifulSoup(r.text, "html.parser")
    articles = soup.select("article.Box-row")
    n = 0
    for art in articles[:15]:
        a = art.select_one("h2 a")
        if not a:
            continue
        href = a.get("href") or ""
        name = a.get_text(strip=True).replace("\n", " ").strip()
        p = art.select_one("p.col-9")
        desc = p.get_text(" ", strip=True) if p else ""
        title = f"{name}: {desc}"[:500]
        link = f"https://github.com{href}" if href.startswith("/") else href
        rel = relevance_score(title, cfg)
        if rel < 3:
            continue
        tid = stable_id("gh", link)
        published = datetime.now(timezone.utc).isoformat()
        angle = "Tooling trend: who should adopt this first, and what breaks in production?"
        upsert_trend(
            conn,
            trend_id=tid,
            headline=title,
            source_url=link,
            source_name="github",
            published_at=published,
            score=rel,
            content_angle=angle,
            cached_at=cached_at,
        )
        n += 1
    return n


def main() -> None:
    """Run all trend sources, upsert into SQLite, and log row counts."""
    db_path = get_corpus_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    cfg = load_topics()
    cached_at = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(db_path)
    try:
        ensure_db(conn)
        mark_expired(conn)
        total = 0
        with httpx.Client() as client:
            hn = 0
            r = client.get("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=30.0)
            r.raise_for_status()
            ids = r.json()[:100]
            for story_id in ids:
                it = client.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                    timeout=30.0,
                )
                it.raise_for_status()
                item = it.json()
                if not item or item.get("type") != "story":
                    continue
                title = item.get("title") or ""
                url = item.get("url") or f"https://news.ycombinator.com/item?id={story_id}"
                ts = item.get("time")
                published = (
                    datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
                    if ts
                    else datetime.now(timezone.utc).isoformat()
                )
                score = relevance_score(title, cfg)
                if score < 3:
                    continue
                tid = stable_id("hn", str(story_id))
                angle = f"LinkedIn angle: what builders should do differently given: {title[:120]}"
                upsert_trend(
                    conn,
                    trend_id=tid,
                    headline=title[:500],
                    source_url=url,
                    source_name="hackernews",
                    published_at=published,
                    score=score,
                    content_angle=angle,
                    cached_at=cached_at,
                )
                hn += 1
            total += hn

            subs = cfg.get("reddit_subreddits") or DEFAULT_TOPICS["reddit_subreddits"]
            for sub in subs:
                total += fetch_reddit_sub(client, conn, cfg, str(sub), cached_at)

            total += fetch_github_trending(client, conn, cfg, cached_at)

        conn.commit()
        if total == 0:
            print(
                f"No trend rows passed relevance>=3 this run (sources may be empty or keywords too strict). DB: {db_path}",
                file=sys.stderr,
            )
        print(f"Ingested {total} trend rows (relevance>=3). DB: {db_path}")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Trend ingest failed: {exc}", file=sys.stderr)
        sys.exit(1)
