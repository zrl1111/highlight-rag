/**
 * Dual-PDF source comparison (submitted vs reference).
 */
import { X } from 'lucide-react';
import { firstPageFromHighlights } from '../lib/pdfHighlightUtils';
import { PdfViewportWithHighlights } from './PdfViewportWithHighlights';
import type { EvidenceComparePayload } from '../lib/evidenceTypes';

export interface EvidenceCompareViewProps {
  payload: EvidenceComparePayload;
  onClose?: () => void;
  variant?: 'page' | 'sheet';
}

export function EvidenceCompareView({
  payload,
  onClose,
  variant = 'sheet',
}: EvidenceCompareViewProps) {
  const submittedHighlights = payload.submitted.highlights;
  const referenceHighlights = payload.reference?.highlights ?? [];
  const submittedFocus = firstPageFromHighlights(submittedHighlights);
  const referenceFocus = referenceHighlights.length
    ? firstPageFromHighlights(referenceHighlights)
    : null;

  const viewportClassName =
    variant === 'sheet'
      ? 'min-h-0 h-full flex-1'
      : 'min-h-[200px] max-h-[calc(100vh-220px)]';

  const rootClassName =
    variant === 'sheet'
      ? 'flex min-h-0 flex-1 flex-col bg-[#f8fafc]'
      : 'flex min-h-screen flex-col bg-[#f8fafc]';

  return (
    <div className={rootClassName}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-[#001f3f] px-6 py-4 text-white">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Source comparison</p>
          <h1
            id="evidence-compare-title"
            className="truncate text-lg font-bold tracking-tight"
          >
            {payload.title}
          </h1>
          {payload.summary && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{payload.summary}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        )}
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
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <PdfViewportWithHighlights
              pdfUrl={payload.submitted.pdf_url}
              highlights={submittedHighlights}
              activeIdx={submittedHighlights.length > 0 ? 0 : -1}
              focusPage1Based={submittedFocus}
              locateRevision={1}
              autoScrollToHighlight
              viewportClassName={viewportClassName}
              emptyMessage="No submitted document URL."
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-col p-4">
          <h2 className="mb-2 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {payload.reference?.label ?? 'Reference document'}
          </h2>
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {payload.reference ? (
              <PdfViewportWithHighlights
                pdfUrl={payload.reference.pdf_url}
                highlights={referenceHighlights}
                activeIdx={referenceHighlights.length > 0 ? 0 : -1}
                focusPage1Based={referenceFocus}
                locateRevision={1}
                autoScrollToHighlight
                viewportClassName={viewportClassName}
                emptyMessage="No reference document URL."
              />
            ) : (
              <div className="flex min-h-[min(40vh,280px)] flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
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
