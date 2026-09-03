'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  ChevronRight,
  ClipboardList,
  ArrowLeft,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  PenLine,
  User,
  ExternalLink,
} from 'lucide-react';
import {
  collection,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlftRecord = {
  id: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
  toolCode?: string;
  documentType?: string;
  memberName?: string;
  medicalRecordNumber?: string | null;
  memberMrn?: string | null;
  assignedSwName?: string | null;
  assignedSwEmail?: string | null;
  uploaderName?: string | null;
  uploaderEmail?: string | null;
  workflowStatus?: string | null;
  workflowStage?: string | null;
  workflowUpdatedAt?: any;

  alftRnName?: string | null;
  alftRnEmail?: string | null;
  alftRnAssignedAt?: any;
  alftRnDownloadedAt?: any;
  alftRnRevisionUploadedAt?: any;

  alftStaffName?: string | null;
  alftStaffEmail?: string | null;
  alftStaffAssignedAt?: any;

  alftSignature?: {
    status?: string | null;
    requestedAt?: any;
    rnSignedAt?: any;
    mswSignedAt?: any;
    completedAt?: any;
    packetPdfStoragePath?: string | null;
    signaturePagePdfStoragePath?: string | null;
  } | null;

  alftManagerReview?: {
    status?: string | null;
    reviewedAt?: any;
    reviewedByName?: string | null;
    reviewedByEmail?: string | null;
    rejectedAt?: any;
    rejectedByName?: string | null;
    rejectedByEmail?: string | null;
    rejectedByRole?: string | null;
    rejectionReason?: string | null;
  } | null;

  alftEditHistory?: Array<{
    editedAt?: any;
    editedAtIso?: string | null;
    editedByName?: string | null;
    editedByEmail?: string | null;
    editedByRole?: string | null;
    changedFields?: string[];
    changedExactQuestionIds?: string[];
    changedExactQuestionCount?: number;
    note?: string | null;
  }>;

  files?: Array<{ fileName: string; downloadURL: string }>;
  alftRevisions?: Array<{
    fileName: string;
    downloadURL: string;
    uploadedByName?: string | null;
    uploadedAt?: any;
    note?: string | null;
  }>;
};

type StageFilter =
  | 'all'
  | 'received'
  | 'returned_to_sw'
  | 'rn_assigned'
  | 'signatures'
  | 'manager_review'
  | 'completed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toMs = (v: any): number => {
  if (!v) return 0;
  try {
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (typeof v?.toDate === 'function') return v.toDate().getTime();
    const ms = new Date(v).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

const fmt = (v: any) => {
  const ms = toMs(v);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const fmtDate = (v: any) => {
  const ms = toMs(v);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

type StageKey =
  | 'received'
  | 'returned_to_sw'
  | 'rn_assigned'
  | 'rn_downloaded'
  | 'rn_reuploaded'
  | 'staff_assigned'
  | 'sent_for_signature'
  | 'rn_signed'
  | 'fully_signed'
  | 'manager_review'
  | 'ready_to_send'
  | 'completed';

const computeStage = (r: AlftRecord): StageKey => {
  const ws = String(r.workflowStatus ?? '').toLowerCase();
  const ms = String(r.alftManagerReview?.status ?? '').toLowerCase();
  const docStatus = String(r.status ?? '').toLowerCase();

  if (ws.includes('completed_sent_to_jocelyn') || docStatus === 'completed') return 'completed';
  if (ws.includes('returned_to_sw')) return 'returned_to_sw';
  if (ms === 'approved') return 'ready_to_send';
  if (ws.includes('awaiting_kaiser_manager_final_review') || ms === 'pending') return 'manager_review';
  if (ws.includes('returned_to_staff') || ws.includes('returned_to_admin') || ws.includes('waiting_staff_revision')) {
    return 'manager_review';
  }
  const mswSigned = toMs(r.alftSignature?.mswSignedAt) > 0;
  const rnSigned = toMs(r.alftSignature?.rnSignedAt) > 0;
  if (mswSigned && rnSigned) return 'fully_signed';
  if (rnSigned) return 'rn_signed';
  if (toMs(r.alftSignature?.requestedAt) > 0) return 'sent_for_signature';
  if (toMs(r.alftStaffAssignedAt) > 0) return 'staff_assigned';
  if (toMs(r.alftRnRevisionUploadedAt) > 0) return 'rn_reuploaded';
  if (toMs(r.alftRnDownloadedAt) > 0) return 'rn_downloaded';
  if (toMs(r.alftRnAssignedAt) > 0) return 'rn_assigned';
  return 'received';
};

const stageBadge = (stage: StageKey) => {
  const cls = 'text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap';
  switch (stage) {
    case 'received':
      return <span className={`${cls} bg-slate-100 text-slate-700 border-slate-300`}>Received</span>;
    case 'returned_to_sw':
      return <span className={`${cls} bg-red-100 text-red-700 border-red-300`}>Returned to SW</span>;
    case 'rn_assigned':
      return <span className={`${cls} bg-indigo-100 text-indigo-700 border-indigo-300`}>RN Assigned</span>;
    case 'rn_downloaded':
      return <span className={`${cls} bg-blue-100 text-blue-700 border-blue-300`}>RN Downloaded</span>;
    case 'rn_reuploaded':
      return <span className={`${cls} bg-purple-100 text-purple-700 border-purple-300`}>RN Re-uploaded</span>;
    case 'staff_assigned':
      return <span className={`${cls} bg-amber-100 text-amber-700 border-amber-300`}>Staff Review</span>;
    case 'sent_for_signature':
      return <span className={`${cls} bg-emerald-100 text-emerald-700 border-emerald-300`}>Signatures Sent</span>;
    case 'rn_signed':
      return <span className={`${cls} bg-teal-100 text-teal-700 border-teal-300`}>RN Signed</span>;
    case 'fully_signed':
      return <span className={`${cls} bg-green-100 text-green-700 border-green-300`}>Fully Signed</span>;
    case 'manager_review':
      return <span className={`${cls} bg-blue-100 text-blue-800 border-blue-300`}>Kaiser Review</span>;
    case 'ready_to_send':
      return <span className={`${cls} bg-violet-100 text-violet-700 border-violet-300`}>Ready → Jocelyn</span>;
    case 'completed':
      return <span className={`${cls} bg-gray-100 text-gray-600 border-gray-300`}>Completed</span>;
  }
};

const stageFilterMatch = (stage: StageKey, filter: StageFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'received') return stage === 'received';
  if (filter === 'returned_to_sw') return stage === 'returned_to_sw';
  if (filter === 'rn_assigned') return ['rn_assigned', 'rn_downloaded', 'rn_reuploaded', 'staff_assigned'].includes(stage);
  if (filter === 'signatures') return ['sent_for_signature', 'rn_signed', 'fully_signed'].includes(stage);
  if (filter === 'manager_review') return ['manager_review', 'ready_to_send'].includes(stage);
  if (filter === 'completed') return stage === 'completed';
  return true;
};

const queueProgressChips = (r: AlftRecord) => {
  const workflow = String(r.workflowStatus || '').toLowerCase();
  const status = String(r.status || '').toLowerCase();
  const hasInvite = workflow.includes('sw_invited') || status === 'sw_form_in_progress';
  const swSubmitted = workflow.includes('awaiting_manager_review_pre_rn');
  const managerLoop = workflow.includes('returned_to_sw_for_revision') || workflow.includes('awaiting_manager_review_pre_rn');
  const rnStep = workflow.includes('awaiting_rn') || workflow.includes('awaiting_rn_revision_and_signatures') || workflow.includes('awaiting_rn_final_signature');
  const finalManager = workflow.includes('awaiting_kaiser_manager_final_review');
  const complete = workflow.includes('completed_sent_to_jocelyn') || status === 'completed';

  return [
    { key: 'prefill', label: 'Prefill', done: true, current: !hasInvite },
    { key: 'sw_notice', label: 'SW Notice', done: hasInvite, current: hasInvite && !swSubmitted },
    { key: 'sw_submit', label: 'SW Submit', done: swSubmitted, current: hasInvite && !swSubmitted },
    { key: 'manager', label: 'Manager', done: managerLoop, current: swSubmitted && !rnStep },
    { key: 'rn', label: 'RN', done: rnStep || finalManager || complete, current: rnStep && !finalManager },
    { key: 'final', label: 'Final', done: finalManager || complete, current: finalManager && !complete },
  ];
};

const PROGRESSION_COLUMNS: Array<{ key: string; abbr: string; label: string }> = [
  { key: 'prefill', abbr: 'PF', label: 'Prefill Ready' },
  { key: 'sw_notice', abbr: 'SWN', label: 'SW Notice Sent' },
  { key: 'sw_submit', abbr: 'SWS', label: 'SW Submitted/Signed' },
  { key: 'manager', abbr: 'MGR', label: 'Manager Review' },
  { key: 'rn', abbr: 'RN', label: 'RN Review/Sign' },
  { key: 'final', abbr: 'FIN', label: 'Final Preview + Jocelyn Email' },
];

const getProgressState = (r: AlftRecord) => {
  const map: Record<string, { done: boolean; current: boolean }> = {};
  queueProgressChips(r).forEach((chip) => {
    map[chip.key] = { done: chip.done, current: chip.current };
  });
  return map;
};

const progressDot = (state: { done: boolean; current: boolean } | undefined) => {
  if (state?.done) {
    return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300 bg-emerald-100 text-emerald-700 text-[11px]">✓</span>;
  }
  if (state?.current) {
    return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 text-[11px]">●</span>;
  }
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-300 text-[11px]">○</span>;
};

// ─── Timeline ─────────────────────────────────────────────────────────────────

type TimelineEntry = { icon: React.ReactNode; label: string; detail?: string; ms: number; color: string };

const buildTimeline = (r: AlftRecord): TimelineEntry[] => {
  const entries: TimelineEntry[] = [];

  const add = (ms: number, icon: React.ReactNode, label: string, detail: string | undefined, color: string) => {
    if (ms > 0) entries.push({ icon, label, detail, ms, color });
  };

  add(toMs(r.createdAt), <FileText className="h-3.5 w-3.5" />, 'Form submitted by SW',
    r.uploaderName || r.uploaderEmail || undefined, 'text-slate-500');

  add(toMs(r.alftRnAssignedAt), <User className="h-3.5 w-3.5" />, 'RN assigned',
    r.alftRnName || r.alftRnEmail || undefined, 'text-indigo-500');

  add(toMs(r.alftRnDownloadedAt), <FileText className="h-3.5 w-3.5" />, 'RN downloaded packet',
    r.alftRnName || r.alftRnEmail || undefined, 'text-blue-500');

  add(toMs(r.alftRnRevisionUploadedAt), <RotateCcw className="h-3.5 w-3.5" />, 'RN re-uploaded revised packet',
    r.alftRnName || r.alftRnEmail || undefined, 'text-purple-500');

  add(toMs(r.alftStaffAssignedAt), <User className="h-3.5 w-3.5" />, 'Staff assigned for review',
    r.alftStaffName || r.alftStaffEmail || undefined, 'text-amber-500');

  add(toMs(r.alftSignature?.requestedAt), <PenLine className="h-3.5 w-3.5" />, 'Signatures requested',
    undefined, 'text-emerald-500');

  add(toMs(r.alftSignature?.rnSignedAt), <CheckCircle2 className="h-3.5 w-3.5" />, 'RN signed',
    r.alftRnName || r.alftRnEmail || undefined, 'text-teal-500');

  add(toMs(r.alftSignature?.mswSignedAt), <CheckCircle2 className="h-3.5 w-3.5" />, 'MSW signed',
    r.uploaderName || r.uploaderEmail || undefined, 'text-green-600');

  add(toMs(r.alftSignature?.completedAt), <CheckCircle2 className="h-3.5 w-3.5" />, 'Packet PDF ready',
    undefined, 'text-green-700');

  if (r.alftManagerReview?.rejectedAt) {
    add(toMs(r.alftManagerReview.rejectedAt), <AlertCircle className="h-3.5 w-3.5" />, 'Returned to SW for revision',
      `${r.alftManagerReview.rejectedByName || r.alftManagerReview.rejectedByEmail || 'Manager'}: "${r.alftManagerReview.rejectionReason || ''}"`,
      'text-red-500');
  }

  if (r.alftManagerReview?.reviewedAt && r.alftManagerReview?.status === 'approved') {
    add(toMs(r.alftManagerReview.reviewedAt), <CheckCircle2 className="h-3.5 w-3.5" />, 'Kaiser manager approved',
      r.alftManagerReview.reviewedByName || r.alftManagerReview.reviewedByEmail || undefined, 'text-violet-600');
  }

  for (const edit of (r.alftEditHistory ?? [])) {
    const ms = toMs(edit.editedAt) || toMs(edit.editedAtIso);
    const role = edit.editedByRole ? ` (${edit.editedByRole.replace('_', ' ')})` : '';
    const who = `${edit.editedByName || edit.editedByEmail || 'Staff'}${role}`;
    const fields = (edit.changedFields ?? []).join(', ') || edit.note || 'No changes';
    add(ms, <PenLine className="h-3.5 w-3.5" />, `Form edited — ${fields}`, who, 'text-orange-500');
  }

  return entries.filter((e) => e.ms > 0).sort((a, b) => a.ms - b.ms);
};

// ─── Detail modal ─────────────────────────────────────────────────────────────

function AlftDetailModal({ record, onClose }: { record: AlftRecord; onClose: () => void }) {
  const stage = computeStage(record);
  const timeline = buildTimeline(record);
  const hasPacket = Boolean(record.alftSignature?.packetPdfStoragePath || record.alftSignature?.signaturePagePdfStoragePath);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            ALFT Log — {record.memberName || '(No name)'}
          </DialogTitle>
        </DialogHeader>

        {/* Header summary */}
        <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/40">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Member</p>
            <p className="font-medium">{record.memberName || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">MRN</p>
            <p className="font-medium">{record.medicalRecordNumber || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Social Worker</p>
            <p>{record.uploaderName || record.uploaderEmail || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Submitted</p>
            <p>{fmtDate(record.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">RN (Leslie)</p>
            <p>{record.alftRnName || record.alftRnEmail || 'Leslie'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Current stage</p>
            {stageBadge(stage)}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Last updated</p>
            <p>{fmt(record.updatedAt || record.workflowUpdatedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Packet ready</p>
            <p>{hasPacket ? 'Yes' : 'No'}</p>
          </div>
        </div>

        {/* Rejection reason callout */}
        {record.alftManagerReview?.rejectionReason && record.alftManagerReview.status === 'rejected_returned_to_sw' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-semibold text-red-700 flex items-center gap-1.5 mb-1">
              <AlertCircle className="h-4 w-4" /> Returned to SW for revision
            </p>
            <p className="text-red-800">
              <span className="font-medium">{record.alftManagerReview.rejectedByName || record.alftManagerReview.rejectedByEmail || 'Manager'}:</span>{' '}
              {record.alftManagerReview.rejectionReason}
            </p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Activity timeline
          </h3>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-3">
              {timeline.map((entry, i) => (
                <li key={i} className="pl-4">
                  <span className={`absolute -left-[9px] flex items-center justify-center w-4.5 h-4.5 ${entry.color}`}>
                    {entry.icon}
                  </span>
                  <p className="text-xs text-muted-foreground">{fmt(entry.ms)}</p>
                  <p className="text-sm font-medium leading-snug">{entry.label}</p>
                  {entry.detail && <p className="text-xs text-muted-foreground">{entry.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Edit history breakdown */}
        {(record.alftEditHistory ?? []).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <PenLine className="h-4 w-4" /> Edit history ({record.alftEditHistory!.length} saves)
            </h3>
            <div className="space-y-1.5">
              {record.alftEditHistory!.slice().reverse().map((edit, i) => {
                const ms = toMs(edit.editedAt) || toMs(edit.editedAtIso);
                const role = edit.editedByRole ? ` · ${edit.editedByRole.replace(/_/g, ' ')}` : '';
                return (
                  <div key={i} className="text-sm border rounded p-2.5 bg-muted/30">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{edit.editedByName || edit.editedByEmail || 'Staff'}<span className="font-normal text-muted-foreground text-xs">{role}</span></span>
                      <span className="text-xs text-muted-foreground shrink-0">{fmt(ms)}</span>
                    </div>
                    {(edit.changedFields ?? []).length > 0 ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Changed: {edit.changedFields!.join(', ')}
                        {(edit.changedExactQuestionCount ?? 0) > 0 && ` + ${edit.changedExactQuestionCount} questionnaire answers`}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">{edit.note || 'No field changes'}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Documents */}
        {((record.files ?? []).length > 0 || (record.alftRevisions ?? []).length > 0) && (
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Documents
            </h3>
            <div className="space-y-1">
              {(record.files ?? []).map((f, i) => (
                <a key={i} href={f.downloadURL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {f.fileName}
                </a>
              ))}
              {(record.alftRevisions ?? []).map((f, i) => (
                <a key={`rev-${i}`} href={f.downloadURL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-purple-600 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {f.fileName} <span className="text-xs text-muted-foreground">(revision by {f.uploadedByName || 'RN'})</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t">
          <p className="text-xs text-muted-foreground">Intake ID: {record.id}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/alft-tracker?focus=${encodeURIComponent(record.id)}`}>
              Open in tracker <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AlftLogPage() {
  const { isAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();

  const [records, setRecords] = useState<AlftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [selected, setSelected] = useState<AlftRecord | null>(null);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    setLoading(true);
    const mapAssignmentDocs = (docs: Array<{ id: string; data: () => any }>) => {
      const raw: AlftRecord[] = docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          status: String(data?.status || ''),
          memberName: String(data?.memberName || ''),
          memberMrn: String(data?.memberMrn || ''),
          medicalRecordNumber: String(data?.memberMrn || ''),
          assignedSwName: String(data?.assignedSwName || ''),
          assignedSwEmail: String(data?.assignedSwEmail || ''),
          uploaderName: String(data?.assignedSwName || ''),
          uploaderEmail: String(data?.assignedSwEmail || ''),
          createdAt: data?.assignedAt || data?.createdAt,
          updatedAt: data?.updatedAt || data?.assignedAt || data?.createdAt,
            workflowStatus: String(data?.workflowStatus || ''),
          workflowStage: String(data?.workflowStage || ''),
            alftRnName: String(data?.alftRnName || 'Leslie'),
            alftRnEmail: String(data?.alftRnEmail || ''),
        } as AlftRecord;
      });
      raw.sort((a, b) => toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt));
      return raw;
    };

    const loadSnapshotFallback = async () => {
      const snap = await getDocs(collection(firestore, 'alft_assignments')).catch(() => null);
      if (!snap) return;
      setRecords(mapAssignmentDocs(snap.docs as any));
      setLoading(false);
    };

    void loadSnapshotFallback();

    const unsub = onSnapshot(
      collection(firestore, 'alft_assignments'),
      (snap) => {
        setRecords(mapAssignmentDocs(snap.docs as any));
        setLoading(false);
      },
      async () => {
        // Keep existing records on transient listener issues; try one-time fetch fallback.
        await loadSnapshotFallback();
      }
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return records.filter((r) => {
      const stage = computeStage(r);
      if (!stageFilterMatch(stage, stageFilter)) return false;
      if (!q) return true;
      return (
        String(r.memberName ?? '').toLowerCase().includes(q) ||
        String(r.medicalRecordNumber ?? '').toLowerCase().includes(q) ||
        String(r.uploaderName ?? '').toLowerCase().includes(q) ||
        String(r.uploaderEmail ?? '').toLowerCase().includes(q) ||
        String(r.alftRnName ?? '').toLowerCase().includes(q) ||
        String(r.alftRnEmail ?? '').toLowerCase().includes(q) ||
        String(r.id ?? '').toLowerCase().includes(q)
      );
    });
  }, [records, search, stageFilter]);

  // Stage summary counts
  const counts = useMemo(() => {
    const c: Record<StageFilter, number> = {
      all: records.length,
      received: 0,
      returned_to_sw: 0,
      rn_assigned: 0,
      signatures: 0,
      manager_review: 0,
      completed: 0,
    };
    records.forEach((r) => {
      const s = computeStage(r);
      if (s === 'received') c.received++;
      else if (s === 'returned_to_sw') c.returned_to_sw++;
      else if (['rn_assigned', 'rn_downloaded', 'rn_reuploaded', 'staff_assigned'].includes(s)) c.rn_assigned++;
      else if (['sent_for_signature', 'rn_signed', 'fully_signed'].includes(s)) c.signatures++;
      else if (['manager_review', 'ready_to_send'].includes(s)) c.manager_review++;
      else if (s === 'completed') c.completed++;
    });
    return c;
  }, [records]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>Please sign in as an admin to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/admin/alft-tracker">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tracker
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> ALFT Log
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Queue log of ALFT members — filter by stage and quickly see where each member is in progression.
          </p>
        </div>
      </div>

      {/* Stage summary pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'received', label: 'Received' },
            { key: 'returned_to_sw', label: 'Returned to SW' },
            { key: 'rn_assigned', label: 'With RN / Staff' },
            { key: 'signatures', label: 'Signatures' },
            { key: 'manager_review', label: 'Kaiser Review' },
            { key: 'completed', label: 'Completed' },
          ] as { key: StageFilter; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStageFilter(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors
              ${stageFilter === key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
          >
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold
              ${stageFilter === key ? 'bg-white/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4 text-xs text-muted-foreground">
          <div className="font-medium mb-1 text-foreground">ALFT Progress Legend</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {PROGRESSION_COLUMNS.map((col) => (
              <span key={`legend-${col.key}`}>
                <span className="font-medium">{col.abbr}</span> = {col.label}
              </span>
            ))}
            <span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-300 bg-emerald-100 text-emerald-700 text-[10px] mr-1">✓</span>
              Completed step
            </span>
            <span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 text-[10px] mr-1">●</span>
              Current step in progress
            </span>
            <span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-300 text-[10px] mr-1">○</span>
              Not started yet
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search member name, MRN, social worker, RN…"
          className="max-w-md"
        />
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="returned_to_sw">Returned to SW</SelectItem>
            <SelectItem value="rn_assigned">With RN / Staff</SelectItem>
            <SelectItem value="signatures">Signatures</SelectItem>
            <SelectItem value="manager_review">Kaiser Review</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear</Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} {filtered.length === 1 ? 'form' : 'forms'}
            {stageFilter !== 'all' || search ? ' (filtered)' : ' total'}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading ALFT records…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No ALFT forms match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>MRN</TableHead>
                  <TableHead>Social Worker</TableHead>
                  <TableHead>RN Assigned</TableHead>
                  {PROGRESSION_COLUMNS.map((col) => (
                    <TableHead key={`th-${col.key}`} className="text-center font-mono text-[10px]">
                      {col.abbr}
                    </TableHead>
                  ))}
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const p = getProgressState(r);
                  const lastActivity = Math.max(
                    toMs(r.updatedAt),
                    toMs(r.workflowUpdatedAt),
                    toMs(r.alftSignature?.completedAt),
                    toMs(r.alftManagerReview?.reviewedAt),
                    toMs(r.alftManagerReview?.rejectedAt),
                  );
                  const editCount = (r.alftEditHistory ?? []).length;
                  return (
                    <TableRow
                      key={r.id}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="font-medium">{r.memberName || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.medicalRecordNumber || '—'}</TableCell>
                      <TableCell className="text-sm">{r.assignedSwName || r.assignedSwEmail || r.uploaderName || r.uploaderEmail || '—'}</TableCell>
                      <TableCell className="text-sm">{r.alftRnName || r.alftRnEmail || 'Leslie'}</TableCell>
                      {PROGRESSION_COLUMNS.map((col) => (
                        <TableCell key={`${r.id}-pc-${col.key}`} className="text-center" title={col.label}>
                          {progressDot(p[col.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        <div>{lastActivity > 0 ? fmtDate(lastActivity) : '—'}</div>
                        {editCount > 0 && (
                          <div className="text-xs text-orange-600">{editCount} edit{editCount > 1 ? 's' : ''}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(r)}>
                            Quick view
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                            <Link href={`/admin/alft-tracker?member=${encodeURIComponent(String(r.id || ''))}&focus=${encodeURIComponent(String(r.id || ''))}`}>
                              Workflow intake
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <AlftDetailModal record={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
