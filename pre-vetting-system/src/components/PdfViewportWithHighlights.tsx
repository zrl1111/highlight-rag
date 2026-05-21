/**
 * Shared pdf.js canvas + [0,1000] bbox overlay (used by audit workspace and evidence compare window).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { RagHit } from '../lib/highlightApi';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const LAYOUT_RETRY_MAX = 10;
const LAYOUT_SETTLE_MS = 100;

function isRenderCancelledError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes('cancel') || msg.includes('abort');
}

export interface PdfViewportWithHighlightsProps {
  pdfUrl: string | null;
  highlights: RagHit[];
  /** Highlight index for emphasis; -1 = equal emphasis */
  activeIdx: number;
  focusPage1Based?: number | null;
  /** Bump to re-run scroll-into-view after highlights/page update */
  locateRevision?: number;
  /** Scroll active bbox into center of viewport after render (default true) */
  autoScrollToHighlight?: boolean;
  /** Max height of scroll area (Tailwind class or arbitrary) */
  viewportClassName?: string;
  emptyMessage?: string;
}

export function PdfViewportWithHighlights({
  pdfUrl,
  highlights,
  activeIdx,
  focusPage1Based,
  locateRevision = 0,
  autoScrollToHighlight = true,
  viewportClassName = 'min-h-[240px] max-h-[70vh]',
  emptyMessage = 'No document URL.',
}: PdfViewportWithHighlightsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const layoutSettleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const layoutRetryRafRef = useRef<number | undefined>(undefined);
  const layoutRetryCountRef = useRef(0);
  const renderGenRef = useRef(0);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [currentScale, setCurrentScale] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cancelActiveRender = useCallback(() => {
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
  }, []);

  const buildViewport = useCallback(
    async (page: pdfjsLib.PDFPageProxy) => {
      const el = viewportRef.current;
      const maxW = el ? Math.max(120, el.clientWidth - 24) : 560;
      const base = page.getViewport({ scale: 1 });
      const scale = currentScale ?? maxW / base.width;
      return page.getViewport({ scale });
    },
    [currentScale],
  );

  const scrollActiveHighlightIntoView = useCallback(() => {
    if (!autoScrollToHighlight || activeIdx < 0) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const activeEl = overlay.querySelector<HTMLElement>(
      `[data-highlight-idx="${activeIdx}"]`,
    );
    if (!activeEl) return;
    activeEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }, [activeIdx, autoScrollToHighlight]);

  const scheduleScrollToHighlight = useCallback(() => {
    if (!autoScrollToHighlight || activeIdx < 0) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = undefined;
      requestAnimationFrame(() => scrollActiveHighlightIntoView());
    }, 120);
  }, [activeIdx, autoScrollToHighlight, scrollActiveHighlightIntoView]);

  const drawHighlights = useCallback(
    (pageIdx0: number, cssW: number, cssH: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      overlay.innerHTML = '';
      highlights.forEach((h, i) => {
        if (h.page_idx !== pageIdx0 || !h.bbox) return;
        const [x0, y0, x1, y1] = h.bbox;
        const div = document.createElement('div');
        div.className =
          'absolute rounded-sm border-2 pointer-events-none ' +
          (activeIdx >= 0 && i === activeIdx
            ? 'border-amber-500 bg-amber-400/25'
            : 'border-sky-500/70 bg-sky-400/15');
        div.style.left = `${(x0 / 1000) * cssW}px`;
        div.style.top = `${(y0 / 1000) * cssH}px`;
        div.style.width = `${((x1 - x0) / 1000) * cssW}px`;
        div.style.height = `${((y1 - y0) / 1000) * cssH}px`;
        div.dataset.highlightIdx = String(i);
        if (activeIdx >= 0 && i === activeIdx) {
          div.dataset.active = 'true';
        }
        overlay.appendChild(div);
      });
    },
    [highlights, activeIdx],
  );

  const renderPage = useCallback(
    async (pageNum: number) => {
      const doc = pdfDoc;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;

      const el = viewportRef.current;
      if (el && (el.clientWidth === 0 || el.clientHeight === 0)) {
        if (layoutRetryCountRef.current < LAYOUT_RETRY_MAX) {
          layoutRetryCountRef.current += 1;
          if (layoutRetryRafRef.current) cancelAnimationFrame(layoutRetryRafRef.current);
          layoutRetryRafRef.current = requestAnimationFrame(() => {
            layoutRetryRafRef.current = undefined;
            void renderPage(pageNum);
          });
        }
        return;
      }
      layoutRetryCountRef.current = 0;

      cancelActiveRender();
      const gen = ++renderGenRef.current;

      try {
        const page = await doc.getPage(pageNum);
        if (gen !== renderGenRef.current) return;

        const viewport = await buildViewport(page);
        if (gen !== renderGenRef.current) return;

        const dpr = window.devicePixelRatio || 1;
        const cssW = viewport.width;
        const cssH = viewport.height;
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const overlay = overlayRef.current;
        if (overlay) {
          overlay.style.width = `${cssW}px`;
          overlay.style.height = `${cssH}px`;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (gen !== renderGenRef.current) return;

        const transform = dpr !== 1 ? ([dpr, 0, 0, dpr, 0, 0] as const) : undefined;
        const task = page.render({
          canvasContext: ctx,
          viewport,
          transform,
        });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;

        if (gen !== renderGenRef.current) return;

        drawHighlights(pageNum - 1, cssW, cssH);
        scheduleScrollToHighlight();
      } catch (e) {
        renderTaskRef.current = null;
        if (gen !== renderGenRef.current || isRenderCancelledError(e)) return;
        console.error('PDF render failed:', e);
      }
    },
    [pdfDoc, buildViewport, drawHighlights, scheduleScrollToHighlight, cancelActiveRender],
  );

  const scheduleRender = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      void renderPage(currentPage);
    }, 150);
  }, [currentPage, renderPage]);

  useEffect(() => {
    return () => {
      cancelActiveRender();
      renderGenRef.current += 1;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      if (layoutSettleTimerRef.current) clearTimeout(layoutSettleTimerRef.current);
      if (layoutRetryRafRef.current) cancelAnimationFrame(layoutRetryRafRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [cancelActiveRender]);

  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setNumPages(0);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    cancelActiveRender();
    renderGenRef.current += 1;
    layoutRetryCountRef.current = 0;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const task = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
        const doc = await task.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setCurrentScale(null);
      } catch (e) {
        if (!cancelled) {
          setPdfDoc(null);
          setNumPages(0);
          setLoadError(e instanceof Error ? e.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelActiveRender();
      renderGenRef.current += 1;
    };
  }, [pdfUrl, cancelActiveRender]);

  useEffect(() => {
    if (!pdfDoc) return;
    scheduleRender();
  }, [pdfDoc, currentPage, currentScale, scheduleRender]);

  useEffect(() => {
    if (focusPage1Based == null || !pdfDoc) return;
    const n = Math.max(1, Math.min(pdfDoc.numPages, focusPage1Based));
    setCurrentPage(n);
  }, [focusPage1Based, pdfDoc]);

  useEffect(() => {
    if (!pdfDoc || highlights.length === 0 || activeIdx < 0) return;
    scheduleScrollToHighlight();
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [
    pdfDoc,
    highlights,
    activeIdx,
    currentPage,
    focusPage1Based,
    locateRevision,
    scheduleScrollToHighlight,
  ]);

  useEffect(() => {
    if (!pdfDoc) return;
    window.addEventListener('resize', scheduleRender);
    const el = viewportRef.current;
    const observer =
      el && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => scheduleRender())
        : null;
    if (el && observer) observer.observe(el);
    return () => {
      window.removeEventListener('resize', scheduleRender);
      observer?.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [pdfDoc, scheduleRender]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) scheduleRender();
      });
    });
    layoutSettleTimerRef.current = setTimeout(() => {
      if (!cancelled) scheduleRender();
    }, LAYOUT_SETTLE_MS);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (layoutSettleTimerRef.current) clearTimeout(layoutSettleTimerRef.current);
    };
  }, [pdfDoc, scheduleRender]);

  const goToPage = (n: number) => {
    if (!pdfDoc) return;
    setCurrentPage(Math.max(1, Math.min(pdfDoc.numPages, n)));
  };

  const zoom = (delta: number) => {
    if (!pdfDoc) return;
    void pdfDoc.getPage(currentPage).then(async (page) => {
      const el = viewportRef.current;
      const maxW = el ? Math.max(120, el.clientWidth - 24) : 560;
      const base = currentScale ?? maxW / page.getViewport({ scale: 1 }).width;
      setCurrentScale(Math.max(0.3, Math.min(4, base + delta)));
    });
  };

  const fitWidth = () => setCurrentScale(null);

  if (!pdfUrl) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
        {emptyMessage}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-error/30 bg-error-container/20 p-4 text-center text-xs text-error">
        {loadError}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-high px-2 py-1.5 text-[11px] text-on-surface-variant">
        <button
          type="button"
          className="rounded border border-outline-variant bg-surface px-2 py-1 font-bold hover:bg-surface-container disabled:opacity-40"
          disabled={!pdfDoc || currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          Prev
        </button>
        <button
          type="button"
          className="rounded border border-outline-variant bg-surface px-2 py-1 font-bold hover:bg-surface-container disabled:opacity-40"
          disabled={!pdfDoc || currentPage >= numPages}
          onClick={() => goToPage(currentPage + 1)}
        >
          Next
        </button>
        <span className="mx-1 font-mono">
          Page{' '}
          <input
            type="number"
            min={1}
            max={Math.max(1, numPages)}
            value={currentPage}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) goToPage(v);
            }}
            className="w-11 rounded border border-outline-variant bg-surface px-1 py-0.5 text-center text-on-surface"
          />{' '}
          / {numPages || '—'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-outline-variant bg-surface px-2 py-1 font-bold hover:bg-surface-container"
            disabled={!pdfDoc}
            onClick={() => zoom(-0.15)}
          >
            −
          </button>
          <button
            type="button"
            className="rounded border border-outline-variant bg-surface px-2 py-1 font-bold hover:bg-surface-container"
            disabled={!pdfDoc}
            onClick={() => zoom(0.15)}
          >
            +
          </button>
          <button
            type="button"
            className="rounded border border-outline-variant bg-surface px-2 py-1 font-bold hover:bg-surface-container"
            disabled={!pdfDoc}
            onClick={fitWidth}
          >
            Fit
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative flex-1 overflow-auto rounded-lg bg-zinc-800 p-3 ${viewportClassName}`}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/40 text-xs font-bold text-white">
            Loading PDF…
          </div>
        )}
        <div className="flex justify-center">
          <div className="relative inline-block shadow-lg ring-1 ring-black/40">
            <canvas ref={canvasRef} className="block bg-white" />
            <div ref={overlayRef} className="pointer-events-none absolute left-0 top-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
