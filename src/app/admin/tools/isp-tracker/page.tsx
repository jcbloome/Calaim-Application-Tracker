'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import {
  type IspLayoutMode,
  readIspLayoutMode,
  writeIspLayoutMode,
} from '@/lib/isp-layout-mode';

type StepStatus = 'Completed' | 'Pending' | 'Returned';

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
  rejectionReason: string;
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
  swViewedAtMs: number;
  swViewedBy: string;
  /** Default ON when unset; false only when explicitly disabled. */
  dailyActionReminderEnabled: boolean;
};

const ISP_STEPS: IspStep[] = [
  { key: 'sent_to_sw', abbreviation: 'Sent SW', label: 'Sent to SW' },
  { key: 'sw_signed', abbreviation: 'SW Sign', label: 'SW Signed' },
  { key: 'admin_review', abbreviation: 'Admin', label: 'Admin Review' },
  { key: 'rn_review', abbreviation: 'RN', label: 'RN Review' },
  { key: 'final_download', abbreviation: 'Final', label: 'Final and Download' },
];

const INVITE_PENDING_STATUSES = new Set([
  'sw_invited_pending_submission',
  'sw_form_in_progress',
  'sw_invited_to_portal',
]);

const clean = (value: unknown) => String(value || '').trim();

/** Reminders default ON unless explicitly set to false. */
const isReminderEnabled = (value: unknown) => value !== false;

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

const resolveSwViewed = (
  log: IspWorkflowActivityEntry[],
  fallbackAtMs = 0,
  fallbackBy = ''
): { atMs: number; by: string } => {
  const viewedEntries = log
    .filter((entry) => clean(entry.event) === 'sw_viewed')
    .sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  const entry = viewedEntries[0] || null;
  return {
    atMs: Math.max(toMs(entry?.atIso), fallbackAtMs),
    by: clean(entry?.byName || entry?.byEmail) || clean(fallbackBy),
  };
};

