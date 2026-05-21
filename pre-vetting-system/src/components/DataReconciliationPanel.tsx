import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { DEMO_DISPLAY_MODE, DEMO_ENTITY_ID } from '../lib/demoConfig';
import {
  setApplicantIdentity,
  setScreeningError,
  setScreeningPending,
  setScreeningResult,
} from '../lib/backgroundScreeningStorage';
import { pdfUrl, queryDocument, runBackgroundScreening, type RagHit } from '../lib/highlightApi';
import { firstPageFromHighlights } from '../lib/pdfHighlightUtils';
import { fetchReconciliationSnapshot } from '../lib/reconciliationApi';
import type { EvidenceComparePayload } from '../lib/evidenceTypes';
import type {
  ExtractedFieldRow,
  ReconciliationPerFile,
  ReconciliationSnapshot,
  ReconciliationWarning,
} from '../lib/reconciliationTypes';
import { EvidenceCompareSheet } from './EvidenceCompareSheet';
import { SourcePdfModal } from './SourcePdfModal';

export interface IndexedIntakeFile {
  id: string;
  displayName: string;
  filename: string;
}

export interface DataReconciliationPanelProps {
  batchSessionId: string;
  entityId?: string | null;
  files: IndexedIntakeFile[];
  onBack: () => void;
}

function normalizeHits(highlights: RagHit[]): RagHit[] {
  return highlights.map((h) => ({
    ...h,
    score: typeof h.score === 'number' ? h.score : 1,
  }));
}

function buildWarningEvidencePayload(w: ReconciliationWarning): EvidenceComparePayload | null {
  const title = w.title ?? w.code;
  const ev = w.evidence;
  if (!ev) {
    const fn = w.filename;
    if (!fn) return null;
    return {
      title,
      summary: w.message,
      submitted: {
        label: 'Submitted',
        pdf_url: pdfUrl(fn),
        highlights: [],
      },
      reference: null,
      referenceMissingNote:
        'No structured evidence payload for this warning yet. Reference pane will populate when your API returns evidence.',
    };
  }

  return {
    title,
    summary: w.message,
    submitted: {
      label: ev.submitted.label ?? 'Submitted',
      pdf_url: ev.submitted.pdf_url,
      highlights: normalizeHits(ev.submitted.highlights),
    },
    reference: ev.reference
      ? {
          label: ev.reference.label ?? 'Reference',
          pdf_url: ev.reference.pdf_url,
          highlights: normalizeHits(ev.reference.highlights),
        }
      : null,
    referenceMissingNote: ev.reference
      ? undefined
      : 'Registry did not return a reference PDF URL for this warning.',
  };
}

function statusBadge(status: ReconciliationPerFile['rows'][0]['status']) {
  if (status === 'match') {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">
        Match
      </span>
    );
  }
  if (status === 'mismatch') {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
        Mismatch
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
      Unknown
    </span>
  );
}

function severityStyles(w: ReconciliationWarning) {
  if (w.severity === 'critical') {
    return {
      border: 'border-red-200',
      title: 'text-red-700',
    };
  }
  if (w.severity === 'warn') {
    return {
      border: 'border-amber-200',
      title: 'text-amber-800',
    };
  }
  return {
    border: 'border-slate-200',
    title: 'text-slate-800',
  };
}

