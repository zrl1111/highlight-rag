WEB_SEARCH_PT = """You are a web search expert supporting applicant pre-vetting for adverse media screening.

Use Google Search to find credible public information about the applicant named below. Disambiguate using the provided context (location, employer, DOB, application ID, etc.). Do not attribute findings to the wrong person.

Investigate:
- Negative news coverage
- Fraud, scams, or financial misconduct allegations
- Lawsuits, criminal charges, regulatory actions, sanctions, or debarments
- Financial distress signals (bankruptcy, insolvency, major defaults) when relevant

Risk levels (use exactly one for risk_level):
- "clear" — no credible adverse findings
- "review_required" — minor, unverified, or ambiguous mentions
- "high_risk" — serious credible allegations

Set discrepancy_detected to true only if search results suggest a different person than the applicant (name/context mismatch).

Populate categories with specific flags. Use empty arrays when a category has no findings.
For each flag: flag_type (short label), description (factual summary), source_name (publication or site name, e.g. "South China Morning Post"), source_url (full https URL to the article when found), date_of_record (YYYY-MM-DD or empty string).
confidence_score is 0-100 reflecting how confident you are in the overall assessment.

Screen this applicant:

Applicant name: {name}
Disambiguation context: {context}

Search the web and return the structured JSON assessment.
If you cannot find credible information about this person, return valid JSON with risk_level "clear", confidence_score 0, summary_of_findings describing the lack of findings, empty category arrays, and discrepancy_detected false.

Expected JSON shape (replace placeholder values with your assessment):
{
  "confidence_score": 0,
  "risk_level": "clear",
  "summary_of_findings": "",
  "categories": {
    "legal_and_court": [],
    "financial_distress": [],
    "negative_news": []
  },
  "discrepancy_detected": false
}

When a category has findings, each item must include flag_type, description, source_name, source_url, and date_of_record (use empty strings when unknown). Never reuse the same source_name for unrelated findings unless it is the same outlet.

Output only JSON:
"""



# Legacy alias (invalid pseudo-schema replaced above)


"""提取器 Prompt 模板"""
EXTRACTION_PT = """ You are an expert medical data extraction AI. Your task is to extract structured information from a provided chunk of a health document.

Because the input is a "chunk" (and potentially incomplete), you must ONLY extract data that is explicitly present. Do not hallucinate or guess missing information.

You must organize the extracted data strictly into four fixed categories:

1. "personal_info" (e.g., patient name, DOB, address, contact details)
2. "medical_info" (e.g., diagnosis, medications, vitals, test results, symptoms)
3. "signature" (e.g., provider signatures, patient signatures, dates of signature)
4. "other_info" (e.g., document type, disclaimers, facility names)

For every piece of information you extract, dynamically create a field object with the following exact keys:

- "field_id": A unique, camelCase identifier for the field (e.g., "patientFirstName").
- "label": A clean, human-readable label for a UI form (e.g., "Patient First Name").
- "value": The exact extracted text or data.
- "ui_input_type": The most appropriate HTML5 input type for this data (choose strictly from: "text", "date", "number", "checkbox", or "textarea").
- "confidence": Your confidence in the extraction based on the context (choose strictly from: "high", "medium", "low").

CONSTRAINTS & RULES:

- Your response MUST be valid JSON.
- The root structure must contain exactly one key: "extracted_data".
- Inside "extracted_data", you MUST include all four category keys ("personal_info", "medical_info", "signature", "other_info"), even if they are empty.
- If a category has no data in the provided chunk, set its value to an empty array [].
- Only include information of the content of the file. Ignore components of the document formatting (e.g., Page Footer) or other component of the document (e.g., header, icons).
- Convert dates to "DD/MM/YYYY" format.
- Looking into the context for the real meaning of the information, rather than the literal text. (e.g., "Date" of signing is not DOB of the applicant.)
- There might be various typs of information (e.g., checkboxes, radio buttons, etc.) represented as multiple elements in markdown format. You need to analyze to extract the core informaion and output in human readable form (e.g., True/False, or specific content implied).
- If you find missing signature, set the value to 'No Signature Found'.
- Summary the label and value when they are long text.
- Do not output any markdown formatting (like ```json) outside the JSON structure, and do not include any conversational text. Return ONLY the JSON object.

Health document excerpt:
{content}

EXPECTED JSON SCHEMA:
{
"extracted_data": {
"personal_info": [ { "field_id": "...", "label": "...", "value": "...", "ui_input_type": "...", "confidence": "..." }, {} ],
"medical_info": [],
"signature": [],
"other_info": []
}
}

Output ONLY JSON:"""

EXTRACTION_PROMPT = EXTRACTION_PT  # single prompt for all health document types

