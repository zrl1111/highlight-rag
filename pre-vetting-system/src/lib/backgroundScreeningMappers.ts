import type {
  ApplicantSummaryData,
  DiscoveryStats,
  PipelineStep,
  RowRiskLevel,
  RowStatus,
  RowTypeKey,
  ScreeningResultRow,
  SourcePreviewData,
} from './backgroundScreeningDefaults';
import {
  DEFAULT_DISCOVERY_STATS,
  DEFAULT_PIPELINE_STEPS,
} from './backgroundScreeningDefaults';
import type {
  GroundingCitation,
  RiskLevel,
  WebSearchFlagItem,
  WebSearchScreeningResult,
} from './highlightApi';

const CATEGORY_TYPE: Record<
  keyof WebSearchScreeningResult['categories'],
  { typeKey: RowTypeKey; typeLabel: string; defaultRisk: RowRiskLevel }
> = {
  legal_and_court: { typeKey: 'litigation', typeLabel: 'Litigation record', defaultRisk: 'high' },
  financial_distress: {
    typeKey: 'financial',
    typeLabel: 'Financial distress',
    defaultRisk: 'medium',
  },
  negative_news: { typeKey: 'negative_news', typeLabel: 'Negative news', defaultRisk: 'high' },
};

const GENERIC_FLAG_TYPE =
  /^(negative news|litigation|financial distress|legal|fraud|investigation|court record|regulatory|other|finding)$/i;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function urlsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeUrlKey(a);
  const nb = normalizeUrlKey(b);
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function findCitationForUrl(
  url: string,
  citations: GroundingCitation[],
): GroundingCitation | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return citations.find((c) => c.url && urlsMatch(trimmed, c.url));
}

function isUsefulCitationTitle(title: string, url: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (t === url) return false;
  if (isHttpUrl(t)) return false;
  if (GENERIC_FLAG_TYPE.test(t)) return false;
  return t.length >= 3;
}

function resolveSourceDisplay(
  flag: WebSearchFlagItem,
  citation: GroundingCitation | undefined,
  resolvedUrl: string,
): string {
  const modelSourceName = flag.source_name?.trim() ?? '';
  if (modelSourceName && !GENERIC_FLAG_TYPE.test(modelSourceName) && !isHttpUrl(modelSourceName)) {
    return modelSourceName;
  }
  if (citation?.title && isUsefulCitationTitle(citation.title, resolvedUrl)) {
    return citation.title.trim();
  }
  if (resolvedUrl) {
    const host = hostnameFromUrl(resolvedUrl);
    if (host) return host;
  }
  const ft = flag.flag_type?.trim() ?? '';
  if (ft && !GENERIC_FLAG_TYPE.test(ft) && !isHttpUrl(ft)) {
    return ft;
  }
  if (citation?.title?.trim()) return citation.title.trim();
  return resolvedUrl ? hostnameFromUrl(resolvedUrl) || 'Web source' : 'Source pending';
}

function pickUnusedCitation(
  citations: GroundingCitation[],
  usedUrls: Set<string>,
): GroundingCitation | undefined {
  return citations.find((c) => c.url?.trim() && !usedUrls.has(normalizeUrlKey(c.url)));
}

function rowRiskFromCategory(
  category: keyof WebSearchScreeningResult['categories'],
  overall: RiskLevel,
): RowRiskLevel {
  const base = CATEGORY_TYPE[category].defaultRisk;
  if (overall === 'clear') return 'low';
  if (overall === 'high_risk') return base === 'medium' ? 'medium' : 'high';
  if (overall === 'review_required') return base;
  return 'pending';
}

function rowStatusFromOverall(overall: RiskLevel): RowStatus {
  if (overall === 'clear') return 'reviewed';
  return 'pending_review';
}

export function mapResultToRows(
  result: WebSearchScreeningResult,
  applicantName: string,
): ScreeningResultRow[] {
  const citations = result.grounding_citations ?? [];
  const rows: ScreeningResultRow[] = [];
  const usedCitationKeys = new Set<string>();
  let idx = 0;

  for (const category of Object.keys(CATEGORY_TYPE) as (keyof WebSearchScreeningResult['categories'])[]) {
    const meta = CATEGORY_TYPE[category];
    for (const flag of result.categories[category] ?? []) {
      idx += 1;
      let resolvedUrl = flag.source_url?.trim() || '';
      let citation = resolvedUrl ? findCitationForUrl(resolvedUrl, citations) : undefined;

      if (!resolvedUrl || !citation) {
        const spare = pickUnusedCitation(citations, usedCitationKeys);
        if (spare?.url) {
          if (!resolvedUrl) resolvedUrl = spare.url.trim();
          citation = citation ?? spare;
        }
      }

      if (resolvedUrl) {
        usedCitationKeys.add(normalizeUrlKey(resolvedUrl));
      }

      rows.push({
        id: `api-${category}-${idx}`,
        sourceName: resolveSourceDisplay(flag, citation, resolvedUrl),
        sourceUrl: resolvedUrl || citation?.url?.trim() || undefined,
        typeKey: meta.typeKey,
        typeLabel: meta.typeLabel,
        matchingObject: applicantName,
        riskSignal: flag.description || flag.flag_type || 'Finding',
        flagType: flag.flag_type || undefined,
        time: flag.date_of_record || '—',
        confidence: result.confidence_score,
        riskLevel: rowRiskFromCategory(category, result.risk_level),
        status: rowStatusFromOverall(result.risk_level),
      });
    }
  }

  for (const [i, c] of citations.entries()) {
    const url = c.url?.trim();
    if (!url) continue;
    const key = normalizeUrlKey(url);
    if (usedCitationKeys.has(key)) continue;
    usedCitationKeys.add(key);
    rows.push({
      id: `cite-${i}`,
      sourceName:
        c.title && isUsefulCitationTitle(c.title, url)
          ? c.title.trim()
          : hostnameFromUrl(url) || 'Web source',
      sourceUrl: url,
      typeKey: 'other',
      typeLabel: 'Grounding source',
      matchingObject: applicantName,
      riskSignal:
        rows.length === 0
          ? result.summary_of_findings || 'See screening summary'
          : c.title && isUsefulCitationTitle(c.title, url)
            ? `Referenced: ${c.title}`
            : 'Additional web source from search',
      time: result.searchedAt
        ? new Date(result.searchedAt).toISOString().slice(0, 10)
        : '—',
      confidence: result.confidence_score,
      riskLevel:
        result.risk_level === 'high_risk'
          ? 'high'
          : result.risk_level === 'clear'
            ? 'low'
            : 'medium',
      status: rowStatusFromOverall(result.risk_level),
    });
  }

  return rows;
}

