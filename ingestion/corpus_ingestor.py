"""
Corpus ingestion via Apify (weekly). Starts an actor run; posts land in SQLite via the
Next.js webhook ``/api/ingestion/corpus`` when configured.

- Do not log ``APIFY_API_TOKEN`` or echo API responses that may contain secrets.
- ``input.profileUrls`` must be **LinkedIn** profile or post URLs (see ``docs/INGESTION.md``),
  not your app URL.

If ``APIFY_API_TOKEN`` is unset, exits 0 after a clear skip message (safe for scheduled CI).

For local tests without Apify, POST sample posts to ``/api/ingestion/corpus`` with the webhook secret.

Run: ``python ingestion/corpus_ingestor.py``
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import httpx

CONFIG_PATH = _REPO_ROOT / "ingestion" / "apify_config.json"


def load_apify_input() -> dict[str, Any]:
    """Load actor + input template."""
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    """Start Apify actor run when token is present; otherwise no-op for CI."""
    token = os.environ.get("APIFY_API_TOKEN", "").strip()
    if not token:
        print(
            "SKIP: APIFY_API_TOKEN not set - no Apify run started. "
            "Add the repo secret for scheduled corpus triggers.",
            file=sys.stderr,
        )
        sys.exit(0)

    cfg = load_apify_input()
    actor = cfg.get("actor") or "apify/linkedin-post-scraper"
    actor_input = cfg.get("input") or {}

    # Start actor run (Apify API v2). Never print the token or full error bodies in CI logs if sensitive.
    url = f"https://api.apify.com/v2/acts/{actor.replace('/', '~')}/runs"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"input": actor_input}

    with httpx.Client() as client:
        r = client.post(url, headers=headers, json=body, timeout=60.0)
        if r.status_code >= 400:
            snippet = (r.text or "")[:500]
            print(f"Apify error HTTP {r.status_code} (body truncated): {snippet}", file=sys.stderr)
            sys.exit(1)
        data = r.json()
        run_id = data.get("data", {}).get("id") or data.get("id")
        print(
            f"Started Apify run: {run_id}. "
            "On success, webhook should POST to your deployed /api/ingestion/corpus."
        )


if __name__ == "__main__":
    main()
