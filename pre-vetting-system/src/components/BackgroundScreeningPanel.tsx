import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Newspaper,
  Scale,
  Search,
  User,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  DEFAULT_APPLICANT_SUMMARY,
  DEFAULT_REVIEW_CHECKLIST,
  DEFAULT_SCREENING_ROWS,
  DEFAULT_SOURCE_PREVIEW,
  type ApplicantSummaryData,
  type ReviewChecklistItem,
  type RowRiskLevel,
  type ScreeningResultRow,
  type SourcePreviewData,
} from '../lib/backgroundScreeningDefaults';
import {
  mapResultToRows,
  riskLabelFromLevel,
  rowToSourcePreview,
} from '../lib/backgroundScreeningMappers';
import {
  getApplicantIdentity,
  getScreeningError,
  getScreeningResult,
  isScreeningPending,
  setApplicantIdentity,
  setScreeningError,
  setScreeningPending,
  setScreeningResult,
} from '../lib/backgroundScreeningStorage';
import {
  runBackgroundScreening,
  type RiskLevel,
  type WebSearchScreeningResult,
} from '../lib/highlightApi';

const PAGE_SIZE = 5;
/** ASCII-safe Unicode escapes (avoids mojibake from bad file saves). */
const MIDDLE_DOT = '\u00b7';
const MALE_SIGN = '\u2642';

export interface BackgroundScreeningPanelProps {
  applicantSummary?: Partial<ApplicantSummaryData>;
  initialRows?: ScreeningResultRow[];
  defaultSourcePreview?: SourcePreviewData;
  reviewChecklist?: ReviewChecklistItem[];
  showManualSearch?: boolean;
}

function riskBadge(level: RiskLevel) {
  switch (level) {
    case 'clear':
      return {
        label: 'Clear',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: <CheckCircle2 size={14} />,
      };
    case 'high_risk':
      return {
        label: 'High risk',
        className: 'bg-red-100 text-red-800 border-red-200',
        icon: <AlertTriangle size={14} />,
      };
    default:
      return {
        label: 'Review required',
        className: 'bg-amber-100 text-amber-900 border-amber-200',
        icon: <AlertTriangle size={14} />,
      };
  }
}

