"""Trigram Jaccard similarity for corpus guardrails (PRD Module E)."""

from __future__ import annotations

import re
from typing import Iterable


def _tokens(text: str) -> list[str]:
    s = re.sub(r"[^\w\s]+", " ", text.lower())
    return [t for t in s.split() if t]


def _trigrams(tokens: list[str]) -> set[str]:
    if len(tokens) < 3:
        return {" ".join(tokens)} if tokens else set()
    return {" ".join(tokens[i : i + 3]) for i in range(0, len(tokens) - 2)}


def trigram_jaccard(a: str, b: str) -> float:
    """Jaccard similarity of word trigram sets."""
    ta, tb = _trigrams(_tokens(a)), _trigrams(_tokens(b))
    if not ta and not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def check_similarity(generated_post: str, corpus: Iterable[str]) -> float:
    """
    Max trigram Jaccard similarity against any corpus post.
    BLOCK if score > 0.40; WARN if > 0.25 (caller decides).
    """
    best = 0.0
    for c in corpus:
        j = trigram_jaccard(generated_post, c)
        if j > best:
            best = j
    return best


if __name__ == "__main__":
    sample = "one two three four five six seven"
    assert check_similarity(sample, [sample]) >= 0.99