const statusBadge = (row: IspRow): { label: string; className: string } => {
  const ws = clean(row.workflowStatus).toLowerCase();
  const invitePhase =
    row.source === 'invite' ||
    INVITE_PENDING_STATUSES.has(ws) ||
    ws.includes('sw_invited') ||
    ws.includes('sw_form');

  if (ws.includes('returned_to_sw') || clean(row.alftManagerReviewStatus).toLowerCase().includes('rejected_returned')) {
    return {
      label: 'Sent back to SW',
      className: 'border-orange-300 bg-orange-50 text-orange-950',
    };
  }
  if (invitePhase && row.swViewedAtMs) {
    return {
      label: 'SW logged in & viewed',
      className: 'border-sky-200 bg-sky-50 text-sky-900',
    };
  }
  if (invitePhase) {
    return {
      label: 'Invite pending',
      className: '',
    };
  }
  return {
    label: 'In review',
    className: 'border-slate-200 bg-slate-50 text-slate-800',
  };
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
        className="flex w-full max-w-full items-start gap-1 text-left text-xs text-emerald-800 hover:underline"
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
        <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-700">
          {lines.map((line, idx) => (
            <li key={`${row.id}-log-${idx}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const StatusIndicator = ({
  status,
  formName,
  shortLabel,
  showLabel = false,
}: {
  status: StepStatus;
  formName: string;
  shortLabel?: string;
  showLabel?: boolean;
}) => {
  const statusConfig = {
    Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
    Pending: { Icon: XCircle, color: 'text-orange-500', label: 'Pending' },
    Returned: { Icon: RotateCcw, color: 'text-orange-700', label: 'Sent back to SW for resubmission' },
  };
  const { Icon, color, label } = statusConfig[status];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex flex-col items-center gap-0.5">
            {showLabel && shortLabel ? (
              <span className="max-w-[3.5rem] text-center text-[9px] font-semibold leading-tight text-slate-600 whitespace-normal">
                {shortLabel}
              </span>
            ) : null}
            <Icon className={`h-5 w-5 ${color}`} aria-label={`${formName}: ${label}`} />
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
  const returned =
    ws.includes('returned_to_sw') || final.includes('rejected_returned');
  const invitePhase =
    row.source === 'invite' ||
    INVITE_PENDING_STATUSES.has(ws) ||
    ws.includes('sw_invited') ||
    ws.includes('sw_form');
  const completedFlow =
    ws.includes('completed') ||
    ws.includes('manager_review_complete') ||
    ws.includes('ready_to_send');
  const pastAdminReview =
    !returned &&
    (pre.includes('approved') ||
      ws.includes('awaiting_sw_signature') ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      completedFlow);
  const pastRnReview =
    !returned && (row.rnSigned || ws.includes('awaiting_kaiser_manager_final') || completedFlow);
  const pastSwSign =
    !returned &&
    (row.mswSigned ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      completedFlow);
  const finalDone = !returned && (final.includes('approved') || completedFlow);

  if (stepKey === 'sent_to_sw') {
    if (row.sentToSwAtMs > 0) return 'Completed';
    if (invitePhase || pastSwSign || pastAdminReview || returned || row.source === 'intake') return 'Completed';
    return 'Pending';
  }

  if (stepKey === 'sw_signed') {
    if (returned) return 'Returned';
    if (invitePhase && !pastSwSign) return 'Pending';
    return pastSwSign ? 'Completed' : 'Pending';
  }

  if (stepKey === 'admin_review') {
    if (returned) return 'Returned';
    if (invitePhase && !pastAdminReview) return 'Pending';
    return pastAdminReview ? 'Completed' : 'Pending';
  }

  if (stepKey === 'rn_review') {
    if (returned) return 'Pending';
    if (invitePhase && !pastRnReview) return 'Pending';
    return pastRnReview ? 'Completed' : 'Pending';
  }

  if (stepKey === 'final_download') {
    if (finalDone && row.downloaded) return 'Completed';
    return 'Pending';
  }

  return 'Pending';
};

type ActionNeeded = 'msw' | 'admin' | 'rn' | 'none';

const currentStepKey = (row: IspRow): string => {
  for (const step of ISP_STEPS) {
    if (getStepStatus(row, step.key) !== 'Completed') return step.key;
  }
  return 'final_download';
};

const actionNeededForRow = (row: IspRow): ActionNeeded => {
  const step = currentStepKey(row);
  const status = getStepStatus(row, step);
  if (status === 'Completed' && step === 'final_download') return 'none';
  if (step === 'sent_to_sw' || step === 'sw_signed') return 'msw';
  if (step === 'rn_review') return 'rn';
  if (step === 'admin_review' || step === 'final_download') return 'admin';
  return 'none';
};

const workflowLabel = (row: IspRow) => {
  const ws = clean(row.workflowStatus);
  const invitePhase =
    row.source === 'invite' ||
    INVITE_PENDING_STATUSES.has(ws.toLowerCase()) ||
    ws.toLowerCase().includes('sw_invited');

  if (invitePhase && row.swViewedAtMs) {
    return 'SW logged in and viewed member — awaiting submit';
  }
  if (invitePhase) {
    return 'Invited — awaiting SW submit';
  }
  if (!ws) return 'Not started';
  if (ws.includes('returned_to_sw') || clean(row.alftManagerReviewStatus).toLowerCase().includes('rejected_returned')) {
    return 'Sent back to SW for resubmission';
  }
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<IspRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [stepFilter, setStepFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<'all' | ActionNeeded>('all');
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<IspRow | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [layoutMode, setLayoutMode] = useState<IspLayoutMode>('desktop');
  const [reminderSavingId, setReminderSavingId] = useState('');
  const [bulkReminderSaving, setBulkReminderSaving] = useState(false);

  useEffect(() => {
    setLayoutMode(readIspLayoutMode());
  }, []);

  useEffect(() => {
    if (String(searchParams.get('log') || '') === '1') {
      router.replace('/admin/tools/isp-activity-log');
    }
  }, [router, searchParams]);

  const onLayoutModeChange = (mode: IspLayoutMode) => {
    setLayoutMode(mode);
    writeIspLayoutMode(mode);
  };

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
          const softDeleted =
            Boolean(data.removedFromIspTrackerAt) ||
            Boolean(data.ispTrackerSoftDeleted) ||
            clean(data.workflowStatus).toLowerCase().includes('removed_from_isp_tracker');
          if (softDeleted) return null;

          const sig = (data.alftSignature || {}) as Record<string, unknown>;
          const pre = (data.alftManagerPreReview || {}) as Record<string, unknown>;
          const final = (data.alftManagerReview || {}) as Record<string, unknown>;
          const memberId = clean(data.memberId);
          if (memberId) intakeByMember.set(memberId, docSnap.id);

          const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
          const sent = resolveSentToSw(activityLog);
          const viewed = resolveSwViewed(activityLog);

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
            rejectionReason: clean(final.rejectionReason),
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
            swViewedAtMs: viewed.atMs,
            swViewedBy: viewed.by,
            dailyActionReminderEnabled: true,
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
      const reminderByMember = new Map<string, boolean>();
      const inviteMetaByMember = new Map<
        string,
        { atMs: number; recipient: string; viewedAtMs: number; viewedBy: string }
      >();

      for (const docSnap of assignmentSnap.docs) {
        const data = docSnap.data() || {};
        const memberId = clean(data.memberId || docSnap.id);
        const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
        if (memberId && activityLog.length) activityByMember.set(memberId, activityLog);
        if (memberId) reminderByMember.set(memberId, isReminderEnabled(data.dailyActionReminderEnabled));

        const inviteFallbackMs = Math.max(
          toMs(data.workflowInvites?.invitedAt),
          toMs(data.workflowStepsAt?.swInviteSentAt)
        );
        const viewedFallbackMs = Math.max(
          toMs(data.swPortalLastViewedAt),
          toMs(data.swPortalFirstViewedAt)
        );
        const viewedFallbackBy =
          clean(data.swPortalLastViewedByName) || clean(data.swPortalLastViewedByEmail);
        const inviteRecipient =
          clean(data.assignedSwEmail) ||
          clean(
            (Array.isArray(data.swEmailDeliveryLog) ? data.swEmailDeliveryLog : []).find(
              (entry: any) => clean(entry?.status) === 'sent'
            )?.recipientEmail
          );
        if (memberId) {
          const sent = resolveSentToSw(activityLog, inviteFallbackMs, inviteRecipient);
          const viewed = resolveSwViewed(activityLog, viewedFallbackMs, viewedFallbackBy);
          inviteMetaByMember.set(memberId, {
            atMs: sent.atMs,
            recipient: sent.recipient,
            viewedAtMs: viewed.atMs,
            viewedBy: viewed.by,
          });
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
        const viewed = resolveSwViewed(activityLog, viewedFallbackMs, viewedFallbackBy);

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
          rejectionReason: '',
          mswSigned: false,
          rnSigned: false,
          downloaded: false,
          updatedAtMs: Math.max(
            toMs(data.updatedAt),
            inviteFallbackMs,
            sent.atMs,
            viewed.atMs,
            toMs(data.createdAt)
          ),
          source: 'invite',
          activityLog,
          latestActivityLabel: latestNonInviteActivityLabel(activityLog),
          sentToSwAtMs: sent.atMs,
          sentToSwLabel: sent.label,
          sentToSwRecipient: sent.recipient,
          swViewedAtMs: viewed.atMs,
          swViewedBy: viewed.by,
          dailyActionReminderEnabled: isReminderEnabled(data.dailyActionReminderEnabled),
        });
      }

      const mergedIntakeRows = intakeRows.map((row) => {
        const fromAssignment = row.memberId ? activityByMember.get(row.memberId) : undefined;
        const inviteMeta = row.memberId ? inviteMetaByMember.get(row.memberId) : undefined;
        const reminderEnabled = row.memberId
          ? reminderByMember.has(row.memberId)
            ? Boolean(reminderByMember.get(row.memberId))
            : true
          : true;
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
        const viewed = resolveSwViewed(
          deduped,
          Math.max(row.swViewedAtMs, inviteMeta?.viewedAtMs || 0),
          inviteMeta?.viewedBy || row.swViewedBy
        );
        return {
          ...row,
          activityLog: deduped,
          latestActivityLabel: latestNonInviteActivityLabel(deduped) || latestActivityLabel(deduped),
          sentToSwAtMs: sent.atMs,
          sentToSwLabel: sent.label,
          sentToSwRecipient: sent.recipient,
          swViewedAtMs: viewed.atMs,
          swViewedBy: viewed.by,
          dailyActionReminderEnabled: reminderEnabled,
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

  const persistReminderEnabled = async (memberId: string, enabled: boolean) => {
    if (!firestore || !memberId) throw new Error('Missing member');
    await setDoc(
      doc(firestore, 'alft_assignments', memberId),
      {
        memberId,
        dailyActionReminderEnabled: enabled,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const toggleRowReminder = async (row: IspRow) => {
    const memberId = clean(row.memberId);
    if (!memberId || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Cannot update reminder',
        description: 'This row is missing a member id.',
      });
      return;
    }
    const next = !row.dailyActionReminderEnabled;
    setReminderSavingId(row.id);
    try {
      await persistReminderEnabled(memberId, next);
      setRows((prev) =>
        prev.map((r) =>
          clean(r.memberId) === memberId ? { ...r, dailyActionReminderEnabled: next } : r
        )
      );
      toast({
        title: next ? 'Daily reminder on' : 'Daily reminder off',
        description: `${row.memberName}: emails ${next ? 'enabled' : 'disabled'} (9 AM PT).`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Reminder update failed',
        description: String(e?.message || e),
      });
    } finally {
      setReminderSavingId('');
    }
  };

  const setBulkReminders = async (enabled: boolean) => {
    if (!firestore) return;
    const targets = rows.filter((r) => clean(r.memberId));
    if (!targets.length) return;
    setBulkReminderSaving(true);
    try {
      const uniqueMemberIds = Array.from(new Set(targets.map((r) => clean(r.memberId))));
      for (let i = 0; i < uniqueMemberIds.length; i += 20) {
        const chunk = uniqueMemberIds.slice(i, i + 20);
        await Promise.all(chunk.map((memberId) => persistReminderEnabled(memberId, enabled)));
      }
      setRows((prev) => prev.map((r) => ({ ...r, dailyActionReminderEnabled: enabled })));
      toast({
        title: enabled ? 'Reminders on for all' : 'Reminders off for all',
        description: `Updated ${uniqueMemberIds.length} member${uniqueMemberIds.length === 1 ? '' : 's'}.`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Bulk reminder update failed',
        description: String(e?.message || e),
      });
      await loadRows();
    } finally {
      setBulkReminderSaving(false);
    }
  };

  const allRemindersOn = useMemo(
    () => rows.length > 0 && rows.every((r) => r.dailyActionReminderEnabled),
    [rows]
  );
  const remindersOnCount = useMemo(
    () => rows.filter((r) => r.dailyActionReminderEnabled).length,
    [rows]
  );

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
          description: `${row.memberName} was removed. Use ISP Activity Log → Undelete if this was accidental.`,
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
        title: 'ISP record removed',
        description: `${row.memberName} can start over. Undelete from ISP Activity Log if needed.`,
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

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: rows.length,
      completed: 0,
    };
    for (const step of ISP_STEPS) counts[step.key] = 0;
    for (const row of rows) {
      const key = currentStepKey(row);
      const atFinal = key === 'final_download' && getStepStatus(row, 'final_download') === 'Completed';
      if (atFinal) {
        counts.completed += 1;
      } else {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [rows]);

  const actionCounts = useMemo(() => {
    const counts = { msw: 0, admin: 0, rn: 0, none: 0 };
    for (const row of rows) {
      const action = actionNeededForRow(row);
      counts[action] += 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay =
          `${row.memberName} ${row.memberMrn} ${row.uploaderName} ${row.staffName} ${row.rnName} ${row.workflowStatus} ${row.latestActivityLabel} ${row.sentToSwLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (showPendingOnly) {
        const hasPending = ISP_STEPS.some((step) => getStepStatus(row, step.key) !== 'Completed');
        if (!hasPending) return false;
      }
      if (stepFilter === 'completed') {
        const done =
          currentStepKey(row) === 'final_download' && getStepStatus(row, 'final_download') === 'Completed';
        if (!done) return false;
      } else if (stepFilter !== 'all') {
        if (currentStepKey(row) !== stepFilter) return false;
        // Fully complete packets share final_download as currentStepKey — exclude them from in-progress Final.
        if (stepFilter === 'final_download' && getStepStatus(row, 'final_download') === 'Completed') {
          return false;
        }
      }
      if (actionFilter !== 'all' && actionNeededForRow(row) !== actionFilter) return false;
      return true;
    });
  }, [rows, search, showPendingOnly, stepFilter, actionFilter]);

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
    <div className={`container mx-auto space-y-4 p-4 sm:p-6 ${layoutMode === 'mobile' ? 'max-w-xl' : 'max-w-[1200px]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <IspLayoutModeToggle mode={layoutMode} onChange={onLayoutModeChange} />
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-activity-log">ISP Activity Log</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-workflow">ISP Workflow</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-assignment">SW ISP Assignments</Link>
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

      <div className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-slate-700">
          <button
            type="button"
            onClick={() => {
              setStepFilter('all');
              setActionFilter('all');
              setShowPendingOnly(false);
            }}
            className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${
              stepFilter === 'all' && actionFilter === 'all' && !showPendingOnly ? 'bg-slate-100 font-semibold' : ''
            }`}
          >
            Total <span className="tabular-nums">{stageCounts.all}</span>
          </button>
          {ISP_STEPS.map((step) => {
            const count = stageCounts[step.key] || 0;
            const active = stepFilter === step.key;
            return (
              <React.Fragment key={step.key}>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  title={step.label}
                  onClick={() => {
                    setStepFilter(step.key);
                    setActionFilter('all');
                    setShowPendingOnly(false);
                  }}
                  className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${active ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  {step.abbreviation} <span className="tabular-nums">{count}</span>
                </button>
              </React.Fragment>
            );
          })}
          <span className="text-slate-300">·</span>
          <button
            type="button"
            title="Fully complete"
            onClick={() => {
              setStepFilter('completed');
              setActionFilter('all');
              setShowPendingOnly(false);
            }}
            className={`rounded px-1.5 py-0.5 text-emerald-800 hover:bg-emerald-50 ${
              stepFilter === 'completed' ? 'bg-emerald-50 font-semibold' : ''
            }`}
          >
            Done <span className="tabular-nums">{stageCounts.completed}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-slate-600">
          <span className="pr-1 text-xs font-medium text-slate-500">Action Needed</span>
          {(
            [
              ['msw', 'MSW'],
              ['admin', 'Admin'],
              ['rn', 'RN'],
              ['none', 'None'],
            ] as Array<[ActionNeeded, string]>
          ).map(([key, label], idx) => (
            <React.Fragment key={key}>
              {idx > 0 ? <span className="text-slate-300">·</span> : null}
              <button
                type="button"
                onClick={() => {
                  setActionFilter(key);
                  setStepFilter('all');
                  setShowPendingOnly(false);
                }}
                className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${
                  actionFilter === key ? 'bg-slate-100 font-semibold' : ''
                }`}
              >
                {label} <span className="tabular-nums">{actionCounts[key]}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ISP Tracker</CardTitle>
            <Badge variant="outline">Workflow progress</Badge>
          </div>
          <CardDescription className="mt-1.5">
            One line per member. Open Details for staff/status. Full timelines live on the ISP Activity Log.
          </CardDescription>
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
            <select
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Filter by current stage"
            >
              <option value="all">Stage: All</option>
              {ISP_STEPS.map((step) => (
                <option key={step.key} value={step.key}>
                  Stage: {step.abbreviation}
                </option>
              ))}
              <option value="completed">Stage: Done</option>
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as 'all' | ActionNeeded)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Filter by action needed"
            >
              <option value="all">Action: All</option>
              <option value="msw">MSW action needed</option>
              <option value="admin">Admin action needed</option>
              <option value="rn">RN action needed</option>
              <option value="none">No action needed</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showPendingOnly}
                onChange={(e) => setShowPendingOnly(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Show incomplete only
            </label>
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-950">
              <Bell className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="whitespace-nowrap font-medium">Daily reminders</span>
              <Switch
                checked={allRemindersOn}
                disabled={bulkReminderSaving || loading || rows.length === 0}
                onCheckedChange={(checked) => void setBulkReminders(Boolean(checked))}
                aria-label="Bulk toggle daily action reminders"
              />
              <span className="text-xs text-amber-900/80">
                {bulkReminderSaving
                  ? 'Saving…'
                  : `${remindersOnCount}/${rows.length || 0} on · 9 AM PT`}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">{filteredRows.length} ISP packets</span>
          </div>

          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                <RotateCcw className="h-4 w-4 text-orange-700" /> Sent back to SW
              </span>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading || isAdminLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4">Loading ISP Tracker data…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No ISP invites or intakes found yet. Send an SW invite from ISP Workflow, or wait for SW portal submit.
            </p>
          ) : layoutMode === 'mobile' ? (
            <ul className="space-y-2">
              {filteredRows.map((row) => {
                const badge = statusBadge(row);
                const rowOpen = Boolean(expandedRows[row.id]);
                const detailHref =
                  row.source === 'intake'
                    ? `/admin/alft-tracker?focus=${encodeURIComponent(row.id)}`
                    : `/admin/alft-tracker?memberId=${encodeURIComponent(row.memberId)}`;
                return (
                  <li key={row.id} className="rounded-md border bg-white px-3 py-2.5">
                    <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                      <span className="shrink-0 font-medium">{row.memberName}</span>
                      <Badge
                        variant={badge.className ? 'outline' : 'secondary'}
                        className={`shrink-0 text-[10px] ${badge.className}`}
                      >
                        {badge.label}
                      </Badge>
                      <span className="shrink-0 text-xs text-muted-foreground">MRN {row.memberMrn}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 overflow-x-auto">
                      <div className="flex items-end gap-2.5">
                        {ISP_STEPS.map((step) => (
                          <StatusIndicator
                            key={`${row.id}-m-${step.key}`}
                            status={getStepStatus(row, step.key)}
                            formName={step.label}
                            shortLabel={step.abbreviation}
                            showLabel
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`h-8 w-8 shrink-0 p-0 ${
                                row.dailyActionReminderEnabled
                                  ? 'border-amber-300 text-amber-700'
                                  : 'text-muted-foreground'
                              }`}
                              onClick={() => void toggleRowReminder(row)}
                              disabled={reminderSavingId === row.id || bulkReminderSaving || !clean(row.memberId)}
                              aria-label={
                                row.dailyActionReminderEnabled
                                  ? 'Turn off daily reminder'
                                  : 'Turn on daily reminder'
                              }
                            >
                              {reminderSavingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : row.dailyActionReminderEnabled ? (
                                <Bell className="h-4 w-4" />
                              ) : (
                                <BellOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {row.dailyActionReminderEnabled
                              ? 'Daily reminder on (click to turn off)'
                              : 'Daily reminder off (click to turn on)'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="outline" size="sm" className="h-8 w-8 shrink-0 p-0">
                              <Link href={workflowHref(row)} aria-label="ISP Workflow">
                                <ClipboardList className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>ISP Workflow</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="outline" size="sm" className="h-8 w-8 shrink-0 p-0">
                              <Link href={detailHref} aria-label="Detail">
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Detail</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8 w-8 shrink-0 p-0"
                              onClick={() => setConfirmDeleteRow(row)}
                              disabled={deletingId === row.id}
                              aria-label="Delete"
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-xs text-blue-700 hover:underline"
                        onClick={() => setExpandedRows((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                      >
                        {rowOpen ? 'Hide' : 'Details'}
                      </button>
                    </div>
                    {rowOpen ? (
                      <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                        <div>
                          {row.healthPlan} · MRN {row.memberMrn}
                        </div>
                        <div>
                          MSW: {row.uploaderName} · Staff: {row.staffName} · RN: {row.rnName}
                        </div>
                        <div className="font-medium text-slate-700">{workflowLabel(row)}</div>
                        {row.rejectionReason ? (
                          <div className="rounded border border-orange-200 bg-orange-50 px-2 py-1.5 text-orange-950">
                            <span className="font-medium">Return comments: </span>
                            {row.rejectionReason}
                          </div>
                        ) : null}
                        {row.swViewedAtMs ? (
                          <div className="text-sky-800">
                            SW logged in and viewed member
                            {row.swViewedBy ? ` · ${row.swViewedBy}` : ''}
                            {formatWhen(row.swViewedAtMs) ? ` · ${formatWhen(row.swViewedAtMs)}` : ''}
                          </div>
                        ) : null}
                        <MemberLogOneLine row={row} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px] font-semibold">Member</TableHead>
                    {ISP_STEPS.map((step) => (
                      <TableHead key={step.key} className="w-[64px] p-2 text-center">
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
                    <TableHead className="w-[156px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const badge = statusBadge(row);
                    const rowOpen = Boolean(expandedRows[row.id]);
                    const detailHref =
                      row.source === 'intake'
                        ? `/admin/alft-tracker?focus=${encodeURIComponent(row.id)}`
                        : `/admin/alft-tracker?memberId=${encodeURIComponent(row.memberId)}`;
                    return (
                      <React.Fragment key={row.id}>
                        <TableRow>
                          <TableCell className="align-middle py-2">
                            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                              <span className="shrink-0 font-medium">{row.memberName}</span>
                              <Badge
                                variant={badge.className ? 'outline' : 'secondary'}
                                className={`shrink-0 text-[10px] ${badge.className}`}
                              >
                                {badge.label}
                              </Badge>
                              <span className="shrink-0 text-xs text-muted-foreground">MRN {row.memberMrn}</span>
                              <button
                                type="button"
                                className="shrink-0 text-xs text-blue-700 hover:underline"
                                onClick={() =>
                                  setExpandedRows((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                                }
                              >
                                {rowOpen ? 'Hide' : 'Details'}
                              </button>
                            </div>
                          </TableCell>
                          {ISP_STEPS.map((step) => (
                            <TableCell key={`${row.id}-${step.key}`} className="p-2 text-center align-middle">
                              <StatusIndicator status={getStepStatus(row, step.key)} formName={step.label} />
                            </TableCell>
                          ))}
                          <TableCell className="align-middle py-2 text-right">
                            <div className="inline-flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={`h-8 w-8 p-0 ${
                                        row.dailyActionReminderEnabled
                                          ? 'border-amber-300 text-amber-700'
                                          : 'text-muted-foreground'
                                      }`}
                                      onClick={() => void toggleRowReminder(row)}
                                      disabled={
                                        reminderSavingId === row.id ||
                                        bulkReminderSaving ||
                                        !clean(row.memberId)
                                      }
                                      aria-label={
                                        row.dailyActionReminderEnabled
                                          ? 'Turn off daily reminder'
                                          : 'Turn on daily reminder'
                                      }
                                    >
                                      {reminderSavingId === row.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : row.dailyActionReminderEnabled ? (
                                        <Bell className="h-4 w-4" />
                                      ) : (
                                        <BellOff className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {row.dailyActionReminderEnabled
                                      ? 'Daily reminder on (click to turn off)'
                                      : 'Daily reminder off (click to turn on)'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0">
                                      <Link href={workflowHref(row)} aria-label="ISP Workflow">
                                        <ClipboardList className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>ISP Workflow</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0">
                                      <Link href={detailHref} aria-label="Detail">
                                        <ExternalLink className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Detail</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => setConfirmDeleteRow(row)}
                                      disabled={deletingId === row.id}
                                      aria-label="Delete"
                                    >
                                      {deletingId === row.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                        {rowOpen ? (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={ISP_STEPS.length + 2} className="py-3">
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <div>
                                  {row.healthPlan} · MRN {row.memberMrn}
                                </div>
                                <div>
                                  MSW: {row.uploaderName} · Staff: {row.staffName} · RN: {row.rnName}
                                </div>
                                <div className="font-medium text-slate-700">{workflowLabel(row)}</div>
                                {row.rejectionReason ? (
                                  <div className="rounded border border-orange-200 bg-orange-50 px-2 py-1.5 text-orange-950">
                                    <span className="font-medium">Return comments: </span>
                                    {row.rejectionReason}
                                  </div>
                                ) : null}
                                {row.swViewedAtMs ? (
                                  <div className="text-sky-800">
                                    SW logged in and viewed member
                                    {row.swViewedBy ? ` · ${row.swViewedBy}` : ''}
                                    {formatWhen(row.swViewedAtMs) ? ` · ${formatWhen(row.swViewedAtMs)}` : ''}
                                  </div>
                                ) : null}
                                <MemberLogOneLine row={row} />
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
                    : 'This soft-deletes the current ISP / ALFT workflow for '}
                  <span className="font-medium text-foreground">
                    {confirmDeleteRow?.memberName || 'this member'}
                  </span>
                  {confirmDeleteRow?.memberMrn && confirmDeleteRow.memberMrn !== '—'
                    ? ` (MRN ${confirmDeleteRow.memberMrn})`
                    : ''}
                  {confirmDeleteRow?.source === 'invite' ? ' from the ISP Tracker list.' : '.'}
                </p>
                <p>
                  {confirmDeleteRow?.source === 'invite'
                    ? 'You can undelete from ISP Activity Log, or send a new SW invite from ISP Workflow. Clinical files stay on the assignment.'
                    : 'Signature links are cancelled so the member can start over. Undelete from ISP Activity Log if this was accidental. Download logs are kept.'}
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