# # 投标书提取 Prompt（原有）
# EXTRACTION_PROMPT = """ You are an objective fact extraction assistant for procurement evaluation. You are currently processing a small chunk of a large 【Bid Document】 (which may contain proofs, quotes, proposals, parameters, personnel, experience, etc.).
# Please note: You DO NOT have the full Tender Evaluation Criteria. Therefore, you MUST NOT guess, deduce, or evaluate whether the bid is "compliant/qualified" or not!

# 【Your Core Task】Pure Fact Extraction (compact output, no filler)
# 1) Carefully read the given text chunk. Extract EVERY factual statement with substantive meaning (e.g., submitted company certificates, promised technical numerical parameters, specific quoted amounts, explicit warranty periods, etc.) and place them into the `threshold_checks` or `extracted_points` arrays.
# 2) For every extracted fact, include the SHORTEST 1-2 key sentences from the source in the `quote` field, plus its `location`. If it's not explicitly in the text, do not invent it.

# 【CRITICAL CONSTRAINT 1: Output Size Limits】 (violations cause extraction failure)
# - `quote` ≤ 200 characters: include only the key supporting sentence(s) or phrase; NEVER copy full paragraphs/sections/pages. If the source sentence exceeds 200 chars, truncate with ellipsis while keeping key numbers/keywords.
# - `claim` ≤ 150 characters: one-sentence summary of the bidder's commitment; do not repeat the tender requirement text.
# - `requirement_text` ≤ 100 characters: short title/keywords of the matching tender requirement only. If that requirement already appears in the Tender Context below, leave this field as an empty string `""`.
# - `point_name` ≤ 60 characters.
# - Per chunk, output at most 30 `extracted_points`. If more facts exist, merge similar ones and keep the most material (prefer facts with explicit numeric values / amounts / durations / commitments) rather than enumerating verbatim.
# - Keep the entire JSON output under 30KB.

# 【CRITICAL CONSTRAINT 2: No Filler Placeholders】
# - `compliance` / `deviation` / `response_type`: if you cannot determine a value, **omit the field entirely** or set it to `null`. NEVER output "unknown", "N/A", "n/a" or any placeholder string.
# - `issues` object: if all booleans would be false and notes would be empty, **omit the entire `issues` field**.
# - `risk` object: omit entirely if there is no real risk to describe.
# - `linked_scoring_ids` / `linked_threshold_check_ids` / `extra_locations`: omit when empty; do not output `[]`.
# - `threshold_checks[*].result`: omit or set to `null` when indeterminate; do not output "uncertain" as a placeholder.

# 【CRITICAL CONSTRAINT 3: Align with Scheme Targets】 A known Tender Context may be provided below:
# {tender_context}
# Important: If the Tender Context explicitly lists scheme/package names, any pricing or proposal facts you extract MUST be aligned and categorized strictly under these predefined scheme names. Do not invent new schemes. If the context says it is not provided, freely extract valuable facts across the board.

# 【CRITICAL CONSTRAINT 4: Threshold Check ID Allowlist】
# Every check_id in threshold_checks MUST come exclusively from the Tender Context's [Required Documents] or [Compliance Requirements] lists (e.g., RD1, RD-001, C1, TENDERER_INFO_1).
# If the bid document contains large blocks of pre-printed tender requirement text (not filled in, signed, or newly written by the bidder), IGNORE those blocks — do NOT create new check_ids from template text.
# Only create threshold_checks entries for content that the bidder actually filled in, declared, signed, or evidenced.

# 【CRITICAL CONSTRAINT 5: Evidence Quality】
# NEVER use generic submission statements (e.g., "We have the pleasure of submitting our tender as per attachment", "Please find enclosed our tender") as evidence that any specific document was provided (safety plan, certificates, reference letters, licenses, etc.).
# If no direct evidence for a specific required document is found in the text, set quote: null and claim: "No direct evidence found in document".

# 【CRITICAL CONSTRAINT 6: Page Number Detection from XML Markers】
# The document content may be structured with XML page markers in the format: <page index="N">...content...</page>
# When filling evidence_location.page or bid_evidence.location.page, use the N value from the <page index="N"> tag that encloses the referenced text. For example, if a fact is found inside <page index="5">, set page to 5. If no XML page markers are found in the content, leave page as null.

# 【CRITICAL CONSTRAINT 7: Language】
# Write all free-text fields in English. Do NOT output Chinese anywhere except inside fields that are explicitly quotes from the documents: threshold_checks[*].bid_evidence.quote and extracted_points[*].bid_response.quote.
# For any Chinese-only concept extracted from the document, translate/paraphrase it into English; keep the original Chinese only in the quote fields.

