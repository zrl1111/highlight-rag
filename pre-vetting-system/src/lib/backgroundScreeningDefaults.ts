/** Default demo data and types for the background screening dashboard. */

export type RowRiskLevel = 'high' | 'medium' | 'low' | 'pending';
export type RowStatus = 'pending_review' | 'reviewed' | 'false_positive';
export type RowTypeKey =
  | 'negative_news'
  | 'litigation'
  | 'financial'
  | 'regulatory'
  | 'other';

export interface ApplicantSummaryData {
  name: string;
  gender?: 'male' | 'female' | 'other';
  applicationId: string;
  product: string;
  idMasked: string;
  idVerified: boolean;
  materialsPdf: number;
  materialsImages: number;
  materialsTables: number;
  applicationTime: string;
  externalRiskScore: number;
  riskLabel: string;
}

export type PipelineStepStatus = 'pending' | 'in_progress' | 'completed';

export interface PipelineStep {
  id: string;
  label: string;
  status: PipelineStepStatus;
  completedAt?: string;
}

export interface DiscoveryStats {
  riskSignalsTotal: number;
  riskSignalsHigh: number;
  riskSignalsMedium: number;
  newExternalLeads: number;
  newToday: number;
  storedCount: number;
  storedNote: string;
}

export interface ScreeningResultRow {
  id: string;
  sourceName: string;
  sourceUrl?: string;
  typeKey: RowTypeKey;
  typeLabel: string;
  matchingObject: string;
  riskSignal: string;
  flagType?: string;
  time: string;
  confidence: number;
  riskLevel: RowRiskLevel;
  status: RowStatus;
}

export interface SourceEntity {
  label: string;
  value: string;
}

export interface SourcePreviewData {
  sourceName: string;
  publishedAt: string;
  matchLabel: string;
  snippetParts: Array<{ text: string; highlight?: boolean }>;
  entities: SourceEntity[];
  sourceUrl?: string;
}

export interface ReviewChecklistItem {
  id: string;
  label: string;
  checked?: boolean;
}

export const DEFAULT_APPLICANT_SUMMARY: ApplicantSummaryData = {
  name: 'Chen Wei',
  gender: 'male',
  applicationId: 'APP-2026-0418',
  product: '',
  idMasked: '320***********251X',
  idVerified: true,
  materialsPdf: 6,
  materialsImages: 12,
  materialsTables: 3,
  applicationTime: '2026-04-18 09:42',
  externalRiskScore: 72,
  riskLabel: 'High risk',
};

export const DEFAULT_SEARCH_KEYWORDS = [
  'Chen Wei litigation',
  'Chen Wei fraud',
  'Chen Wei insurance',
  'Chen Wei English name',
];

export const DEFAULT_PIPELINE_STEPS: PipelineStep[] = [
  { id: 'crawl', label: 'Crawl public web pages', status: 'completed', completedAt: '2026-04-18 10:01' },
  { id: 'align', label: 'Entity alignment', status: 'completed', completedAt: '2026-04-18 10:03' },
  { id: 'classify', label: 'Risk classification', status: 'completed', completedAt: '2026-04-18 10:05' },
  { id: 'store', label: 'Results storage', status: 'completed', completedAt: '2026-04-18 10:06' },
  { id: 'review', label: 'Push to manual review', status: 'completed', completedAt: '2026-04-18 10:07' },
];

export const DEFAULT_DISCOVERY_STATS: DiscoveryStats = {
  riskSignalsTotal: 4,
  riskSignalsHigh: 2,
  riskSignalsMedium: 2,
  newExternalLeads: 2,
  newToday: 2,
  storedCount: 6,
  storedNote: 'In knowledge base',
};

export const DEFAULT_SCREENING_ROWS: ScreeningResultRow[] = [
  {
    id: 'demo-1',
    sourceName: 'News portal A',
    sourceUrl: 'https://example.com/news/1',
    typeKey: 'negative_news',
    typeLabel: 'Negative news',
    matchingObject: 'Chen Wei',
    riskSignal: 'Suspected involvement in insurance fraud investigation',
    flagType: 'Insurance fraud',
    time: '2026-03-12',
    confidence: 91,
    riskLevel: 'high',
    status: 'pending_review',
  },
  {
    id: 'demo-2',
    sourceName: 'Court record database',
    typeKey: 'litigation',
    typeLabel: 'Litigation record',
    matchingObject: 'Chen Wei',
    riskSignal: 'Civil dispute related to policy dispute',
    flagType: 'Civil case',
    time: '2025-11-08',
    confidence: 84,
    riskLevel: 'medium',
    status: 'pending_review',
  },
  {
    id: 'demo-3',
    sourceName: 'Regulatory bulletin',
    typeKey: 'regulatory',
    typeLabel: 'Regulatory notice',
    matchingObject: 'Chen Wei',
    riskSignal: 'Listed in industry watchlist (unverified match)',
    time: '2025-09-20',
    confidence: 76,
    riskLevel: 'medium',
    status: 'pending_review',
  },
  {
    id: 'demo-4',
    sourceName: 'Financial news wire',
    typeKey: 'financial',
    typeLabel: 'Financial distress',
    matchingObject: 'Chen Wei',
    riskSignal: 'Reported debt restructuring proceedings',
    time: '2025-07-02',
    confidence: 68,
    riskLevel: 'medium',
    status: 'pending_review',
  },
  {
    id: 'demo-5',
    sourceName: 'Social media archive',
    typeKey: 'negative_news',
    typeLabel: 'Negative news',
    matchingObject: 'Chen Wei',
    riskSignal: 'Public complaint regarding claim denial',
    time: '2026-01-15',
    confidence: 62,
    riskLevel: 'pending',
    status: 'pending_review',
  },
  {
    id: 'demo-6',
    sourceName: 'Industry forum',
    typeKey: 'other',
    typeLabel: 'Other',
    matchingObject: 'Chen Wei',
    riskSignal: 'Name similarity only — requires identity confirmation',
    time: '2024-12-01',
    confidence: 45,
    riskLevel: 'pending',
    status: 'pending_review',
  },
];

export const DEFAULT_SOURCE_PREVIEW: SourcePreviewData = {
  sourceName: 'News portal A',
  publishedAt: '2026-03-12',
  matchLabel: 'High match',
  snippetParts: [
    { text: 'According to regulatory sources, applicant ' },
    { text: 'Chen Wei', highlight: true },
    { text: ' (ID ' },
    { text: '320***********251X', highlight: true },
    {
      text: ') is under preliminary review in connection with an ',
    },
    { text: 'insurance fraud', highlight: true },
    { text: ' investigation. The case was filed in Jiangsu province.' },
  ],
  entities: [
    { label: 'Applicant name', value: 'Chen Wei' },
    { label: 'ID number', value: '320***********251X' },
    { label: 'Case type', value: 'Insurance fraud investigation' },
    { label: 'Time', value: '2026-03-12' },
    { label: 'Location', value: 'Jiangsu' },
    { label: 'Source type', value: 'News media' },
  ],
  sourceUrl: 'https://example.com/news/1',
};

export const DEFAULT_REVIEW_CHECKLIST: ReviewChecklistItem[] = [
  { id: 'c1', label: 'Verify name and ID match applicant records' },
  { id: 'c2', label: 'Confirm identity is not a namesake' },
  { id: 'c3', label: 'Check for material conflicts with application' },
  { id: 'c4', label: 'Validate case details against submitted documents' },
  { id: 'c5', label: 'Determine if supplementary materials are required' },
];
