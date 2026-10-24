import {
  getMemberActionLog,
  MEMBER_ACTION_KEYS,
  synthesizeLegacyMemberActions,
  type MemberActionLogEntry,
} from '@/lib/member-action-log';
import { toMillisSafe } from './shared';

export function getIntroEmailLastSentAtMs(application: Record<string, any> | null | undefined): number {
  if (!application) return 0;
  const direct = Math.max(
    toMillisSafe(application.introEmailLastSentAt),
    toMillisSafe(application.introEmailLastSentDate)
  );
  const history = Array.isArray(application.introEmailSendHistory)
    ? (application.introEmailSendHistory as Array<any>)
    : [];
  const historyMs = history.reduce((max, entry) => {
    const ms = Math.max(toMillisSafe(entry?.sentAtIso), toMillisSafe(entry?.sentAt));
    return ms > max ? ms : max;
  }, 0);
  const log = Array.isArray(application.memberActionLog) ? (application.memberActionLog as Array<any>) : [];
  const logMs = log.reduce((max, entry) => {
    const key = String(entry?.actionKey || entry?.label || '').toLowerCase();
    if (!key.includes('primary') && !key.includes('intro')) return max;
    const ms = Math.max(toMillisSafe(entry?.atIso), toMillisSafe(entry?.at));
    return ms > max ? ms : max;
  }, 0);
  return Math.max(direct, historyMs, logMs);
}

export type MemberPortalLoginEntry = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  action: string;
  success: boolean;
  failureReason?: string;
  portal: string;
  userAgent?: string;
  timestamp?: any;
  createdAt?: any;
};

export function getStaffAssignmentSentAtMs(application: Record<string, any> | null | undefined): number {
  if (!application) return 0;
  const direct = Math.max(
    toMillisSafe(application.staffAssignmentNotifiedAt),
    toMillisSafe(application.assignedDate)
  );
  const combined = [
    ...getMemberActionLog(application),
    ...synthesizeLegacyMemberActions(application),
  ];
  const logMs = combined.reduce((max, entry) => {
    const key = String(entry?.actionKey || '').toLowerCase();
    const label = String(entry?.label || '').toLowerCase();
    if (key !== MEMBER_ACTION_KEYS.staffAssigned && !label.includes('assigned staff') && !label.includes('sent to staff')) {
      return max;
    }
    const ms = toMillisSafe(entry?.atIso);
    return ms > max ? ms : max;
  }, 0);
  return Math.max(direct, logMs);
}

export function getStaffAssignmentLogEntries(application: Record<string, any> | null | undefined): MemberActionLogEntry[] {
  if (!application) return [];
  const combined = [
    ...getMemberActionLog(application),
    ...synthesizeLegacyMemberActions(application),
  ];
  const seen = new Set<string>();
  return combined
    .filter((entry) => {
      const key = String(entry?.actionKey || '').toLowerCase();
      const label = String(entry?.label || '').toLowerCase();
      return (
        key === MEMBER_ACTION_KEYS.staffAssigned ||
        label.includes('assigned staff') ||
        label.includes('sent to staff') ||
        label.includes('reassigned staff')
      );
    })
    .filter((entry) => {
      const id = entry.id || `${entry.actionKey}-${entry.atIso}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => toMillisSafe(b.atIso) - toMillisSafe(a.atIso));
}
