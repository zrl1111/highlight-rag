import type { RagHit } from './highlightApi';
import { DEMO_DISPLAY_MODE, DEMO_ENTITY_ID } from './demoConfig';

function pdfUrl(filename: string): string {
  return `/api/pdf/${encodeURIComponent(filename)}`;
}
import type {
  ExtractedFieldRow,
  ReconciliationRequest,
  ReconciliationSnapshot,
  ReconciliationWarning,
} from './reconciliationTypes';

const BASELINE_PDF = 'demo-prior.pdf';
const BASELINE_DOB = '01/01/1995';

function hit(page: number, bbox: [number, number, number, number], text: string): RagHit {
  return { page_idx: page, bbox, text, score: 1 };
}

function withSource(
  row: ExtractedFieldRow,
  page = 0,
  bbox: [number, number, number, number] = [120, 120, 520, 160],
): ExtractedFieldRow {
  return {
    ...row,
    source: {
      highlights: [hit(page, bbox, row.extracted_value)],
    },
  };
}

function attachMockRowSources(rows: ExtractedFieldRow[]): ExtractedFieldRow[] {
  return rows.map((row) => {
    const fieldLower = row.field.toLowerCase();
    if (fieldLower.includes('date of birth') || fieldLower === 'dob') {
      return withSource(row, 0, [648.6, 177.4, 958.8, 208.2]);
    }
    if (fieldLower.includes('nature of illness')) {
      return withSource(
        row,
        0,
        row.status === 'mismatch'
          ? [34.3, 400.0, 958.2, 450.0]
          : [34.3, 619.7, 958.2, 657.9],
      );
    }
    return withSource(row);
  });
}

function neutralRow(field: string, value: string): ExtractedFieldRow {
  return {
    field,
    extracted_value: value,
    database_value: '',
    status: 'match',
  };
}

function mismatchRow(field: string, value: string): ExtractedFieldRow {
  return {
    field,
    extracted_value: value,
    database_value: '',
    status: 'mismatch',
  };
}

/** Mock extraction rows for a new APS-style upload (DOB wrong + heart disease concealed). */
function mockNewFileExtractionRows(variant: 'dob' | 'medical' | 'both'): ExtractedFieldRow[] {
  const rows: ExtractedFieldRow[] = [
    neutralRow('First Name', 'Steven'),
    neutralRow('Last Name', 'Zhang Kangyang'),
    neutralRow('Address', '789 Willow Creek Drive, Apt 4B, Toronto, ON M4C 1Z5'),
    neutralRow('Phone Number', '416-555-0987'),
    neutralRow('Personal Email', 'm.johnson95@email.com'),
    neutralRow('Employer Name', 'National Logistics Co.'),
    neutralRow('Job Title', 'Warehouse Associate'),
    neutralRow('Symptoms began', '05/02/2024'),
    neutralRow('Date first unable to work', '05/03/2024'),
    neutralRow('Compliant with treatment', 'Yes'),
  ];

  if (variant === 'dob' || variant === 'both') {
    rows.push(mismatchRow('Date of birth', '15/03/1987'));
  } else {
    rows.push(neutralRow('Date of birth', BASELINE_DOB));
  }

  if (variant === 'medical' || variant === 'both') {
    rows.push(
      mismatchRow('Nature of illness or injury', 'Lower back strain, mild discomfort'),
    );
  } else {
    rows.push(
      neutralRow(
        'Nature of illness or injury',
        'Acute Viral Myocarditis (Inflammation of the heart muscle).',
      ),
    );
  }

  rows.push(
    neutralRow(
      'How illness impacts work',
      'Mild discomfort when lifting; no cardiac symptoms reported.',
    ),
  );

  return attachMockRowSources(rows);
}

