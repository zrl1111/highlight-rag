import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Search,
  Shield,
  UploadCloud,
} from 'lucide-react';
import { PdfAuditSourcePanel } from './PdfAuditSourcePanel';
import { DataReconciliationPanel } from './DataReconciliationPanel';
import { DEMO_BASELINE_LABEL, DEMO_ENTITY_ID } from '../lib/demoConfig';
import { pdfUrl, queryDocument, uploadPdf, type RagHit } from '../lib/highlightApi';

const STORAGE_KEY = 'pv_currentPdf';
const BATCH_SESSION_KEY = 'pv_batch_session';
const INTAKE_QUEUE_KEY = 'pv_intake_queue';

type CompareFieldRow = { field: string; value: string };

/** Placeholder until extraction pipeline populates real fields. */
const DEMO_EXTRACTED_ROWS: CompareFieldRow[] = [
  { field: 'Applicant Name', value: 'Steven Zhang Kangyang' },
  { field: 'Age', value: '41' },
  { field: 'Diagnosis', value: 'lower musculoskeletal strain' },
];

/** Placeholder until structured database is wired. */
const DEMO_DATABASE_ROWS: CompareFieldRow[] = [
  { field: 'Name', value: 'Steven Zhang Kangyang' },
  { field: 'Invoice Amount', value: 'HK$ 14,000.00' },
  { field: 'Diagnosis Code', value: 'ICD-10 J45.90' },
];

type IntakeRow = {
  id: string;
  name: string;
  sizeLabel: string;
  status: 'uploading' | 'indexed' | 'error';
  filename?: string;
  errorMessage?: string;
  chunkCount?: number;
  parseMode?: string;
};

