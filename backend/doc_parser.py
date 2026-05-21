"""
PDF parsing via Azure Document Intelligence (prebuilt-layout model).

Public API (called from main.py):
    async def parse_pdf(pdf_path: str) -> tuple[list[dict], str]
        Returns (chunks, markdown_str) from a single API call.
    def post_process(chunks: list[dict]) -> list[dict]   # identity (kept for compat)

Chunk schema:
    {
        "text":     str,
        "page_idx": int,                            # 0-based
        "bbox":     [x0, y0, x1, y1] in [0, 1000], # axis-aligned
        "type":     "paragraph" | "table_cell",
    }

Auth:
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT  — resource endpoint URL
    AZURE_DOCUMENT_INTELLIGENCE_KEY       — API key (Key 1 or Key 2)

Limits (paid S0 tier):
    Up to 2,000 pages / 500 MB per call — no separate batch path needed.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

_documentintelligence = None
_azure_core = None


def _lazy_imports():
    global _documentintelligence, _azure_core
    if _documentintelligence is None:
        import azure.ai.documentintelligence as di
        _documentintelligence = di
    if _azure_core is None:
        import azure.core.credentials as creds
        _azure_core = creds


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _config() -> dict[str, str | None]:
    return {
        "endpoint": os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"),
        "key":      os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_KEY"),
    }


ANALYZE_TIMEOUT = 600   # seconds; Azure default is 300, raise for large docs


# ===========================================================================
# Public entry points
# ===========================================================================

async def parse_pdf(pdf_path: str) -> tuple[list[dict[str, Any]], str]:
    """Parse a PDF via Azure Document Intelligence.

    Returns (chunks, markdown_str) from a single API call:
      - chunks:       [{text, page_idx, bbox, type}]  — used for BM25 + highlighting
      - markdown_str: full document as Markdown        — tables as |col| syntax
    """
    cfg = _config()
    if not cfg["endpoint"] or not cfg["key"]:
        raise RuntimeError(
            "Azure Document Intelligence not configured. "
            "Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and "
            "AZURE_DOCUMENT_INTELLIGENCE_KEY in .env."
        )

    _lazy_imports()

    pdf_bytes = Path(pdf_path).read_bytes()

    client = _documentintelligence.DocumentIntelligenceClient(
        endpoint=cfg["endpoint"],
        credential=_azure_core.AzureKeyCredential(cfg["key"]),
    )

    request = _documentintelligence.models.AnalyzeDocumentRequest(
        bytes_source=pdf_bytes,
    )

    poller = await asyncio.to_thread(
        client.begin_analyze_document,
        "prebuilt-layout",
        body=request,
        output_content_format="markdown",   # result.content → Markdown; bbox data unaffected
    )
    result = await asyncio.to_thread(poller.result, timeout=ANALYZE_TIMEOUT)

    chunks       = _result_to_chunks(result)
    markdown_str = result.content or ""
    print(f"[azure] pages={len(result.pages)}  chunks={len(chunks)}  "
          f"markdown={len(markdown_str)} chars")
    return chunks, markdown_str


def post_process(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Identity pass-through. Kept so main.py callsite stays stable."""
    return chunks


# ===========================================================================
# Response → chunk schema
# ===========================================================================

def _result_to_chunks(result) -> list[dict[str, Any]]:
    """Convert analyzeResult to [{text, page_idx, bbox, type}]."""
    # 1. Build page dimension map  {pageNumber → (width_inch, height_inch)}
    page_dims: dict[int, tuple[float, float]] = {}
    for page in result.pages:
        page_dims[page.page_number] = (
            page.width  or 8.5,
            page.height or 11.0,
        )

    chunks: list[dict[str, Any]] = []

    # 2. Table cells — per-cell bbox, preserve rowSpan/colSpan naturally
    table_bboxes_by_page: dict[int, list[list[float]]] = {}

    for table in (result.tables or []):
        for cell in (table.cells or []):
            if not cell.content or not cell.bounding_regions:
                continue
            region = cell.bounding_regions[0]
            page_num = region.page_number
            w, h = page_dims.get(page_num, (8.5, 11.0))
            bbox = _polygon_to_bbox(region.polygon, w, h)
            if bbox is None:
                continue

            table_bboxes_by_page.setdefault(page_num, []).append(bbox)
            chunks.append({
                "text":     cell.content.strip(),
                "page_idx": page_num - 1,
                "bbox":     bbox,
                "type":     "table_cell",
            })

    # 3. Paragraphs — skip those that fall inside a table cell (dedup)
    for para in (result.paragraphs or []):
        if not para.content or not para.bounding_regions:
            continue
        region = para.bounding_regions[0]
        page_num = region.page_number
        w, h = page_dims.get(page_num, (8.5, 11.0))
        bbox = _polygon_to_bbox(region.polygon, w, h)
        if bbox is None:
            continue

        table_bboxes = table_bboxes_by_page.get(page_num, [])
        if any(_bbox_iou(bbox, tb) > 0.5 for tb in table_bboxes):
            continue

        text = para.content.strip()
        if not text:
            continue
        chunks.append({
            "text":     text,
            "page_idx": page_num - 1,
            "bbox":     bbox,
            "type":     "paragraph",
        })

    return chunks


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _polygon_to_bbox(polygon, page_w: float, page_h: float) -> list[float] | None:
    """8-float polygon (x,y pairs in inches) → [x0,y0,x1,y1] in [0,1000]."""
    if not polygon or len(polygon) < 2:
        return None
    xs = [p for i, p in enumerate(polygon) if i % 2 == 0]
    ys = [p for i, p in enumerate(polygon) if i % 2 == 1]
    if not xs or not ys:
        return None
    return [
        round(min(xs) / page_w * 1000, 1),
        round(min(ys) / page_h * 1000, 1),
        round(max(xs) / page_w * 1000, 1),
        round(max(ys) / page_h * 1000, 1),
    ]


def _bbox_iou(a: list[float], b: list[float]) -> float:
    """Intersection-over-union of two axis-aligned bboxes."""
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw = max(0.0, ix1 - ix0)
    ih = max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
    area_b = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0
