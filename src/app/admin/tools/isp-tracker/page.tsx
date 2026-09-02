'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Download, Loader2, Search, Trash2, XCircle } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  formatIspWorkflowActivityLabel,
  type IspWorkflowActivityEntry,
} from '@/lib/isp-workflow-activity';

type StepStatus = 'Completed' | 'Pending' | 'Not Applicable';

type IspStep = {
  key: string;
  abbreviation: string;
  label: string;
};

type IspRow = {
  id: string;
  memberId: string;
  memberName: string;
  memberMrn: string;
  healthPlan: string;
  uploaderName: string;
  staffName: string;
  rnName: string;
  workflowStatus: string;
  workflowStage: string;
  status: string;
  alftManagerPreReviewStatus: string;
  alftManagerReviewStatus: string;
  mswSigned: boolean;
  rnSigned: boolean;
  downloaded: boolean;
  updatedAtMs: number;
  source: 'intake' | 'invite';
  activityLog: IspWorkflowActivityEntry[];
  latestActivityLabel: string;
  sentToSwAtMs: number;
  sentToSwLabel: string;
  sentToSwRecipient: string;
};

type ActivityFeedItem = {
  key: string;
  memberId: string;
  memberName: string;
  memberMrn: string;
  atMs: number;
  atLabel: string;
  label: string;
  noteSentToSw: boolean;
  byName: string;
};

const ISP_STEPS: IspStep[] = [
  { key: 'sw_submit', abbreviation: 'Submit', label: 'MSW submitted ISP / ALFT' },
  { key: 'staff_first', abbreviation: '1stRev', label: 'Staff first review accepted' },
  { key: 'sw_sign', abbreviation: 'SWSign', label: 'MSW signature complete' },
  { key: 'rn_sign', abbreviation: 'RN', label: 'RN review & signature complete' },
  { key: 'staff_final', abbreviation: 'Final', label: 'Staff final review complete' },
  { key: 'downloaded', abbreviation: 'DL', label: 'Packet downloaded & logged' },
];

const INVITE_PENDING_STATUSES = new Set([
  'sw_invited_pending_submission',
  'sw_form_in_progress',
  'sw_invited_to_portal',
]);

const clean = (value: unknown) => String(value || '').trim();

const toMs = (value: unknown): number => {
  try {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate?.toDate === 'function') {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const d = new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

const parseActivityLog = (raw: unknown): IspWorkflowActivityEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const event = clean((entry as any)?.event);
      if (!event) return null;
      return {
        event,
        atIso: clean((entry as any)?.atIso) || new Date(toMs((entry as any)?.at)).toISOString(),
        byName: clean((entry as any)?.byName) || null,
        byEmail: clean((entry as any)?.byEmail) || null,
        details: clean((entry as any)?.details) || null,
        fileName: clean((entry as any)?.fileName) || null,
        fileLabel: clean((entry as any)?.fileLabel) || null,
        recipientEmail: clean((entry as any)?.recipientEmail) || null,
        noteSentToSw: Boolean((entry as any)?.noteSentToSw),
        isResend: Boolean((entry as any)?.isResend),
      } as IspWorkflowActivityEntry;
    })
    .filter(Boolean) as IspWorkflowActivityEntry[];
};

const formatWhen = (ms: number) => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

const latestActivityLabel = (log: IspWorkflowActivityEntry[]) => {
  if (!log.length) return '';
  const sorted = [...log].sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  return formatIspWorkflowActivityLabel(sorted[0]);
};

const resolveSentToSw = (
  log: IspWorkflowActivityEntry[],
  fallbackAtMs = 0,
  recipient = ''
): { atMs: number; label: string; recipient: string } => {
  const inviteEntries = log
    .filter((entry) => clean(entry.event) === 'sw_invite_sent')
    .sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  const entry = inviteEntries[0] || null;
  const atMs = Math.max(toMs(entry?.atIso), fallbackAtMs);
  const recipientEmail = clean(entry?.recipientEmail) || clean(recipient);
  if (!atMs && !entry) {
    return { atMs: 0, label: '', recipient: recipientEmail };
  }
  const when = formatWhen(atMs);
  const resend = Boolean(entry?.isResend);
  const base = resend ? 'Re-sent to SW' : 'Sent to SW';
  const label = when
    ? `${base}: ${when}${recipientEmail ? ` → ${recipientEmail}` : ''}`
    : `${base}${recipientEmail ? ` → ${recipientEmail}` : ''}`;
  return { atMs, label, recipient: recipientEmail };
};