/** Search keyword chips derived from the queried applicant name. */
export function buildSearchKeywordsFromName(name: string): string[] {
  const n = name.trim();
  if (!n) return [];
  return [
    `${n} litigation`,
    `${n} fraud`,
    `${n} adverse media`,
    `${n} insurance`,
  ];
}

export function deriveDiscoveryStats(
  result: WebSearchScreeningResult,
  rowCount: number,
): DiscoveryStats {
  const rows = mapResultToRows(result, '');
  let high = 0;
  let medium = 0;
  for (const r of rows) {
    if (r.riskLevel === 'high') high += 1;
    else if (r.riskLevel === 'medium' || r.riskLevel === 'pending') medium += 1;
  }
  const total = rows.length;
  const citeCount = result.grounding_citations?.length ?? 0;
  return {
    riskSignalsTotal: total,
    riskSignalsHigh: high,
    riskSignalsMedium: medium,
    newExternalLeads: Math.min(2, total),
    newToday: total > 0 ? Math.min(2, total) : 0,
    storedCount: rowCount + citeCount,
    storedNote: 'From latest screening',
  };
}

export function resolvePipelineSteps(
  result: WebSearchScreeningResult | null,
  pending: boolean,
  baseSteps: PipelineStep[],
): PipelineStep[] {
  if (pending) {
    return baseSteps.map((s, i) => ({
      ...s,
      status: i === 0 ? 'in_progress' : 'pending',
      completedAt: undefined,
    }));
  }
  if (!result) {
    return baseSteps.map((s) => ({ ...s, status: 'pending' as const, completedAt: undefined }));
  }
  const at = result.searchedAt
    ? new Date(result.searchedAt).toLocaleString()
    : new Date().toLocaleString();
  return baseSteps.map((s) => ({
    ...s,
    status: 'completed' as const,
    completedAt: at,
  }));
}

export function rowToSourcePreview(
  row: ScreeningResultRow,
  summary: ApplicantSummaryData,
): SourcePreviewData {
  const highlightTerms = [summary.name, summary.idMasked].filter(Boolean);
  let snippet = row.riskSignal;
  if (row.flagType && !snippet.includes(row.flagType)) {
    snippet = `${row.flagType}: ${snippet}`;
  }

  const parts: SourcePreviewData['snippetParts'] = [];
  let remaining = snippet;
  while (remaining.length > 0) {
    let earliest = -1;
    let term = '';
    for (const t of highlightTerms) {
      const idx = remaining.indexOf(t);
      if (idx >= 0 && (earliest < 0 || idx < earliest)) {
        earliest = idx;
        term = t;
      }
    }
    if (earliest < 0) {
      parts.push({ text: remaining });
      break;
    }
    if (earliest > 0) parts.push({ text: remaining.slice(0, earliest) });
    parts.push({ text: term, highlight: true });
    remaining = remaining.slice(earliest + term.length);
  }

  if (parts.length === 0) parts.push({ text: snippet });

  return {
    sourceName: row.sourceName,
    publishedAt: row.time,
    matchLabel: row.confidence >= 80 ? 'High match' : row.confidence >= 60 ? 'Medium match' : 'Low match',
    snippetParts: parts,
    entities: [
      { label: 'Applicant name', value: summary.name },
      { label: 'ID number', value: summary.idMasked },
      { label: 'Case type', value: row.flagType || row.typeLabel },
      { label: 'Time', value: row.time },
      { label: 'Match object', value: row.matchingObject },
      { label: 'Source type', value: row.typeLabel },
    ],
    sourceUrl: row.sourceUrl,
  };
}

export function riskLabelFromLevel(level: RiskLevel): string {
  switch (level) {
    case 'clear':
      return 'Clear';
    case 'high_risk':
      return 'High risk';
    default:
      return 'Review required';
  }
}

export function mergeDiscoveryStats(
  partial: Partial<DiscoveryStats> | undefined,
  derived: DiscoveryStats | null,
): DiscoveryStats {
  const base = derived ?? DEFAULT_DISCOVERY_STATS;
  return { ...base, ...partial };
}
