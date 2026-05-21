import type { RagHit } from './highlightApi';

export interface EvidenceComparePayload {
  title: string;
  summary?: string;
  submitted: { label: string; pdf_url: string; highlights: RagHit[] };
  reference: { label: string; pdf_url: string; highlights: RagHit[] } | null;
  referenceMissingNote?: string;
}
