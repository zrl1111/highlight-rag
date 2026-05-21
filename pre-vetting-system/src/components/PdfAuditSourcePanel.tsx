/**
 * PDF viewer + bbox highlights — wraps shared PdfViewportWithHighlights.
 */
import type { RagHit } from '../lib/highlightApi';
import { PdfViewportWithHighlights } from './PdfViewportWithHighlights';

interface PdfAuditSourcePanelProps {
  pdfUrl: string | null;
  highlights: RagHit[];
  activeIdx: number;
  focusPage1Based?: number | null;
  locateRevision?: number;
  autoScrollToHighlight?: boolean;
}

export function PdfAuditSourcePanel({
  pdfUrl,
  highlights,
  activeIdx,
  focusPage1Based,
  locateRevision,
  autoScrollToHighlight = true,
}: PdfAuditSourcePanelProps) {
  return (
    <PdfViewportWithHighlights
      pdfUrl={pdfUrl}
      highlights={highlights}
      activeIdx={activeIdx}
      focusPage1Based={focusPage1Based}
      locateRevision={locateRevision}
      autoScrollToHighlight={autoScrollToHighlight}
      viewportClassName="min-h-[320px]"
      emptyMessage="Upload and index a PDF to preview the source document here."
    />
  );
}
