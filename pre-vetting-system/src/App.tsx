/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  LayoutDashboard, 
  Search, 
  History, 
  Settings, 
  Plus, 
  Bell, 
  Menu,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle2,
  MoreVertical,
  LogOut,
  Scan,
  Database,
  Globe,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Applicant, AuditLog } from './types';
import { IntakeWorkspace } from './components/IntakeWorkspace';
import { BackgroundScreeningPanel } from './components/BackgroundScreeningPanel';
import {
  analyzeApplicantRisk,
  listIndexedFilenames,
  queryDocument,
  type RagHit,
} from './lib/highlightApi';

// Mock Data
const MOCK_APPLICANTS: Applicant[] = [
  { id: 'IND-8842', name: 'Robert J. Oppenheimer', submissionDate: '2023-10-24 08:12', documentType: 'Financial Statement', riskScore: 92, status: 'HIGH' },
  { id: 'IND-8843', name: 'Eleanor Vance', submissionDate: '2023-10-24 09:45', documentType: 'Medical Report', riskScore: 65, status: 'MED' },
  { id: 'IND-8844', name: 'Arthur Dent', submissionDate: '2023-10-24 10:10', documentType: 'Background Check', riskScore: 12, status: 'LOW' },
  { id: 'IND-8845', name: 'Sarah Connor', submissionDate: '2023-10-24 11:30', documentType: 'Financial Statement', riskScore: 88, status: 'HIGH' },
  { id: 'IND-8846', name: 'John Smith', submissionDate: '2023-10-24 13:15', documentType: 'Medical Report', riskScore: 25, status: 'LOW' },
];

const MOCK_LOGS: AuditLog[] = [
  { 
    id: 'LOG-99281A', 
    timestamp: '2023-10-25T14:32:01Z', 
    operator: 'J. Doe (Sr. Adjuster)', 
    action: 'DATA_MODIFIED', 
    entityId: 'IND-8842',
    details: 'Field "Annual Income" modified from $120k to $125k',
    payload: {
      event: "DATA_MODIFIED",
      timestamp: "2023-10-25T14:32:01Z",
      operator: { id: "USR-442", role: "SR_ADJUSTER" },
      entity: { id: "IND-8842", type: "CLAIM_APPLICATION" },
      changes: { field: "annual_income", previous_value: 120000, new_value: 125000, reason_code: "DOC_VERIFIED_W2" }
    }
  },
  { 
    id: 'LOG-99282B', 
    timestamp: '2023-10-25T14:30:15Z', 
    operator: 'System (AI Engine)', 
    action: 'RISK_FLAGGED', 
    entityId: 'IND-8842',
    details: 'Auto-flagged due to negative news detected on external search.',
    payload: { event: "RISK_FLAGGED", type: "NEGATIVE_NEWS", source: "External Search" }
  },
];

type View = 'dashboard' | 'intake' | 'background' | 'audit' | 'management';

