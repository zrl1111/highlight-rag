/**
 * In-app modal for field source PDF + bbox highlights (data validation).
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { RagHit } from '../lib/highlightApi';
import { PdfAuditSourcePanel } from './PdfAuditSourcePanel';

export interface SourcePdfModalProps {
  open: boolean;
  onClose: () => void;
  fieldLabel: string;
  documentName: string;
  pdfUrl: string | null;
  highlights: RagHit[];
  activeIdx: number;
  focusPage1Based?: number | null;
  locateRevision?: number;
  sourceError?: string | null;
  loading?: boolean;
}

export function SourcePdfModal({
  open,
  onClose,
  fieldLabel,
  documentName,
  pdfUrl,
  highlights,
  activeIdx,
  focusPage1Based,
  locateRevision = 0,
  sourceError,
  loading = false,
}: SourcePdfModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-pdf-modal-title"
        >
          <motion.button
            type="button"
            aria-label="Close source preview"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex max-h-[90vh] w-[min(96vw,900px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="source-pdf-modal-title"
                  className="truncate text-sm font-bold text-[#001f3f]"
                >
                  {fieldLabel}
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-600">{documentName}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-200"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {sourceError && (
              <p className="shrink-0 border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
                {sourceError}
              </p>
            )}

            <div className="relative flex min-h-[min(50vh,480px)] flex-1 flex-col p-4">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-xs font-medium text-slate-600">
                  Locating source…
                </div>
              )}
              <PdfAuditSourcePanel
                pdfUrl={pdfUrl}
                highlights={highlights}
                activeIdx={activeIdx}
                focusPage1Based={focusPage1Based}
                locateRevision={locateRevision}
                autoScrollToHighlight
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