function rowRiskPill(level: RowRiskLevel) {
  switch (level) {
    case 'high':
      return 'bg-red-100 text-red-800';
    case 'medium':
      return 'bg-amber-100 text-amber-900';
    case 'low':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

function rowRiskLabel(level: RowRiskLevel) {
  switch (level) {
    case 'high':
      return 'High risk';
    case 'medium':
      return 'Medium risk';
    case 'low':
      return 'Low risk';
    default:
      return 'Pending review';
  }
}

function typePillClass(typeKey: ScreeningResultRow['typeKey']) {
  switch (typeKey) {
    case 'negative_news':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'litigation':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'financial':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function SourceIcon({ typeKey }: { typeKey: ScreeningResultRow['typeKey'] }) {
  if (typeKey === 'litigation') return <Scale size={14} className="text-orange-600" />;
  if (typeKey === 'negative_news') return <Newspaper size={14} className="text-red-600" />;
  return <Globe size={14} className="text-secondary" />;
}

function ScreeningCard({
  title,
  icon,
  headerExtra,
  children,
  className = '',
  fillHeight = true,
}: {
  title: string;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  fillHeight?: boolean;
}) {
  return (
    <section
      className={`flex flex-col rounded-lg border border-outline-variant bg-surface shadow-sm ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
        <motion.div className="flex items-center gap-2">
          {icon}
          <h4 className="text-sm font-bold text-on-surface">{title}</h4>
        </motion.div>
        {headerExtra}
      </header>
      <div className={`flex flex-col p-4 ${fillHeight ? 'min-h-0 flex-1' : ''}`}>
        {children}
      </div>
    </section>
  );
}

const applicantFieldLabel = 'text-on-surface-variant';
const applicantFieldValue = 'mt-0.5 font-medium text-on-surface';

function ApplicantSummaryCard({
  summary,
  onManualReview,
}: {
  summary: ApplicantSummaryData;
  onManualReview: () => void;
}) {
  return (
    <ScreeningCard
      title="Applicant Information"
      icon={<User size={16} className="text-secondary" />}
      className="h-full"
    >
      <motion.div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high">
          <User size={22} className="text-on-surface-variant" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-on-surface">
            {summary.name}
            {summary.gender === 'male' && (
              <span className="ml-1 font-normal text-on-surface-variant" aria-hidden>
                {MALE_SIGN}
              </span>
            )}
          </p>
          <div className="mt-2 space-y-1.5 text-xs leading-snug">
            <div>
              <p className={applicantFieldLabel}>Application</p>
              <p className={applicantFieldValue}>{summary.applicationId}</p>
            </div>
            <div>
              <p className={applicantFieldLabel}>ID</p>
              <p className={`${applicantFieldValue} flex flex-wrap items-center gap-2`}>
                {summary.idMasked}
                {summary.idVerified && (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                    Verified
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className={applicantFieldLabel}>Materials</p>
              <p className={applicantFieldValue}>
                {summary.materialsPdf} PDF {MIDDLE_DOT} {summary.materialsImages} images{' '}
                {MIDDLE_DOT} {summary.materialsTables} tables
              </p>
            </div>
            <div>
              <p className={applicantFieldLabel}>Submitted</p>
              <p className={applicantFieldValue}>{summary.applicationTime}</p>
            </div>
          </div>
          {summary.product.trim() ? (
            <div className="mt-1.5 text-xs leading-snug">
              <p className={applicantFieldLabel}>Product</p>
              <p className={applicantFieldValue}>{summary.product}</p>
            </div>
          ) : null}
        </div>
      </motion.div>

      <button
        type="button"
        onClick={onManualReview}
        className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-700"
      >
        Manual review
      </button>
    </ScreeningCard>
  );
}

function SourceToSightCard({
  preview,
  summary,
  riskLevel,
}: {
  preview: SourcePreviewData;
  summary: ApplicantSummaryData;
  riskLevel: RiskLevel | null;
}) {
  const badge = riskLevel ? riskBadge(riskLevel) : null;
  const isHigh = summary.externalRiskScore >= 70;

  return (
    <ScreeningCard
      title="Summary from AI Assistant"
      icon={<FileText size={16} className="text-secondary" />}
      className="h-full"
    >
      <div
        className={`rounded-lg border px-4 py-3 ${
          isHigh ? 'border-red-200 bg-red-50' : 'border-outline-variant bg-surface-container-low'
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          External risk score
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-3xl font-black text-on-surface">
            {summary.externalRiskScore}
            <span className="text-lg font-normal text-on-surface-variant"> / 100</span>
          </p>
          {badge && (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${badge.className}`}
            >
              {badge.icon}
              {summary.riskLabel || badge.label}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm leading-relaxed text-on-surface">
        {preview.snippetParts.map((part, i) =>
          part.highlight ? (
            <mark key={i} className="rounded bg-amber-200 px-0.5 font-semibold text-on-surface">
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </div>
      {preview.sourceUrl && (
        <a
          href={preview.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"
        >
          Open source <ExternalLink size={12} />
        </a>
      )}
    </ScreeningCard>
  );
}

function ManualSearchSection({
  name,
  context,
  loading,
  linkedName,
  onNameChange,
  onContextChange,
  onSearch,
}: {
  name: string;
  context: string;
  loading: boolean;
  linkedName?: string;
  onNameChange: (v: string) => void;
  onContextChange: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="shrink-0 rounded-lg border border-dashed border-outline-variant bg-surface p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container">
          <Search className="text-outline" size={24} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-on-surface">Manual screening search</h4>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Isolated test — type a name without uploading documents. Results appear in the
            table above.
          </p>
        </div>
      </div>

      {linkedName && (
        <p className="mb-4 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
          <span className="font-bold uppercase tracking-widest text-on-surface-variant">
            Linked identity
          </span>
          <span className="ml-2 font-semibold">{linkedName}</span>
          <span className="ml-2 text-on-surface-variant">
            — override the name field to search someone else.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Applicant name
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="Full name…"
            className="mt-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface"
          />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Context (optional)
          <input
            type="text"
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="Location, employer, DOB…"
            className="mt-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface"
          />
        </label>
        <button
          type="button"
          disabled={loading || !name.trim()}
          onClick={onSearch}
          className="rounded-lg bg-secondary px-6 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </span>
          ) : (
            'SEARCH'
          )}
        </button>
      </div>
    </div>
  );
}

function ScreeningResultsTable({
  rows,
  selectedRowId,
  checkedIds,
  typeFilter,
  statusFilter,
  page,
  isLiveData,
  emptyMessage,
  onSelectRow,
  onToggleCheck,
  onTypeFilter,
  onStatusFilter,
  onPageChange,
}: {
  rows: ScreeningResultRow[];
  selectedRowId: string | null;
  checkedIds: Set<string>;
  typeFilter: string;
  statusFilter: string;
  page: number;
  isLiveData: boolean;
  emptyMessage?: string;
  onSelectRow: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onTypeFilter: (v: string) => void;
  onStatusFilter: (v: string) => void;
  onPageChange: (p: number) => void;
}) {
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.typeKey !== typeFilter) return false;
      if (statusFilter === 'high' && r.riskLevel !== 'high') return false;
      if (statusFilter === 'medium' && r.riskLevel !== 'medium') return false;
      if (statusFilter === 'pending' && r.status !== 'pending_review') return false;
      return true;
    });
  }, [rows, typeFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (safePage !== page) onPageChange(safePage);
  }, [safePage, page, onPageChange]);

  const typeOptions = [
    { value: 'all', label: 'All types' },
    { value: 'negative_news', label: 'Negative news' },
    { value: 'litigation', label: 'Litigation' },
    { value: 'financial', label: 'Financial' },
    { value: 'regulatory', label: 'Regulatory' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <ScreeningCard
      title={`Internet search results (${rows.length})`}
      icon={<Search size={16} className="text-secondary" />}
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
          {isLiveData ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-800">
              Live search
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">
              Demo data
            </span>
          )}
          <select
            value={typeFilter}
            onChange={(e) => {
              onTypeFilter(e.target.value);
              onPageChange(0);
            }}
            className="rounded border border-outline-variant bg-surface px-2 py-1 text-[10px] font-semibold"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              onStatusFilter(e.target.value);
              onPageChange(0);
            }}
            className="rounded border border-outline-variant bg-surface px-2 py-1 text-[10px] font-semibold"
          >
            <option value="all">All statuses</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="pending">Pending review</option>
          </select>
        </div>
      }
      fillHeight={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-outline-variant text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">
              <th className="w-8 py-2 pr-2" />
              <th className="py-2 pr-2">Source</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Match</th>
              <th className="py-2 pr-2">Risk signal</th>
              <th className="py-2 pr-2">Time</th>
              <th className="py-2 pr-2">Conf.</th>
              <th className="py-2 pr-2">Risk</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const selected = row.id === selectedRowId;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectRow(row.id)}
                  className={`cursor-pointer border-b border-outline-variant/60 transition-colors ${
                    selected ? 'bg-secondary-container/50' : 'hover:bg-surface-container-low'
                  }`}
                >
                  <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(row.id)}
                      onChange={() => onToggleCheck(row.id)}
                      className="rounded border-outline"
                    />
                  </td>
                  <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                    {row.sourceUrl ? (
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={row.sourceUrl}
                        className="group inline-flex max-w-[200px] items-center gap-1.5 font-semibold text-secondary hover:underline"
                      >
                        <SourceIcon typeKey={row.typeKey} />
                        <span className="truncate">{row.sourceName}</span>
                        <ExternalLink
                          size={12}
                          className="shrink-0 opacity-70 group-hover:opacity-100"
                        />
                      </a>
                    ) : (
                      <span className="flex max-w-[200px] items-center gap-1.5 font-semibold text-on-surface">
                        <SourceIcon typeKey={row.typeKey} />
                        <span className="truncate">{row.sourceName}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${typePillClass(row.typeKey)}`}
                    >
                      {row.typeLabel}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-on-surface">{row.matchingObject}</td>
                  <td className="max-w-[180px] truncate py-2 pr-2 text-on-surface-variant">
                    {row.riskSignal}
                  </td>
                  <td className="py-2 pr-2 font-mono text-[10px]">{row.time}</td>
                  <td className="py-2 pr-2 font-mono font-bold">{row.confidence}%</td>
                  <td className="py-2 pr-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${rowRiskPill(row.riskLevel)}`}
                    >
                      {rowRiskLabel(row.riskLevel)}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-700">
                      {row.status === 'pending_review' ? 'Pending review' : row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pageRows.length === 0 && (
          <p className="py-8 text-center text-sm text-on-surface-variant">
            {emptyMessage ?? 'No rows match filters.'}
          </p>
        )}
      </div>
      <footer className="mt-3 flex items-center justify-between border-t border-outline-variant pt-3 text-[10px] text-on-surface-variant">
        <span>
          Showing {pageRows.length} of {filtered.length} (total {rows.length})
        </span>
        <motion.div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded border border-outline-variant p-1 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded border border-outline-variant p-1 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </motion.div>
      </footer>
    </ScreeningCard>
  );
}

function ManualReviewCard({
  checklist,
  onCheckChange,
  reviewRef,
}: {
  checklist: ReviewChecklistItem[];
  onCheckChange: (id: string, checked: boolean) => void;
  reviewRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <ScreeningCard
      title="Manual review"
      icon={<AlertTriangle size={16} className="text-amber-600" />}
      className="h-full"
    >
      <ul ref={reviewRef as React.RefObject<HTMLUListElement>} className="mb-4 flex flex-col gap-2">
        {checklist.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-xs text-on-surface">
            <input
              type="checkbox"
              checked={!!item.checked}
              onChange={(e) => onCheckChange(item.id, e.target.checked)}
              className="mt-0.5 rounded border-outline"
            />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-lg bg-secondary px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
        >
          Add to manual review queue
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-outline-variant px-4 py-2.5 text-xs font-bold text-on-surface hover:bg-surface-container-low"
        >
          Mark as false positive
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-outline-variant px-4 py-2.5 text-xs font-bold text-on-surface hover:bg-surface-container-low"
        >
          Request supplementary materials
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50"
        >
          Escalate to anti-fraud team
        </button>
      </div>
    </ScreeningCard>
  );
}

export function BackgroundScreeningPanel({
  applicantSummary: applicantSummaryProp,
  initialRows = DEFAULT_SCREENING_ROWS,
  defaultSourcePreview = DEFAULT_SOURCE_PREVIEW,
  reviewChecklist: reviewChecklistProp = DEFAULT_REVIEW_CHECKLIST,
  showManualSearch = true,
}: BackgroundScreeningPanelProps = {}) {
  const linked = getApplicantIdentity();
  const [name, setName] = useState(linked?.name ?? '');
  const [context, setContext] = useState('');
  const [result, setResult] = useState<WebSearchScreeningResult | null>(() => getScreeningResult());
  const [error, setError] = useState<string | null>(() => getScreeningError());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(() => isScreeningPending());
  const [lastQueriedName, setLastQueriedName] = useState(() => linked?.name?.trim() ?? '');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [checklist, setChecklist] = useState(reviewChecklistProp);
  const reviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPending(isScreeningPending());
      const cached = getScreeningResult();
      if (cached) setResult(cached);
      const err = getScreeningError();
      if (err) setError(err);
    }, 800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (linked?.name) {
      setName((prev) => (prev.trim() ? prev : linked.name));
      if (!lastQueriedName) setLastQueriedName(linked.name.trim());
    }
  }, [linked?.name, lastQueriedName]);

  useEffect(() => {
    if (result && !lastQueriedName) {
      const fromLinked = linked?.name?.trim();
      const fromField = name.trim();
      if (fromLinked) setLastQueriedName(fromLinked);
      else if (fromField) setLastQueriedName(fromField);
    }
  }, [result, lastQueriedName, linked?.name, name]);

  const displayApplicantName =
    lastQueriedName.trim() ||
    name.trim() ||
    linked?.name?.trim() ||
    applicantSummaryProp?.name?.trim() ||
    DEFAULT_APPLICANT_SUMMARY.name;

  const isLiveData = result !== null;

  const resolvedSummary: ApplicantSummaryData = useMemo(() => {
    const base = { ...DEFAULT_APPLICANT_SUMMARY, ...applicantSummaryProp };
    return {
      ...base,
      name: displayApplicantName,
      externalRiskScore: result?.confidence_score ?? base.externalRiskScore,
      riskLabel: result ? riskLabelFromLevel(result.risk_level) : base.riskLabel,
    };
  }, [applicantSummaryProp, displayApplicantName, result]);

  const tableRows = useMemo(() => {
    if (result) return mapResultToRows(result, displayApplicantName);
    return initialRows;
  }, [result, displayApplicantName, initialRows]);

  const sourcePreview = useMemo(() => {
    const row = tableRows.find((r) => r.id === selectedRowId) ?? tableRows[0];
    if (row) {
      const preview = rowToSourcePreview(row, resolvedSummary);
      if (result?.summary_of_findings && isLiveData) {
        const summary = result.summary_of_findings;
        return {
          ...preview,
          snippetParts: [
            { text: summary.length > 400 ? `${summary.slice(0, 400)}…` : summary },
            { text: ' — ' },
            ...preview.snippetParts,
          ],
        };
      }
      return preview;
    }
    return defaultSourcePreview;
  }, [tableRows, selectedRowId, resolvedSummary, defaultSourcePreview, result, isLiveData]);

  useEffect(() => {
    if (tableRows.length === 0) return;
    setSelectedRowId((prev) => {
      if (prev && tableRows.some((r) => r.id === prev)) return prev;
      return tableRows[0].id;
    });
  }, [tableRows]);

  const runSearch = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter an applicant name to search.');
      return;
    }
    setLoading(true);
    setError(null);
    setScreeningPending(true);
    try {
      const data = await runBackgroundScreening(trimmed, context.trim());
      setLastQueriedName(trimmed);
      setApplicantIdentity({ name: trimmed });
      setResult(data);
      setScreeningResult(data);
      setPage(0);
      setTypeFilter('all');
      setStatusFilter('all');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Background screening failed';
      setError(msg);
      setScreeningError(msg);
      setResult(null);
    } finally {
      setLoading(false);
      setScreeningPending(false);
    }
  }, [name, context]);

  const scrollToReview = () => {
    reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-background p-6"
    >
      <header className="shrink-0">
        <h2 className="text-xl font-bold text-on-surface">Internet risk search & manual review</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Adverse media and external intelligence for pre-vetting.
          {linked ? (
            <span className="ml-2 font-semibold text-on-surface">Linked: {linked.name}</span>
          ) : (
            <span className="ml-2">No linked identity — use manual search or Data validation.</span>
          )}
        </p>
        {pending && !loading && (
          <p className="mt-2 flex items-center gap-2 text-xs text-secondary">
            <Loader2 size={14} className="animate-spin" />
            Background search in progress from Data validation…
          </p>
        )}
      </header>

      {error && (
        <p className="shrink-0 rounded-lg border border-error/30 bg-error-container/30 px-4 py-3 text-sm text-error">
          {error}
        </p>
      )}

      {result?.discrepancy_detected && (
        <motion.div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Identity discrepancy detected.</strong> Results may refer to a different person.
          Human review required.
        </motion.div>
      )}

      <div className="shrink-0 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <ApplicantSummaryCard
            summary={resolvedSummary}
            onManualReview={scrollToReview}
          />
        </div>
        <div className="xl:col-span-5">
          <SourceToSightCard
            preview={sourcePreview}
            summary={resolvedSummary}
            riskLevel={result?.risk_level ?? null}
          />
        </div>
        <div className="xl:col-span-4">
          <ManualReviewCard
            checklist={checklist}
            onCheckChange={(id, checked) => {
              setChecklist((prev) =>
                prev.map((c) => (c.id === id ? { ...c, checked } : c)),
              );
            }}
            reviewRef={reviewRef}
          />
        </div>
      </div>

      <section className="flex shrink-0 flex-col gap-4">
        <ScreeningResultsTable
          rows={tableRows}
          selectedRowId={selectedRowId}
          checkedIds={checkedIds}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          page={page}
          isLiveData={isLiveData}
          emptyMessage={
            isLiveData
              ? 'No categorized flags returned. Check the AI summary panel and grounding sources.'
              : undefined
          }
          onSelectRow={setSelectedRowId}
          onToggleCheck={(id) => {
            setCheckedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onTypeFilter={setTypeFilter}
          onStatusFilter={setStatusFilter}
          onPageChange={setPage}
        />

        {showManualSearch && (
          <ManualSearchSection
            name={name}
            context={context}
            loading={loading}
            linkedName={linked?.name}
            onNameChange={setName}
            onContextChange={setContext}
            onSearch={() => void runSearch()}
          />
        )}
      </section>
    </motion.div>
  );
}
