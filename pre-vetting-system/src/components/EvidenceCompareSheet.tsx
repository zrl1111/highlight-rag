/**
 * Near-fullscreen bottom sheet for dual-PDF evidence comparison.
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { EvidenceComparePayload } from '../lib/evidenceTypes';
import { EvidenceCompareView } from './EvidenceCompareView';

export interface EvidenceCompareSheetProps {
  open: boolean;
  payload: EvidenceComparePayload | null;
  onClose: () => void;
}

export function EvidenceCompareSheet({ open, payload, onClose }: EvidenceCompareSheetProps) {
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
      {open && payload && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          <motion.button
            type="button"
            aria-label="Close evidence comparison"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex h-[min(95vh,100dvh)] w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-200 bg-[#f8fafc] shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-compare-title"
            onClick={(e) => e.stopPropagation()}
          >
            <EvidenceCompareView payload={payload} onClose={onClose} variant="sheet" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
