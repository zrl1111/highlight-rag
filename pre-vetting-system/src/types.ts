export interface Applicant {
  id: string;
  name: string;
  submissionDate: string;
  documentType: 'Financial Statement' | 'Medical Report' | 'Background Check' | 'Passport';
  riskScore: number;
  status: 'PENDING' | 'HIGH' | 'MED' | 'LOW' | 'APPROVED' | 'REJECTED';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  entityId: string;
  details: string;
  payload: any;
}

export interface FileStatus {
  id: string;
  name: string;
  size: string;
  progress: number;
  status: 'scanning' | 'recognizing' | 'extracting' | 'completed' | 'error';
  message: string;
}