export function IntakeWorkspace() {
  const [mode, setMode] = useState<'upload' | 'audit' | 'reconcile'>('upload');
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [batchSessionId, setBatchSessionId] = useState<string | null>(null);
  const [auditFilename, setAuditFilename] = useState<string | null>(null);
  const [auditLabel, setAuditLabel] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [highlights, setHighlights] = useState<RagHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [focusPage1Based, setFocusPage1Based] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [uploadHint, setUploadHint] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INTAKE_QUEUE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as IntakeRow[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRows(parsed);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  useEffect(() => {
    try {
      if (rows.length === 0) {
        sessionStorage.removeItem(INTAKE_QUEUE_KEY);
      } else {
        sessionStorage.setItem(INTAKE_QUEUE_KEY, JSON.stringify(rows));
      }
    } catch {
      /* quota */
    }
  }, [rows]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7754/ingest/1074a86e-f8c4-4106-a01e-73746c0bd6dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f8f939'},body:JSON.stringify({sessionId:'f8f939',location:'IntakeWorkspace.tsx:rowsEffect',message:'rows or mode changed',data:{mode,rowsLength:rows.length,statuses:rows.map((r)=>r.status)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  }, [mode, rows]);

  // Disabled for batch intake testing: was auto-opening audit for pv_currentPdf in localStorage.
  // useEffect(() => {
  //   const saved = localStorage.getItem(STORAGE_KEY);
  //   if (!saved) return;
  //   void getStatus(saved)
  //     .then((s) => {
  //       if (s.indexed) {
  //         setAuditFilename(saved);
  //         setAuditLabel(saved);
  //         setMode('audit');
  //       }
  //     })
  //     .catch(() => {});
  // }, []);

  const openReconcile = useCallback(() => {
    let id = sessionStorage.getItem(BATCH_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(BATCH_SESSION_KEY, id);
    }
    setBatchSessionId(id);
    setMode('reconcile');
  }, []);

  const openAudit = useCallback((filename: string, displayName: string) => {
    setAuditFilename(filename);
    setAuditLabel(displayName);
    localStorage.setItem(STORAGE_KEY, filename);
    setQuery('');
    setHighlights([]);
    setActiveIdx(-1);
    setFocusPage1Based(null);
    setSearchError(null);
    setMode('audit');
  }, []);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || !auditFilename) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await queryDocument(auditFilename, q, 5);
      setHighlights(results);
      setActiveIdx(-1);
      setFocusPage1Based(null);
      if (results.length > 0) {
        setActiveIdx(0);
        setFocusPage1Based(results[0].page_idx + 1);
      }
    } catch (e) {
      setHighlights([]);
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const selectHit = (i: number) => {
    if (!highlights[i]) return;
    setActiveIdx(i);
    setFocusPage1Based(highlights[i].page_idx + 1);
  };

  const processPdfFile = async (file: File) => {
    const id = Math.random().toString(36).slice(2, 11);
    const sizeLabel = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    // #region agent log
    fetch('http://127.0.0.1:7754/ingest/1074a86e-f8c4-4106-a01e-73746c0bd6dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f8f939'},body:JSON.stringify({sessionId:'f8f939',location:'IntakeWorkspace.tsx:processPdfFile',message:'processPdfFile start',data:{id,name:file.name,size:file.size},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    setUploadHint(null);
    setRows((prev) => [
      {
        id,
        name: file.name,
        sizeLabel,
        status: 'uploading',
      },
      ...prev,
    ]);
    try {
      const data = await uploadPdf(file);
      // #region agent log
      fetch('http://127.0.0.1:7754/ingest/1074a86e-f8c4-4106-a01e-73746c0bd6dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f8f939'},body:JSON.stringify({sessionId:'f8f939',location:'IntakeWorkspace.tsx:processPdfFile',message:'upload success',data:{id,filename:data.filename,chunkCount:data.chunk_count},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: 'indexed' as const,
                filename: data.filename,
                chunkCount: data.chunk_count,
                parseMode: data.mode,
              }
            : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      // #region agent log
      fetch('http://127.0.0.1:7754/ingest/1074a86e-f8c4-4106-a01e-73746c0bd6dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f8f939'},body:JSON.stringify({sessionId:'f8f939',location:'IntakeWorkspace.tsx:processPdfFile',message:'upload error',data:{id,error:msg},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: 'error', errorMessage: msg } : r,
        ),
      );
    }
  };

  const acceptPdfFiles = (files: FileList | Iterable<File>) => {
    const pdfs = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf'),
    );
    // #region agent log
    fetch('http://127.0.0.1:7754/ingest/1074a86e-f8c4-4106-a01e-73746c0bd6dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f8f939'},body:JSON.stringify({sessionId:'f8f939',location:'IntakeWorkspace.tsx:acceptPdfFiles',message:'acceptPdfFiles',data:{incomingCount:Array.from(files).length,pdfCount:pdfs.length,names:pdfs.map((f)=>f.name)},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (pdfs.length === 0) {
      setUploadHint('Only PDF files are supported. Please select a .pdf file.');
      return;
    }
    setUploadHint(null);
    for (const file of pdfs) void processPdfFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
    else if (e.type === 'dragleave') setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      acceptPdfFiles(e.dataTransfer.files);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Snapshot before clearing — FileList is live and empties when input.value is reset.
    const picked = Array.from(e.target.files ?? []);
    const lenBeforeClear = picked.length;
    e.target.value = '';
    const lenAfterClear = picked.length;
    // #region agent log
    fetch('http://127.0.0.1:7754/ingest/1074a86e-f8c4-4106-a01e-73746c0bd6dd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f8f939'},body:JSON.stringify({sessionId:'f8f939',runId:'post-fix',location:'IntakeWorkspace.tsx:onFileInputChange',message:'file input change',data:{lenBeforeClear,lenAfterClear},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (picked.length === 0) return;
    acceptPdfFiles(picked);
  };

  const indexedFiles = rows
    .filter((r): r is IntakeRow & { filename: string } => r.status === 'indexed' && !!r.filename)
    .map((r) => ({ id: r.id, displayName: r.name, filename: r.filename }));

  if (mode === 'reconcile') {
    if (!batchSessionId || indexedFiles.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-auto flex max-w-lg flex-col gap-4 p-10 text-center"
        >
          <p className="text-sm text-on-surface-variant">No indexed documents in this batch. Upload PDFs first.</p>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white"
          >
            Back to upload
          </button>
        </motion.div>
      );
    }
    return (
      <DataReconciliationPanel
        batchSessionId={batchSessionId}
        entityId={DEMO_ENTITY_ID}
        files={indexedFiles}
        onBack={() => setMode('upload')}
      />
    );
  }

  if (mode === 'upload') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-8 overflow-y-auto overscroll-y-contain p-10"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={onFileInputChange}
        />
        <div className="flex flex-col gap-1">
          <h3 className="text-2xl font-black tracking-tight text-primary">
            Vetting Intake Gateway
          </h3>
          <p className="text-sm text-on-surface-variant">
            Upload a PDF for Azure Document Intelligence layout + BM25 indexing (same pipeline as
            highlight_rag).
          </p>
          <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-900">
            {DEMO_BASELINE_LABEL} is already on file. Upload the new document batch below, then open{' '}
            <span className="font-bold">Data validation</span> to compare against the prior record.
          </p>
        </div>

        <motion.div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-all duration-300 ${
            isDragging
              ? 'scale-[1.02] border-secondary bg-secondary-container/10'
              : 'border-outline-variant bg-surface-container-low'
          }`}
        >
          <div
            className={`rounded-full bg-secondary/10 p-4 text-secondary transition-transform duration-300 ${isDragging ? 'scale-110 animate-bounce' : ''}`}
          >
            <UploadCloud size={40} />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-on-surface">Drag and drop PDF here</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              PDF only (Azure Document Intelligence). Max size depends on server limits.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-primary px-6 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-primary-container"
          >
            SELECT PDF
          </button>
        </motion.div>

        {uploadHint && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
            {uploadHint}
          </p>
        )}

        {rows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex shrink-0 flex-col gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Intake queue
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                {indexedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={openReconcile}
                    className="rounded-lg bg-[#001f3f] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-slate-800"
                  >
                    Data validation
                  </button>
                )}
                <button
                  type="button"
                  className="text-[10px] font-bold text-secondary hover:underline"
                  onClick={() => {
                    setRows([]);
                    setUploadHint(null);
                    sessionStorage.removeItem(BATCH_SESSION_KEY);
                    sessionStorage.removeItem(INTAKE_QUEUE_KEY);
                    setBatchSessionId(null);
                  }}
                >
                  CLEAR ALL
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface p-4 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded bg-surface-container p-2 text-outline">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-on-surface">{file.name}</div>
                      <div className="mt-1 text-[10px] uppercase text-on-surface-variant">
                        {file.sizeLabel}
                        {file.status === 'uploading' && ' • INDEXING…'}
                        {file.status === 'indexed' &&
                          file.chunkCount != null &&
                          ` • ${file.chunkCount} chunks · ${file.parseMode ?? ''}`}
                        {file.status === 'error' && (
                          <span className="text-error"> • {file.errorMessage}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {file.status === 'uploading' && (
                      <span className="text-[10px] font-mono font-bold text-secondary">
                        Processing…
                      </span>
                    )}
                    {file.status === 'indexed' && file.filename && (
                      <button
                        type="button"
                        onClick={() => openAudit(file.filename!, file.name)}
                        className="rounded bg-secondary px-3 py-1 text-[10px] font-bold text-white shadow-sm hover:opacity-90"
                      >
                        AUDIT WORKSPACE
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {rows.length === 0 && (
          <div className="grid grid-cols-3 gap-6">
            <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Shield size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-on-surface">Layout + OCR</div>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Structured text and tables via Azure Document Intelligence.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <Search size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-on-surface">BM25 retrieval</div>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Keyword search with bounding-box mapping to the source PDF.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="rounded-lg bg-green-50 p-2 text-green-600">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-on-surface">Cached parse</div>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Re-upload skips Azure when parsed JSON already exists on the server.
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  const url = auditFilename ? pdfUrl(auditFilename) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 flex-1 overflow-hidden"
    >
      <div className="flex min-w-0 min-h-0 flex-[3] flex-col border-r border-outline-variant bg-background p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className="flex items-center gap-1 transition-colors hover:text-primary"
          >
            <ChevronRight size={14} className="rotate-180" /> BACK TO UPLOAD
          </button>
          <span className="truncate font-mono text-[10px] normal-case text-on-surface">
            {auditLabel}
          </span>
        </div>
        <PdfAuditSourcePanel
          pdfUrl={url}
          highlights={highlights}
          activeIdx={activeIdx}
          focusPage1Based={focusPage1Based}
        />
      </div>

      <div className="flex min-h-0 min-w-[320px] flex-[2] flex-col overflow-hidden bg-surface">
        <div className="flex-1 overflow-y-auto p-6">
          <section className="mb-8">
            <h3 className="mb-2 border-l-4 border-secondary pl-3 text-[10px] font-bold uppercase tracking-widest text-on-surface">
              Source comparison
            </h3>
            <p className="mb-4 pl-4 text-[11px] text-on-surface-variant">
              Extracted fields from this upload vs the closest structured database record (demo
              values until extraction + DB APIs are connected).
            </p>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <h4 className="mb-3 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Extracted from document
                </h4>
                <div className="overflow-x-auto rounded border border-outline-variant/80 bg-surface">
                  <table className="w-full text-left text-[11px] text-on-surface">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-high">
                        <th className="px-3 py-2 font-bold uppercase tracking-tighter text-on-surface-variant">
                          Field
                        </th>
                        <th className="px-3 py-2 font-bold uppercase tracking-tighter text-on-surface-variant">
                          Extracted value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_EXTRACTED_ROWS.map((row) => (
                        <tr key={row.field} className="border-b border-outline-variant/60 last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-on-surface-variant">
                            {row.field}
                          </td>
                          <td className="break-words px-3 py-2">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <h4 className="mb-3 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Relevant database data
                </h4>
                <div className="overflow-x-auto rounded border border-outline-variant/80 bg-surface">
                  <table className="w-full text-left text-[11px] text-on-surface">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-high">
                        <th className="px-3 py-2 font-bold uppercase tracking-tighter text-on-surface-variant">
                          Field
                        </th>
                        <th className="px-3 py-2 font-bold uppercase tracking-tighter text-on-surface-variant">
                          Database value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_DATABASE_ROWS.map((row) => (
                        <tr key={row.field} className="border-b border-outline-variant/60 last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-on-surface-variant">
                            {row.field}
                          </td>
                          <td className="break-words px-3 py-2">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-on-surface-variant">
                  Placeholder — will load from your structured store when available.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h3 className="mb-4 border-l-4 border-secondary pl-3 text-[10px] font-bold uppercase tracking-widest text-on-surface">
              Semantic retrieval
            </h3>
            {/* <p className="mb-3 text-[11px] text-on-surface-variant">
              Same <code className="rounded bg-surface-container px-1">POST /api/query</code> as
              highlight_rag — results highlight regions on the PDF.
            </p> */}
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                placeholder="Keywords or question…"
                className="flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-secondary focus:ring-2"
              />
              <button
                type="button"
                disabled={searching || !auditFilename}
                onClick={() => void runSearch()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-40"
              >
                {searching ? '…' : 'SEARCH'}
              </button>
            </div>
            {searchError && (
              <p className="mt-2 text-xs text-error">{searchError}</p>
            )}
            <div className="mt-4 flex max-h-56 flex-col gap-2 overflow-y-auto">
              {highlights.length === 0 && !searchError && (
                <p className="text-center text-xs text-on-surface-variant">
                  No results yet. Run a search to see ranked chunks.
                </p>
              )}
              {highlights.map((r, i) => (
                <button
                  key={`${r.page_idx}-${i}-${r.score}`}
                  type="button"
                  onClick={() => selectHit(i)}
                  className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                    activeIdx === i
                      ? 'border-secondary bg-secondary-container/30'
                      : 'border-outline-variant bg-surface-container-low hover:border-secondary/50'
                  }`}
                >
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="font-bold text-secondary">p.{r.page_idx + 1}</span>
                    <span className="text-on-surface-variant">score {r.score.toFixed(3)}</span>
                  </div>
                  <div className="line-clamp-4 break-words text-on-surface">{r.text}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-4 border-l-4 border-error pl-3 text-[10px] font-bold uppercase tracking-widest text-on-surface">
              Automated risk intelligence (demo)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Legal check
                </div>
                <div className="text-sm font-bold text-secondary">Clear</div>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Placeholder — wire to your rules engine when available.
                </p>
              </div>
              <div className="rounded-lg border border-error/20 bg-error-container/30 p-4">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-on-error-container">
                  Duplicate scan
                </div>
                <div className="text-sm font-bold text-on-error-container">Demo flag</div>
                <p className="mt-1 text-[10px] text-on-error-container/70">
                  Placeholder for fraud / duplicate rules.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="flex h-16 shrink-0 items-center justify-between border-t border-outline-variant bg-surface-container-low px-6">
          <label className="group flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="rounded border-outline text-secondary" />
            <span className="text-xs font-bold uppercase tracking-tight text-on-surface-variant transition-colors group-hover:text-on-surface">
              Flag for investigation
            </span>
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded border border-error/30 px-6 py-2 text-xs font-bold uppercase tracking-widest text-error transition-colors hover:bg-error-container"
            >
              REJECT
            </button>
            <button
              type="button"
              className="rounded bg-primary px-8 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-sm transition-all hover:opacity-90"
            >
              APPROVE CASE
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
