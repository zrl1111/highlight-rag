"""Applicant background screening via OpenRouter (web search + structured JSON)."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

try:
    from .prompts import WEB_SEARCH_PT
except ImportError:
    from prompts import WEB_SEARCH_PT

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)

_DEBUG_LOG = Path(__file__).resolve().parent.parent.parent / "debug-1a54c1.log"


def _agent_log(
    location: str,
    message: str,
    data: dict[str, Any],
    hypothesis_id: str,
    run_id: str = "pre-fix",
) -> None:
    # #region agent log
    try:
        payload = {
            "sessionId": "1a54c1",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with open(_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, default=str) + "\n")
    except Exception:
        pass
    # #endregion


def _parse_json(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    m = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {}


def _extract_url_citations(data: dict[str, Any]) -> list[dict[str, str]]:
    citations: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(title: str, url: str) -> None:
        url = (url or "").strip()
        if not url or url in seen:
            return
        seen.add(url)
        citations.append({"title": (title or url).strip(), "url": url})

    choices = data.get("choices") or []
    if not choices:
        return citations

    message = choices[0].get("message") or {}
    annotations = message.get("annotations") or []
    for ann in annotations:
        if not isinstance(ann, dict) or ann.get("type") != "url_citation":
            continue
        cite = ann.get("url_citation") or {}
        if not isinstance(cite, dict):
            continue
        add(
            str(cite.get("title") or ""),
            str(cite.get("url") or ""),
        )
    return citations


def _build_web_search_prompt(name: str, context: str) -> str:
    """Fill {name} and {context} without str.format (JSON schema uses literal braces)."""
    return (
        WEB_SEARCH_PT.replace("{name}", name).replace("{context}", context).strip()
    )


def _online_model_id(model: str) -> str:
    """Append OpenRouter :online variant so web search runs once per request."""
    base = model.strip()
    if not base:
        base = "anthropic/claude-3.5-haiku"
    if base.endswith(":online"):
        return base
    return f"{base}:online"


def _flags_from_categories(categories: dict[str, Any]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    if not isinstance(categories, dict):
        return flags

    for cat_key in ("legal_and_court", "financial_distress", "negative_news"):
        items = categories.get(cat_key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            flags.append(
                {
                    "category": cat_key,
                    "flag_type": str(item.get("flag_type") or ""),
                    "description": str(item.get("description") or ""),
                    "source_name": str(item.get("source_name") or ""),
                    "source_url": str(item.get("source_url") or ""),
                    "date_of_record": str(item.get("date_of_record") or ""),
                }
            )
    return flags


def _merge_citations(
    grounding: list[dict[str, str]],
    categories: dict[str, Any],
) -> list[dict[str, str]]:
    out = list(grounding)
    seen = {c["url"] for c in out}
    for flag in _flags_from_categories(categories):
        url = flag.get("source_url", "").strip()
        if url and url not in seen:
            seen.add(url)
            out.append(
                {
                    "title": flag.get("source_name") or flag.get("flag_type") or url,
                    "url": url,
                }
            )
    return out


def _normalize_screening(parsed: dict[str, Any], grounding: list[dict[str, str]]) -> dict[str, Any]:
    risk = str(parsed.get("risk_level") or "review_required").lower()
    if risk not in ("clear", "review_required", "high_risk"):
        risk = "review_required"

    score = parsed.get("confidence_score")
    if not isinstance(score, (int, float)):
        score = 50
    score = max(0, min(100, int(score)))

    categories = parsed.get("categories")
    if not isinstance(categories, dict):
        categories = {
            "legal_and_court": [],
            "financial_distress": [],
            "negative_news": [],
        }
    for key in ("legal_and_court", "financial_distress", "negative_news"):
        if key not in categories or not isinstance(categories[key], list):
            categories[key] = []

    discrepancy = parsed.get("discrepancy_detected")
    if not isinstance(discrepancy, bool):
        discrepancy = bool(discrepancy)

    return {
        "confidence_score": score,
        "risk_level": risk,
        "summary_of_findings": str(
            parsed.get("summary_of_findings") or "Background screening completed."
        ),
        "categories": categories,
        "discrepancy_detected": discrepancy,
        "grounding_citations": _merge_citations(grounding, categories),
        "searchedAt": datetime.now(timezone.utc).isoformat(),
    }


def screen_applicant_background(name: str, context: str = "") -> dict[str, Any]:
    api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is not set")

    model = _online_model_id(
        model=os.getenv("OPENROUTER_BACKGROUND_MODEL", "anthropic/claude-3.5-haiku")
    )
    name = (name or "").strip()
    if not name:
        raise ValueError("Applicant name is required")
   
    # context = (context or "").strip() or "No additional context provided."
    context = "No additional context provided."
    combined_prompt = _build_web_search_prompt(name, context)

    request_body = {
        "model": model,
        "messages": [{"role": "user", "content": combined_prompt}],
        "max_tokens": 4096,
    }

    # #region agent log
    _agent_log(
        "adverse_media.py:screen_applicant_background:config",
        "OpenRouter request before API call",
        {
            "model": model,
            "web_search": "online_variant",
        },
        "H1",
        run_id="openrouter",
    )
    # #endregion

    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=request_body,
            timeout=120,
        )
    except requests.RequestException as e:
        # #region agent log
        _agent_log(
            "adverse_media.py:screen_applicant_background:api_error",
            "OpenRouter request failed",
            {
                "error_type": type(e).__name__,
                "error_message": str(e)[:500],
            },
            "H1",
            run_id="openrouter",
        )
        # #endregion
        raise RuntimeError(f"OpenRouter API error: {e}") from e

    if resp.status_code != 200:
        # #region agent log
        _agent_log(
            "adverse_media.py:screen_applicant_background:api_error",
            "OpenRouter HTTP error",
            {
                "status_code": resp.status_code,
                "error_message": resp.text[:500],
            },
            "H1",
            run_id="openrouter",
        )
        # #endregion
        raise RuntimeError(
            f"OpenRouter HTTP {resp.status_code}: {resp.text[:200]}"
        )

    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("OpenRouter response missing choices field")

    message = choices[0].get("message") or {}
    text = message.get("content") or ""
    if isinstance(text, list):
        text = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in text
        )

    # #region agent log
    _agent_log(
        "adverse_media.py:screen_applicant_background:api_ok",
        "OpenRouter chat completion succeeded",
        {
            "has_text": bool(text),
            "annotation_count": len(message.get("annotations") or []),
            "web_search_requests": (data.get("usage") or {})
            .get("server_tool_use", {})
            .get("web_search_requests"),
        },
        "H4",
        run_id="openrouter",
    )
    # #endregion

    parsed = _parse_json(text)
    if not parsed:
        raise RuntimeError("Background screening returned unparseable JSON")

    grounding = _extract_url_citations(data)
    return _normalize_screening(parsed, grounding)
