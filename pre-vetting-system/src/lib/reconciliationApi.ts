import { readJsonBody } from './highlightApi';

import { buildMockReconciliation } from './reconciliationMock';

import type { ReconciliationRequest, ReconciliationSnapshot } from './reconciliationTypes';



/** Calls `POST /api/reconciliation/evaluate`; mock only when the backend is unreachable. */

export async function fetchReconciliationSnapshot(

  body: ReconciliationRequest,

): Promise<ReconciliationSnapshot> {

  let res: Response;

  try {

    res = await fetch('/api/reconciliation/evaluate', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(body),

    });

  } catch {

    return buildMockReconciliation(body);

  }



  if (res.ok) {

    return readJsonBody<ReconciliationSnapshot>(res);

  }



  const data = (await readJsonBody(res).catch(() => ({}))) as { detail?: string };

  const detail =

    typeof data.detail === 'string'

      ? data.detail

      : `Reconciliation failed (${res.status} ${res.statusText})`;

  throw new Error(detail);

}


