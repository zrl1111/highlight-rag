"""
BM25-based RAG index.

Each chunk stores its original text, page_idx, and bbox so callers can map
a retrieval result directly back to a location in the PDF viewer.
"""

from __future__ import annotations

import re
from typing import Any

from rank_bm25 import BM25Okapi


def _tokenize(text: str) -> list[str]:
    """Tokenize for BM25; uses jieba for Chinese if available."""
    try:
        import jieba
        return list(jieba.cut(text.lower()))
    except ImportError:
        pass
    return re.findall(r"\w+", text.lower())


class RAGIndex:
    def __init__(self) -> None:
        self._chunks: list[dict[str, Any]] = []
        self._bm25: BM25Okapi | None = None

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def build(self, chunks: list[dict[str, Any]]) -> None:
        """Index a list of chunks produced by parser.parse_pdf()."""
        self._chunks = chunks
        tokenized = [_tokenize(c["text"]) for c in chunks]
        self._bm25 = BM25Okapi(tokenized)

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Return top-k chunks ranked by BM25, each augmented with a score."""
        if self._bm25 is None or not self._chunks:
            return []

        tokens = _tokenize(query)
        scores = self._bm25.get_scores(tokens)

        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)

        results: list[dict[str, Any]] = []
        for idx, score in ranked[:top_k]:
            if score <= 0:
                continue
            chunk = dict(self._chunks[idx])
            chunk["score"] = round(float(score), 4)
            results.append(chunk)

        return results
