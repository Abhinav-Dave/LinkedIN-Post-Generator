"""Shared filesystem paths for ingestion scripts (aligned with lib/db.ts getDbPath)."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def get_corpus_db_path() -> Path:
    """Resolve SQLite path: CORPUS_DB_PATH env (absolute or repo-relative), else data/corpus.db."""
    raw = os.environ.get("CORPUS_DB_PATH", "").strip()
    if raw:
        p = Path(raw)
        return p if p.is_absolute() else ROOT / p
    return ROOT / "data" / "corpus.db"