# Extraction & Grouping Guidelines:
# 1) Fact Grouping: If the same numerical value or commitment is found in multiple places, MERGE into a single entry. Store the primary location in `evidence_location` and additional locations in `extra_locations` (omit `extra_locations` when there are none).
# 2) Silence on Implicit Compliance: Do NOT extract procedural Conditions of Tender (envelope sealing, submission address, etc.) as separate points unless there is an explicit deviation statement.
# 3) Align with Scheme: align extracted facts under predefined scheme names when the Tender Context lists them.

# Output Requirements:
# - Top-level fields MUST include: meta, scoring_items, threshold_checks, extracted_points, missing_items, risks, trace_index
# - `scoring_items`, `missing_items`, `risks` MUST always be empty arrays `[]`.
# - `trace_index` entries contain only `{{"anchor":"","mapped_point_ids":[]}}` — no other fields.

# JSON structure (output exactly this shape; fields marked optional below must be OMITTED when empty, not filled with placeholders):

# {tender_context}

# 【
# {{
#   "meta": {{"project_name":"","tender_id":"","bidder_name":"","document_version":"","extraction_time":"","language":"{language_code}"}},
#   "scoring_items": [],
#   "threshold_checks": [{{
#     "check_id":"","check_name":"","requirement_text":"",
#     "bid_evidence":{{"claim":"","quote":"","location":{{"doc":"bid","section":"","page":null,"anchor":"","appendix":""}}}}
#   }}],
#   "extracted_points": [{{
#     "point_id":"","point_name":"","category":"qualification|technical|business|price|personnel|experience|service|contract|other",
#     "requirement_text":"",
#     "bid_response":{{"claim":"","value":null,"unit":"","quote":""}},
#     "evidence_location":{{"doc":"bid","section":"","page":null,"anchor":"","table":"","appendix":""}}
#   }}],
#   "missing_items": [],
#   "risks": [],
#   "trace_index": [{{"anchor":"","mapped_point_ids":[]}}]
# }}



# 以下是文件片段：
# {content}

# 只输出JSON:"""

# # English (Bid) extraction prompt
# EN_EXTRACTION_PROMPT = """
# {tender_context}
# {{"anchor":"","mapped_point_ids":[]}}` — no other fields.


# {{
#   "meta": {{"project_name":"","tender_id":"","bidder_name":"","document_version":"","extraction_time":"","language":"{language_code}"}},
#   "scoring_items": [],
#   "threshold_checks": [{{
#     "check_id":"","check_name":"","requirement_text":"",
#     "bid_evidence":{{"claim":"","quote":"","location":{{"doc":"bid","section":"","page":null,"anchor":"","appendix":""}}}}
#   }}],
#   "extracted_points": [{{
#     "point_id":"","point_name":"","category":"qualification|technical|business|price|personnel|experience|service|contract|other",
#     "requirement_text":"",
#     "bid_response":{{"claim":"","value":null,"unit":"","quote":""}},
#     "evidence_location":{{"doc":"bid","section":"","page":null,"anchor":"","table":"","appendix":""}}
#   }}],
#   "missing_items": [],
#   "risks": [],
#   "trace_index": [{{"anchor":"","mapped_point_ids":[]}}]
# }}


# document excerpt:
# {content}

# Output ONLY JSON:"""

