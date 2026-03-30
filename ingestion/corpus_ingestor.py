"""
Corpus ingestion via Apify (weekly). Requires APIFY_API_TOKEN and configured actor input.

For a quick local test without Apify, POST sample posts to /api/ingestion/corpus with the webhook secret.

Run: `python ingestion/corpus_ingestor.py`
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "ingestion" / "apify_config.json"


def load_apify_input() -> dict[str, Any]:
    """Load actor + input template."""
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    token = os.environ.get("APIFY_API_TOKEN", "").strip()
    if not token:
        print("Set APIFY_API_TOKEN to trigger an Apify actor run.", file=sys.stderr)
        sys.exit(1)

    cfg = load_apify_input()
    actor = cfg.get("actor") or "apify/linkedin-post-scraper"
    actor_input = cfg.get("input") or {}

    # Start actor run (Apify API v2)
    url = f"https://api.apify.com/v2/acts/{actor.replace('/', '~')}/runs"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"input": actor_input}

    with httpx.Client() as client:
        r = client.post(url, headers=headers, json=body, timeout=60.0)
        if r.status_code >= 400:
            print(f"Apify error {r.status_code}: {r.text}", file=sys.stderr)
            sys.exit(1)
        data = r.json()
        run_id = data.get("data", {}).get("id") or data.get("id")
        print(f"Started Apify run: {run_id}. Wire webhook to /api/ingestion/corpus when complete.")


if __name__ == "__main__":
    main()
