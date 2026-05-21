/** Calls FastAPI highlight_rag backend (proxied as `/api` in Vite dev / preview). */

const BACKEND_HINT =
  'Start the Python API on http://127.0.0.1:8000 (e.g. from highlight_rag: python backend/main.py) while using Vite on port 3000.';

export async function readJsonBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      `Empty response (${res.status} ${res.statusText}). ${BACKEND_HINT}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Non-JSON response (${res.status}). ${BACKEND_HINT} Body starts with: ${text.slice(0, 160)}`,
    );
  }
}

export type UploadPhase = 'parsing' | 'indexed' | 'extracting' | 'ready' | 'error';

export interface UploadResponse {
  filename: string;
  chunk_count?: number;
  mode?: string;
  has_markdown: boolean;
  phase?: UploadPhase;
  accepted?: boolean;
}

export interface RagHit {
  text: string;
  page_idx: number;
  bbox?: [number, number, number, number];
  score: number;
  type?: string;
}

export interface StatusResponse {
  filename: string;
  indexed: boolean;
  cached: boolean;
  has_markdown: boolean;
  phase: UploadPhase;
  extraction_ready: boolean;
  error: string | null;
  chunk_count?: number | null;
  mode?: string | null;
  field_count?: number | null;
}

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = (await readJsonBody(res)) as { detail?: string } & Partial<UploadResponse>;
  if (res.status === 202) {
    if (!data.filename) {
      throw new Error('Upload accepted but filename missing');
    }
    return {
      filename: data.filename,
      has_markdown: data.has_markdown ?? false,
      phase: (data.phase as UploadPhase) ?? 'parsing',
      accepted: true,
    };
  }
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Upload failed');
  }
  return data as UploadResponse;
}

export async function queryDocument(
  filename: string,
  query: string,
  topK = 5,
): Promise<RagHit[]> {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, query, top_k: topK }),
  });
  const data = (await readJsonBody(res)) as { detail?: string; results?: RagHit[] };
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Query failed');
  }
  return data.results ?? [];
}

export function pdfUrl(filename: string): string {
  return `/api/pdf/${encodeURIComponent(filename)}`;
}

export async function getStatus(filename: string): Promise<StatusResponse> {
  const res = await fetch(`/api/status/${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error('Status check failed');
  return readJsonBody<StatusResponse>(res);
}

export async function getMarkdownText(filename: string): Promise<string> {
  const res = await fetch(`/api/markdown/${encodeURIComponent(filename)}`);
  if (!res.ok) {
    const data = (await readJsonBody(res).catch(() => ({}))) as { detail?: string };
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Markdown fetch failed');
  }
  return res.text();
}

export async function listIndexedFilenames(): Promise<string[]> {
  const res = await fetch('/api/documents');
  if (!res.ok) return [];
  const data = (await readJsonBody(res)) as { filenames?: string[] };
  return data.filenames ?? [];
}

export interface RiskFinding {
  category: string;
  description: string;
  severity: string;
}

export interface RiskScanResult {
  riskScore: number;
  riskLevel: string;
  findings: RiskFinding[];
  summary: string;
}

export async function analyzeApplicantRisk(
  name: string,
  context: string,
): Promise<RiskScanResult | null> {
  let res: Response;
  try {
    res = await fetch('/api/vetting/risk-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, context }),
    });
  } catch {
    return null;
  }

  const data = (await readJsonBody(res).catch(() => ({}))) as {
    detail?: string;
  } & Partial<RiskScanResult>;

  if (!res.ok) {
    console.error(
      typeof data.detail === 'string' ? data.detail : 'Risk scan failed',
    );
    return null;
  }

  return data as RiskScanResult;
}

export type RiskLevel = 'clear' | 'review_required' | 'high_risk';

export interface WebSearchFlagItem {
  flag_type: string;
  description: string;
  source_name?: string;
  source_url: string;
  date_of_record: string;
}

export interface WebSearchCategories {
  legal_and_court: WebSearchFlagItem[];
  financial_distress: WebSearchFlagItem[];
  negative_news: WebSearchFlagItem[];
}

export interface GroundingCitation {
  title: string;
  url: string;
}

export interface WebSearchScreeningResult {
  confidence_score: number;
  risk_level: RiskLevel;
  summary_of_findings: string;
  categories: WebSearchCategories;
  discrepancy_detected: boolean;
  grounding_citations: GroundingCitation[];
  searchedAt: string;
}

/** @deprecated Use WebSearchScreeningResult */
export type BackgroundScreeningResult = WebSearchScreeningResult;

export async function runBackgroundScreening(
  name: string,
  context = '',
): Promise<WebSearchScreeningResult> {
  const res = await fetch('/api/vetting/background-screening', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, context }),
  });

  const data = (await readJsonBody(res)) as {
    detail?: string;
  } & Partial<WebSearchScreeningResult>;

  if (!res.ok) {
    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : 'Background screening failed',
    );
  }

  return data as WebSearchScreeningResult;
}
