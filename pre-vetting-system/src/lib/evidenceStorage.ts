import type { EvidenceComparePayload } from './evidenceTypes';

const PREFIX = 'pv_evidence_v1:';

export function stashEvidencePayload(payload: EvidenceComparePayload): string {
  const token = crypto.randomUUID();
  try {
    localStorage.setItem(
      PREFIX + token,
      JSON.stringify({ ...payload, stashedAt: Date.now() }),
    );
  } catch {
    /* quota or private mode */
  }
  return token;
}

/** Read payload without removing (safe under React StrictMode double mount). */
export function readEvidencePayload(token: string): EvidenceComparePayload | null {
  const key = PREFIX + token;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as EvidenceComparePayload & { stashedAt?: number };
    delete (data as { stashedAt?: number }).stashedAt;
    return data as EvidenceComparePayload;
  } catch {
    return null;
  }
}

export function discardEvidencePayload(token: string): void {
  try {
    localStorage.removeItem(PREFIX + token);
  } catch {
    /* ignore */
  }
}

export function openEvidenceCompareWindow(payload: EvidenceComparePayload): void {
  const token = stashEvidencePayload(payload);
  const u = new URL(window.location.href);
  u.searchParams.set('evidence', '1');
  u.searchParams.set('token', token);
  window.open(u.toString(), '_blank', 'noopener,noreferrer');
}