const latestNonInviteActivityLabel = (log: IspWorkflowActivityEntry[]) => {
  const sorted = [...log]
    .filter((entry) => clean(entry.event) !== 'sw_invite_sent')
    .sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  if (!sorted.length) return '';
  return formatIspWorkflowActivityLabel(sorted[0]);
};

const buildRowLogLines = (row: IspRow): string[] => {
  const lines: string[] = [];
  if (row.sentToSwLabel) lines.push(row.sentToSwLabel);
  const sorted = [...row.activityLog].sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  for (const entry of sorted) {
    if (clean(entry.event) === 'sw_invite_sent') continue;
    const when = formatWhen(toMs(entry.atIso));
    const label = formatIspWorkflowActivityLabel(entry);
    lines.push(when ? `${label} · ${when}` : label);
  }
  if (!lines.length && row.latestActivityLabel) lines.push(row.latestActivityLabel);
  return lines;
};

const MemberLogOneLine = ({ row }: { row: IspRow }) => {
  const [open, setOpen] = useState(false);
  const lines = buildRowLogLines(row);
  if (!lines.length) return null;
  const summary = lines[0];
  const extraCount = Math.max(0, lines.length - 1);

  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex w-full max-w-[320px] items-start gap-1 text-left text-xs text-emerald-800 hover:underline"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0">
          <span className="line-clamp-1">{summary}</span>
          {!open && extraCount > 0 ? (
            <span className="ml-1 text-muted-foreground">+{extraCount} more · Details</span>
          ) : !open ? (
            <span className="ml-1 text-muted-foreground">· Details</span>
          ) : null}
        </span>
      </button>
      {open ? (
        <ul className="mt-1 max-w-[320px] space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-700">
          {lines.map((line, idx) => (
            <li key={`${row.id}-log-${idx}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const StatusIndicator = ({ status, formName }: { status: StepStatus; formName: string }) => {
  const statusConfig = {
    Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
    Pending: { Icon: XCircle, color: 'text-orange-500', label: 'Pending' },
    'Not Applicable': { Icon: Circle, color: 'text-gray-300', label: 'Not Applicable' },
  };
  const { Icon, color, label } = statusConfig[status];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Icon className={`h-5 w-5 ${color}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {formName}: {label}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const getStepStatus = (row: IspRow, stepKey: string): StepStatus => {
  const ws = clean(row.workflowStatus).toLowerCase();
  const pre = clean(row.alftManagerPreReviewStatus).toLowerCase();
  const final = clean(row.alftManagerReviewStatus).toLowerCase();
  const returned = ws.includes('returned_to_sw');
  const inviteOnly =
    row.source === 'invite' ||
    INVITE_PENDING_STATUSES.has(ws) ||
    ws.includes('sw_invited') ||
    ws.includes('sw_form');
  const completedFlow =
    ws.includes('completed') ||
    ws.includes('manager_review_complete') ||
    ws.includes('ready_to_send');

  if (stepKey === 'sw_submit') {
    if (inviteOnly && row.source === 'invite') return 'Pending';
    if (inviteOnly && !row.mswSigned && !ws.includes('awaiting_')) return 'Pending';
    return ws && !INVITE_PENDING_STATUSES.has(ws) && !ws.includes('sw_invited') ? 'Completed' : 'Pending';
  }

  if (stepKey === 'staff_first') {
    if (inviteOnly && row.source === 'invite') return 'Pending';
    if (returned) return 'Pending';
    if (
      pre.includes('approved') ||
      ws.includes('awaiting_sw_signature') ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      completedFlow
    ) {
      return 'Completed';
    }
    return 'Pending';
  }

  if (stepKey === 'sw_sign') {
    if (row.mswSigned) return 'Completed';
    if (
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      completedFlow
    ) {
      return 'Completed';
    }
    return 'Pending';
  }

  if (stepKey === 'rn_sign') {
    if (row.rnSigned) return 'Completed';
    if (ws.includes('awaiting_kaiser_manager_final') || completedFlow) return 'Completed';
    return 'Pending';
  }

  if (stepKey === 'staff_final') {
    if (final.includes('approved') || completedFlow) return 'Completed';
    return 'Pending';
  }

  if (stepKey === 'downloaded') {
    return row.downloaded ? 'Completed' : 'Pending';
  }

  return 'Not Applicable';
};

const workflowLabel = (row: IspRow) => {
  const ws = clean(row.workflowStatus);
  if (row.source === 'invite' || INVITE_PENDING_STATUSES.has(ws.toLowerCase()) || ws.toLowerCase().includes('sw_invited')) {
    return 'Invited — awaiting SW submit';
  }
  if (!ws) return 'Not started';
  if (ws.includes('returned_to_sw')) return 'Returned to MSW';
  if (ws.includes('awaiting_manager_review_pre_rn')) return 'Awaiting first review';
  if (ws.includes('awaiting_sw_signature')) return 'Awaiting MSW signature';
  if (ws.includes('awaiting_rn')) return 'Awaiting RN';
  if (ws.includes('awaiting_kaiser_manager_final')) return 'Awaiting final review';
  if (ws.includes('manager_review_complete') || ws.includes('ready_to_send')) return 'Ready to send';
  if (ws.includes('completed')) return 'Completed';
  return ws.replace(/_/g, ' ');
};

const workflowHref = (row: IspRow) => {
  if (row.source === 'intake' && row.id && !row.id.startsWith('invite:')) {
    return `/admin/tools/isp-workflow?intakeId=${encodeURIComponent(row.id)}`;
  }
  const memberId = clean(row.memberId);
  if (memberId) return `/admin/tools/isp-workflow?memberId=${encodeURIComponent(memberId)}`;
  return '/admin/tools/isp-workflow';
};

export default function IspTrackerPage() {
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<IspRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<IspRow | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [expandedLogMembers, setExpandedLogMembers] = useState<Record<string, boolean>>({});

  const loadRows = useCallback(async () => {
    if (!firestore || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(firestore, 'standalone_upload_submissions'),
            where('toolCode', '==', 'ALFT'),
            orderBy('updatedAt', 'desc'),
            limit(300)
          )
        );
      } catch {
        snap = await getDocs(
          query(collection(firestore, 'standalone_upload_submissions'), orderBy('updatedAt', 'desc'), limit(400))
        );
      }

      const intakeByMember = new Map<string, string>();
      const intakeRows: IspRow[] = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() || {};
          const toolCode = clean(data.toolCode).toUpperCase();
          const docType = clean(data.documentType).toLowerCase();
          const isAlft = toolCode === 'ALFT' || docType.includes('alft');
          if (!isAlft) return null;

          const sig = (data.alftSignature || {}) as Record<string, unknown>;
          const pre = (data.alftManagerPreReview || {}) as Record<string, unknown>;
          const final = (data.alftManagerReview || {}) as Record<string, unknown>;
          const memberId = clean(data.memberId);
          if (memberId) intakeByMember.set(memberId, docSnap.id);

          const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
          const sent = resolveSentToSw(activityLog);

          return {
            id: docSnap.id,
            memberId,
            memberName: clean(data.memberName) || 'Member',
            memberMrn: clean(data.medicalRecordNumber || data.kaiserMrn) || '—',
            healthPlan: clean(data.healthPlan) || 'Kaiser',
            uploaderName: clean(data.uploaderName || data.uploaderEmail) || 'MSW',
            staffName: clean(data.alftStaffName || data.alftStaffEmail || data.assignedManager?.name) || '—',
            rnName: clean(data.alftRnName || data.alftRnEmail) || '—',
            workflowStatus: clean(data.workflowStatus),
            workflowStage: clean(data.workflowStage),
            status: clean(data.status),
            alftManagerPreReviewStatus: clean(pre.status),
            alftManagerReviewStatus: clean(final.status),
            mswSigned: Boolean(sig.mswSignedAt),
            rnSigned: Boolean(sig.rnSignedAt),
            downloaded: Boolean(data.alftStaffDownloadedAt || data.alftLastDownloadLogId),
            updatedAtMs: Math.max(toMs(data.updatedAt), toMs(data.createdAt), toMs(data.workflowUpdatedAt)),
            source: 'intake' as const,
            activityLog,
            latestActivityLabel: latestNonInviteActivityLabel(activityLog) || latestActivityLabel(activityLog),
            sentToSwAtMs: sent.atMs,
            sentToSwLabel: sent.label,
            sentToSwRecipient: sent.recipient,
          } as IspRow;
        })
        .filter(Boolean) as IspRow[];

      let assignmentSnap;
      try {
        assignmentSnap = await getDocs(
          query(collection(firestore, 'alft_assignments'), orderBy('updatedAt', 'desc'), limit(500))
        );
      } catch {
        try {
          assignmentSnap = await getDocs(
            query(
              collection(firestore, 'alft_assignments'),
              where('workflowStatus', 'in', [
                'sw_invited_pending_submission',
                'sw_form_in_progress',
              ]),
              limit(300)
            )
          );
        } catch {
          assignmentSnap = await getDocs(query(collection(firestore, 'alft_assignments'), limit(500)));
        }
      }

      const inviteRows: IspRow[] = [];
      const activityByMember = new Map<string, IspWorkflowActivityEntry[]>();
      const inviteMetaByMember = new Map<string, { atMs: number; recipient: string }>();

      for (const docSnap of assignmentSnap.docs) {
        const data = docSnap.data() || {};
        const memberId = clean(data.memberId || docSnap.id);
        const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
        if (memberId && activityLog.length) activityByMember.set(memberId, activityLog);

        const inviteFallbackMs = Math.max(
          toMs(data.workflowInvites?.invitedAt),
          toMs(data.workflowStepsAt?.swInviteSentAt)
        );
        const inviteRecipient =
          clean(data.assignedSwEmail) ||
          clean(
            (Array.isArray(data.swEmailDeliveryLog) ? data.swEmailDeliveryLog : []).find(
              (entry: any) => clean(entry?.status) === 'sent'
            )?.recipientEmail
          );
        if (memberId) {
          const sent = resolveSentToSw(activityLog, inviteFallbackMs, inviteRecipient);
          if (sent.atMs || sent.recipient) {
            inviteMetaByMember.set(memberId, { atMs: sent.atMs, recipient: sent.recipient });
          }
        }

        const ws = clean(data.workflowStatus).toLowerCase();
        const stage = clean(data.workflowStage).toLowerCase();
        const status = clean(data.status).toLowerCase();
        if (
          ws.includes('removed_from_isp_tracker') ||
          status.includes('removed_from_isp_tracker') ||
          Boolean(data.removedFromIspTrackerAt)
        ) {
          continue;
        }
        const invitePending =
          INVITE_PENDING_STATUSES.has(ws) ||
          INVITE_PENDING_STATUSES.has(status) ||
          ws.includes('sw_invited') ||
          stage.includes('sw_invited') ||
          Boolean(data?.workflowSteps?.swInviteSent && !data?.workflowSteps?.swSubmittedSigned);

        if (!invitePending) continue;
        if (memberId && intakeByMember.has(memberId)) continue;

        const sent = resolveSentToSw(activityLog, inviteFallbackMs, inviteRecipient);

        inviteRows.push({
          id: `invite:${memberId || docSnap.id}`,
          memberId,
          memberName:
            clean(data.memberName) ||
            `${clean(data.memberFirstName)} ${clean(data.memberLastName)}`.trim() ||
            'Member',
          memberMrn: clean(data.memberMrn || data.medicalRecordNumber) || '—',
          healthPlan: clean(data.healthPlan) || 'Kaiser',
          uploaderName: clean(data.assignedSwName || data.assignedSwEmail) || 'MSW',
          staffName:
            clean(data.assignedManagerName || data.alftStaffName || data.workflowInvites?.invitedByName) || '—',
          rnName: clean(data.assignedRnName || data.alftRnName) || '—',
          workflowStatus: clean(data.workflowStatus) || 'sw_invited_pending_submission',
          workflowStage: clean(data.workflowStage),
          status: clean(data.status),
          alftManagerPreReviewStatus: '',
          alftManagerReviewStatus: '',
          mswSigned: false,
          rnSigned: false,
          downloaded: false,
          updatedAtMs: Math.max(
            toMs(data.updatedAt),
            inviteFallbackMs,
            sent.atMs,
            toMs(data.createdAt)
          ),
          source: 'invite',
          activityLog,
          latestActivityLabel: latestNonInviteActivityLabel(activityLog),
          sentToSwAtMs: sent.atMs,
          sentToSwLabel: sent.label,
          sentToSwRecipient: sent.recipient,
        });
      }

      const mergedIntakeRows = intakeRows.map((row) => {
        const fromAssignment = row.memberId ? activityByMember.get(row.memberId) : undefined;
        const inviteMeta = row.memberId ? inviteMetaByMember.get(row.memberId) : undefined;
        const combined = [...row.activityLog, ...(fromAssignment || [])].sort(
          (a, b) => toMs(b.atIso) - toMs(a.atIso)
        );
        const deduped: IspWorkflowActivityEntry[] = [];
        const seen = new Set<string>();
        for (const entry of combined) {
          const key = `${entry.event}|${entry.atIso}|${entry.fileName || ''}|${entry.details || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(entry);
        }
        const sent = resolveSentToSw(
          deduped,
          Math.max(row.sentToSwAtMs, inviteMeta?.atMs || 0),
          inviteMeta?.recipient || row.sentToSwRecipient
        );
        return {
          ...row,
          activityLog: deduped,
          latestActivityLabel: latestNonInviteActivityLabel(deduped) || latestActivityLabel(deduped),
          sentToSwAtMs: sent.atMs,
          sentToSwLabel: sent.label,
          sentToSwRecipient: sent.recipient,
        };
      });

      const next = [...mergedIntakeRows, ...inviteRows].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      setRows(next);
    } catch (e: any) {
      setError(String(e?.message || 'Failed to load ISP intakes'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [firestore, isAdmin]);

  useEffect(() => {
    if (!isAdmin || isAdminLoading) return;
    void loadRows();
  }, [isAdmin, isAdminLoading, loadRows]);

  const deleteAndStartOver = async () => {
    const row = confirmDeleteRow;
    if (!row?.id) return;
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Sign-in required',
        description: 'Please sign in again before deleting.',
        variant: 'destructive',
      });
      return;
    }

    setDeletingId(row.id);
    try {
      const idToken = await user.getIdToken();
      if (row.source === 'invite') {
        const memberId = clean(row.memberId);
        if (!memberId) throw new Error('Missing member id for invite row');
        const res = await fetch('/api/alft/assignment/remove-from-tracker', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ memberId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) {
          throw new Error(String(body?.error || 'Delete failed'));
        }
        setRows((prev) => prev.filter((r) => r.id !== row.id && r.memberId !== memberId));
        setConfirmDeleteRow(null);
        toast({
          title: 'Removed from ISP Tracker',
          description: `${row.memberName} invite was removed from the tracker list.`,
        });
        return;
      }

      const res = await fetch('/api/alft/intake/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intakeId: row.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Delete failed'));
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setConfirmDeleteRow(null);
      toast({
        title: 'ISP record deleted',
        description: `${row.memberName} can start over from SW submit.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not delete ISP record',
        description: String(e?.message || e),
        variant: 'destructive',
      });
    } finally {
      setDeletingId('');
    }
  };

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay =
          `${row.memberName} ${row.memberMrn} ${row.uploaderName} ${row.staffName} ${row.rnName} ${row.workflowStatus} ${row.latestActivityLabel} ${row.sentToSwLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (showPendingOnly) {
        const hasPending = ISP_STEPS.some((step) => getStepStatus(row, step.key) === 'Pending');
        if (!hasPending) return false;
      }
      return true;
    });
  }, [rows, search, showPendingOnly]);

  const activityFeedByMember = useMemo(() => {
    const byMember = new Map<
      string,
      {
        memberKey: string;
        memberId: string;
        memberName: string;
        memberMrn: string;
        rowId: string;
        source: 'intake' | 'invite';
        items: ActivityFeedItem[];
      }
    >();

    for (const row of rows) {
      const memberKey = clean(row.memberId) || row.id;
      const mutable = byMember.get(memberKey) || {
        memberKey,
        memberId: row.memberId,
        memberName: row.memberName,
        memberMrn: row.memberMrn,
        rowId: row.id,
        source: row.source,
        items: [] as ActivityFeedItem[],
      };

      const hasInviteEvent = row.activityLog.some((entry) => clean(entry.event) === 'sw_invite_sent');
      if (row.sentToSwAtMs && !hasInviteEvent) {
        mutable.items.push({
          key: `${row.id}:sent-to-sw:${row.sentToSwAtMs}`,
          memberId: row.memberId,
          memberName: row.memberName,
          memberMrn: row.memberMrn,
          atMs: row.sentToSwAtMs,
          atLabel: formatWhen(row.sentToSwAtMs) || '—',
          label: row.sentToSwLabel || 'Sent to SW',
          noteSentToSw: false,
          byName: row.staffName || 'Staff',
        });
      }
      for (const entry of row.activityLog) {
        const atMs = toMs(entry.atIso);
        mutable.items.push({
          key: `${row.id}:${entry.event}:${entry.atIso}:${entry.fileName || entry.details || ''}`,
          memberId: row.memberId,
          memberName: row.memberName,
          memberMrn: row.memberMrn,
          atMs,
          atLabel: atMs ? formatWhen(atMs) : '—',
          label: formatIspWorkflowActivityLabel(entry),
          noteSentToSw: Boolean(entry.noteSentToSw) || entry.event === 'clinical_files_note_sent',
          byName: clean(entry.byName || entry.byEmail) || 'Staff',
        });
      }

      mutable.items.sort((a, b) => b.atMs - a.atMs);
      byMember.set(memberKey, mutable);
    }

    return Array.from(byMember.values())
      .filter((group) => group.items.length > 0)
      .sort((a, b) => (b.items[0]?.atMs || 0) - (a.items[0]?.atMs || 0));
  }, [rows]);

  const toggleLogMember = (memberKey: string) => {
    setExpandedLogMembers((prev) => ({ ...prev, [memberKey]: !prev[memberKey] }));
  };

  if (!isAdminLoading && !isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>ISP Tracker</CardTitle>
            <CardDescription>Admin access is required.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-[1200px] space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>ISP Tracker</CardTitle>
                <Badge variant="outline">Workflow progress</Badge>
              </div>
              <CardDescription className="mt-1.5">
                Green = step complete. Orange = still pending. Includes SW invites awaiting submit, plus a log when
                clinical files are uploaded and a note is sent to the SW.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-workflow">ISP Workflow</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-downloads">
                  <Download className="mr-2 h-4 w-4" />
                  ISP Downloads
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, MRN, staff, RN…"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showPendingOnly}
                onChange={(e) => setShowPendingOnly(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Show incomplete only
            </label>
            <span className="text-sm text-muted-foreground">{filteredRows.length} ISP packets</span>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="text-sm font-semibold">Legend</h3>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {ISP_STEPS.map((step) => (
                <span key={step.key}>
                  <strong className="font-mono">{step.abbreviation}:</strong> {step.label}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Completed
              </span>
              <span className="inline-flex items-center gap-1">
                <XCircle className="h-4 w-4 text-orange-500" /> Pending
              </span>
              <span className="inline-flex items-center gap-1">
                <Circle className="h-4 w-4 text-gray-300" /> Not applicable
              </span>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading || isAdminLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4">Loading ISP workflow data…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px] font-semibold">Member</TableHead>
                    {ISP_STEPS.map((step) => (
                      <TableHead key={step.key} className="w-[72px] p-2 text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="cursor-help font-mono text-xs">{step.abbreviation}</TooltipTrigger>
                            <TooltipContent>
                              <p>{step.label}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length > 0 ? (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">{row.memberName}</div>
                            {row.source === 'invite' ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Invite pending
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.healthPlan} · MRN {row.memberMrn}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            MSW: {row.uploaderName} · Staff: {row.staffName} · RN: {row.rnName}
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-700">{workflowLabel(row)}</div>
                          <MemberLogOneLine row={row} />
                        </TableCell>
                        {ISP_STEPS.map((step) => (
                          <TableCell key={`${row.id}-${step.key}`} className="text-center">
                            <StatusIndicator status={getStepStatus(row, step.key)} formName={step.label} />
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={workflowHref(row)}>Workflow</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={
                                  row.source === 'intake'
                                    ? `/admin/alft-tracker?focus=${encodeURIComponent(row.id)}`
                                    : `/admin/alft-tracker?memberId=${encodeURIComponent(row.memberId)}`
                                }
                              >
                                Detail
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setConfirmDeleteRow(row)}
                              disabled={deletingId === row.id}
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                              )}
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={ISP_STEPS.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                        No ISP invites or intakes found yet. Send an SW invite from ISP Workflow, or wait for SW
                        portal submit.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ISP activity log</CardTitle>
          <CardDescription>
            One line per member — open Details for the full timeline. Delete removes the member from this tracker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityFeedByMember.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Invites and clinical file uploads will appear here.
            </p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {activityFeedByMember.map((group) => {
                const open = Boolean(expandedLogMembers[group.memberKey]);
                const latest = group.items[0];
                const extra = Math.max(0, group.items.length - 1);
                const matchingRow =
                  rows.find((r) => r.id === group.rowId) ||
                  rows.find((r) => clean(r.memberId) === clean(group.memberId)) ||
                  null;
                return (
                  <li key={group.memberKey} className="rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => toggleLogMember(group.memberKey)}
                      >
                        <div className="flex items-start gap-1">
                          {open ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium">
                              {group.memberName}
                              {group.memberMrn && group.memberMrn !== '—' ? (
                                <span className="ml-1 font-normal text-muted-foreground">
                                  · MRN {group.memberMrn}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 line-clamp-1 text-slate-800">
                              {latest?.label || 'Activity'}
                              {latest?.atLabel ? (
                                <span className="text-muted-foreground"> · {latest.atLabel}</span>
                              ) : null}
                              {!open && extra > 0 ? (
                                <span className="text-muted-foreground"> · +{extra} more</span>
                              ) : null}
                              <span className="ml-1 text-blue-700">{open ? 'Hide' : 'Details'}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                      <div className="flex shrink-0 gap-2">
                        {group.memberId ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/tools/isp-workflow?memberId=${encodeURIComponent(group.memberId)}`}>
                              Workflow
                            </Link>
                          </Button>
                        ) : null}
                        {matchingRow ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deletingId === matchingRow.id}
                            onClick={() => setConfirmDeleteRow(matchingRow)}
                          >
                            {deletingId === matchingRow.id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <ul className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 text-xs text-slate-700">
                        {group.items.map((item) => (
                          <li key={item.key}>
                            <span className="font-medium text-slate-800">{item.label}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {item.atLabel} · by {item.byName}
                              {item.noteSentToSw ? ' · Note sent to SW' : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(confirmDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deletingId) setConfirmDeleteRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDeleteRow?.source === 'invite'
                ? 'Remove member from ISP Tracker?'
                : 'Delete ISP record and start over?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {confirmDeleteRow?.source === 'invite'
                    ? 'This removes the pending invite for '
                    : 'This permanently removes the current ISP / ALFT workflow for '}
                  <span className="font-medium text-foreground">
                    {confirmDeleteRow?.memberName || 'this member'}
                  </span>
                  {confirmDeleteRow?.memberMrn && confirmDeleteRow.memberMrn !== '—'
                    ? ` (MRN ${confirmDeleteRow.memberMrn})`
                    : ''}
                  {confirmDeleteRow?.source === 'invite'
                    ? ' from the ISP Tracker list.'
                    : '.'}
                </p>
                <p>
                  {confirmDeleteRow?.source === 'invite'
                    ? 'You can send a new SW invite later from ISP Workflow. Clinical files on the assignment are kept.'
                    : 'Signature links will be cancelled and the member can submit a new ISP from the beginning. Download logs are kept for history.'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(deletingId)}
              onClick={(e) => {
                e.preventDefault();
                void deleteAndStartOver();
              }}
            >
              {deletingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {confirmDeleteRow?.source === 'invite' ? 'Remove from tracker' : 'Delete & start over'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
