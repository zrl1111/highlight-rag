"""Applicant pre-vetting risk assessment via OpenRouter."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)

RISK_SCAN_PROMPT = """Perform a pre-vetting risk assessment for the following applicant.
Applicant name: {name}
Context: {context}

Identify any potential red flags, legal history, or consistency issues.

Return ONLY valid JSON with this structure:
{{
  "riskScore": <number 0-100>,
  "riskLevel": "<string e.g. HIGH, MED, LOW>",
  "findings": [
    {{"category": "<string>", "description": "<string>", "severity": "<INFO|MED|HIGH>"}}
  ],
  "summary": "<string>"
}}
"""


def _parse_json(text: str) -> dict[str, Any]:
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


def analyze_applicant_risk(name: str, context: str) -> dict[str, Any]:
    api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY 环境变量未设置")

    model = os.getenv(
        "VETTING_RISK_MODEL",
        os.getenv("EVAL_EXTRACTION_MODEL", "google/gemini-2.5-flash-lite"),
    )
    prompt = RISK_SCAN_PROMPT.format(name=name, context=context)

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 4096,
        },
        timeout=120,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    parsed = _parse_json(content)
    if not parsed:
        raise RuntimeError("Risk scan returned unparseable JSON")
    return parsed
