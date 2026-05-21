"""
Compare live-upload extractions against the frozen demo baseline registry.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Protocol

try:
    from .demo_registry import (
        APPLICANT_LABEL,
        BASELINE_DISPLAY_NAME,
        BASELINE_PDF_FILENAME,
        DISPLAY_MODE_NEW_EXTRACTION,
        EVIDENCE_FALLBACKS,
        HEART_DISEASE_WARNING_TITLE,
        MEDICAL_BASELINE_KEYWORDS,
        baseline_field_map,
        database_record_rows,
    )
    from .prompts import CATEGORIES
except ImportError:
    from demo_registry import (
        APPLICANT_LABEL,
        BASELINE_DISPLAY_NAME,
        BASELINE_PDF_FILENAME,
        DISPLAY_MODE_NEW_EXTRACTION,
        EVIDENCE_FALLBACKS,
        HEART_DISEASE_WARNING_TITLE,
        MEDICAL_BASELINE_KEYWORDS,
        baseline_field_map,
        database_record_rows,
    )
    from prompts import CATEGORIES


class _FileRef(Protocol):
    filename: str
    original_name: str

SearchFn = Callable[[str, str, int], list[dict[str, Any]]]

DOB_KEYWORDS = ("dob", "date of birth", "dateofbirth")
ILLNESS_KEYWORDS = ("nature of illness", "natureofillness", "general nature of the illness")


def _norm_date(s: str) -> str:
    t = re.sub(r"[^\d]", "", (s or "").strip())
    return t[:8] if len(t) >= 8 else t


def _field_by_id(merged: dict[str, Any], field_id: str) -> dict[str, Any] | None:
    data = merged.get("extracted_data") or {}
    for items in data.values():
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and str(item.get("field_id") or "") == field_id:
                return item
    return None


def _extracted_value(merged: dict[str, Any], field_id: str) -> str:
    item = _field_by_id(merged, field_id)
    if not item:
        return ""
    return str(item.get("value") or "").strip()


def _find_item_by_label_keywords(
    merged: dict[str, Any], keywords: tuple[str, ...]
) -> dict[str, Any] | None:
    data = merged.get("extracted_data") or {}
    for items in data.values():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").lower()
            fid = str(item.get("field_id") or "").lower()
            if any(k in label or k in fid for k in keywords):
                return item
    return None


def _get_dob_from_merged(merged: dict[str, Any]) -> str:
    direct = _extracted_value(merged, "dateOfBirth")
    if direct:
        return direct
    item = _find_item_by_label_keywords(merged, DOB_KEYWORDS)
    return str(item.get("value") or "").strip() if item else ""


def _get_nature_from_merged(merged: dict[str, Any]) -> str:
    direct = _extracted_value(merged, "natureOfIllness")
    if direct:
        return direct
    item = _find_item_by_label_keywords(
        merged, ("nature of illness", "diagnosis", "injury", "illness")
    )
    return str(item.get("value") or "").strip() if item else ""


def _merged_medical_blob(merged: dict[str, Any]) -> str:
    parts: list[str] = []
    data = merged.get("extracted_data") or {}
    med = data.get("medical_info")
    if isinstance(med, list):
        for item in med:
            if isinstance(item, dict) and item.get("value"):
                parts.append(str(item["value"]))
    return " ".join(parts).lower()


def _is_medical_concealed(merged: dict[str, Any]) -> bool:
    blob = _merged_medical_blob(merged)
    nature = _get_nature_from_merged(merged).lower()
    if not blob and not nature:
        return True
    for kw in MEDICAL_BASELINE_KEYWORDS:
        if kw not in blob and kw not in nature:
            return True
    return False


def _is_dob_field(field_id: str, label: str) -> bool:
    fid = field_id.lower().replace(" ", "")
    lab = label.lower()
    return fid == "dateofbirth" or any(k in fid or k in lab for k in DOB_KEYWORDS)


def _is_illness_field(field_id: str, label: str) -> bool:
    fid = field_id.lower().replace(" ", "")
    lab = label.lower()
    if fid == "natureofillness":
        return True
    return any(k in lab for k in ILLNESS_KEYWORDS) or (
        "illness" in lab and "injury" in lab
    )


def _rows_from_new_extraction(
    merged: dict[str, Any],
    baseline_dob: str,
) -> list[dict[str, str]]:
    """All fields from the new file; mismatch only on DOB and heart-disease concealment."""
    medical_concealed = _is_medical_concealed(merged)
    has_illness_row = False
    rows: list[dict[str, str]] = []
    extracted = merged.get("extracted_data") or {}

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
            field_id = str(item.get("field_id") or "")
            value = item.get("value")
            ext_val = "" if value is None else str(value).strip()

            status = "match"
            if _is_dob_field(field_id, label):
                if baseline_dob and ext_val and _norm_date(ext_val) != _norm_date(baseline_dob):
                    status = "mismatch"
            elif _is_illness_field(field_id, label):
                has_illness_row = True
                if medical_concealed:
                    status = "mismatch"

            rows.append({
                "field": label,
                "extracted_value": ext_val or "—",
                "database_value": "",
                "status": status,
            })

    rows.sort(key=lambda r: r["field"].lower())

    if medical_concealed and not has_illness_row:
        rows.append({
            "field": "Nature of illness or injury",
            "extracted_value": _get_nature_from_merged(merged) or "—",
            "database_value": "",
            "status": "mismatch",
        })

    return rows


def _hit_from_chunk(chunk: dict[str, Any] | None, fallback: dict[str, Any]) -> dict[str, Any]:
    if chunk and chunk.get("bbox"):
        return {
            "page_idx": int(chunk.get("page_idx", 0)),
            "bbox": chunk["bbox"],
            "text": str(chunk.get("text") or fallback.get("text", ""))[:200],
            "score": float(chunk.get("score", 1)),
        }
    return {
        "page_idx": int(fallback.get("page_idx", 0)),
        "bbox": fallback.get("bbox"),
        "text": str(fallback.get("text", "")),
        "score": 1.0,
    }


def _search_hit(search: SearchFn | None, filename: str, query: str, fallback: dict[str, Any]) -> dict[str, Any]:
    if search and query:
        try:
            results = search(filename, query, 1)
            if results:
                return _hit_from_chunk(results[0], fallback)
        except Exception:
            pass
    return _hit_from_chunk(None, fallback)


def _pdf_url(filename: str) -> str:
    return f"/api/pdf/{filename}"


def apply_demo_comparison(
    snapshot: dict[str, Any],
    file_mergeds: list[tuple[_FileRef, dict[str, Any]]],
    search: SearchFn | None = None,
) -> dict[str, Any]:
    """Enrich evaluate_files snapshot with baseline comparison + two warnings."""
    baseline = baseline_field_map()
    baseline_dob = str(baseline.get("dateOfBirth", {}).get("value") or "")

    per_file_out: list[dict[str, Any]] = []
    dob_mismatch_file: _FileRef | None = None
    dob_extracted = ""
    medical_file: _FileRef | None = None

    for ref, merged in file_mergeds:
        rows = _rows_from_new_extraction(merged, baseline_dob)
        mismatch_count = sum(1 for r in rows if r["status"] == "mismatch")
        per_file_out.append({
            "filename": ref.filename,
            "original_name": ref.original_name,
            "rows": rows,
            "mismatch_count": mismatch_count,
        })

        ext_dob = _get_dob_from_merged(merged)
        if ext_dob and baseline_dob and _norm_date(ext_dob) != _norm_date(baseline_dob):
            if dob_mismatch_file is None:
                dob_mismatch_file = ref
                dob_extracted = ext_dob

        if _is_medical_concealed(merged) and medical_file is None:
            medical_file = ref

    warnings: list[dict[str, Any]] = []
    ref_pdf = BASELINE_PDF_FILENAME

    if dob_mismatch_file:
        fb = EVIDENCE_FALLBACKS["w-dob"]
        ref_fb = fb["reference"]
        sub_hit = _search_hit(
            search,
            dob_mismatch_file.filename,
            dob_extracted or fb.get("submitted_query", ""),
            {"page_idx": 0, "bbox": [648.6, 177.4, 958.8, 208.2], "text": dob_extracted},
        )
        ref_hit = _search_hit(search, ref_pdf, baseline_dob, ref_fb)
        warnings.append({
            "id": "w-dob",
            "severity": "critical",
            "code": "FIELD_MISMATCH",
            "priority": "high",
            "title": "Date of Birth Mismatch",
            "message": (
                f"The DOB on {dob_mismatch_file.original_name} ({dob_extracted}) does not match "
                f"the prior submission ({baseline_dob})."
            ),
            "filename": dob_mismatch_file.filename,
            "field": "Date of birth",
            "evidence": {
                "submitted": {
                    "label": "New submission",
                    "pdf_url": _pdf_url(dob_mismatch_file.filename),
                    "highlights": [sub_hit],
                },
                "reference": {
                    "label": BASELINE_DISPLAY_NAME,
                    "pdf_url": _pdf_url(ref_pdf),
                    "highlights": [ref_hit],
                },
            },
        })

    if medical_file:
        fb = EVIDENCE_FALLBACKS["w-medical-concealment"]
        ref_fb = fb["reference"]
        sub_query = fb.get("submitted_query", "musculoskeletal")
        for ref, merged in file_mergeds:
            if ref.filename == medical_file.filename:
                sub_query = _get_nature_from_merged(merged) or sub_query
                break

        sub_hit = _search_hit(
            search,
            medical_file.filename,
            sub_query or "illness injury",
            {"page_idx": 0, "bbox": [34.3, 400.0, 958.2, 450.0], "text": sub_query or "—"},
        )
        ref_hit = _search_hit(search, ref_pdf, "Acute Viral Myocarditis", ref_fb)
        warnings.append({
            "id": "w-medical-concealment",
            "severity": "critical",
            "code": "MEDICAL_DISCLOSURE_GAP",
            "priority": "high",
            "title": HEART_DISEASE_WARNING_TITLE,
            "message": (
                f"{medical_file.original_name} conceals heart disease (Acute Viral Myocarditis) "
                f"documented on the prior Attending Physician Statement."
            ),
            "filename": medical_file.filename,
            "field": "Nature of illness or injury",
            "evidence": {
                "submitted": {
                    "label": "New submission",
                    "pdf_url": _pdf_url(medical_file.filename),
                    "highlights": [sub_hit],
                },
                "reference": {
                    "label": BASELINE_DISPLAY_NAME,
                    "pdf_url": _pdf_url(ref_pdf),
                    "highlights": [ref_hit],
                },
            },
        })

    snapshot["per_file"] = per_file_out
    snapshot["warnings"] = warnings
    snapshot["database_record"] = database_record_rows()
    snapshot["applicant_label"] = APPLICANT_LABEL
    snapshot["display_mode"] = DISPLAY_MODE_NEW_EXTRACTION
    snapshot["review_status"] = "flagged" if warnings else "clear"
    return snapshot
