"""
Reconciliation evaluate: run health Extractor on cached Markdown and map to UI snapshot.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

UploadPhase = Literal["parsing", "indexed", "extracting", "ready", "error"]

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)

try:
    from .demo_compare import SearchFn, _search_hit, apply_demo_comparison
    from .demo_registry import is_demo_entity
    from .extractor import Extractor
    from .prompts import CATEGORIES
except ImportError:
    from demo_compare import SearchFn, _search_hit, apply_demo_comparison
    from demo_registry import is_demo_entity
    from extractor import Extractor
    from prompts import CATEGORIES


@dataclass
class ReconciliationFileRef:
    filename: str
    original_name: str


# In-memory upload / extraction phase (lost on server restart).
_upload_jobs: dict[str, dict[str, Any]] = {}
_extraction_running: set[str] = set()


def init_upload_job(stem: str, filename: str) -> None:
    _upload_jobs[stem] = {
        "filename": filename,
        "phase": "parsing",
        "error": None,
        "chunk_count": None,
        "mode": None,
    }


def update_upload_job(
    stem: str,
    phase: UploadPhase,
    *,
    error: str | None = None,
    chunk_count: int | None = None,
    mode: str | None = None,
) -> None:
    job = _upload_jobs.setdefault(stem, {"filename": f"{stem}.pdf", "phase": phase, "error": None})
    job["phase"] = phase
    if error is not None:
        job["error"] = error
    if chunk_count is not None:
        job["chunk_count"] = chunk_count
    if mode is not None:
        job["mode"] = mode


def get_upload_job(stem: str) -> dict[str, Any] | None:
    return _upload_jobs.get(stem)


def _extraction_cache_path(parsed_dir: Path, stem: str) -> Path:
    return parsed_dir / f"{stem}.extraction.json"


def _markdown_path(parsed_dir: Path, stem: str) -> Path:
    return parsed_dir / f"{stem}.md"


def _parse_cache_path(parsed_dir: Path, stem: str) -> Path:
    return parsed_dir / f"{stem}.json"


def extraction_ready(parsed_dir: Path, stem: str) -> bool:
    cache = _extraction_cache_path(parsed_dir, stem)
    if not cache.exists():
        return False
    try:
        merged = json.loads(cache.read_text(encoding="utf-8"))
        return not _is_empty_extraction(merged)
    except Exception:
        return False


def extraction_field_count(parsed_dir: Path, stem: str) -> int:
    cache = _extraction_cache_path(parsed_dir, stem)
    if not cache.exists():
        return 0
    try:
        merged = json.loads(cache.read_text(encoding="utf-8"))
        data = merged.get("extracted_data") or {}
        return sum(len(data.get(cat) or []) for cat in CATEGORIES if isinstance(data.get(cat), list))
    except Exception:
        return 0


def _resolve_phase(
    stem: str,
    parsed_dir: Path,
    *,
    indexed: bool,
) -> UploadPhase:
    if extraction_ready(parsed_dir, stem):
        return "ready"

    job = get_upload_job(stem)
    if job and job.get("error") and job.get("phase") == "error":
        return "error"

    if stem in _extraction_running or (job and job.get("phase") == "extracting"):
        return "extracting"

    if indexed:
        return "indexed"

    if job and job.get("phase") == "parsing":
        return "parsing"

    if _parse_cache_path(parsed_dir, stem).exists() and not indexed:
        return "parsing"

    if job:
        phase = job.get("phase")
        if phase in ("parsing", "indexed", "extracting", "ready", "error"):
            return phase

    return "error" if (job and job.get("error")) else "parsing"


def build_file_status(
    filename: str,
    parsed_dir: Path,
    *,
    indexed: bool,
) -> dict[str, Any]:
    stem = Path(filename).stem
    job = get_upload_job(stem)
    phase = _resolve_phase(stem, parsed_dir, indexed=indexed)
    ext_ready = extraction_ready(parsed_dir, stem)

    error: str | None = None
    if job and job.get("error"):
        error = str(job["error"])
    if phase == "error" and not error:
        error = "Processing failed"

    return {
        "filename": filename,
        "indexed": indexed,
        "cached": _parse_cache_path(parsed_dir, stem).exists(),
        "has_markdown": _markdown_path(parsed_dir, stem).exists(),
        "phase": phase,
        "extraction_ready": ext_ready,
        "error": error,
        "chunk_count": job.get("chunk_count") if job else None,
        "mode": job.get("mode") if job else None,
        "field_count": extraction_field_count(parsed_dir, stem) if ext_ready else None,
    }


async def ensure_field_extraction(parsed_dir: Path, stem: str) -> dict[str, Any]:
    md_path = _markdown_path(parsed_dir, stem)
    if not md_path.exists():
        raise FileNotFoundError(
            f"Markdown not found for {stem}.pdf. Re-upload the PDF."
        )
    md_text = md_path.read_text(encoding="utf-8")
    return await asyncio.to_thread(_load_or_extract, parsed_dir, stem, md_text)


def maybe_schedule_extraction(parsed_dir: Path, stem: str) -> None:
    if extraction_ready(parsed_dir, stem):
        update_upload_job(stem, "ready")
        return
    if stem in _extraction_running:
        return
    if not _markdown_path(parsed_dir, stem).exists():
        return
    schedule_field_extraction(parsed_dir, stem)


async def _run_field_extraction(parsed_dir: Path, stem: str) -> None:
    _extraction_running.add(stem)
    update_upload_job(stem, "extracting")
    try:
        await ensure_field_extraction(parsed_dir, stem)
        update_upload_job(stem, "ready")
    except Exception as e:
        update_upload_job(stem, "indexed", error=str(e))
    finally:
        _extraction_running.discard(stem)


def schedule_field_extraction(parsed_dir: Path, stem: str) -> None:
    if stem in _extraction_running:
        return
    if extraction_ready(parsed_dir, stem):
        update_upload_job(stem, "ready")
        return
    asyncio.create_task(_run_field_extraction(parsed_dir, stem))


# #region agent log
def _agent_dbg(location: str, message: str, hypothesis_id: str, data: dict | None = None) -> None:
    try:
        log_path = Path(__file__).resolve().parent.parent.parent / "debug-cedaa1.log"
        payload = {
            "sessionId": "cedaa1",
            "location": location,
            "message": message,
            "hypothesisId": hypothesis_id,
            "timestamp": int(time.time() * 1000),
            "data": data or {},
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


# #endregion


def _is_empty_extraction(merged: dict[str, Any]) -> bool:
    data = merged.get("extracted_data") or {}
    return all(not (data.get(cat) or []) for cat in CATEGORIES)


def flatten_extraction(merged: dict[str, Any]) -> list[dict[str, str]]:
    """Map Extractor merged output to reconciliation table rows."""
    extracted = merged.get("extracted_data") or {}
    rows: list[dict[str, str]] = []

    for cat in CATEGORIES:
        items = extracted.get(cat)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("field_id") or "").strip()
            if not label:
                continue
            value = item.get("value")
            rows.append({
                "field": label,
                "extracted_value": "" if value is None else str(value),
                "database_value": "—",
                "status": "unknown",
                "_category": cat,
            })

    rows.sort(key=lambda r: (CATEGORIES.index(r["_category"]), r["field"].lower()))
    for r in rows:
        del r["_category"]
    return rows


def _source_query(label: str, value: str) -> str:
    val = (value or "").strip()
    if not val or val == "—":
        return (label or "").strip()
    if len(val) < 4 and label:
        return f"{label} {val}".strip()
    return val


def attach_row_sources(
    rows: list[dict[str, Any]],
    filename: str,
    search: SearchFn | None,
) -> None:
    """Attach BM25 bbox highlights for each reconciliation row (mutates rows in place)."""
    for row in rows:
        label = str(row.get("field") or "")
        value = str(row.get("extracted_value") or "")
        query = _source_query(label, value)
        fallback: dict[str, Any] = {
            "page_idx": 0,
            "text": value or label,
        }
        hit = _search_hit(search, filename, query, fallback)
        row["source"] = {"highlights": [hit]}


def _applicant_label_from_merged(merged: dict[str, Any]) -> str | None:
    personal = (merged.get("extracted_data") or {}).get("personal_info") or []
    if not isinstance(personal, list):
        return None
    name_keys = ("patientname", "patient_name", "fullname", "full_name", "name", "applicantname")
    for item in personal:
        if not isinstance(item, dict):
            continue
        fid = str(item.get("field_id") or "").lower().replace(" ", "")
        label = str(item.get("label") or "").lower()
        if any(k in fid or k in label for k in name_keys):
            val = item.get("value")
            if val:
                return str(val)
    for item in personal:
        if isinstance(item, dict) and item.get("value"):
            return str(item["value"])
    return None


def _load_or_extract(
    parsed_dir: Path,
    stem: str,
    md_text: str,
) -> dict[str, Any]:
    cache = _extraction_cache_path(parsed_dir, stem)
    if cache.exists():
        merged = json.loads(cache.read_text(encoding="utf-8"))
        if not _is_empty_extraction(merged):
            # #region agent log
            _agent_dbg(
                "reconciliation._load_or_extract",
                "cache hit",
                "H3",
                {"stem": stem, "md_len": len(md_text), "field_count": sum(
                    len((merged.get("extracted_data") or {}).get(cat) or []) for cat in CATEGORIES
                )},
            )
            # #endregion
            return merged
        cache.unlink()

    if not (os.environ.get("OPENROUTER_API_KEY") or "").strip():
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Add it to .env to run field extraction."
        )

    merged = Extractor().extract(md_text)
    if _is_empty_extraction(merged):
        raise RuntimeError(
            "Extraction returned no fields. Check server logs and OPENROUTER_API_KEY."
        )
    cache.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    # #region agent log
    _agent_dbg(
        "reconciliation._load_or_extract",
        "extracted and cached",
        "H3",
        {
            "stem": stem,
            "md_len": len(md_text),
            "field_count": sum(
                len((merged.get("extracted_data") or {}).get(cat) or []) for cat in CATEGORIES
            ),
        },
    )
    # #endregion
    return merged


async def evaluate_files(
    parsed_dir: Path,
    batch_session_id: str,
    entity_id: str | None,
    files: list[ReconciliationFileRef],
    search: Any | None = None,
) -> dict[str, Any]:
    """Build a ReconciliationSnapshot dict for the frontend."""
    per_file: list[dict[str, Any]] = []
    applicant_label: str | None = None
    file_mergeds: list[tuple[ReconciliationFileRef, dict[str, Any]]] = []

    for ref in files:
        stem = Path(ref.filename).stem
        md_path = _markdown_path(parsed_dir, stem)
        if not md_path.exists():
            raise FileNotFoundError(
                f"Markdown not found for {ref.filename}. Re-upload the PDF."
            )

        md_text = md_path.read_text(encoding="utf-8")
        try:
            merged = await asyncio.to_thread(
                _load_or_extract, parsed_dir, stem, md_text
            )
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Extraction failed for {ref.filename}: {e}") from e

        if applicant_label is None:
            applicant_label = _applicant_label_from_merged(merged)

        file_mergeds.append((ref, merged))
        rows = flatten_extraction(merged)
        per_file.append({
            "filename": ref.filename,
            "original_name": ref.original_name,
            "rows": rows,
            "mismatch_count": 0,
        })

    app_suffix = batch_session_id[:8].upper().replace("-", "")
    snapshot: dict[str, Any] = {
        "batch_session_id": batch_session_id,
        "entity_id": entity_id,
        "applicant_label": applicant_label,
        "application_id": f"VET-{app_suffix}",
        "review_status": "clear",
        "database_record": [],
        "per_file": per_file,
        "warnings": [],
    }

    if is_demo_entity(entity_id):
        snapshot = apply_demo_comparison(snapshot, file_mergeds, search=search)

    for pf in snapshot.get("per_file") or []:
        fn = pf.get("filename")
        file_rows = pf.get("rows")
        if fn and isinstance(file_rows, list):
            attach_row_sources(file_rows, str(fn), search)

    return snapshot