export function DataReconciliationPanel({
  batchSessionId,
  entityId = null,
  files,
  onBack,
}: DataReconciliationPanelProps) {
  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({});
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [modalFieldLabel, setModalFieldLabel] = useState('');
  const [modalDocumentName, setModalDocumentName] = useState('');
  const [highlights, setHighlights] = useState<RagHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [focusPage1Based, setFocusPage1Based] = useState<number | null>(null);
  const [activeSourceKey, setActiveSourceKey] = useState<string | null>(null);
  const [sourceLoadingKey, setSourceLoadingKey] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [locateRevision, setLocateRevision] = useState(0);
  const [evidenceSheetOpen, setEvidenceSheetOpen] = useState(false);
  const [evidencePayload, setEvidencePayload] = useState<EvidenceComparePayload | null>(null);

  const filesKey = useMemo(() => files.map((f) => f.filename).join('|'), [files]);
  const previewUrl = previewFilename ? pdfUrl(previewFilename) : null;
  const screeningKeyRef = useRef<string | null>(null);

  function buildScreeningContext(data: ReconciliationSnapshot): string {
    const parts: string[] = [];
    if (data.application_id) parts.push(`Application ID: ${data.application_id}`);
    if (data.entity_id) parts.push(`Entity: ${data.entity_id}`);
    const rows = data.per_file?.[0]?.rows?.slice(0, 5) ?? [];
    for (const row of rows) {
      if (row.field && row.extracted_value) {
        parts.push(`${row.field}: ${row.extracted_value}`);
      }
    }
    return parts.join('; ') || 'Pre-vetting document batch';
  }

  function triggerBackgroundScreening(
    applicantName: string,
    data: ReconciliationSnapshot,
  ): void {
    const dedupeKey = `${applicantName}|${filesKey}`;
    if (screeningKeyRef.current === dedupeKey) return;
    screeningKeyRef.current = dedupeKey;

    const context = buildScreeningContext(data);
    setApplicantIdentity({
      name: applicantName,
      context,
      batchSessionId,
    });
    setScreeningPending(true);

    void runBackgroundScreening(applicantName, context)
      .then((result) => {
        setScreeningResult(result);
      })
      .catch((e: unknown) => {
        const msg =
          e instanceof Error ? e.message : 'Background screening failed';
        setScreeningError(msg);
      })
      .finally(() => {
        setScreeningPending(false);
      });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchReconciliationSnapshot({
      batch_session_id: batchSessionId,
      entity_id: entityId,
      files: files.map((f) => ({ filename: f.filename, original_name: f.displayName })),
    })
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          const initial: Record<string, boolean> = {};
          data.per_file.forEach((p) => {
            initial[p.filename] = true;
          });
          setOpenFiles(initial);
          const label = data.applicant_label?.trim();
          if (label) {
            triggerBackgroundScreening(label, data);
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load validation data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchSessionId, entityId, filesKey]);

  const toggleFile = useCallback((filename: string) => {
    setOpenFiles((prev) => ({ ...prev, [filename]: !prev[filename] }));
  }, []);

  const rowSourceKey = (filename: string, field: string) => `${filename}:${field}`;

  const closeEvidenceSheet = useCallback(() => {
    setEvidenceSheetOpen(false);
    setEvidencePayload(null);
  }, []);

  const openWarningEvidence = useCallback((w: ReconciliationWarning) => {
    const payload = buildWarningEvidencePayload(w);
    if (!payload) return;
    setEvidencePayload(payload);
    setEvidenceSheetOpen(true);
  }, []);

  const closeSourceModal = useCallback(() => {
    setSourceModalOpen(false);
    setPreviewFilename(null);
    setModalFieldLabel('');
    setModalDocumentName('');
    setHighlights([]);
    setActiveIdx(-1);
    setFocusPage1Based(null);
    setSourceError(null);
    setSourceLoadingKey(null);
    setLocateRevision(0);
  }, []);

  const applyHighlights = useCallback((hits: RagHit[]) => {
    const normalized = normalizeHits(hits);
    setHighlights(normalized);
    setLocateRevision((r) => r + 1);
    if (normalized.length > 0) {
      setActiveIdx(0);
      const page = firstPageFromHighlights(normalized);
      setFocusPage1Based(null);
      queueMicrotask(() => setFocusPage1Based(page));
    } else {
      setActiveIdx(-1);
      setFocusPage1Based(null);
    }
  }, []);

  const openRowSource = useCallback(
    async (pf: ReconciliationPerFile, row: ExtractedFieldRow) => {
      const key = rowSourceKey(pf.filename, row.field);
      setActiveSourceKey(key);
      setSourceError(null);
      setPreviewFilename(pf.filename);
      setModalFieldLabel(row.field);
      setModalDocumentName(pf.original_name);

      const precomputed = row.source?.highlights;
      if (precomputed?.length) {
        applyHighlights(precomputed);
        setSourceModalOpen(true);
        return;
      }

      const val = row.extracted_value?.trim();
      if (!val || val === '—') {
        setHighlights([]);
        setActiveIdx(-1);
        setFocusPage1Based(null);
        setSourceError('No value to locate in the document.');
        setSourceModalOpen(true);
        return;
      }

      setSourceLoadingKey(key);
      try {
        const results = await queryDocument(pf.filename, val, 1);
        if (results.length > 0) {
          applyHighlights(results);
        } else {
          setHighlights([]);
          setActiveIdx(-1);
          setFocusPage1Based(null);
          setSourceError('No matching region found in the PDF.');
        }
        setSourceModalOpen(true);
      } catch (e: unknown) {
        setHighlights([]);
        setActiveIdx(-1);
        setFocusPage1Based(null);
        setSourceError(e instanceof Error ? e.message : 'Failed to locate source');
        setSourceModalOpen(true);
      } finally {
        setSourceLoadingKey(null);
      }
    },
    [applyHighlights],
  );

  const actionRequired = snapshot?.warnings.filter((w) => w.severity !== 'info').length ?? 0;
  const newExtractionOnly =
    entityId === DEMO_ENTITY_ID || snapshot?.display_mode === DEMO_DISPLAY_MODE;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f1f5f9]"
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-8 py-5 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-secondary hover:underline"
        >
          <ChevronRight size={14} className="rotate-180" /> Back to upload
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#001f3f]">
              Data Validation: {snapshot?.applicant_label ?? 'Applicant'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>
                Application ID:{' '}
                <span className="font-mono font-bold text-slate-800">
                  {snapshot?.application_id ?? `BATCH-${batchSessionId.slice(0, 8)}`}
                </span>
              </span>
              <span className="hidden h-3 w-px bg-slate-300 sm:inline" />
              <span>
                Status:{' '}
                <span
                  className={
                    snapshot?.review_status === 'flagged'
                      ? 'font-bold text-red-600'
                      : 'font-bold text-emerald-600'
                  }
                >
                  {snapshot?.review_status === 'flagged' ? 'Flagged' : 'Clear'}
                </span>
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Save draft
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#001f3f] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-slate-800"
            >
              Submit verification
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6 lg:flex-row lg:gap-6 lg:p-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-[#001f3f]">
              {newExtractionOnly ? 'Extracted from new submission' : 'Extracted information'}
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {files.length} file{files.length === 1 ? '' : 's'} processed
            </span>
          </div>

          <motion.div className="min-h-0 flex-1 overflow-hidden p-4">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <Loader2 className="animate-spin" size={28} />
                <p className="text-xs font-medium">Extracting fields…</p>
              </div>
            )}
            {loadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>
            )}
            {!loading && !loadError && snapshot && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                {snapshot.per_file.map((pf) => {
                  const isOpen = openFiles[pf.filename] ?? true;
                  const mismatches = pf.mismatch_count ?? pf.rows.filter((r) => r.status === 'mismatch').length;
                  return (
                    <div
                      key={pf.filename}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFile(pf.filename)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="shrink-0 text-slate-500" size={20} />
                          <span className="truncate text-sm font-bold text-slate-900">{pf.original_name}</span>
                          {mismatches > 0 && (
                            <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-700">
                              {mismatches} mismatch{mismatches === 1 ? '' : 'es'}
                            </span>
                          )}
                        </div>
                        {isOpen ? (
                          <ChevronDown size={18} className="text-slate-400" />
                        ) : (
                          <ChevronRight size={18} className="text-slate-400" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-200 bg-white px-2 pb-3 pt-1">
                          <div className="max-h-[min(50vh,420px)] overflow-x-auto overflow-y-auto">
                            <table
                              className={`w-full table-fixed text-left text-[12px] ${newExtractionOnly ? 'min-w-[440px]' : 'min-w-[560px]'}`}
                            >
                              <colgroup>
                                <col className="w-[26%]" />
                                <col className={newExtractionOnly ? 'w-[30%]' : 'w-[24%]'} />
                                {!newExtractionOnly && <col className="w-[26%]" />}
                                <col className="w-[76px]" />
                                <col className="w-[92px]" />
                              </colgroup>
                              <thead>
                                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  <th className="px-3 py-2">Field</th>
                                  <th className="px-3 py-2">Extracted value</th>
                                  {!newExtractionOnly && (
                                    <th className="px-3 py-2">Database record</th>
                                  )}
                                  <th className="px-3 py-2">Status</th>
                                  <th className="px-3 py-2">Source</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {pf.rows.map((row) => {
                                  const sourceKey = rowSourceKey(pf.filename, row.field);
                                  const isActiveSource = activeSourceKey === sourceKey;
                                  const isLoadingSource = sourceLoadingKey === sourceKey;
                                  return (
                                  <tr
                                    key={`${pf.filename}-${row.field}`}
                                    className={`text-slate-800 ${isActiveSource ? 'bg-sky-50' : ''}`}
                                  >
                                    <td
                                      className="truncate px-3 py-2.5 font-semibold text-slate-600"
                                      title={row.field}
                                    >
                                      {row.field}
                                    </td>
                                    <td
                                      className={`line-clamp-3 break-words px-3 py-2.5 ${
                                        row.status === 'mismatch' ? 'font-semibold text-red-600' : ''
                                      }`}
                                      title={row.extracted_value}
                                    >
                                      {row.extracted_value}
                                    </td>
                                    {!newExtractionOnly && (
                                      <td
                                        className="line-clamp-3 break-words px-3 py-2.5 text-slate-700"
                                        title={row.database_value}
                                      >
                                        {row.database_value}
                                      </td>
                                    )}
                                    <td className="px-2 py-2.5">
                                      {row.status === 'mismatch' ? statusBadge(row.status) : null}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                      <button
                                        type="button"
                                        disabled={isLoadingSource}
                                        onClick={() => void openRowSource(pf, row)}
                                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                                          isActiveSource
                                            ? 'border-sky-500 bg-sky-100 text-sky-900'
                                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                        }`}
                                      >
                                        {isLoadingSource ? (
                                          <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                          <Eye size={12} />
                                        )}
                                        Locate
                                      </button>
                                    </td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        <SourcePdfModal
          open={sourceModalOpen}
          onClose={closeSourceModal}
          fieldLabel={modalFieldLabel}
          documentName={modalDocumentName}
          pdfUrl={previewUrl}
          highlights={highlights}
          activeIdx={activeIdx}
          focusPage1Based={focusPage1Based}
          locateRevision={locateRevision}
          sourceError={sourceError}
          loading={sourceLoadingKey !== null}
        />

        <EvidenceCompareSheet
          open={evidenceSheetOpen}
          payload={evidencePayload}
          onClose={closeEvidenceSheet}
        />

        <div className="flex max-h-[min(40vh,320px)] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:max-h-none lg:w-72 xl:w-80">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={18} />
              <h2 className="text-sm font-bold text-[#001f3f]">Review flags</h2>
            </div>
            {actionRequired > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase text-red-800">
                {actionRequired} action required
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {!loading && snapshot?.warnings.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-500 lg:py-6">No flags for this batch.</p>
            )}
            {snapshot?.warnings.map((w) => {
              const st = severityStyles(w);
              return (
                <div
                  key={w.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm ${st.border}`}
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <h3 className={`text-sm font-bold ${st.title}`}>{w.title ?? w.code}</h3>
                    {w.priority === 'high' && (
                      <span className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        High priority
                      </span>
                    )}
                    {w.priority === 'medium' && (
                      <span className="shrink-0 rounded bg-amber-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        Medium
                      </span>
                    )}
                  </div>
                  <p className="mb-4 text-xs leading-relaxed text-slate-600">{w.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openWarningEvidence(w)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-800 hover:bg-slate-50"
                    >
                      <Eye size={14} /> View src
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-[#001f3f] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-800"
                    >
                      Resolve conflict
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