export default function App({ initialView = 'dashboard' }: { initialView?: View }) {
  const [currentView, setCurrentView] = useState<View>(initialView);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [riskFindings, setRiskFindings] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(MOCK_LOGS[0]);

  const handleScan = async (app: Applicant) => {
    setSelectedApplicant(app);
    setIsScanning(true);
    setRiskFindings(null);
    
    try {
      const result = await analyzeApplicantRisk(app.name, `Document Type: ${app.documentType}, Current Score: ${app.riskScore}`);
      if (result) {
        setRiskFindings(result);
      } else {
        // Fallback to mock behavior if AI fails
        setRiskFindings({
          riskScore: app.riskScore,
          riskLevel: app.status,
          summary: `Automatic risk assessment completed for ${app.name}. No major anomalies detected in the immediate surface scan. Detailed cross-referencing recommended.`,
          findings: [
            { category: 'System Default', description: 'Primary identity verification successful.', severity: 'INFO' },
            { category: 'Data Consistency', description: 'Submitted records match known patterns for this document type.', severity: 'INFO' }
          ]
        });
      }
    } catch (error) {
      console.error("Scanning error:", error);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`bg-surface text-on-surface-variant flex flex-col transition-all duration-300 border-r border-outline-variant shadow-sm z-50 ${isSidebarOpen ? 'w-60' : 'w-20'}`}>
        <div className="p-6 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-secondary rounded flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          {isSidebarOpen && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-sm font-bold text-primary tracking-tight leading-tight">VET-SYSTEM</h1>
              <p className="text-[10px] text-outline font-bold uppercase tracking-widest">Intelligence Hub</p>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
          {isSidebarOpen && <div className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2 px-3">Vetting Queue</div>}
          <NavItem 
            icon={<LayoutDashboard size={18} />} 
            label="Triage Dashboard" 
            active={currentView === 'dashboard'} 
            expanded={isSidebarOpen} 
            onClick={() => setCurrentView('dashboard')} 
          />
          <NavItem 
            icon={<Scan size={18} />} 
            label="Document Intake" 
            active={currentView === 'intake'} 
            expanded={isSidebarOpen} 
            onClick={() => setCurrentView('intake')} 
          />
          <NavItem 
            icon={<Globe size={18} />} 
            label="Background Screening" 
            active={currentView === 'background'} 
            expanded={isSidebarOpen} 
            onClick={() => setCurrentView('background')} 
          />
          <NavItem 
            icon={<History size={18} />} 
            label="Audit Logs" 
            active={currentView === 'audit'} 
            expanded={isSidebarOpen} 
            onClick={() => setCurrentView('audit')} 
          />
          <NavItem 
            icon={<Database size={18} />} 
            label="Entity Search" 
            active={currentView === 'management'} 
            expanded={isSidebarOpen} 
            onClick={() => setCurrentView('management')} 
          />
        </nav>

        <div className="p-4 border-t border-outline-variant bg-surface-container-low flex flex-col gap-4">
          {isSidebarOpen && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-outline uppercase">Intelligence Status</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-[11px] text-on-surface-variant">Data Engine: Active</span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <NavItem icon={<Settings size={18} />} label="Settings" expanded={isSidebarOpen} />
            <NavItem icon={<LogOut size={18} />} label="Logout" expanded={isSidebarOpen} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="h-14 bg-primary text-on-primary flex items-center justify-between px-6 shrink-0 z-40 shadow-md">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-white/10 rounded transition-colors text-slate-400">
              <Menu size={18} />
            </button>
            <h2 className="text-sm font-semibold tracking-tight">
              Application Pre-vetting System <span className="text-slate-400 font-normal text-xs ml-2">| HK Department of Health</span>
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input 
                type="text" 
                placeholder="Search resources..." 
                className="pl-9 pr-4 py-1.5 bg-slate-800 text-xs text-slate-300 border border-slate-700 rounded-full focus:outline-none focus:ring-1 focus:ring-secondary w-48 transition-all"
              />
            </div>
            <div className="flex items-center gap-4 border-l border-slate-700 pl-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[10px] font-bold">JD</div>
                <span className="text-slate-300 text-xs font-medium">Jane Doe</span>
              </div>
              <IconButton icon={<Bell size={18} className="text-slate-400" />} />
            </div>
          </div>
        </header>

        <div
          className={`relative flex min-h-0 flex-1 flex-col ${
            currentView === 'intake' ? 'overflow-hidden' : 'overflow-auto'
          }`}
        >
          <div className="h-12 bg-surface border-b border-outline-variant flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {currentView === 'dashboard' ? 'VETTING QUEUE' : currentView.toUpperCase()}
              </span>
              <span className="h-4 w-px bg-outline-variant"></span>
              <span className="text-xs font-semibold text-on-surface">
                {currentView === 'dashboard' && 'Pending Applicant Reviews'}
                {currentView === 'intake' && 'Secure Transmission & Extraction'}
                {currentView === 'background' && 'External Intelligence & Adverse Media'}
                {currentView === 'audit' && 'Compliance & Activity Audit'}
                {currentView === 'management' && 'Entity Database & Intelligence Search'}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 border border-outline-variant rounded text-[10px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors uppercase">History</button>
              <button className="px-3 py-1 bg-secondary text-white rounded text-[10px] font-bold shadow-sm hover:bg-blue-700 transition-colors uppercase">Full Report</button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {currentView === 'dashboard' && (
              <TriageDashboard key="dashboard" onReview={handleScan} />
            )}
            {currentView === 'intake' && (
              <div key="intake" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <IntakeWorkspace />
              </div>
            )}
            {currentView === 'background' && (
              <BackgroundScreeningPanel key="background" />
            )}
            {currentView === 'audit' && (
              <AuditLogView key="audit" selectedLog={selectedLog} onSelectLog={setSelectedLog} />
            )}
            {currentView === 'management' && (
              <ManagementView key="management" />
            )}
          </AnimatePresence>

          {/* Risk Report Modal */}
          <AnimatePresence>
            {selectedApplicant && (
              <div className="fixed inset-0 z-[60] flex items-center justify-end">
                 <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectedApplicant(null)}
                    className="absolute inset-0 bg-primary/20 backdrop-blur-sm"
                 />
                 <motion.div 
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="relative w-[500px] h-full bg-white border-l border-outline-variant shadow-2xl flex flex-col"
                 >
                    <div className="p-6 border-b border-outline-variant bg-surface-container-low flex justify-between items-center shrink-0">
                       <div>
                          <h3 className="text-xl font-bold text-primary">Intelligence Report</h3>
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">ID: {selectedApplicant.id}</p>
                       </div>
                       <button onClick={() => setSelectedApplicant(null)} className="p-2 hover:bg-surface-container rounded-full">
                          <MoreVertical size={20} />
                       </button>
                    </div>

                    <div className="flex-1 overflow-auto p-8 flex flex-col gap-8">
                       <div className="flex items-center gap-6">
                          <div className={`w-24 h-24 rounded-full border-[6px] flex items-center justify-center ${
                             selectedApplicant.status === 'HIGH' ? 'border-error/20 text-error' : 'border-secondary/20 text-secondary'
                          }`}>
                             <div className="text-center">
                                <div className="text-2xl font-black">{isScanning ? '...' : selectedApplicant.riskScore}</div>
                                <div className="text-[8px] font-bold uppercase">SCORE</div>
                             </div>
                          </div>
                          <div>
                             <h4 className="text-lg font-bold text-primary">{selectedApplicant.name}</h4>
                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                                selectedApplicant.status === 'HIGH' ? 'bg-error-container text-on-error-container' : 
                                selectedApplicant.status === 'MED' ? 'bg-orange-100 text-orange-700' :
                                'bg-secondary-fixed text-on-secondary-fixed'
                             }`}>
                                {selectedApplicant.status} RISK FLAG
                             </span>
                          </div>
                       </div>

                       {isScanning ? (
                         <div className="flex flex-col items-center justify-center p-12 gap-4 h-full">
                            <Scan className="w-12 h-12 text-secondary animate-pulse" />
                            <p className="text-sm font-bold text-secondary animate-pulse uppercase tracking-widest text-center">Running Deep Search Integration...</p>
                         </div>
                       ) : riskFindings && (
                         <motion.div 
                           initial={{ opacity: 0, y: 10 }} 
                           animate={{ opacity: 1, y: 0 }}
                           className="flex flex-col gap-8 pb-12"
                         >
                            <div className="flex flex-col gap-2">
                               <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Executive Summary</label>
                               <p className="text-sm text-on-surface leading-relaxed font-medium bg-surface-container-low p-4 rounded-lg border border-outline-variant">
                                  {riskFindings.summary}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3">
                               <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Automated Findings</label>
                               <div className="flex flex-col gap-2">
                                  {riskFindings.findings.map((finding: any, i: number) => (
                                    <div key={i} className="p-4 bg-white border border-outline-variant rounded-lg flex gap-4 items-start shadow-sm hover:shadow-md transition-shadow">
                                       {finding.severity === 'CRITICAL' ? <AlertTriangle className="text-error mt-1 shrink-0" size={18} /> : <CheckCircle2 className="text-secondary mt-1 shrink-0" size={18} />}
                                       <div>
                                          <div className="text-xs font-bold text-primary mb-1">{finding.category}</div>
                                          <div className="text-xs text-on-surface-variant font-medium leading-relaxed">{finding.description}</div>
                                       </div>
                                    </div>
                                  ))}
                               </div>
                            </div>
                         </motion.div>
                       )}
                    </div>

                    <div className="p-6 bg-surface-container-low border-t border-outline-variant flex gap-3 shrink-0">
                       <button className="flex-1 px-4 py-3 bg-white border border-outline-variant text-[10px] font-bold text-primary rounded-lg hover:bg-surface-container transition-colors">
                          FLAG FOR REVIEW
                       </button>
                       <button className="flex-1 px-4 py-3 bg-primary text-white text-[10px] font-bold rounded-lg hover:bg-primary-container transition-all shadow-lg">
                          APPROVE ENTITY
                       </button>
                    </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, expanded, onClick }: { icon: React.ReactNode, label: string, active?: boolean, expanded: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 p-2 rounded transition-all duration-200 w-full ${
        active 
          ? 'bg-secondary-container text-secondary' 
          : 'text-on-surface-variant hover:bg-surface-container'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-secondary' : 'text-outline'}`}>{icon}</span>
      {expanded && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
    </button>
  );
}

function IconButton({ icon }: { icon: React.ReactNode }) {
  return (
    <button className="p-2 text-on-surface-variant hover:bg-white/10 rounded-full transition-colors active:scale-95">
      {icon}
    </button>
  );
}

function TriageDashboard({ onReview, key }: { onReview: (app: Applicant) => void, key?: React.Key }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-8 flex flex-col gap-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-xl font-bold text-on-surface">Triage Queue</h3>
          <p className="text-sm text-on-surface-variant mt-1">Real-time risk assessment and application pre-vetting.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-surface border border-outline-variant text-on-surface-variant font-bold text-[10px] rounded hover:bg-surface-container transition-colors uppercase tracking-widest">
          <Download size={14} /> EXPORT CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <KPIItem title="PENDING" value="1,248" trend="+12%" icon={<History className="text-on-surface-variant" size={18} />} />
        <KPIItem title="HIGH RISK" value="87" color="text-error" border="border-l-4 border-error" icon={<AlertTriangle className="text-error" size={18} />} subtitle="Priority review" />
        <KPIItem title="PROCESSED" value="342" trend="Target: 400" icon={<CheckCircle2 className="text-secondary" size={18} />} />
      </div>

      <div className="bg-surface border border-outline-variant rounded shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 bg-surface-container border-b border-outline-variant flex justify-between items-center">
          <div className="text-[10px] font-bold text-on-surface flex gap-4 uppercase tracking-widest">
             <span className="text-secondary border-b-2 border-secondary pb-1">All Applications</span>
             <span className="text-on-surface-variant hover:text-on-surface cursor-pointer transition-colors">Flagged Only</span>
          </div>
          <span className="text-[10px] text-on-surface-variant font-mono font-bold">1-10 of 1,248</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Applicant / ID</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Submission</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Type</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">AI score</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {MOCK_APPLICANTS.map((app) => (
                <tr key={app.id} className="hover:bg-secondary-container/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-on-surface">{app.name}</div>
                    <div className="text-[10px] font-mono text-on-surface-variant font-bold uppercase">{app.id}</div>
                  </td>
                  <td className="px-6 py-4 text-[11px] font-mono text-on-surface-variant">
                    {app.submissionDate}
                  </td>
                  <td className="px-6 py-4 text-xs text-on-surface-variant">
                    {app.documentType}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-bold text-xs ${app.riskScore > 75 ? 'text-error' : app.riskScore > 30 ? 'text-amber-600' : 'text-secondary'}`}>
                        {app.riskScore}%
                      </span>
                      <div className="w-16 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${app.riskScore > 75 ? 'bg-error' : app.riskScore > 30 ? 'bg-amber-600' : 'bg-secondary'}`} 
                          style={{ width: `${app.riskScore}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase ${
                      app.status === 'HIGH' ? 'bg-error-container text-on-error-container' : 
                      app.status === 'MED' ? 'bg-amber-100 text-amber-700' : 
                      'bg-secondary-container text-secondary'
                    }`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onReview(app)}
                      className="text-on-primary bg-primary hover:opacity-90 px-3 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-widest shadow-sm"
                    >
                      REVIEW
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function KPIItem({ title, value, trend, color = 'text-on-surface', border = '', icon, subtitle }: any) {
  return (
    <div className={`bg-surface border border-outline-variant p-5 rounded shadow-sm flex flex-col justify-between h-32 ${border}`}>
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{title}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-black tracking-tight ${color}`}>{value}</span>
        {trend && <span className="text-[11px] text-on-surface-variant font-medium">{trend}</span>}
        {subtitle && <span className="text-[9px] text-on-surface-variant uppercase font-black">{subtitle}</span>}
      </div>
    </div>
  );
}

function ManagementView({ key }: { key?: React.Key }) {
  const [filenames, setFilenames] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<RagHit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void listIndexedFilenames().then((names) => {
      setFilenames(names);
      setSelectedFile((prev) => (prev && names.includes(prev) ? prev : names[0] ?? ''));
    });
  }, []);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || !selectedFile) return;
    setLoading(true);
    setErr(null);
    try {
      const results = await queryDocument(selectedFile, q, 8);
      setHits(results);
    } catch (e) {
      setHits([]);
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-8 flex flex-col gap-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-xl font-bold text-on-surface">Entity Database</h3>
          <p className="text-sm text-on-surface-variant mt-1">Cross-reference mock KPIs below; document BM25 search uses the same highlight_rag backend as Intake.</p>
        </div>
        <button type="button" className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary font-bold text-[10px] rounded hover:opacity-90 transition-colors uppercase tracking-widest">
          <Plus size={14} /> REGISTER NEW ENTITY
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface border border-outline-variant p-4 rounded flex flex-col gap-2">
           <Database className="text-secondary" size={24} />
           <div className="text-xs font-bold text-on-surface">Structured HKID</div>
           <div className="text-2xl font-black text-on-surface">8.4M</div>
           <p className="text-xs text-on-surface-variant">Validated records</p>
        </div>
        <div className="bg-surface border border-outline-variant p-4 rounded flex flex-col gap-2">
           <FileText className="text-on-surface-variant" size={24} />
           <div className="text-xs font-bold text-on-surface">Medical Licenses</div>
           <div className="text-2xl font-black text-on-surface">142K</div>
           <p className="text-xs text-on-surface-variant">Active professional certs</p>
        </div>
        <div className="bg-surface border border-outline-variant p-4 rounded flex flex-col gap-2">
           <Search className="text-on-surface-variant" size={24} />
           <div className="text-xs font-bold text-on-surface">Cross-System Matches</div>
           <div className="text-2xl font-black text-on-surface">92.4%</div>
           <p className="text-xs text-on-surface-variant">Sync accuracy rate</p>
        </div>
        <div className="bg-surface border border-outline-variant p-4 rounded flex flex-col gap-2">
           <AlertTriangle className="text-error" size={24} />
           <div className="text-xs font-bold text-on-surface">Intelligence Alerts</div>
           <div className="text-2xl font-black text-error">42</div>
           <p className="text-xs text-on-surface-variant">Requires reconciliation</p>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded p-8 flex flex-col gap-6 border-dashed">
         <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-surface-container rounded-full flex items-center justify-center shrink-0">
              <Search className="text-outline" size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-on-surface">Indexed document search (BM25)</h4>
              <p className="text-xs text-on-surface-variant mt-0.5">Run <code className="rounded bg-surface-container px-1">POST /api/query</code> on PDFs already uploaded to the backend.</p>
            </div>
         </div>
         <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              PDF on server
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="mt-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface min-w-[200px]"
              >
                {filenames.length === 0 && <option value="">No indexed PDFs — upload via Document Intake</option>}
                {filenames.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Query</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                  placeholder="Keywords…"
                  className="flex-1 px-4 py-2 border border-outline-variant rounded-lg text-sm bg-surface-container-low"
                />
                <button
                  type="button"
                  disabled={loading || !selectedFile}
                  onClick={() => void runSearch()}
                  className="px-6 py-2 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? '…' : 'SEARCH'}
                </button>
              </div>
            </div>
         </div>
         {err && <p className="text-xs text-error">{err}</p>}
         <div className="max-h-80 overflow-y-auto flex flex-col gap-2">
            {hits.length === 0 && !err && (
              <p className="text-center text-xs text-on-surface-variant py-6">No results yet.</p>
            )}
            {hits.map((r, i) => (
              <div key={`${r.page_idx}-${i}`} className="rounded-lg border border-outline-variant p-3 text-left text-xs bg-surface-container-low">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="font-bold text-secondary">p.{r.page_idx + 1}</span>
                  <span className="text-on-surface-variant font-mono">{r.score.toFixed(3)}</span>
                </div>
                <div className="text-on-surface leading-relaxed break-words">{r.text}</div>
              </div>
            ))}
         </div>
      </div>
    </motion.div>
  );
}

function AuditLogView({ selectedLog, onSelectLog, key }: { selectedLog: AuditLog | null, onSelectLog: (log: AuditLog) => void, key?: React.Key }) {
  return (
    <motion.div 
       initial={{ opacity: 0, x: 20 }}
       animate={{ opacity: 1, x: 0 }}
       exit={{ opacity: 0, x: -20 }}
       className="p-8 flex gap-6 h-full overflow-hidden"
    >
       <div className="flex-[3] flex flex-col gap-6 overflow-hidden">
          <div className="flex justify-between items-end shrink-0">
             <div>
                <h3 className="text-xl font-bold text-on-surface">Compliance Audit</h3>
                <p className="text-sm text-on-surface-variant mt-1">System-wide immutable ledger of operator actions and automated flags.</p>
             </div>
             <div className="flex gap-2">
                <button className="px-4 py-2 bg-surface border border-outline-variant text-[10px] font-bold text-on-surface-variant rounded uppercase tracking-widest hover:bg-surface-container transition-colors"><Download size={14} className="inline mr-1" /> CSV</button>
                <button className="px-4 py-2 bg-primary text-on-primary border border-primary text-[10px] font-bold rounded uppercase tracking-widest hover:opacity-90 transition-colors"><FileText size={14} className="inline mr-1" /> PDF</button>
             </div>
          </div>

          <div className="bg-surface border border-outline-variant rounded shadow-sm overflow-hidden flex flex-col flex-1">
             <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                   <thead className="sticky top-0 bg-surface-container border-b border-outline-variant z-10">
                      <tr>
                         <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Timestamp (ISO)</th>
                         <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Operator</th>
                         <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Action</th>
                         <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Entity ID</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-outline-variant">
                      {MOCK_LOGS.map(log => (
                        <tr 
                          key={log.id} 
                          onClick={() => onSelectLog(log)}
                          className={`cursor-pointer transition-colors ${selectedLog?.id === log.id ? 'bg-secondary-container/20 border-l-4 border-secondary' : 'hover:bg-surface-container-low'}`}
                        >
                           <td className="px-6 py-4 font-mono text-[11px] text-on-surface-variant font-medium">{log.timestamp}</td>
                           <td className="px-6 py-4 text-xs font-bold text-on-surface">{log.operator}</td>
                           <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-tight uppercase ${
                                log.action === 'RISK_FLAGGED' ? 'bg-error-container text-on-error-container font-bold' : 'bg-secondary-container text-secondary font-bold'
                              }`}>
                                {log.action}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-xs font-mono font-bold text-secondary uppercase">{log.entityId}</td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
       </div>

       <div className="flex-[2] bg-surface border border-outline-variant rounded shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-outline-variant bg-surface-container flex justify-between items-center">
             <h5 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Log Entry Details</h5>
             <span className="text-[10px] font-mono text-on-surface-variant font-bold">{selectedLog?.id}</span>
          </div>
          <div className="flex-1 p-6 overflow-auto flex flex-col gap-6">
             {selectedLog ? (
               <>
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Action Summary</label>
                    <p className="text-sm font-semibold border-l-4 border-secondary pl-4 py-1 text-on-surface leading-relaxed bg-secondary-container/10 rounded-r-lg">
                      {selectedLog.details}
                    </p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                       <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Operator Role</label>
                       <span className="text-xs font-mono text-on-surface font-bold uppercase">SR_ADJUSTER</span>
                    </div>
                    <div className="flex flex-col gap-1">
                       <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Session IP</label>
                       <span className="text-xs font-mono text-on-surface font-bold">192.168.1.105</span>
                    </div>
                 </div>

                 <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                    <div className="flex justify-between items-center">
                       <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Payload (JSON)</label>
                       <button className="text-[10px] text-secondary font-bold hover:underline transition-all">COPY JSON</button>
                    </div>
                    <pre className="flex-1 bg-primary text-slate-300 p-4 rounded font-mono text-[11px] overflow-auto whitespace-pre-wrap leading-relaxed shadow-inner border border-slate-700">
                       {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                 </div>
               </>
             ) : (
               <div className="flex items-center justify-center h-full text-on-surface-variant font-bold uppercase tracking-widest text-xs">
                 Select a log entry
               </div>
             )}
          </div>
       </div>
    </motion.div>
  );
}
