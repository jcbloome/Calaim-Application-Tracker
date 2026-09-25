'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Filter,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarDays,
} from 'lucide-react';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { normalizeIspAssessmentPurpose } from '@/lib/isp-visit-location';
import { buildH2022EndWarning } from '@/lib/h2022-end-warning';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BackToTop } from '@/components/ui/back-to-top';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  formatIspWorkflowActivityLabel,
  type IspWorkflowActivityEntry,
} from '@/lib/isp-workflow-activity';
import {
  type IspLayoutMode,
  readIspLayoutMode,
  writeIspLayoutMode,
} from '@/lib/isp-layout-mode';

type StepStatus = 'Completed' | 'Pending' | 'Returned' | 'Resent';

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
  /** Assigned social worker display name (from alft_assignments / intake). */
  swName: string;
  /** Assigned social worker email used for invites / reminders. */
  swEmail: string;
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
  /** True when ALFT cover-sheet package was emailed to Veronica / ILS. */
  sentToIls: boolean;
  sentToIlsAtIso?: string;
  sentToIlsManual?: boolean;
  updatedAtMs: number;
  source: 'intake' | 'invite';
  activityLog: IspWorkflowActivityEntry[];
  latestActivityLabel: string;
  sentToSwAtMs: number;
  sentToSwLabel: string;
  sentToSwRecipient: string;
  swViewedAtMs: number;
  swViewedBy: string;
  /** True when packet was re-sent to RN after the first send. */
  rnWasResent: boolean;
  rnResentAtMs: number;
  rnResentLabel: string;
  /** Default ON when unset; false only when explicitly disabled. */
  dailyActionReminderEnabled: boolean;
  lastActionReminderAtMs: number;
  lastActionReminderLabel: string;
  /** initial | review (reauth) | change_condition — from assignment / form. */
  assessmentPurpose: string;
  /** H2022 auth end approaching/ended — only populated for Reauth rows. */
  h2022EndWarning?: boolean;
  h2022DaysUntilEnd?: number | null;
  h2022WarningLabel?: string | null;
  h2022EndDate?: string | null;
  /** Clinical / support files on the member assignment (SW portal). */
  supportFiles: IspMemberSupportFile[];
};

type IspMemberSupportFile = {
  id: string;
  label: string;
  fileName: string;
  downloadURL: string;
  storagePath: string;
  uploadedAtLabel: string;
  raw: Record<string, unknown>;
};

const ISP_STEPS: IspStep[] = [
  { key: 'sent_to_sw', abbreviation: 'Sent SW', label: 'Sent to SW' },
  { key: 'sw_signed', abbreviation: 'SW Sign', label: 'SW Signed' },
  { key: 'admin_review', abbreviation: 'Admin', label: 'Admin Review' },
  { key: 'rn_review', abbreviation: 'RN', label: 'RN Review' },
  { key: 'final_download', abbreviation: 'Final', label: 'Final and Download' },
  { key: 'sent_to_ils', abbreviation: 'ILS', label: 'Sent to ILS' },
];

/** Progress icons on each tracker row (ILS is filter-only, not shown per row). */
const ISP_TRACKER_STEPS = ISP_STEPS.filter((step) => step.key !== 'sent_to_ils');

const TRACKER_STAGE_ICONS_WIDTH = 'w-[18rem] sm:w-[19.5rem]';

type StageIconFilterMode = 'action_needed' | 'complete';

const INVITE_PENDING_STATUSES = new Set([
  'sw_invited_pending_submission',
  'sw_form_in_progress',
  'sw_invited_to_portal',
]);

const clean = (value: unknown) => String(value || '').trim();

/** Last name key for A–Z sort ("Claudia Thompson" → thompson; "Thompson, Claudia" → thompson). */
const memberLastNameSortKey = (memberName: string) => {
  const name = clean(memberName);
  if (!name) return '';
  if (name.includes(',')) {
    return name.split(',')[0].trim().toLowerCase();
  }
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
};

