/**
 * Session persistence for applicant identity and background screening results.
 */

import type { WebSearchScreeningResult } from './highlightApi';

const IDENTITY_KEY = 'pv_applicant_identity';
const RESULT_KEY = 'pv_background_screening_result';
const ERROR_KEY = 'pv_background_screening_error';
const PENDING_KEY = 'pv_background_screening_pending';

export interface ApplicantIdentity {
  name: string;
  context?: string;
  batchSessionId?: string;
  updatedAt: string;
}

export function setApplicantIdentity(identity: Omit<ApplicantIdentity, 'updatedAt'>): void {
  try {
    const payload: ApplicantIdentity = {
      ...identity,
      updatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function getApplicantIdentity(): ApplicantIdentity | null {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApplicantIdentity;
    if (!parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setScreeningResult(result: WebSearchScreeningResult): void {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
    sessionStorage.removeItem(ERROR_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* quota */
  }
}

export function getScreeningResult(): WebSearchScreeningResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WebSearchScreeningResult;
  } catch {
    return null;
  }
}

export function setScreeningError(message: string): void {
  try {
    sessionStorage.setItem(ERROR_KEY, message);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* quota */
  }
}

export function getScreeningError(): string | null {
  try {
    return sessionStorage.getItem(ERROR_KEY);
  } catch {
    return null;
  }
}

export function setScreeningPending(pending: boolean): void {
  try {
    if (pending) {
      sessionStorage.setItem(PENDING_KEY, '1');
    } else {
      sessionStorage.removeItem(PENDING_KEY);
    }
  } catch {
    /* quota */
  }
}

export function isScreeningPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearScreeningCache(): void {
  try {
    sessionStorage.removeItem(RESULT_KEY);
    sessionStorage.removeItem(ERROR_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