export function buildMockReconciliation(req: ReconciliationRequest): ReconciliationSnapshot {
  const appId = `VET-${req.batch_session_id.slice(0, 4).toUpperCase()}-${req.batch_session_id.slice(4, 7).toUpperCase()}`;
  const isDemo = req.entity_id === DEMO_ENTITY_ID;

  if (isDemo) {
    return buildDemoDocumentCompareMock(req, appId);
  }

  const first = req.files[0];
  const firstUrl = first ? pdfUrl(first.filename) : '';

  const per_file = req.files.map((f, idx) => {
    const rows = attachMockRowSources(
      idx === 0
        ? [
            neutralRow('First Name', 'John'),
            mismatchRow('Date of Birth', '1985-10-12'),
          ]
        : [neutralRow('Service Date', '2024-01-15')],
    );

    return {
      filename: f.filename,
      original_name: f.original_name,
      rows,
      mismatch_count: rows.filter((r) => r.status === 'mismatch').length,
    };
  });

  const warnings: ReconciliationWarning[] = [];
  if (first) {
    warnings.push({
      id: 'w-dob',
      severity: 'critical',
      code: 'FIELD_MISMATCH',
      priority: 'high',
      title: 'Date of Birth Mismatch',
      message: `The extracted DOB from ${first.original_name} does not match the prior record.`,
      filename: first.filename,
      field: 'Date of Birth',
      evidence: {
        submitted: {
          label: 'New submission',
          pdf_url: firstUrl,
          highlights: [hit(0, [648.6, 177.4, 958.8, 208.2], '1985-10-12')],
        },
        reference: {
          label: 'Prior submission',
          pdf_url: pdfUrl(BASELINE_PDF),
          highlights: [hit(0, [648.6, 177.4, 958.8, 208.2], BASELINE_DOB)],
        },
      },
    });
  }

  return {
    batch_session_id: req.batch_session_id,
    entity_id: req.entity_id,
    applicant_label: 'John Doe',
    application_id: appId,
    review_status: warnings.length ? 'flagged' : 'clear',
    database_record: [],
    per_file,
    warnings,
  };
}

function buildDemoDocumentCompareMock(
  req: ReconciliationRequest,
  appId: string,
): ReconciliationSnapshot {
  const baselineUrl = pdfUrl(BASELINE_PDF);
  const first = req.files[0];
  const second = req.files[1];

  const per_file = req.files.map((f, idx) => {
    let variant: 'dob' | 'medical' | 'both' = 'both';
    if (req.files.length > 1) {
      variant = idx === 0 ? 'dob' : 'medical';
    }
    const rows = mockNewFileExtractionRows(variant);
    return {
      filename: f.filename,
      original_name: f.original_name,
      rows,
      mismatch_count: rows.filter((r) => r.status === 'mismatch').length,
    };
  });

  const warnings: ReconciliationWarning[] = [
    {
      id: 'w-dob',
      severity: 'critical',
      code: 'FIELD_MISMATCH',
      priority: 'high',
      title: 'Date of Birth Mismatch',
      message: `DOB on ${first?.original_name ?? 'upload'} does not match the prior submission (${BASELINE_DOB}).`,
      filename: first?.filename,
      field: 'Date of birth',
      evidence: {
        submitted: {
          label: 'New submission',
          pdf_url: first ? pdfUrl(first.filename) : baselineUrl,
          highlights: [hit(0, [648.6, 177.4, 958.8, 208.2], '15/03/1987')],
        },
        reference: {
          label: 'Prior Attending Physician Statement',
          pdf_url: baselineUrl,
          highlights: [hit(0, [648.6, 177.4, 958.8, 208.2], BASELINE_DOB)],
        },
      },
    },
    {
      id: 'w-medical-concealment',
      severity: 'critical',
      code: 'MEDICAL_DISCLOSURE_GAP',
      priority: 'high',
      title: 'Heart disease disclosure gap',
      message: `${(second ?? first)?.original_name ?? 'Upload'} conceals heart disease (Acute Viral Myocarditis) documented on the prior APS.`,
      filename: (second ?? first)?.filename,
      field: 'Nature of illness or injury',
      evidence: {
        submitted: {
          label: 'New submission',
          pdf_url: (second ?? first) ? pdfUrl((second ?? first)!.filename) : baselineUrl,
          highlights: [hit(0, [34.3, 400.0, 958.2, 450.0], 'Lower back strain')],
        },
        reference: {
          label: 'Prior Attending Physician Statement',
          pdf_url: baselineUrl,
          highlights: [hit(0, [34.3, 619.7, 958.2, 657.9], 'Acute Viral Myocarditis')],
        },
      },
    },
  ];

  return {
    batch_session_id: req.batch_session_id,
    entity_id: req.entity_id,
    applicant_label: 'Steven Zhang Kangyang',
    application_id: appId,
    review_status: 'flagged',
    display_mode: DEMO_DISPLAY_MODE,
    database_record: [
      { field: 'Employee Name', value: 'Steven Zhang Kangyang', source: 'prior_submission' },
      { field: 'Date of birth', value: BASELINE_DOB, source: 'prior_submission' },
    ],
    per_file,
    warnings,
  };
}
