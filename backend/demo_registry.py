"""
Frozen baseline registry for the document-comparison demo (Steven Zhang Kangyang / Cowan APS DMT).
"""

from __future__ import annotations

from typing import Any

DEMO_ENTITY_ID = "demo:document-compare"
DISPLAY_MODE_NEW_EXTRACTION = "new_extraction_only"
HEART_DISEASE_WARNING_TITLE = "Heart disease disclosure gap"
BASELINE_PDF_FILENAME = "demo-prior.pdf"
BASELINE_STEM = "demo-prior"
BASELINE_DISPLAY_NAME = "Attending Physician Statement (prior submission)"
APPLICANT_LABEL = "Steven Zhang Kangyang"

# BM25 highlight fallbacks (page_idx 0-based, bbox in [0, 1000]).
EVIDENCE_FALLBACKS: dict[str, dict[str, Any]] = {
    "w-dob": {
        "reference": {
            "page_idx": 0,
            "bbox": [648.6, 177.4, 958.8, 208.2],
            "text": "01/01/1995",
        },
        "submitted_query": "date of birth",
    },
    "w-medical-concealment": {
        "reference": {
            "page_idx": 0,
            "bbox": [34.3, 619.7, 958.2, 657.9],
            "text": "Acute Viral Myocarditis",
        },
        "submitted_query": "myocarditis cardiac",
    },
}

BASELINE_EXTRACTION: dict[str, Any] = {
    "extracted_data": {
        "personal_info": [
            {
                "field_id": "firstName",
                "label": "First Name",
                "value": "Steven",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "lastName",
                "label": "Last Name",
                "value": "Zhang Kangyang",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "fullName",
                "label": "Employee Name",
                "value": "Steven Zhang Kangyang",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "dateOfBirth",
                "label": "Date of birth",
                "value": "01/01/1995",
                "ui_input_type": "date",
                "confidence": "high",
            },
            {
                "field_id": "address",
                "label": "Address",
                "value": "789 Willow Creek Drive, Apt 4B, Toronto, ON M4C 1Z5",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "phoneNumber",
                "label": "Phone Number",
                "value": "416-555-0987",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "personalEmail",
                "label": "Personal Email",
                "value": "m.johnson95@email.com",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "employerName",
                "label": "Employer Name",
                "value": "National Logistics Co.",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "jobTitle",
                "label": "Job Title",
                "value": "Warehouse Associate",
                "ui_input_type": "text",
                "confidence": "high",
            },
        ],
        "medical_info": [
            {
                "field_id": "natureOfIllness",
                "label": "Nature of illness or injury",
                "value": (
                    "Acute Viral Myocarditis (Inflammation of the heart muscle "
                    "resulting in reduced cardiac output and arrhythmias)."
                ),
                "ui_input_type": "textarea",
                "confidence": "high",
            },
            {
                "field_id": "symptomsBegan",
                "label": "Symptoms began",
                "value": "05/02/2024",
                "ui_input_type": "date",
                "confidence": "high",
            },
            {
                "field_id": "dateFirstUnableToWork",
                "label": "Date first unable to work",
                "value": "05/03/2024",
                "ui_input_type": "date",
                "confidence": "high",
            },
            {
                "field_id": "treatmentCompliant",
                "label": "Compliant with treatment",
                "value": "Yes",
                "ui_input_type": "text",
                "confidence": "high",
            },
            {
                "field_id": "workImpact",
                "label": "How illness impacts work",
                "value": (
                    "Patient experiences severe shortness of breath, fatigue, and chest pain "
                    "upon physical exertion. Heart rate spikes dangerously with minimal physical strain."
                ),
                "ui_input_type": "textarea",
                "confidence": "high",
            },
            {
                "field_id": "exertionRisk",
                "label": "How working impacts recovery",
                "value": (
                    "Physical exertion at this stage could induce severe cardiac arrhythmias, "
                    "permanent heart muscle damage, or sudden cardiac arrest. Strict rest is required."
                ),
                "ui_input_type": "textarea",
                "confidence": "high",
            },
        ],
        "signature": [],
        "other_info": [],
    }
}

# Keywords used to detect heart-disease concealment in new uploads vs prior APS.
MEDICAL_BASELINE_KEYWORDS = (
    "myocarditis",
    "cardiac",
    "arrhythmia",
    "heart muscle",
    "sudden cardiac",
)


def baseline_field_map() -> dict[str, dict[str, Any]]:
    """field_id -> field object from baseline extraction."""
    out: dict[str, dict[str, Any]] = {}
    data = BASELINE_EXTRACTION.get("extracted_data") or {}
    for cat_items in data.values():
        if not isinstance(cat_items, list):
            continue
        for item in cat_items:
            if isinstance(item, dict) and item.get("field_id"):
                out[str(item["field_id"])] = item
    return out


def database_record_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in baseline_field_map().values():
        rows.append({
            "field": str(item.get("label") or item.get("field_id")),
            "value": str(item.get("value") or ""),
            "source": "prior_submission",
        })
    return rows


def is_demo_entity(entity_id: str | None) -> bool:
    return (entity_id or "").strip() == DEMO_ENTITY_ID