/** Sent-to-SW / requested date next to Details: MM-DD-YYYY with time. */
const formatSentToSwDisplayDate = (atMs: number) => {
  if (!atMs || atMs <= 0) return '';
  const d = new Date(atMs);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const time = d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${mm}-${dd}-${yyyy}, ${time}`;
};

type ListSort =
  | 'name_asc'
  | 'name_desc'
  | 'requested_newest'
  | 'requested_oldest'
  | 'ils_newest'
  | 'ils_oldest'
  | 'none';

/** Prefer assigned SW name/email; fall back to invite recipient / uploader. */
const formatIspTrackerSwContact = (row: {
  swName?: string;
  swEmail?: string;
  uploaderName?: string;
  sentToSwRecipient?: string;
}) => {
  const name = clean(row.swName) || clean(row.uploaderName);
  const email = clean(row.swEmail) || clean(row.sentToSwRecipient);
  if (name && email) {
    if (name.toLowerCase() === email.toLowerCase()) return name;
    return `${name} · ${email}`;
  }
  return name || email || '';
};

/** Build searchable text so SW last name matches "First Last" or "Last, First". */
const personSearchBlob = (...parts: Array<string | undefined | null>) => {
  const tokens: string[] = [];
  for (const part of parts) {
    const raw = clean(part).toLowerCase();
    if (!raw) continue;
    tokens.push(raw);
    for (const token of raw.split(/[,\s/;|]+/).filter((t) => t.length >= 2)) {
      tokens.push(token);
    }
  }
  return tokens.join(' ');
};

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

const parseIspMemberSupportFiles = (raw: unknown): IspMemberSupportFile[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any, index: number) => {
      const downloadURL = clean(entry?.downloadURL);
      const storagePath = clean(entry?.storagePath || entry?.filePath || entry?.path);
      const uploadedAtMs = toMs(entry?.uploadedAt || entry?.uploadedAtIso || '');
      return {
        id: clean(entry?.id) || `support_${index}_${downloadURL.slice(-24)}`,
        label: clean(entry?.label),
        fileName: clean(entry?.fileName),
        downloadURL,
        storagePath,
        uploadedAtLabel: uploadedAtMs ? formatWhen(uploadedAtMs) : '',
        raw: entry && typeof entry === 'object' ? { ...(entry as Record<string, unknown>) } : {},
      };
    })
    .filter((entry) => Boolean(entry.downloadURL));
};

const reminderRoleLabel = (role: unknown) => {
  const r = clean(role).toLowerCase();
  if (r === 'msw') return 'SW';
  if (r === 'rn') return 'RN';
  if (r === 'admin') return 'Admin';
  return clean(role);
};

const formatLastActionReminderLabel = (atMs: number, role: string, recipient: string) => {
  if (!atMs) return '';
  const when = formatWhen(atMs);
  const who = reminderRoleLabel(role);
  const to = clean(recipient);
  return `Email sent successfully · ${when}${who ? ` to ${who}` : ''}${to ? ` (${to})` : ''}`;
};

const reminderRoleFromDetails = (details: unknown) => {
  const text = clean(details).toLowerCase();
  if (text.includes(' msw ') || text.startsWith('manual msw') || text.startsWith('daily msw')) return 'msw';
  if (text.includes(' rn ') || text.startsWith('manual rn') || text.startsWith('daily rn')) return 'rn';
  if (text.includes(' admin ') || text.startsWith('manual admin') || text.startsWith('daily admin')) return 'admin';
  return '';
};

const resolveLastActionReminder = (
  log: IspWorkflowActivityEntry[],
  fallback?: { atMs?: number; role?: string; recipient?: string }
): { atMs: number; label: string } => {
  const reminderEntries = log
    .filter((entry) => clean(entry.event) === 'action_needed_reminder_sent')
    .sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  const entry = reminderEntries[0] || null;
  const atMs = Math.max(toMs(entry?.atIso), Number(fallback?.atMs || 0) || 0);
  if (!atMs) return { atMs: 0, label: '' };
  const role = reminderRoleFromDetails(entry?.details) || clean(fallback?.role);
  const recipient = clean(entry?.recipientEmail) || clean(fallback?.recipient);
  return { atMs, label: formatLastActionReminderLabel(atMs, role, recipient) };
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

const resolveRnResend = (
  log: IspWorkflowActivityEntry[],
  alftRnResend: any
): { wasResent: boolean; atMs: number; label: string } => {
  const activityEntries = log
    .filter((entry) => clean(entry.event) === 'resent_to_rn')
    .sort((a, b) => toMs(b.atIso) - toMs(a.atIso));
  const activity = activityEntries[0] || null;
  const metaAtMs = toMs(alftRnResend?.resentAt);
  const atMs = Math.max(toMs(activity?.atIso), metaAtMs);
  const note = clean(alftRnResend?.note) || clean(activity?.details);
  if (!atMs && !activity && !alftRnResend) {
    return { wasResent: false, atMs: 0, label: '' };
  }
  const when = formatWhen(atMs);
  const label = when
    ? `Resent to RN: ${when}${note ? ` — ${note}` : ''}`
    : `Resent to RN${note ? ` — ${note}` : ''}`;
  return { wasResent: true, atMs, label };
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
  const final = clean(row.alftManagerReviewStatus).toLowerCase();
  const returned =
    ws.includes('returned_to_sw') ||
    ws.includes('waiting_sw_revision') ||
    (final.includes('rejected_returned') &&
      !ws.includes('awaiting_manager_review') &&
      !ws.includes('awaiting_rn') &&
      !ws.includes('awaiting_kaiser') &&
      !ws.includes('ready_to_send') &&
      !ws.includes('manager_review_complete') &&
      !ws.includes('completed'));

  if (returned) {
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

const formatIspPurposeShortLabel = (purpose?: string | null) => {
  const next = normalizeIspAssessmentPurpose(purpose);
  if (next === 'initial') return 'Initial';
  if (next === 'review') return 'Reauth';
  if (next === 'change_condition') return 'Change of condition';
  return '';
};

const LastActionReminderNote = ({ row }: { row: IspRow }) => {
  if (!row.lastActionReminderLabel) return null;
  const isSuccess = row.lastActionReminderLabel.toLowerCase().includes('email sent successfully');
  if (isSuccess) {
    const detail = row.lastActionReminderLabel
      .replace(/^Email sent successfully\s*·\s*/i, '')
      .trim();
    return (
      <Link
        href="/admin/email-logs"
        className="max-w-full truncate text-xs text-green-800 underline underline-offset-2 hover:text-green-950 sm:text-sm"
        title={row.lastActionReminderLabel}
      >
        Email Logs{detail ? ` · ${detail}` : ' · sent'}
      </Link>
    );
  }
  return (
    <div className="max-w-full whitespace-normal text-xs leading-snug text-amber-800 sm:text-sm">
      {row.lastActionReminderLabel}
    </div>
  );
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
  detail,
  onClick,
  dateBadge,
}: {
  status: StepStatus;
  formName: string;
  shortLabel?: string;
  showLabel?: boolean;
  detail?: string;
  onClick?: () => void;
  dateBadge?: string;
}) => {
  const statusConfig = {
    Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
    Pending: { Icon: XCircle, color: 'text-orange-500', label: 'Pending' },
    Returned: { Icon: RotateCcw, color: 'text-orange-700', label: 'Sent back to SW for resubmission' },
    Resent: { Icon: Mail, color: 'text-violet-700', label: 'Resent to RN — awaiting signature' },
  };
  const { Icon, color, label } = statusConfig[status];
  const tooltipLabel = clean(detail) || label;
  const interactive = typeof onClick === 'function';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex w-[3.25rem] flex-col items-center gap-0.5 rounded sm:w-14 ${
              interactive ? 'cursor-pointer hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500' : 'cursor-default'
            }`}
            onClick={(e) => {
              if (!interactive) return;
              e.preventDefault();
              e.stopPropagation();
              onClick?.();
            }}
            aria-label={
              interactive
                ? `${formName}: ${tooltipLabel}. Click to set Sent to ILS date.`
                : `${formName}: ${tooltipLabel}`
            }
          >
            {showLabel && shortLabel ? (
              <span className="text-center text-[10px] font-semibold leading-tight text-slate-600 sm:text-xs">
                {shortLabel}
              </span>
            ) : null}
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${color}`} />
            {dateBadge ? (
              <span className="max-w-full truncate text-center text-[9px] font-medium leading-tight text-teal-800">
                {dateBadge}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {formName}: {tooltipLabel}
            {interactive ? ' — click to set/edit date' : ''}
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
  // Prefer live workflowStatus. Stale alftManagerReview.rejected_* after SW resubmit
  // must not keep the row stuck as "returned" / SW Sign pending.
  const returned =
    ws.includes('returned_to_sw') ||
    ws.includes('waiting_sw_revision') ||
    (final.includes('rejected_returned') &&
      !ws.includes('awaiting_manager_review') &&
      !ws.includes('awaiting_rn') &&
      !ws.includes('awaiting_kaiser') &&
      !ws.includes('ready_to_send') &&
      !ws.includes('manager_review_complete') &&
      !ws.includes('completed'));
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
      ws.includes('awaiting_manager_review') ||
      ws.includes('submitted_by_sw') ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      ws.includes('awaiting_sw_signature') || // admin already approved; SW had signed to get here
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
    if (pastRnReview) return 'Completed';
    if (row.rnWasResent) return 'Resent';
    if (invitePhase) return 'Pending';
    return 'Pending';
  }

  if (stepKey === 'final_download') {
    if (finalDone && row.downloaded) return 'Completed';
    return 'Pending';
  }

  if (stepKey === 'sent_to_ils') {
    // Manual mark or cover-package send is enough to complete this step.
    if (row.sentToIls) return 'Completed';
    return 'Pending';
  }

  return 'Pending';
};

type ActionNeeded = 'msw' | 'admin' | 'rn' | 'none';

const isReturnedToSw = (row: IspRow): boolean => {
  const ws = clean(row.workflowStatus).toLowerCase();
  const final = clean(row.alftManagerReviewStatus).toLowerCase();
  return (
    ws.includes('returned_to_sw') ||
    ws.includes('waiting_sw_revision') ||
    (final.includes('rejected_returned') &&
      !ws.includes('awaiting_manager_review') &&
      !ws.includes('awaiting_rn') &&
      !ws.includes('awaiting_kaiser') &&
      !ws.includes('ready_to_send') &&
      !ws.includes('manager_review_complete') &&
      !ws.includes('completed'))
  );
};

const isInviteAwaitingSw = (row: IspRow): boolean => {
  const ws = clean(row.workflowStatus).toLowerCase();
  return (
    row.source === 'invite' ||
    INVITE_PENDING_STATUSES.has(ws) ||
    ws.includes('sw_invited') ||
    ws.includes('sw_form')
  );
};

const currentStepKey = (row: IspRow): string => {
  const ws = clean(row.workflowStatus).toLowerCase();
  const returned = isReturnedToSw(row);
  const invitePhase = isInviteAwaitingSw(row);
  const pastSwSign =
    !returned &&
    (row.mswSigned ||
      ws.includes('awaiting_manager_review') ||
      ws.includes('submitted_by_sw') ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      ws.includes('awaiting_sw_signature') ||
      ws.includes('completed') ||
      ws.includes('manager_review_complete') ||
      ws.includes('ready_to_send'));

  // Invite sent, SW has not signed/submitted yet → stage is Sent SW (awaiting SW).
  // Progress checkmarks still show Sent SW as Completed via getStepStatus.
  if (!returned && invitePhase && !pastSwSign) {
    return 'sent_to_sw';
  }

  for (const step of ISP_STEPS) {
    if (getStepStatus(row, step.key) !== 'Completed') return step.key;
  }
  return 'sent_to_ils';
};

const isIspPacketComplete = (row: IspRow): boolean =>
  currentStepKey(row) === 'sent_to_ils' && getStepStatus(row, 'sent_to_ils') === 'Completed';

const isSentToIlsRow = (row: IspRow) => Boolean(row.sentToIls) || isIspPacketComplete(row);

const sentToIlsSortMs = (row: IspRow) => {
  const iso = clean(row.sentToIlsAtIso);
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
};

const actionNeededForRow = (row: IspRow): ActionNeeded => {
  const step = currentStepKey(row);
  const status = getStepStatus(row, step);
  if (status === 'Completed' && step === 'sent_to_ils') return 'none';
  if (step === 'sent_to_sw' || step === 'sw_signed') return 'msw';
  if (step === 'rn_review') return 'rn';
  if (step === 'admin_review' || step === 'final_download' || step === 'sent_to_ils') return 'admin';
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

const coverSheetPackageHref = (row: IspRow) => {
  const memberId = clean(row.memberId);
  if (memberId) {
    return `/admin/tools/alft-cover-sheet-package?memberClientId=${encodeURIComponent(memberId)}`;
  }
  const mrn = clean(row.memberMrn);
  if (mrn && mrn !== '—') {
    return `/admin/tools/alft-cover-sheet-package?memberMrn=${encodeURIComponent(mrn)}`;
  }
  return '/admin/tools/alft-cover-sheet-package';
};

export default function IspTrackerPage() {
  const firestore = useFirestore();
  const storage = useStorage();
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
  const [stageIconFilterMode, setStageIconFilterMode] = useState<StageIconFilterMode>('action_needed');
  const [actionFilter, setActionFilter] = useState<'all' | ActionNeeded>('all');
  const [listSort, setListSort] = useState<ListSort>('name_asc');
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<IspRow | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [deletingSupportFileKey, setDeletingSupportFileKey] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [layoutMode, setLayoutMode] = useState<IspLayoutMode>('desktop');
  const [reminderSavingId, setReminderSavingId] = useState('');
  const [bulkReminderSaving, setBulkReminderSaving] = useState(false);
  const [manualReminderSendingId, setManualReminderSendingId] = useState('');
  const [reminderPreviewLoadingId, setReminderPreviewLoadingId] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{
    status: 'success' | 'failure';
    to: string;
    atIso: string;
    error?: string;
  } | null>(null);
  const [reminderCompose, setReminderCompose] = useState<{
    row: IspRow;
    targetRole: 'auto' | 'msw' | 'rn';
    role: string;
    roleLabel: string;
    recipientEmail: string;
    recipientName: string;
    memberName: string;
    mrn: string;
    stageLabel: string;
    subject: string;
    defaultSubject: string;
    nextAction: string;
    defaultNextAction: string;
    additionalNote: string;
    textPreview: string;
    actionUrl: string;
    ctaLabel: string;
    /** Optional dummy/test override of the To address. */
    overrideRecipientEmail: string;
  } | null>(null);
  const [sentToIlsRow, setSentToIlsRow] = useState<IspRow | null>(null);
  const [sentToIlsDate, setSentToIlsDate] = useState('');
  const [sentToIlsConfirmChecked, setSentToIlsConfirmChecked] = useState(false);
  const [sentToIlsSaving, setSentToIlsSaving] = useState(false);
  const [refreshingSwRnContacts, setRefreshingSwRnContacts] = useState(false);

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
      const preferredIntakeByMember = new Map<string, string>();
      const assignmentWorkflowByMember = new Map<
        string,
        {
          workflowStatus: string;
          workflowStage: string;
          swSubmittedSigned: boolean;
          needsSwRevision: boolean;
          sentToIls: boolean;
          sentToIlsAtIso: string;
          sentToIlsManual: boolean;
        }
      >();
      const sentToIlsByMemberId = new Set<string>();
      const sentToIlsByMrn = new Set<string>();
      const sentToIlsAtByMemberId = new Map<string, string>();
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
            Boolean(data.supersededByIntakeId) ||
            clean(data.workflowStatus).toLowerCase().includes('removed_from_isp_tracker') ||
            clean(data.workflowStatus).toLowerCase().includes('superseded_by_sw_resubmit');
          if (softDeleted) return null;

          const sig = (data.alftSignature || {}) as Record<string, unknown>;
          const pre = (data.alftManagerPreReview || {}) as Record<string, unknown>;
          const final = (data.alftManagerReview || {}) as Record<string, unknown>;
          const alftForm = (data.alftForm || {}) as Record<string, unknown>;
          const answers = ((alftForm.exactPacketAnswers || {}) as Record<string, unknown>) || {};
          const wsRaw = clean(data.workflowStatus).toLowerCase();
          const stageRaw = clean(data.workflowStage).toLowerCase();
          const memberId = clean(data.memberId);
          if (memberId) intakeByMember.set(memberId, docSnap.id);

          const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
          const sent = resolveSentToSw(activityLog);
          const viewed = resolveSwViewed(activityLog);
          const mswSigned = Boolean(
            sig.mswSignedAt ||
              alftForm.swSignedAt ||
              answers.p14_sw_signed_at ||
              wsRaw.includes('awaiting_manager_review') ||
              wsRaw.includes('submitted_by_sw') ||
              wsRaw.includes('awaiting_rn') ||
              wsRaw.includes('awaiting_kaiser_manager_final') ||
              wsRaw.includes('manager_review_complete') ||
              wsRaw.includes('ready_to_send') ||
              (wsRaw.includes('completed') && !wsRaw.includes('awaiting')) ||
              stageRaw.includes('submitted_by_sw')
          );

          return {
            id: docSnap.id,
            memberId,
            memberName: clean(data.memberName) || 'Member',
            memberMrn: clean(data.medicalRecordNumber || data.kaiserMrn) || '—',
            healthPlan: clean(data.healthPlan) || 'Kaiser',
            uploaderName: clean(data.uploaderName || data.uploaderEmail) || 'MSW',
            swName:
              clean(data.assignedSwName) ||
              clean(data.socialWorkerName) ||
              clean((data.answers as any)?.p1_assessor_name) ||
              '',
            swEmail: clean(data.assignedSwEmail || data.socialWorkerEmail) || '',
            staffName:
              clean(data.alftStaffName) ||
              clean(data.firstReviewerName) ||
              clean(data.assignedManager?.name) ||
              clean(data?.workflowRouting?.finalReviewOwnerName) ||
              clean(data.alftStaffEmail) ||
              '—',
            rnName: clean(data.alftRnName || data.alftRnEmail) || '—',
            workflowStatus: clean(data.workflowStatus),
            workflowStage: clean(data.workflowStage),
            status: clean(data.status),
            alftManagerPreReviewStatus: clean(pre.status),
            alftManagerReviewStatus: clean(final.status),
            rejectionReason: clean(final.rejectionReason),
            mswSigned,
            rnSigned: Boolean(sig.rnSignedAt),
            downloaded: Boolean(data.alftStaffDownloadedAt || data.alftLastDownloadLogId),
            sentToIls: Boolean(
              data.sentToIls ||
                data.coverSheetPackageSentAt ||
                data.coverSheetPackageSentAtIso ||
                clean(data.workflowStatus).toLowerCase().includes('sent_to_ils')
            ),
            sentToIlsAtIso:
              clean(data.sentToIlsAtIso) ||
              clean(data.coverSheetPackageSentAtIso) ||
              '',
            sentToIlsManual: Boolean(data.sentToIlsManual),
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
            lastActionReminderAtMs: 0,
            lastActionReminderLabel: '',
            assessmentPurpose:
              normalizeIspAssessmentPurpose(data.prefillPurpose) ||
              normalizeIspAssessmentPurpose(answers.p1_purpose) ||
              '',
            supportFiles: [],
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
      const reminderMetaByMember = new Map<string, { atMs: number; role: string; recipient: string }>();
      const inviteMetaByMember = new Map<
        string,
        { atMs: number; recipient: string; viewedAtMs: number; viewedBy: string }
      >();
      const swByMember = new Map<string, { name: string; email: string }>();
      const adminByMember = new Map<string, string>();
      const purposeByMember = new Map<string, string>();
      const supportFilesByMember = new Map<string, IspMemberSupportFile[]>();

      for (const docSnap of assignmentSnap.docs) {
        const data = docSnap.data() || {};
        const memberId = clean(data.memberId || docSnap.id);
        const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
        if (memberId && activityLog.length) activityByMember.set(memberId, activityLog);
        if (memberId) reminderByMember.set(memberId, isReminderEnabled(data.dailyActionReminderEnabled));
        if (memberId) {
          const files = parseIspMemberSupportFiles(data.swPortalSupportFiles);
          if (files.length) supportFilesByMember.set(memberId, files);
          const reminders = (data.reminders || {}) as Record<string, unknown>;
          reminderMetaByMember.set(memberId, {
            atMs: Math.max(
              Number(reminders.dailyActionLastSentAtMs || 0) || 0,
              Number(reminders.lastManualActionReminderAtMs || 0) || 0
            ),
            role: clean(reminders.lastManualActionReminderRole || reminders.dailyActionLastRole),
            recipient: clean(reminders.dailyActionLastRecipientEmail),
          });
          const swName = clean(data.assignedSwName);
          const swEmail = clean(data.assignedSwEmail);
          if (swName || swEmail) {
            swByMember.set(memberId, { name: swName, email: swEmail });
          }
          const adminName =
            clean(data.alftStaffName) ||
            clean(data.firstReviewerName) ||
            clean(data.assignedManagerName) ||
            clean(data?.workflowRouting?.finalReviewOwnerName) ||
            clean(data.alftStaffEmail) ||
            clean(data.firstReviewerEmail);
          if (adminName) adminByMember.set(memberId, adminName);
          const preferredIntake = clean(data.latestIntakeId);
          if (preferredIntake) preferredIntakeByMember.set(memberId, preferredIntake);
          assignmentWorkflowByMember.set(memberId, {
            workflowStatus: clean(data.workflowStatus),
            workflowStage: clean(data.workflowStage),
            swSubmittedSigned: Boolean(data?.workflowSteps?.swSubmittedSigned),
            needsSwRevision: Boolean(data.needsSwRevision),
            sentToIls: Boolean(
              data.sentToIls || data.coverSheetPackageSentAt || data.coverSheetPackageSentAtIso
            ),
            sentToIlsAtIso:
              clean(data.sentToIlsAtIso) ||
              clean(data.coverSheetPackageSentAtIso) ||
              '',
            sentToIlsManual: Boolean(data.sentToIlsManual),
          });
          const assignmentPurpose =
            normalizeIspAssessmentPurpose(data.prefillPurpose) ||
            normalizeIspAssessmentPurpose(data.assessmentPurpose);
          if (assignmentPurpose) purposeByMember.set(memberId, assignmentPurpose);
          if (data.sentToIls || data.coverSheetPackageSentAt || data.coverSheetPackageSentAtIso) {
            sentToIlsByMemberId.add(memberId);
            const mrn = clean(data.memberMrn || data.medicalRecordNumber).toLowerCase();
            if (mrn) sentToIlsByMrn.add(mrn);
            const atIso =
              clean(data.sentToIlsAtIso) || clean(data.coverSheetPackageSentAtIso) || '';
            if (atIso) sentToIlsAtByMemberId.set(memberId, atIso);
          }
        }

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
          ws.includes('sw_invite_cancelled') ||
          status.includes('sw_invite_cancelled') ||
          Boolean(data.removedFromIspTrackerAt) ||
          Boolean(data.swInviteCancelledAtIso || data?.workflowInvites?.cancelledAt)
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
        const reminder = resolveLastActionReminder(activityLog, reminderMetaByMember.get(memberId));

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
          swName: clean(data.assignedSwName) || '',
          swEmail: clean(data.assignedSwEmail) || inviteRecipient || '',
          staffName:
            clean(data.alftStaffName) ||
            clean(data.firstReviewerName) ||
            clean(data.assignedManagerName) ||
            clean(data?.workflowRouting?.finalReviewOwnerName) ||
            clean(data.workflowInvites?.invitedByName) ||
            '—',
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
          sentToIls: Boolean(
            data.sentToIls || data.coverSheetPackageSentAt || data.coverSheetPackageSentAtIso
          ),
          sentToIlsAtIso:
            clean(data.sentToIlsAtIso) || clean(data.coverSheetPackageSentAtIso) || '',
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
          lastActionReminderAtMs: reminder.atMs,
          lastActionReminderLabel: reminder.label,
          assessmentPurpose:
            normalizeIspAssessmentPurpose(data.prefillPurpose) ||
            normalizeIspAssessmentPurpose(data.assessmentPurpose) ||
            '',
          supportFiles: parseIspMemberSupportFiles(data.swPortalSupportFiles),
        });
      }

      const mergedIntakeRows = intakeRows.map((row) => {
        const fromAssignment = row.memberId ? activityByMember.get(row.memberId) : undefined;
        const inviteMeta = row.memberId ? inviteMetaByMember.get(row.memberId) : undefined;
        const swFromAssignment = row.memberId ? swByMember.get(row.memberId) : undefined;
        const assignmentWorkflow = row.memberId ? assignmentWorkflowByMember.get(row.memberId) : undefined;
        const purposeFromAssignment = row.memberId ? purposeByMember.get(row.memberId) : '';
        const reminderEnabled = row.memberId
          ? reminderByMember.has(row.memberId)
            ? Boolean(reminderByMember.get(row.memberId))
            : true
          : true;
        const reminderMeta = row.memberId ? reminderMetaByMember.get(row.memberId) : undefined;
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
        const reminder = resolveLastActionReminder(deduped, reminderMeta);
        const swName = clean(swFromAssignment?.name) || row.swName;
        const swEmail =
          clean(swFromAssignment?.email) || clean(sent.recipient) || row.swEmail || row.sentToSwRecipient;
        const adminFromAssignment = row.memberId ? adminByMember.get(row.memberId) : '';
        const staffName = clean(adminFromAssignment) || (row.staffName !== '—' ? row.staffName : '') || '—';

        // If assignment already advanced after SW resubmit but the intake doc is still stale
        // (returned / signature cleared), prefer assignment workflow for tracker stages.
        const intakeWs = clean(row.workflowStatus).toLowerCase();
        const assignmentWs = clean(assignmentWorkflow?.workflowStatus).toLowerCase();
        const assignmentAhead =
          Boolean(assignmentWorkflow) &&
          !Boolean(assignmentWorkflow?.needsSwRevision) &&
          (assignmentWs.includes('awaiting_manager_review') ||
            assignmentWs.includes('awaiting_rn') ||
            assignmentWs.includes('awaiting_kaiser') ||
            assignmentWs.includes('ready_to_send') ||
            assignmentWs.includes('manager_review_complete') ||
            Boolean(assignmentWorkflow?.swSubmittedSigned)) &&
          (intakeWs.includes('returned_to_sw') ||
            intakeWs.includes('waiting_sw_revision') ||
            (!row.mswSigned && assignmentWs.includes('awaiting_manager_review')));

        return {
          ...row,
          workflowStatus: assignmentAhead
            ? clean(assignmentWorkflow?.workflowStatus) || row.workflowStatus
            : row.workflowStatus,
          workflowStage: assignmentAhead
            ? clean(assignmentWorkflow?.workflowStage) || row.workflowStage
            : row.workflowStage,
          alftManagerReviewStatus: assignmentAhead ? '' : row.alftManagerReviewStatus,
          mswSigned: assignmentAhead ? true : row.mswSigned,
          sentToIls:
            row.sentToIls ||
            Boolean(assignmentWorkflow?.sentToIls) ||
            (row.memberId ? sentToIlsByMemberId.has(row.memberId) : false) ||
            sentToIlsByMrn.has(clean(row.memberMrn).toLowerCase()),
          sentToIlsAtIso:
            clean(row.sentToIlsAtIso) ||
            clean(assignmentWorkflow?.sentToIlsAtIso) ||
            (row.memberId ? sentToIlsAtByMemberId.get(row.memberId) || '' : '') ||
            '',
          sentToIlsManual: Boolean(row.sentToIlsManual || assignmentWorkflow?.sentToIlsManual),
          swName,
          swEmail,
          staffName,
          assessmentPurpose:
            normalizeIspAssessmentPurpose(purposeFromAssignment) ||
            normalizeIspAssessmentPurpose(row.assessmentPurpose) ||
            '',
          // Prefer assigned SW for the MSW column when assignment has a name.
          uploaderName: swName || row.uploaderName,
          activityLog: deduped,
          latestActivityLabel: latestNonInviteActivityLabel(deduped) || latestActivityLabel(deduped),
          sentToSwAtMs: sent.atMs,
          sentToSwLabel: sent.label,
          sentToSwRecipient: sent.recipient,
          swViewedAtMs: viewed.atMs,
          swViewedBy: viewed.by,
          dailyActionReminderEnabled: reminderEnabled,
          lastActionReminderAtMs: reminder.atMs,
          lastActionReminderLabel: reminder.label,
          supportFiles:
            (row.memberId ? supportFilesByMember.get(row.memberId) : undefined) ||
            row.supportFiles ||
            [],
        };
      });

      // One row per member: prefer assignment.latestIntakeId, else newest updated intake.
      const dedupedByMember = new Map<string, IspRow>();
      const orphanIntakeRows: IspRow[] = [];
      for (const row of mergedIntakeRows) {
        const memberId = clean(row.memberId);
        if (!memberId) {
          orphanIntakeRows.push(row);
          continue;
        }
        const preferredId = preferredIntakeByMember.get(memberId);
        const existing = dedupedByMember.get(memberId);
        if (!existing) {
          dedupedByMember.set(memberId, row);
          continue;
        }
        if (preferredId) {
          if (row.id === preferredId) {
            dedupedByMember.set(memberId, row);
          } else if (existing.id !== preferredId && row.updatedAtMs >= existing.updatedAtMs) {
            dedupedByMember.set(memberId, row);
          }
          continue;
        }
        if (row.updatedAtMs >= existing.updatedAtMs) {
          dedupedByMember.set(memberId, row);
        }
      }

      const next = [...dedupedByMember.values(), ...orphanIntakeRows, ...inviteRows].sort(
        (a, b) => b.updatedAtMs - a.updatedAtMs
      );

      // Fallback: packages emailed to Veronica count as Sent to ILS.
      try {
        const pkgSnap = await getDocs(
          query(collection(firestore, 'alft_cover_sheet_packages'), where('status', '==', 'sent'), limit(300))
        );
        for (const docSnap of pkgSnap.docs) {
          const data = docSnap.data() || {};
          const clientId = clean(data.memberClientId);
          const mrn = clean(data.memberMrn).toLowerCase();
          const atIso =
            clean(data.sentAtIso) ||
            clean(data.coverSheetPackageSentAtIso) ||
            (toMs(data.sentAt) ? new Date(toMs(data.sentAt)).toISOString() : '');
          if (clientId) {
            sentToIlsByMemberId.add(clientId);
            if (atIso && !sentToIlsAtByMemberId.has(clientId)) sentToIlsAtByMemberId.set(clientId, atIso);
          }
          if (mrn) sentToIlsByMrn.add(mrn);
        }
      } catch {
        // optional index / collection may be unavailable
      }

      const withSentToIls = next.map((row) => ({
        ...row,
        sentToIls:
          row.sentToIls ||
          (row.memberId ? sentToIlsByMemberId.has(row.memberId) : false) ||
          sentToIlsByMrn.has(clean(row.memberMrn).toLowerCase()),
        sentToIlsAtIso:
          clean(row.sentToIlsAtIso) ||
          (row.memberId ? sentToIlsAtByMemberId.get(row.memberId) || '' : '') ||
          '',
      }));

      // Reauth rows: look up H2022 end date from members cache for approaching/ended warning.
      const reauthMemberIds = [
        ...new Set(
          withSentToIls
            .filter((row) => normalizeIspAssessmentPurpose(row.assessmentPurpose) === 'review')
            .map((row) => clean(row.memberId))
            .filter(Boolean)
        ),
      ];
      const h2022ByMember = new Map<
        string,
        ReturnType<typeof buildH2022EndWarning>
      >();
      if (reauthMemberIds.length) {
        await Promise.all(
          reauthMemberIds.map(async (memberId) => {
            try {
              const snap = await getDoc(doc(firestore, 'caspio_members_cache', memberId));
              if (!snap.exists()) return;
              const data = snap.data() || {};
              const plan =
                clean(data.CalAIM_MCO) ||
                clean(data.healthPlan) ||
                clean(data.Health_Plan) ||
                'Kaiser';
              const endRaw =
                data.Authorization_End_Date_H2022 ||
                data.Auth_End_Date_H2022 ||
                data.H2022_End_Date ||
                '';
              h2022ByMember.set(memberId, buildH2022EndWarning(plan, endRaw));
            } catch {
              // cache miss / permission — skip warning for this member
            }
          })
        );
      }

      setRows(
        withSentToIls.map((row) => {
          if (normalizeIspAssessmentPurpose(row.assessmentPurpose) !== 'review') return row;
          const memberId = clean(row.memberId);
          const warn = memberId ? h2022ByMember.get(memberId) : undefined;
          if (!warn) return row;
          return {
            ...row,
            h2022EndWarning: warn.h2022EndWarning,
            h2022DaysUntilEnd: warn.h2022DaysUntilEnd,
            h2022WarningLabel: warn.h2022WarningLabel,
            h2022EndDate: warn.h2022EndDate,
          };
        })
      );
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

  const refreshSwRnContactsFromCaspio = async () => {
    const user = auth?.currentUser;
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required' });
      return;
    }
    const memberIds = [
      ...new Set(rows.map((row) => clean(row.memberId)).filter(Boolean)),
    ];
    if (!memberIds.length) {
      toast({
        variant: 'destructive',
        title: 'No members to refresh',
        description: 'Load tracker rows first, then refresh SW/RN emails from Caspio.',
      });
      return;
    }
    setRefreshingSwRnContacts(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/alft/refresh-sw-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ memberIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to refresh SW/RN contacts'));
      }
      const emailChanges = Array.isArray(data.updates)
        ? data.updates.filter((u: any) => u.swEmailChanged || u.rnEmailChanged)
        : [];
      const sample = emailChanges
        .slice(0, 3)
        .map((u: any) => {
          const parts: string[] = [u.memberName || u.memberId];
          if (u.swEmailChanged) {
            parts.push(`SW ${u.previousSwEmail || '—'} → ${u.newSwEmail}`);
          }
          if (u.rnEmailChanged) {
            parts.push(`RN ${u.previousRnEmail || '—'} → ${u.newRnEmail}`);
          }
          return parts.join(': ');
        })
        .join(' · ');
      toast({
        title:
          emailChanges.length > 0
            ? `Updated ${emailChanges.length} SW/RN email(s) from Caspio`
            : 'SW/RN contacts checked',
        description:
          emailChanges.length > 0
            ? sample + (emailChanges.length > 3 ? ` · +${emailChanges.length - 3} more` : '')
            : String(data.message || 'Emails already match Caspio.'),
        className:
          emailChanges.length > 0
            ? 'bg-blue-50 text-blue-950 border-blue-200'
            : undefined,
      });
      await loadRows();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not refresh SW/RN from Caspio',
        description: String(e?.message || e),
      });
    } finally {
      setRefreshingSwRnContacts(false);
    }
  };

  const openSentToIlsDialog = (row: IspRow) => {
    const existingIso = clean(row.sentToIlsAtIso);
    setSentToIlsRow(row);
    setSentToIlsDate(existingIso ? existingIso.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setSentToIlsConfirmChecked(Boolean(row.sentToIls));
  };

  const saveSentToIlsFromTracker = async () => {
    if (!firestore || !sentToIlsRow) return;
    const memberId = clean(sentToIlsRow.memberId);
    if (!memberId) {
      toast({
        variant: 'destructive',
        title: 'Missing member id',
        description: 'Cannot update Sent to ILS without a member id.',
      });
      return;
    }
    if (!sentToIlsConfirmChecked) {
      toast({
        variant: 'destructive',
        title: 'Confirmation required',
        description: 'Check the box to confirm this ISP was sent to ILS.',
      });
      return;
    }
    const ymd = clean(sentToIlsDate) || new Date().toISOString().slice(0, 10);
    const iso = `${ymd}T12:00:00.000Z`;
    setSentToIlsSaving(true);
    try {
      const stamp = {
        sentToIls: true,
        sentToIlsAt: serverTimestamp(),
        sentToIlsAtIso: iso,
        sentToIlsManual: true,
        sentToIlsMarkedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(firestore, 'alft_assignments', memberId), stamp, { merge: true });
      if (sentToIlsRow.source === 'intake' && sentToIlsRow.id && !sentToIlsRow.id.startsWith('invite:')) {
        await setDoc(doc(firestore, 'standalone_upload_submissions', sentToIlsRow.id), stamp, {
          merge: true,
        });
      }
      setRows((prev) =>
        prev.map((r) =>
          clean(r.memberId) === memberId || r.id === sentToIlsRow.id
            ? { ...r, sentToIls: true, sentToIlsAtIso: iso, sentToIlsManual: true }
            : r
        )
      );
      setSentToIlsRow(null);
      toast({
        title: 'Marked Sent to ILS',
        description: `${sentToIlsRow.memberName}: archived as of ${ymd} (hidden from active tracker).`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update Sent to ILS',
        description: String(e?.message || e),
      });
    } finally {
      setSentToIlsSaving(false);
    }
  };

  const clearSentToIlsFromTracker = async () => {
    if (!firestore || !sentToIlsRow) return;
    const memberId = clean(sentToIlsRow.memberId);
    if (!memberId) return;
    setSentToIlsSaving(true);
    try {
      const clearStamp = {
        sentToIls: false,
        sentToIlsAt: null,
        sentToIlsAtIso: null,
        sentToIlsManual: false,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(firestore, 'alft_assignments', memberId), clearStamp, { merge: true });
      if (sentToIlsRow.source === 'intake' && sentToIlsRow.id && !sentToIlsRow.id.startsWith('invite:')) {
        await setDoc(doc(firestore, 'standalone_upload_submissions', sentToIlsRow.id), clearStamp, {
          merge: true,
        });
      }
      setRows((prev) =>
        prev.map((r) =>
          clean(r.memberId) === memberId || r.id === sentToIlsRow.id
            ? { ...r, sentToIls: false, sentToIlsAtIso: '', sentToIlsManual: false }
            : r
        )
      );
      setSentToIlsRow(null);
      toast({
        title: 'Cleared Sent to ILS',
        description: `${sentToIlsRow.memberName}: ILS status set back to pending.`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not clear Sent to ILS',
        description: String(e?.message || e),
      });
    } finally {
      setSentToIlsSaving(false);
    }
  };

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

  const openActionReminderPreview = async (
    row: IspRow,
    targetRole: 'auto' | 'msw' | 'rn'
  ) => {
    const memberId = clean(row.memberId);
    const user = auth?.currentUser;
    if (!memberId || !user) {
      toast({
        variant: 'destructive',
        title: 'Cannot preview reminder',
        description: !user ? 'Please sign in again.' : 'This row is missing a member id.',
      });
      return;
    }
    setReminderPreviewLoadingId(row.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/alft/reminders/send-action-needed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, memberId, targetRole, preview: true }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Preview failed (HTTP ${res.status})`));
      }
      setReminderCompose({
        row,
        targetRole,
        role: String(data.role || targetRole),
        roleLabel: String(data.roleLabel || ''),
        recipientEmail: String(data.recipientEmail || ''),
        recipientName: String(data.recipientName || ''),
        memberName: String(data.memberName || row.memberName || 'Member'),
        mrn: String(data.mrn || row.memberMrn || ''),
        stageLabel: String(data.stageLabel || ''),
        subject: String(data.subject || data.defaultSubject || ''),
        defaultSubject: String(data.defaultSubject || data.subject || ''),
        nextAction: String(data.nextAction || data.defaultNextAction || ''),
        defaultNextAction: String(data.defaultNextAction || data.nextAction || ''),
        additionalNote: '',
        textPreview: String(data.textPreview || ''),
        actionUrl: String(data.actionUrl || ''),
        ctaLabel: String(data.ctaLabel || 'Open'),
        overrideRecipientEmail: '',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not load reminder preview',
        description: String(e?.message || e),
      });
    } finally {
      setReminderPreviewLoadingId('');
    }
  };

  const sendManualActionReminder = async () => {
    const compose = reminderCompose;
    if (!compose) return;
    const memberId = clean(compose.row.memberId);
    const user = auth?.currentUser;
    if (!memberId || !user) {
      toast({
        variant: 'destructive',
        title: 'Cannot send reminder',
        description: !user ? 'Please sign in again.' : 'This row is missing a member id.',
      });
      return;
    }
    setManualReminderSendingId(compose.row.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/alft/reminders/send-action-needed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          memberId,
          targetRole: compose.targetRole,
          customSubject: clean(compose.subject),
          customNextAction: clean(compose.nextAction),
          additionalNote: clean(compose.additionalNote),
          overrideRecipientEmail: clean(compose.overrideRecipientEmail) || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Send failed (HTTP ${res.status})`));
      }
      const roleLabel =
        data?.role === 'msw' ? 'Social worker' : data?.role === 'rn' ? 'RN' : data?.role === 'admin' ? 'Admin' : 'Recipient';
      const deliveredTo = String(data?.recipientEmail || '');
      toast({
        title: 'Email sent successfully',
        description: `${roleLabel} · ${deliveredTo}${
          data?.overrideUsed ? ' (test override)' : ''
        }${data?.stageLabel ? ` · ${data.stageLabel}` : ''}. Logged in Admin → Email Logs.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      const nowMs = Date.now();
      const nextLabel = formatLastActionReminderLabel(
        nowMs,
        String(data?.role || ''),
        deliveredTo
      );
      setRows((prev) =>
        prev.map((r) =>
          clean(r.memberId) === memberId
            ? { ...r, lastActionReminderAtMs: nowMs, lastActionReminderLabel: nextLabel }
            : r
        )
      );
      setReminderCompose(null);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not send reminder',
        description: String(e?.message || e),
      });
    } finally {
      setManualReminderSendingId('');
    }
  };

  const sendIspTrackerTestEmail = async () => {
    const to = clean(testEmailTo).toLowerCase();
    const user = auth?.currentUser;
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Sign-in required',
        description: 'Please sign in again before sending a test email.',
      });
      return;
    }
    if (!to || !to.includes('@')) {
      toast({
        variant: 'destructive',
        title: 'Enter a test email',
        description: 'Use a real inbox you can check (e.g. your own address).',
      });
      return;
    }
    setTestEmailSending(true);
    setTestEmailResult(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/alft/reminders/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, to }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Test send failed (HTTP ${res.status})`));
      }
      const atIso = String(data?.sentAtIso || new Date().toISOString());
      setTestEmailResult({ status: 'success', to, atIso });
      toast({
        title: 'Email sent successfully',
        description: `Test ISP reminder sent to ${to}. Check that inbox and Admin → Email Logs.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (e: any) {
      const message = String(e?.message || e);
      setTestEmailResult({
        status: 'failure',
        to,
        atIso: new Date().toISOString(),
        error: message,
      });
      toast({
        variant: 'destructive',
        title: 'Test email failed',
        description: message,
      });
    } finally {
      setTestEmailSending(false);
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

  const removeMemberSupportFile = async (row: IspRow, file: IspMemberSupportFile) => {
    const memberId = clean(row.memberId);
    if (!memberId || !firestore) {
      toast({ variant: 'destructive', title: 'Missing member assignment' });
      return;
    }
    if (
      !window.confirm(
        `Remove “${file.label || file.fileName || 'file'}” from ${row.memberName}'s files?`
      )
    ) {
      return;
    }
    const fileKey = `${row.id}:${file.id}`;
    setDeletingSupportFileKey(fileKey);
    try {
      if (storage && file.storagePath) {
        try {
          await deleteObject(ref(storage, file.storagePath));
        } catch (storageError: any) {
          const code = String(storageError?.code || '');
          if (code !== 'storage/object-not-found') {
            console.warn('ISP tracker support file storage delete:', storageError);
          }
        }
      }
      const assignmentRef = doc(firestore, 'alft_assignments', memberId);
      const snap = await getDoc(assignmentRef);
      const existing = snap.exists()
        ? parseIspMemberSupportFiles((snap.data() as any)?.swPortalSupportFiles)
        : row.supportFiles || [];
      const nextRaw = existing
        .filter((entry) => {
          if (file.id && entry.id && entry.id === file.id) return false;
          if (file.downloadURL && entry.downloadURL === file.downloadURL) return false;
          if (file.storagePath && entry.storagePath && entry.storagePath === file.storagePath) {
            return false;
          }
          return true;
        })
        .map((entry) => entry.raw);
      await setDoc(
        assignmentRef,
        {
          memberId,
          swPortalSupportFiles: nextRaw,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const nextFiles = parseIspMemberSupportFiles(nextRaw);
      setRows((prev) =>
        prev.map((r) =>
          clean(r.memberId) === memberId ? { ...r, supportFiles: nextFiles } : r
        )
      );
      toast({
        title: 'File removed',
        description: `${file.label || file.fileName || 'File'} removed from member files.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not remove file',
        description: String(error?.message || error),
      });
    } finally {
      setDeletingSupportFileKey('');
    }
  };

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
      all: 0,
      completed: 0,
      returned: 0,
      sent_to_ils: 0,
    };
    for (const step of ISP_TRACKER_STEPS) counts[step.key] = 0;
    for (const row of rows) {
      if (isSentToIlsRow(row)) {
        counts.sent_to_ils += 1;
        counts.completed += 1;
        continue;
      }
      counts.all += 1;
      if (ISP_TRACKER_STEPS.some((step) => getStepStatus(row, step.key) === 'Returned')) {
        counts.returned += 1;
      }
      const key = currentStepKey(row);
      if (key === 'sent_to_ils') {
        // Final done, waiting on ILS mark — count under Final.
        counts.final_download = (counts.final_download || 0) + 1;
      } else {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [rows]);

  const stageCompleteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const step of ISP_TRACKER_STEPS) {
      counts[step.key] = rows.filter(
        (row) => !isSentToIlsRow(row) && getStepStatus(row, step.key) === 'Completed'
      ).length;
    }
    return counts;
  }, [rows]);

  const actionCounts = useMemo(() => {
    const counts = { msw: 0, admin: 0, rn: 0, none: 0 };
    for (const row of rows) {
      if (isSentToIlsRow(row)) continue;
      const action = actionNeededForRow(row);
      counts[action] += 1;
    }
    return counts;
  }, [rows]);

  const viewingSentToIls =
    stepFilter === 'sent_to_ils' ||
    stepFilter === 'completed' ||
    listSort === 'ils_newest' ||
    listSort === 'ils_oldest';
  /** Browse/search across all ISPs including Sent to ILS archive. */
  const viewingGlobal = stepFilter === 'global' || Boolean(clean(search));

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    const showIlsArchive = viewingSentToIls;
    const showGlobal = stepFilter === 'global' || Boolean(q);
    const filtered = rows.filter((row) => {
      if (q) {
        const hay = personSearchBlob(
          row.memberName,
          row.memberMrn,
          row.uploaderName,
          row.swName,
          row.swEmail,
          row.sentToSwRecipient,
          row.staffName,
          row.rnName,
          row.workflowStatus,
          row.latestActivityLabel,
          row.sentToSwLabel,
          row.lastActionReminderLabel,
          row.swViewedBy
        );
        if (!hay.includes(q)) return false;
        // Name/MRN search is always global — do not hide Sent to ILS matches.
        return true;
      }
      if (showIlsArchive) {
        // Explicit Sent to ILS archive view.
        return isSentToIlsRow(row);
      }
      if (showGlobal) {
        // All ISPs including Sent to ILS; still allow action filter.
        if (actionFilter !== 'all' && actionNeededForRow(row) !== actionFilter) return false;
        return true;
      }
      // Default tracker: hide packets already sent to ILS.
      if (isSentToIlsRow(row)) return false;
      if (showPendingOnly && isIspPacketComplete(row)) return false;
      if (stepFilter === 'returned') {
        if (!ISP_TRACKER_STEPS.some((step) => getStepStatus(row, step.key) === 'Returned')) return false;
      } else if (stepFilter !== 'all' && stepFilter !== 'global') {
        if (stageIconFilterMode === 'complete') {
          if (getStepStatus(row, stepFilter) !== 'Completed') return false;
        } else {
          // Action needed at this stage (current pending step).
          let key = currentStepKey(row);
          if (key === 'sent_to_ils') key = 'final_download';
          if (key !== stepFilter) return false;
        }
      }
      if (actionFilter !== 'all' && actionNeededForRow(row) !== actionFilter) return false;
      return true;
    });
    if (listSort === 'none') return filtered;
    if (listSort === 'ils_newest' || listSort === 'ils_oldest') {
      const dir = listSort === 'ils_newest' ? -1 : 1;
      return [...filtered].sort((a, b) => {
        const aMs = sentToIlsSortMs(a);
        const bMs = sentToIlsSortMs(b);
        if (aMs !== bMs) {
          if (aMs === 0) return 1;
          if (bMs === 0) return -1;
          return (aMs - bMs) * dir;
        }
        return (
          memberLastNameSortKey(a.memberName).localeCompare(memberLastNameSortKey(b.memberName)) ||
          clean(a.memberName).localeCompare(clean(b.memberName))
        );
      });
    }
    if (listSort === 'requested_newest' || listSort === 'requested_oldest') {
      const dir = listSort === 'requested_newest' ? -1 : 1;
      return [...filtered].sort((a, b) => {
        const aMs = a.sentToSwAtMs > 0 ? a.sentToSwAtMs : 0;
        const bMs = b.sentToSwAtMs > 0 ? b.sentToSwAtMs : 0;
        if (aMs !== bMs) {
          // Rows with no sent/requested date sink to the end for both directions.
          if (aMs === 0) return 1;
          if (bMs === 0) return -1;
          return (aMs - bMs) * dir;
        }
        return (
          memberLastNameSortKey(a.memberName).localeCompare(memberLastNameSortKey(b.memberName)) ||
          clean(a.memberName).localeCompare(clean(b.memberName))
        );
      });
    }
    const dir = listSort === 'name_asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const lastCmp =
        memberLastNameSortKey(a.memberName).localeCompare(memberLastNameSortKey(b.memberName)) * dir;
      if (lastCmp !== 0) return lastCmp;
      return clean(a.memberName).localeCompare(clean(b.memberName)) * dir;
    });
  }, [
    rows,
    search,
    showPendingOnly,
    stepFilter,
    actionFilter,
    listSort,
    stageIconFilterMode,
    viewingSentToIls,
  ]);

  const stepFilterLabel = useMemo(() => {
    if (viewingSentToIls) return 'Sent to ILS';
    if (stepFilter === 'global' || clean(search)) return 'Global';
    if (stepFilter === 'all') return 'Active';
    if (stepFilter === 'returned') return 'Sent back';
    return ISP_STEPS.find((step) => step.key === stepFilter)?.label || 'Stage';
  }, [stepFilter, viewingSentToIls, search]);

  const applyStageIconFilter = (stepKey: string) => {
    setShowPendingOnly(false);
    setActionFilter('all');
    // Leave ILS archive when filtering active stages.
    if (listSort === 'ils_newest' || listSort === 'ils_oldest') {
      setListSort('name_asc');
    }
    if (stepFilter === stepKey) {
      // Second click clears → native tracker (no stage filter).
      setStepFilter('all');
      setStageIconFilterMode('action_needed');
      return;
    }
    setStepFilter(stepKey);
    setStageIconFilterMode('action_needed');
  };

  const clearStageFilters = () => {
    setStepFilter('all');
    setActionFilter('all');
    setShowPendingOnly(false);
    setStageIconFilterMode('action_needed');
    if (listSort === 'ils_newest' || listSort === 'ils_oldest') {
      setListSort('name_asc');
    }
  };

  const showGlobalIspList = () => {
    setStepFilter('global');
    setShowPendingOnly(false);
    setActionFilter('all');
    if (listSort === 'ils_newest' || listSort === 'ils_oldest') {
      setListSort('name_asc');
    }
  };

  const showSentToIlsArchive = (sort: 'ils_newest' | 'ils_oldest' = 'ils_newest') => {
    setStepFilter('sent_to_ils');
    setShowPendingOnly(false);
    setActionFilter('all');
    setListSort(sort);
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
    <div className={`container mx-auto space-y-4 p-4 sm:p-6 ${layoutMode === 'mobile' ? 'max-w-xl' : 'max-w-[1200px]'}`}>
      <div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur sm:-mx-6 sm:px-6">
        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="mb-2 text-sm font-semibold">Legend</h3>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {ISP_STEPS.map((step) => (
              <span key={step.key} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" aria-hidden />
                <span>
                  <strong className="font-mono text-slate-700">{step.abbreviation}</strong>
                  <span className="mx-1 text-slate-400">—</span>
                  {step.label}
                </span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-orange-500" /> Pending / action needed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4 text-orange-700" /> Sent back to SW
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-violet-700" /> Resent to RN
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-teal-600" /> Sent to ILS
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <IspLayoutModeToggle mode={layoutMode} onChange={onLayoutModeChange} />
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/email-logs">
            <Mail className="mr-2 h-4 w-4" />
            Email Logs
          </Link>
        </Button>
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
            ISP Download Archive
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/alft-cover-sheet-package">ILS Member Package Checklist</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refreshSwRnContactsFromCaspio()}
          disabled={loading || refreshingSwRnContacts || rows.length === 0}
          title="Pull latest social worker and RN emails from Caspio and update tracker contacts"
          className="border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100"
        >
          {refreshingSwRnContacts ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh SW/RN emails
        </Button>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-slate-700">
          <button
            type="button"
            onClick={clearStageFilters}
            className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${
              stepFilter === 'all' &&
              actionFilter === 'all' &&
              !showPendingOnly &&
              !viewingSentToIls &&
              !viewingGlobal
                ? 'bg-slate-100 font-semibold'
                : ''
            }`}
          >
            Total <span className="tabular-nums">{stageCounts.all}</span>
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={showGlobalIspList}
            title="Show all ISPs including Sent to ILS"
            className={`rounded px-1.5 py-0.5 hover:bg-sky-50 ${
              viewingGlobal && !viewingSentToIls ? 'bg-sky-50 font-semibold text-sky-950' : ''
            }`}
          >
            Global <span className="tabular-nums">{rows.length}</span>
          </button>
          {ISP_TRACKER_STEPS.map((step) => {
            const count =
              stageIconFilterMode === 'complete'
                ? stageCompleteCounts[step.key] || 0
                : stageCounts[step.key] || 0;
            const active = stepFilter === step.key;
            return (
              <React.Fragment key={step.key}>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  title={
                    stageIconFilterMode === 'complete'
                      ? `${step.label} — completed`
                      : `${step.label} — action needed`
                  }
                  onClick={() => applyStageIconFilter(step.key)}
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
            title="Completed ISPs sent to ILS (archive — hidden from default tracker)"
            onClick={() => showSentToIlsArchive('ils_newest')}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-teal-800 hover:bg-teal-50 ${
              viewingSentToIls ? 'bg-teal-50 font-semibold' : ''
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
            Sent to ILS <span className="tabular-nums">{stageCounts.sent_to_ils}</span>
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
            Member info on the left, workflow stages aligned in a fixed column, Details on the second line. Full
            timelines live on the ISP Activity Log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Global search: member, MRN, SW, staff, RN…"
                className="pl-9"
                title="Searches all ISPs, including Sent to ILS archive"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  Stage:{' '}
                  {viewingGlobal && !viewingSentToIls
                    ? clean(search)
                      ? 'Global search'
                      : 'Global'
                    : stepFilter === 'all' && !viewingSentToIls
                    ? 'Active'
                    : viewingSentToIls
                      ? 'Sent to ILS'
                      : stepFilter === 'returned'
                        ? 'Sent back'
                        : ISP_STEPS.find((s) => s.key === stepFilter)?.abbreviation ||
                          stepFilterLabel}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by stage</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={clearStageFilters}
                  className={stepFilter === 'all' && !viewingSentToIls && !clean(search) ? 'bg-accent' : ''}
                >
                  <ClipboardList className="mr-2 h-4 w-4 text-slate-500" />
                  Active tracker
                  <span className="ml-auto tabular-nums text-muted-foreground">{stageCounts.all}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={showGlobalIspList}
                  className={stepFilter === 'global' || clean(search) ? 'bg-accent' : ''}
                >
                  <Search className="mr-2 h-4 w-4 text-sky-600" />
                  All ISPs (global)
                  <span className="ml-auto tabular-nums text-muted-foreground">{rows.length}</span>
                </DropdownMenuItem>
                {ISP_TRACKER_STEPS.map((step) => (
                  <DropdownMenuItem
                    key={step.key}
                    onClick={() => applyStageIconFilter(step.key)}
                    className={stepFilter === step.key ? 'bg-accent' : ''}
                  >
                    <XCircle className="mr-2 h-4 w-4 text-orange-500" />
                    <span className="font-mono text-xs font-semibold">{step.abbreviation}</span>
                    <span className="ml-1.5 truncate text-muted-foreground">{step.label}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {stageIconFilterMode === 'complete'
                        ? stageCompleteCounts[step.key] || 0
                        : stageCounts[step.key] || 0}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => showSentToIlsArchive('ils_newest')}
                  className={viewingSentToIls ? 'bg-accent' : ''}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-teal-600" />
                  Sent to ILS (archive)
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {stageCounts.sent_to_ils}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setStepFilter('returned');
                    setShowPendingOnly(false);
                  }}
                  className={stepFilter === 'returned' ? 'bg-accent' : ''}
                >
                  <RotateCcw className="mr-2 h-4 w-4 text-orange-700" />
                  Sent back to SW
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {stageCounts.returned}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  {listSort === 'requested_newest' || listSort === 'ils_newest' ? (
                    <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                  ) : listSort === 'requested_oldest' || listSort === 'ils_oldest' ? (
                    <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                  ) : listSort === 'name_desc' ? (
                    <ArrowUpAZ className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownAZ className="h-3.5 w-3.5" />
                  )}
                  Sort:{' '}
                  {listSort === 'name_asc'
                    ? 'Name A–Z'
                    : listSort === 'name_desc'
                      ? 'Name Z–A'
                      : listSort === 'requested_newest'
                        ? 'Requested newest'
                        : listSort === 'requested_oldest'
                          ? 'Requested oldest'
                          : listSort === 'ils_newest'
                            ? 'ILS sent newest'
                            : listSort === 'ils_oldest'
                              ? 'ILS sent oldest'
                              : 'Default'}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Sort list</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (viewingSentToIls) clearStageFilters();
                    setListSort('name_asc');
                  }}
                  className={listSort === 'name_asc' ? 'bg-accent' : ''}
                >
                  <ArrowDownAZ className="mr-2 h-4 w-4" />
                  Name A–Z
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (viewingSentToIls) clearStageFilters();
                    setListSort('name_desc');
                  }}
                  className={listSort === 'name_desc' ? 'bg-accent' : ''}
                >
                  <ArrowUpAZ className="mr-2 h-4 w-4" />
                  Name Z–A
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (viewingSentToIls) clearStageFilters();
                    setListSort('requested_newest');
                  }}
                  className={listSort === 'requested_newest' ? 'bg-accent' : ''}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Requested date (newest)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (viewingSentToIls) clearStageFilters();
                    setListSort('requested_oldest');
                  }}
                  className={listSort === 'requested_oldest' ? 'bg-accent' : ''}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Requested date (oldest)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Sent to ILS archive
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => showSentToIlsArchive('ils_newest')}
                  className={listSort === 'ils_newest' ? 'bg-accent' : ''}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-teal-600" />
                  ILS sent date (newest)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => showSentToIlsArchive('ils_oldest')}
                  className={listSort === 'ils_oldest' ? 'bg-accent' : ''}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-teal-600" />
                  ILS sent date (oldest)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (viewingSentToIls) clearStageFilters();
                    setListSort('none');
                  }}
                  className={listSort === 'none' ? 'bg-accent' : ''}
                >
                  Default order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showPendingOnly}
                onChange={(e) => {
                  const hideComplete = e.target.checked;
                  setShowPendingOnly(hideComplete);
                  if (hideComplete && stepFilter === 'completed') setStepFilter('all');
                }}
                className="h-4 w-4 rounded border"
              />
              Hide complete
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
            <span className="text-sm text-muted-foreground">
              {filteredRows.length}{' '}
              {clean(search)
                ? 'matching packets'
                : viewingSentToIls
                  ? 'Sent to ILS packets'
                  : stepFilter === 'global'
                    ? 'ISPs (global)'
                    : 'active ISP packets'}
              {viewingGlobal && !viewingSentToIls ? (
                <span className="ml-1 text-sky-800">
                  {clean(search) ? '· global search includes Sent to ILS' : '· includes Sent to ILS'}
                </span>
              ) : null}
            </span>
          </div>

          <div className="rounded-md border border-sky-200 bg-sky-50/80 px-3 py-2.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label htmlFor="isp-tracker-test-email" className="text-xs text-sky-950">
                  Test reminder email (dummy inbox)
                </Label>
                <Input
                  id="isp-tracker-test-email"
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="you@example.com"
                  className="h-9 bg-white"
                  disabled={testEmailSending}
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={testEmailSending || !clean(testEmailTo)}
                onClick={() => void sendIspTrackerTestEmail()}
              >
                {testEmailSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send test email
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9" asChild>
                <Link href="/admin/email-logs">Email Logs</Link>
              </Button>
            </div>
            {testEmailResult ? (
              <div className="mt-1.5 text-xs">
                {testEmailResult.status === 'success' ? (
                  <Link
                    href="/admin/email-logs"
                    className="text-green-800 underline underline-offset-2 hover:text-green-950"
                    title={`Sent ${new Date(testEmailResult.atIso).toLocaleString()}`}
                  >
                    Email Logs · sent to {testEmailResult.to}
                  </Link>
                ) : (
                  <span className="text-red-800">
                    Test email failed to {testEmailResult.to}
                    {testEmailResult.error ? `: ${testEmailResult.error}` : ''}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-sky-900/80">
                Sends the same ISP reminder template to your address so you can verify delivery without
                emailing the assigned SW.
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-700">Stage icons filter:</span>
              <button
                type="button"
                onClick={clearStageFilters}
                className={`rounded px-2 py-0.5 ${
                  stepFilter === 'all' &&
                  actionFilter === 'all' &&
                  !showPendingOnly &&
                  !viewingSentToIls &&
                  !viewingGlobal
                    ? 'bg-slate-200 font-semibold text-slate-900'
                    : 'text-muted-foreground hover:bg-white/80'
                }`}
              >
                Active tracker
              </button>
              <button
                type="button"
                onClick={showGlobalIspList}
                className={`rounded px-2 py-0.5 ${
                  viewingGlobal && !viewingSentToIls
                    ? 'bg-sky-100 font-semibold text-sky-950'
                    : 'text-muted-foreground hover:bg-white/80'
                }`}
                title="Show all ISPs including Sent to ILS"
              >
                Global
              </button>
              <button
                type="button"
                disabled={
                  stepFilter === 'all' ||
                  stepFilter === 'global' ||
                  !ISP_TRACKER_STEPS.some((s) => s.key === stepFilter)
                }
                onClick={() => setStageIconFilterMode('action_needed')}
                className={`rounded px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${
                  stepFilter !== 'all' &&
                  stepFilter !== 'global' &&
                  stageIconFilterMode === 'action_needed'
                    ? 'bg-orange-100 font-semibold text-orange-900'
                    : 'text-muted-foreground hover:bg-white/80'
                }`}
              >
                Action needed
              </button>
              <button
                type="button"
                disabled={
                  stepFilter === 'all' ||
                  stepFilter === 'global' ||
                  !ISP_TRACKER_STEPS.some((s) => s.key === stepFilter)
                }
                onClick={() => setStageIconFilterMode('complete')}
                className={`rounded px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${
                  stepFilter !== 'all' &&
                  stepFilter !== 'global' &&
                  stageIconFilterMode === 'complete'
                    ? 'bg-green-100 font-semibold text-green-900'
                    : 'text-muted-foreground hover:bg-white/80'
                }`}
              >
                Complete
              </button>
              <span className="text-muted-foreground">
                Active hides Sent to ILS · Global / name search shows everyone
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {ISP_TRACKER_STEPS.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  title={`Filter: ${step.label}`}
                  onClick={() => applyStageIconFilter(step.key)}
                  className={`rounded px-1 py-0.5 hover:bg-white/80 ${
                    stepFilter === step.key ? 'bg-white font-semibold text-slate-800 shadow-sm' : ''
                  }`}
                >
                  <strong className="font-mono">{step.abbreviation}:</strong> {step.label}
                </button>
              ))}
              <button
                type="button"
                title="Show Sent to ILS archive (sorted by newest ILS date)"
                onClick={() => showSentToIlsArchive('ils_newest')}
                className={`rounded px-1 py-0.5 hover:bg-white/80 ${
                  viewingSentToIls ? 'bg-white font-semibold text-slate-800 shadow-sm' : ''
                }`}
              >
                <strong className="font-mono">ILS:</strong> Sent to ILS
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <button
                type="button"
                title="Show Sent to ILS archive"
                onClick={() => showSentToIlsArchive('ils_newest')}
                className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/80 ${
                  viewingSentToIls ? 'bg-white font-semibold text-slate-800 shadow-sm' : ''
                }`}
              >
                <CheckCircle2 className="h-4 w-4 text-teal-600" /> Sent to ILS
              </button>
              <button
                type="button"
                title="Hide complete packets"
                onClick={() => {
                  setShowPendingOnly(true);
                  if (stepFilter === 'completed' || stepFilter === 'sent_to_ils') setStepFilter('all');
                }}
                className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/80 ${
                  showPendingOnly ? 'bg-white font-semibold text-slate-800 shadow-sm' : ''
                }`}
              >
                <XCircle className="h-4 w-4 text-orange-500" /> Pending
              </button>
              <button
                type="button"
                title="Show packets sent back to SW"
                onClick={() => {
                  setStepFilter('returned');
                  setShowPendingOnly(false);
                }}
                className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/80 ${
                  stepFilter === 'returned' ? 'bg-white font-semibold text-slate-800 shadow-sm' : ''
                }`}
              >
                <RotateCcw className="h-4 w-4 text-orange-700" /> Sent back to SW
              </button>
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
              {clean(search)
                ? `No packets match “${clean(search)}”.`
                : viewingSentToIls
                  ? 'No Sent to ILS packets yet. Mark completed ISPs as Sent to ILS to archive them here.'
                  : 'No active ISP packets. Sent to ILS items are archived — open Sent to ILS to view them.'}
            </p>
          ) : (
            <div>
              {layoutMode === 'desktop' ? (
                <div className="sticky top-0 z-20 mb-2 flex items-start gap-3 rounded-md border bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
                  <div className="min-w-0 flex-1 self-center text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={clearStageFilters}
                      className="font-medium text-slate-700 hover:underline"
                      title="Clear stage filter — show active tracker"
                    >
                      Stages
                    </button>
                    <span className="ml-2">
                      {viewingSentToIls
                        ? `Sent to ILS archive · sorted ${
                            listSort === 'ils_oldest' ? 'oldest first' : 'newest first'
                          }`
                        : viewingGlobal
                          ? clean(search)
                            ? `Global search “${clean(search)}” · Sent to ILS included`
                            : 'All ISPs (global) · Sent to ILS included'
                        : stepFilter === 'all' || !ISP_TRACKER_STEPS.some((s) => s.key === stepFilter)
                          ? 'Active packets (Sent to ILS hidden)'
                          : `Filter: ${
                              stageIconFilterMode === 'action_needed' ? 'action needed' : 'complete'
                            } · ${ISP_TRACKER_STEPS.find((s) => s.key === stepFilter)?.abbreviation}`}
                    </span>
                  </div>
                  <div
                    className={`shrink-0 self-center ${TRACKER_STAGE_ICONS_WIDTH} flex flex-nowrap items-end justify-between gap-0`}
                  >
                    {ISP_TRACKER_STEPS.map((step) => {
                      const active = stepFilter === step.key;
                      const count =
                        stepFilter !== 'all' && stageIconFilterMode === 'complete'
                          ? stageCompleteCounts[step.key] || 0
                          : stageCounts[step.key] || 0;
                      return (
                        <button
                          key={`sticky-step-${step.key}`}
                          type="button"
                          title={
                            active
                              ? `${step.label} — click again to clear filter`
                              : `${step.label} — click to filter action needed (${count})`
                          }
                          onClick={() => applyStageIconFilter(step.key)}
                          className={`inline-flex w-[3.25rem] flex-col items-center gap-0.5 rounded sm:w-14 ${
                            active
                              ? 'bg-slate-100 ring-2 ring-slate-300'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-center text-[10px] font-semibold leading-tight text-slate-600 sm:text-xs">
                            {step.abbreviation}
                          </span>
                          {stepFilter !== 'all' && stageIconFilterMode === 'complete' ? (
                            <CheckCircle2
                              className={`h-5 w-5 sm:h-6 sm:w-6 ${
                                active ? 'text-green-600' : 'text-green-500'
                              }`}
                            />
                          ) : (
                            <XCircle
                              className={`h-5 w-5 sm:h-6 sm:w-6 ${
                                active ? 'text-orange-600' : 'text-orange-500'
                              }`}
                            />
                          )}
                          <span className="text-[9px] font-medium tabular-nums text-slate-500">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="w-[9.5rem] shrink-0" aria-hidden />
                </div>
              ) : null}
              <ul className="space-y-2">
              {filteredRows.map((row) => {
                const badge = statusBadge(row);
                const rowOpen = Boolean(expandedRows[row.id]);
                const swContact = formatIspTrackerSwContact(row);
                const stageIcons = (
                  <div
                    className={`${TRACKER_STAGE_ICONS_WIDTH} flex flex-nowrap items-end justify-between gap-0`}
                  >
                    {ISP_TRACKER_STEPS.map((step) => (
                      <StatusIndicator
                        key={`${row.id}-step-${step.key}`}
                        status={getStepStatus(row, step.key)}
                        formName={step.label}
                        shortLabel={step.abbreviation}
                        showLabel
                      />
                    ))}
                  </div>
                );
                return (
                  <li key={row.id} className="rounded-md border bg-white px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                          {isIspPacketComplete(row) ? (
                            <CheckCircle2
                              className="h-5 w-5 shrink-0 text-green-500"
                              aria-label="ISP complete"
                            />
                          ) : null}
                          <Link
                            href={workflowHref(row)}
                            className="truncate text-base font-semibold text-slate-900 hover:underline"
                            title="Open ISP Workflow"
                          >
                            {row.memberName}
                          </Link>
                          {viewingGlobal && isSentToIlsRow(row) ? (
                            <Badge className="shrink-0 bg-teal-700 text-xs">Sent to ILS</Badge>
                          ) : null}
                          <Badge
                            variant={badge.className ? 'outline' : 'secondary'}
                            className={`shrink-0 text-xs ${badge.className}`}
                          >
                            {badge.label}
                          </Badge>
                          {formatIspPurposeShortLabel(row.assessmentPurpose) ? (
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-xs ${
                                normalizeIspAssessmentPurpose(row.assessmentPurpose) === 'initial'
                                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                                  : normalizeIspAssessmentPurpose(row.assessmentPurpose) === 'review'
                                    ? 'border-violet-300 bg-violet-50 text-violet-900'
                                    : 'border-amber-300 bg-amber-50 text-amber-950'
                              }`}
                            >
                              {formatIspPurposeShortLabel(row.assessmentPurpose)}
                            </Badge>
                          ) : null}
                          {row.h2022EndWarning && row.h2022WarningLabel ? (
                            <Badge
                              variant="outline"
                              className={`shrink-0 gap-1 text-xs ${
                                (row.h2022DaysUntilEnd ?? 0) < 0
                                  ? 'border-red-400 bg-red-50 text-red-900'
                                  : 'border-amber-400 bg-amber-50 text-amber-950'
                              }`}
                              title={
                                row.h2022EndDate
                                  ? `H2022 end ${row.h2022EndDate}`
                                  : row.h2022WarningLabel
                              }
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              {row.h2022WarningLabel}
                            </Badge>
                          ) : null}
                          <span className="shrink-0 text-sm text-muted-foreground">
                            MRN {row.memberMrn}
                          </span>
                          {swContact ? (
                            <span
                              className="min-w-0 truncate text-sm text-muted-foreground"
                              title={swContact}
                            >
                              SW: {swContact}
                            </span>
                          ) : null}
                          {row.staffName && row.staffName !== '—' ? (
                            <span
                              className="min-w-0 truncate text-sm text-muted-foreground"
                              title={`Assigned admin for review (change in ISP Workflow): ${row.staffName}`}
                            >
                              Admin: {row.staffName}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <button
                            type="button"
                            className="shrink-0 text-sm font-medium text-blue-700 hover:underline"
                            onClick={() =>
                              setExpandedRows((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                            }
                          >
                            {rowOpen ? 'Hide' : 'Details'}
                          </button>
                          {row.sentToSwAtMs > 0 ? (
                            <span
                              className="shrink-0 text-sm tabular-nums text-slate-600"
                              title={
                                row.sentToSwLabel ||
                                `Sent to SW ${new Date(row.sentToSwAtMs).toLocaleString()}`
                              }
                            >
                              Sent {formatSentToSwDisplayDate(row.sentToSwAtMs)}
                            </span>
                          ) : null}
                          {getStepStatus(row, 'final_download') === 'Completed' ? (
                            <button
                              type="button"
                              className={`shrink-0 text-sm font-medium hover:underline ${
                                row.sentToIls
                                  ? 'text-teal-800'
                                  : 'text-emerald-800'
                              }`}
                              onClick={() => openSentToIlsDialog(row)}
                              title={
                                row.sentToIls && row.sentToIlsAtIso
                                  ? `Sent to ILS ${new Date(row.sentToIlsAtIso).toLocaleDateString()}`
                                  : 'Mark Sent to ILS'
                              }
                            >
                              {row.sentToIls
                                ? `ILS ${
                                    row.sentToIlsAtIso
                                      ? (() => {
                                          const d = new Date(row.sentToIlsAtIso);
                                          if (Number.isNaN(d.getTime())) return '';
                                          return d.toLocaleDateString([], {
                                            month: 'numeric',
                                            day: 'numeric',
                                          });
                                        })()
                                      : 'sent'
                                  }`
                                : 'Mark ILS'}
                            </button>
                          ) : null}
                          {getStepStatus(row, 'final_download') === 'Completed' && !row.sentToIls ? (
                            <Link
                              href={coverSheetPackageHref(row)}
                              className="shrink-0 text-sm font-medium text-emerald-800 hover:underline"
                            >
                              Send to ILS
                            </Link>
                          ) : row.sentToIls ? (
                            <Link
                              href={coverSheetPackageHref(row)}
                              className="shrink-0 text-sm font-medium text-muted-foreground hover:underline"
                            >
                              ILS package
                            </Link>
                          ) : null}
                          <LastActionReminderNote row={row} />
                        </div>
                      </div>
                      {/* Fixed-width stage column in Desktop layout so icons align across rows. */}
                      {layoutMode === 'desktop' ? (
                        <div className="shrink-0 self-center">{stageIcons}</div>
                      ) : null}
                      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 pt-0.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-9 w-9 shrink-0 p-0 ${
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
                        <DropdownMenu>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 w-9 shrink-0 border-sky-300 p-0 text-sky-800"
                                    disabled={
                                      manualReminderSendingId === row.id ||
                                      reminderPreviewLoadingId === row.id ||
                                      bulkReminderSaving ||
                                      !clean(row.memberId)
                                    }
                                    aria-label="Send action-needed reminder"
                                  >
                                    {manualReminderSendingId === row.id ||
                                    reminderPreviewLoadingId === row.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Mail className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent>Preview &amp; send action reminder</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Re-send action reminder</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => void openActionReminderPreview(row, 'auto')}
                            >
                              Current next actor
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void openActionReminderPreview(row, 'msw')}
                            >
                              Social worker
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void openActionReminderPreview(row, 'rn')}
                            >
                              RN
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button asChild variant="outline" size="sm" className="h-9 w-9 shrink-0 p-0">
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
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="h-9 w-9 shrink-0 p-0"
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
                    </div>
                    {layoutMode === 'mobile' ? (
                      <div className="mt-2 flex justify-start">{stageIcons}</div>
                    ) : null}
                    {rowOpen ? (
                      <div className="mt-2 space-y-2 border-t pt-2 text-sm text-muted-foreground">
                        <div>
                          {row.healthPlan} · MRN {row.memberMrn}
                        </div>
                        <div>
                          MSW: {row.uploaderName} · Admin: {row.staffName} · RN: {row.rnName}
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
                        <div className="rounded border bg-slate-50/80 p-2">
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                            <FileText className="h-3.5 w-3.5" />
                            Member files
                            <span className="font-normal normal-case text-muted-foreground">
                              ({row.supportFiles?.length || 0})
                            </span>
                          </div>
                          {row.supportFiles?.length ? (
                            <ul className="space-y-1.5">
                              {row.supportFiles.map((file) => {
                                const fileKey = `${row.id}:${file.id}`;
                                const removing = deletingSupportFileKey === fileKey;
                                return (
                                  <li
                                    key={fileKey}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-2 py-1.5 text-xs text-slate-800"
                                  >
                                    <span className="min-w-0 flex-1">
                                      <a
                                        href={file.downloadURL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-blue-700 hover:underline"
                                      >
                                        {file.label || file.fileName || 'Clinical file'}
                                      </a>
                                      {file.label && file.fileName && file.label !== file.fileName
                                        ? ` · ${file.fileName}`
                                        : ''}
                                      {file.uploadedAtLabel ? ` · ${file.uploadedAtLabel}` : ''}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 shrink-0 px-2 text-red-700 hover:bg-red-50 hover:text-red-800"
                                      disabled={removing || Boolean(deletingSupportFileKey)}
                                      onClick={() => void removeMemberSupportFile(row, file)}
                                      title="Remove file"
                                    >
                                      {removing ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                      <span className="ml-1">Remove</span>
                                    </Button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              No clinical files on this member yet. Upload from ISP Workflow → Member clinical
                              uploads.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(sentToIlsRow)}
        onOpenChange={(open) => {
          if (!open && !sentToIlsSaving) setSentToIlsRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sent to ILS</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Mark{' '}
                  <span className="font-medium text-foreground">
                    {sentToIlsRow?.memberName || 'this member'}
                  </span>
                  {sentToIlsRow?.memberMrn && sentToIlsRow.memberMrn !== '—'
                    ? ` (MRN ${sentToIlsRow.memberMrn})`
                    : ''}{' '}
                  as Sent to ILS when the ISP was already sent outside the ILS Member Package Checklist.
                </p>
                <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/80 p-3 text-teal-950">
                  <label className="flex items-start gap-2 text-sm font-medium">
                    <Checkbox
                      checked={sentToIlsConfirmChecked}
                      onCheckedChange={(v) => setSentToIlsConfirmChecked(Boolean(v))}
                      disabled={sentToIlsSaving}
                      className="mt-0.5"
                    />
                    <span>I confirm this ISP was sent to ILS</span>
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="isp-tracker-sent-to-ils-date">Sent date</Label>
                    <Input
                      id="isp-tracker-sent-to-ils-date"
                      type="date"
                      value={sentToIlsDate}
                      onChange={(e) => setSentToIlsDate(e.target.value)}
                      disabled={sentToIlsSaving}
                    />
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {sentToIlsRow?.sentToIls ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={sentToIlsSaving}
                  onClick={() => void clearSentToIlsFromTracker()}
                >
                  Clear ILS mark
                </Button>
              ) : null}
            </div>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              <AlertDialogCancel disabled={sentToIlsSaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={sentToIlsSaving || !sentToIlsConfirmChecked}
                onClick={(e) => {
                  e.preventDefault();
                  void saveSentToIlsFromTracker();
                }}
              >
                {sentToIlsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Sent to ILS
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(reminderCompose)}
        onOpenChange={(open) => {
          if (!open && !manualReminderSendingId) setReminderCompose(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview action reminder</DialogTitle>
            <DialogDescription>
              Review and customize the message before sending to the{' '}
              {reminderCompose?.role === 'msw'
                ? 'social worker'
                : reminderCompose?.role === 'rn'
                  ? 'RN'
                  : 'next actor'}
              .
            </DialogDescription>
          </DialogHeader>
          {reminderCompose ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-slate-50 p-3 space-y-1">
                <div>
                  <span className="text-muted-foreground">To:</span>{' '}
                  <span className="font-medium">
                    {reminderCompose.recipientName || 'Recipient'} &lt;{reminderCompose.recipientEmail}
                    &gt;
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Role:</span>{' '}
                  {reminderCompose.roleLabel || reminderCompose.role}
                </div>
                <div>
                  <span className="text-muted-foreground">Member:</span>{' '}
                  {reminderCompose.memberName}
                  {reminderCompose.mrn ? ` · MRN ${reminderCompose.mrn}` : ''}
                </div>
                <div>
                  <span className="text-muted-foreground">Stage:</span> {reminderCompose.stageLabel}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-override-to">
                  Test override To (optional dummy email)
                </Label>
                <Input
                  id="reminder-override-to"
                  type="email"
                  value={reminderCompose.overrideRecipientEmail}
                  onChange={(e) =>
                    setReminderCompose((prev) =>
                      prev ? { ...prev, overrideRecipientEmail: e.target.value } : prev
                    )
                  }
                  placeholder="Leave blank to use assigned SW/RN email"
                />
                <p className="text-[11px] text-muted-foreground">
                  If filled, the reminder is sent only to this address (for delivery testing).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-subject">Subject</Label>
                <Input
                  id="reminder-subject"
                  value={reminderCompose.subject}
                  onChange={(e) =>
                    setReminderCompose((prev) => (prev ? { ...prev, subject: e.target.value } : prev))
                  }
                />
                <button
                  type="button"
                  className="text-xs text-sky-700 underline underline-offset-2"
                  onClick={() =>
                    setReminderCompose((prev) =>
                      prev ? { ...prev, subject: prev.defaultSubject } : prev
                    )
                  }
                >
                  Reset subject
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-next-action">Next action (shown in email)</Label>
                <Textarea
                  id="reminder-next-action"
                  rows={3}
                  value={reminderCompose.nextAction}
                  onChange={(e) =>
                    setReminderCompose((prev) =>
                      prev ? { ...prev, nextAction: e.target.value } : prev
                    )
                  }
                />
                <button
                  type="button"
                  className="text-xs text-sky-700 underline underline-offset-2"
                  onClick={() =>
                    setReminderCompose((prev) =>
                      prev ? { ...prev, nextAction: prev.defaultNextAction } : prev
                    )
                  }
                >
                  Reset next action
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-note">Additional note (optional)</Label>
                <Textarea
                  id="reminder-note"
                  rows={3}
                  placeholder="Optional custom note for the MSW or RN…"
                  value={reminderCompose.additionalNote}
                  onChange={(e) =>
                    setReminderCompose((prev) =>
                      prev ? { ...prev, additionalNote: e.target.value } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Live preview</Label>
                <div className="rounded-md border bg-white p-3 whitespace-pre-wrap text-xs text-slate-700">
                  {[
                    `Hi ${reminderCompose.recipientName || 'Team member'},`,
                    '',
                    `You are the ${reminderCompose.roleLabel || 'recipient'} with the next step for ${
                      reminderCompose.memberName
                    }${reminderCompose.mrn ? ` (MRN: ${reminderCompose.mrn})` : ''}.`,
                    `Current stage: ${reminderCompose.stageLabel}`,
                    `Next action: ${reminderCompose.nextAction}`,
                    reminderCompose.additionalNote.trim()
                      ? `\n${reminderCompose.additionalNote.trim()}`
                      : '',
                    '',
                    `${reminderCompose.ctaLabel}: ${reminderCompose.actionUrl}`,
                  ]
                    .filter(Boolean)
                    .join('\n')}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(manualReminderSendingId)}
              onClick={() => setReminderCompose(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                Boolean(manualReminderSendingId) ||
                !reminderCompose?.recipientEmail ||
                !clean(reminderCompose?.subject) ||
                !clean(reminderCompose?.nextAction)
              }
              onClick={() => void sendManualActionReminder()}
            >
              {manualReminderSendingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send reminder'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <BackToTop />
    </div>
  );
}