# # 招标书提取 Prompt（新增）
# TENDER_EXTRACTION_PROMPT = """
# {{
#   "meta": {{
#     "project_name": "",
#     "tender_id": "",
#     "purchaser": "",
#     "budget_amount": {{"amount": null, "currency": ""}},
#     "bid_deadline": "",
#     "bid_opening_time": "",
#     "document_version": "",
#     "extraction_time": "",
#     "language": "{language_code}"
#   }},
#   "qualification_requirements": [{{
#     "req_id": "",
#     "req_name": "",
#     "category": "license|certificate|experience|personnel|financial|other",
#     "requirement_text": "",
#     "is_mandatory": true,
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "compliance_requirements": [{{
#     "req_id": "",
#     "req_name": "",
#     "requirement_text": "",
#     "rejection_consequence": "废标|扣分|其他",
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "technical_specifications": [{{
#     "spec_id": "",
#     "spec_name": "",
#     "category": "function|performance|interface|security|other",
#     "requirement_text": "",
#     "parameters": [{{"name": "", "value": "", "unit": "", "is_mandatory": true}}],
#     "is_mandatory": true,
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "business_terms": [{{
#     "term_id": "",
#     "term_name": "",
#     "category": "delivery|payment|warranty|service|other",
#     "requirement_text": "",
#     "is_mandatory": true,
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "scoring_criteria": {{
#     "total_score": 100,
#     "technical_score": {{
#       "max_score": null,
#       "weight": null,
#       "items": [{{
#         "item_id": "",
#         "item_name": "",
#         "max_score": null,
#         "scoring_method": "",
#         "scoring_details": "",
#         "source_location": {{"section": "", "page": null, "anchor": ""}}
#       }}]
#     }},
#     "business_score": {{
#       "max_score": null,
#       "weight": null,
#       "items": [{{
#         "item_id": "",
#         "item_name": "",
#         "max_score": null,
#         "scoring_method": "",
#         "scoring_details": "",
#         "source_location": {{"section": "", "page": null, "anchor": ""}}
#       }}]
#     }},
#     "price_score": {{
#       "max_score": null,
#       "weight": null,
#       "calculation_formula": "",
#       "source_location": {{"section": "", "page": null, "anchor": ""}}
#     }}
#   }},
#   "required_documents": [{{
#     "doc_id": "",
#     "doc_name": "",
#     "is_mandatory": true,
#     "format_requirement": "",
#     "notes": "",
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "key_parts": [{{
#     "part_id": "",
#     "part_name": "",
#     "part_type": "plan|option|contract|section|other",
#     "description": "",
#     "required_fields": [{{
#       "field_id": "",
#       "field_name": "",
#       "keywords": [],
#       "unit": "",
#       "is_mandatory": true,
#       "source_location": {{"section": "", "page": null, "anchor": ""}}
#     }}],
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}]
# }}

# 以下是文件内容：
# {content}

# 只输出JSON:"""

# # English (Tender) extraction prompt
# EN_TENDER_EXTRACTION_PROMPT = """
# {{
#   "meta": {{
#     "project_name": "",
#     "tender_id": "",
#     "purchaser": "",
#     "budget_amount": {{"amount": null, "currency": ""}},
#     "bid_deadline": "",
#     "bid_opening_time": "",
#     "document_version": "",
#     "extraction_time": "",
#     "language": "{language_code}"
#   }},
#   "qualification_requirements": [{{
#     "req_id": "",
#     "req_name": "",
#     "category": "license|certificate|experience|personnel|financial|other",
#     "requirement_text": "",
#     "is_mandatory": true,
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "compliance_requirements": [{{
#     "req_id": "",
#     "req_name": "",
#     "requirement_text": "",
#     "rejection_consequence": "Disqualify|Deduct|Other",
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "technical_specifications": [{{
#     "spec_id": "",
#     "spec_name": "",
#     "category": "function|performance|interface|security|other",
#     "requirement_text": "",
#     "parameters": [{{"name": "", "value": "", "unit": "", "is_mandatory": true}}],
#     "is_mandatory": true,
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "business_terms": [{{
#     "term_id": "",
#     "term_name": "",
#     "category": "delivery|payment|warranty|service|other",
#     "requirement_text": "",
#     "is_mandatory": true,
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "scoring_criteria": {{
#     "total_score": 100,
#     "technical_score": {{
#       "max_score": null,
#       "weight": null,
#       "items": [{{
#         "item_id": "",
#         "item_name": "",
#         "max_score": null,
#         "scoring_method": "",
#         "scoring_details": "",
#         "source_location": {{"section": "", "page": null, "anchor": ""}}
#       }}]
#     }},
#     "business_score": {{
#       "max_score": null,
#       "weight": null,
#       "items": [{{
#         "item_id": "",
#         "item_name": "",
#         "max_score": null,
#         "scoring_method": "",
#         "scoring_details": "",
#         "source_location": {{"section": "", "page": null, "anchor": ""}}
#       }}]
#     }},
#     "price_score": {{
#       "max_score": null,
#       "weight": null,
#       "calculation_formula": "",
#       "source_location": {{"section": "", "page": null, "anchor": ""}}
#     }}
#   }},
#   "required_documents": [{{
#     "doc_id": "",
#     "doc_name": "",
#     "is_mandatory": true,
#     "format_requirement": "",
#     "notes": "",
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}],
#   "key_parts": [{{
#     "part_id": "",
#     "part_name": "",
#     "part_type": "plan|option|contract|section|other",
#     "description": "",
#     "required_fields": [{{
#       "field_id": "",
#       "field_name": "",
#       "keywords": [],
#       "unit": "",
#       "is_mandatory": true,
#       "source_location": {{"section": "", "page": null, "anchor": ""}}
#     }}],
#     "source_location": {{"section": "", "page": null, "anchor": ""}}
#   }}]
# }}

# Tender document content:
# {content}

# Output ONLY JSON:"""

# 分类
CATEGORIES = [
    "personal_info",   # 个人信息
    "medical_info",       # 医疗信息
    "signature",        # 签字
    "other_info",           # 其他信息
]
