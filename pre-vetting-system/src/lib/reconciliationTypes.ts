/**
 * Types for POST /api/reconciliation/evaluate (implemented in another service later).
 */

import type { RagHit } from './highlightApi';

export interface ReconciliationFileRef {
  filename: string;
  original_name: string;
}

export interface ReconciliationRequest {
  batch_session_id: string;
  entity_id: string | null;
  files: ReconciliationFileRef[];
}

export interface DatabaseRecordField {
  field: string;
  value: string;
  source?: string;
}

export type FieldRowStatus = 'match' | 'mismatch' | 'unknown';

export interface FieldRowSource {
  highlights: RagHit[];
}

export interface ExtractedFieldRow {
  field: string;
  extracted_value: string;
  database_value: string;
  status: FieldRowStatus;
  source?: FieldRowSource;
}

export interface ReconciliationPerFile {
  filename: string;
  original_name: string;
  rows: ExtractedFieldRow[];
  /** Precomputed for badges; optional for older API payloads */
  mismatch_count?: number;
}

export interface EvidencePaneSpec {
  label?: string;
  pdf_url: string;
  highlights: RagHit[];
}

export interface ReconciliationWarning {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  code: string;
  message: string;
  filename?: string;
  field?: string;
  priority?: 'high' | 'medium' | 'low';
  title?: string;
  evidence?: {
    submitted: EvidencePaneSpec;
    reference: EvidencePaneSpec | null;
  };
}

export interface ReconciliationSnapshot {
  batch_session_id: string;
  entity_id: string | null;
  applicant_label?: string;
  application_id?: string;
  review_status?: 'clear' | 'flagged';
  /** When `new_extraction_only`, UI hides prior/database column on extracted table. */
  display_mode?: 'new_extraction_only' | string;
  database_record: DatabaseRecordField[];
  per_file: ReconciliationPerFile[];
  warnings: ReconciliationWarning[];
}
