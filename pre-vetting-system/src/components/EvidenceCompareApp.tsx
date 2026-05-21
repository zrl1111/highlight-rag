/**
 * Standalone evidence compare window (?evidence=1&token=…).
 */
import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { firstPageFromHighlights } from '../lib/pdfHighlightUtils';
import { PdfViewportWithHighlights } from './PdfViewportWithHighlights';
import { readEvidencePayload } from '../lib/evidenceStorage';
import type { EvidenceComparePayload } from '../lib/evidenceTypes';

export function EvidenceCompareApp() {
  const [payload] = useState((): EvidenceComparePayload | null => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    if (!token) return null;
    return readEvidencePayload(token);
  });

  if (!payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-8 text-center">
        <AlertTriangle className="text-amber-600" size={40} />
        <h1 className="text-lg font-bold text-slate-900">Evidence viewer</h1>
        <p className="max-w-md text-sm text-slate-600">
          Missing or expired comparison payload. Close this tab and open <strong>View source</strong> again
          from the data validation screen.
        </p>
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white"
          onClick={() => window.close()}
        >
          Close window
        </button>
      </div>
    );
  }

  const submittedHighlights = payload.submitted.highlights;
  const referenceHighlights = payload.reference?.highlights ?? [];
  const submittedFocus = firstPageFromHighlights(submittedHighlights);
  const referenceFocus = referenceHighlights.length
    ? firstPageFromHighlights(referenceHighlights)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-[#001f3f] px-6 py-4 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Source comparison</p>
          <h1 className="text-lg font-bold tracking-tight">{payload.title}</h1>
          {payload.summary && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{payload.summary}</p>
          )}
        </div>
        <button
          type="button"
          className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
          onClick={() => window.close()}
        >
          <X size={22} />
        </button>
      </header>

      {payload.referenceMissingNote && !payload.reference && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-medium text-amber-900">
          {payload.referenceMissingNote}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <section className="flex min-h-0 flex-col p-4">
          <h2 className="mb-2 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {payload.submitted.label}
          </h2>
          <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <PdfViewportWithHighlights
              pdfUrl={payload.submitted.pdf_url}
              highlights={submittedHighlights}
              activeIdx={submittedHighlights.length > 0 ? 0 : -1}
              focusPage1Based={submittedFocus}
              locateRevision={1}
              autoScrollToHighlight
              viewportClassName="min-h-[200px] max-h-[calc(100vh-220px)]"
              emptyMessage="No submitted document URL."
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-col p-4">
          <h2 className="mb-2 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {payload.reference?.label ?? 'Reference document'}
          </h2>
          <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {payload.reference ? (
              <PdfViewportWithHighlights
                pdfUrl={payload.reference.pdf_url}
                highlights={referenceHighlights}
                activeIdx={referenceHighlights.length > 0 ? 0 : -1}
                focusPage1Based={referenceFocus}
                locateRevision={1}
                autoScrollToHighlight
                viewportClassName="min-h-[200px] max-h-[calc(100vh-220px)]"
                emptyMessage="No reference document URL."
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Reference PDF not available. When your integration returns{' '}
                <code className="rounded bg-slate-200 px-1">evidence.reference.pdf_url</code>, it will render
                here with highlights.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
