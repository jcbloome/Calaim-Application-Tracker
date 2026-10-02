/**
 * Unified change-log model for Super Admin Global Change Log.
 * Events are aggregated from existing collections and optionally dual-written
 * into `global_change_log` for a single searchable history going forward.
 */

export const GLOBAL_CHANGE_LOG_COLLECTION = 'global_change_log';

export type GlobalChangeCategory =
  | 'member_status'
  | 'member_assignment'
  | 'member_note'
  | 'pathway_review'
  | 'application'
  | 'cover_sheet'
  | 'referral'
  | 'mif_consolidator'
  | 'email'
  | 'document'
  | 'isp_alft'
  | 'other';

export type GlobalChangeEvent = {
  id: string;
  atIso: string;
  category: GlobalChangeCategory;
  action: string;
  summary: string;
  memberName?: string;
  memberMrn?: string;
  clientId2?: string;
  applicationId?: string;
  staffName?: string;
  staffEmail?: string;
  source: string;
  sourceRef?: string;
  details?: Record<string, unknown>;
  href?: string;
};

export const GLOBAL_CHANGE_CATEGORY_LABELS: Record<GlobalChangeCategory, string> = {
  member_status: 'Member status',
  member_assignment: 'Staff assignment',
  member_note: 'Member note',
  pathway_review: 'Pathway / file review',
  application: 'Application',
  cover_sheet: 'Cover sheet',
  referral: 'Referral form',
  mif_consolidator: 'MIF consolidator',
  email: 'Email',
  document: 'Document',
  isp_alft: 'ISP / ALFT',
  other: 'Other',
};

const clean = (value: unknown) => String(value ?? '').trim();

export function toGlobalChangeIso(value: unknown): string {
  if (!value) return '';
  try {
    if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
      const d = (value as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : '';
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    }
    if (typeof value === 'object' && value && 'seconds' in (value as object)) {
      const seconds = Number((value as { seconds: number }).seconds);
      if (!Number.isFinite(seconds)) return '';
      return new Date(seconds * 1000).toISOString();
    }
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  } catch {
    return '';
  }
}

export function categorizeMemberActivityType(activityType: unknown, category: unknown): GlobalChangeCategory {
  const type = clean(activityType).toLowerCase();
  const cat = clean(category).toLowerCase();
  if (type.includes('assign') || cat === 'assignment') return 'member_assignment';
  if (type.includes('note') || cat === 'communication') return 'member_note';
  if (type.includes('pathway') || cat === 'pathway') return 'pathway_review';
  if (type.includes('status') || type.includes('authorization') || cat === 'kaiser' || cat === 'authorization') {
    return 'member_status';
  }
  if (cat === 'application') return 'application';
  return 'other';
}

export function categorizeEmailLog(template: unknown, source: unknown, subject: unknown): GlobalChangeCategory {
  const hay = `${clean(template)} ${clean(source)} ${clean(subject)}`.toLowerCase();
  if (hay.includes('kaiser-referral') || hay.includes('kaiser referral') || hay.includes('referral')) {
    return 'referral';
  }
  if (hay.includes('cover') || hay.includes('isp cover')) return 'cover_sheet';
  return 'email';
}

export function categorizeMifAuditAction(action: unknown): GlobalChangeCategory {
  const a = clean(action).toLowerCase();
  if (a.includes('authorized') || a.includes('t2038') || a.includes('caspio') || a.includes('mif_')) {
    return 'mif_consolidator';
  }
  return 'mif_consolidator';
}

export function filterGlobalChangeEvents(
  events: GlobalChangeEvent[],
  filters: {
    category?: string;
    staff?: string;
    member?: string;
    fromIso?: string;
    toIso?: string;
    search?: string;
  }
): GlobalChangeEvent[] {
  const category = clean(filters.category).toLowerCase();
  const staff = clean(filters.staff).toLowerCase();
  const member = clean(filters.member).toLowerCase();
  const search = clean(filters.search).toLowerCase();
  const fromMs = filters.fromIso ? Date.parse(filters.fromIso) : NaN;
  const toMs = filters.toIso ? Date.parse(filters.toIso) : NaN;

  return events.filter((event) => {
    if (category && category !== 'all' && event.category !== category) return false;
    if (staff) {
      const staffHay = `${event.staffName || ''} ${event.staffEmail || ''}`.toLowerCase();
      if (!staffHay.includes(staff)) return false;
    }
    if (member) {
      const memberHay = `${event.memberName || ''} ${event.memberMrn || ''} ${event.clientId2 || ''}`.toLowerCase();
      if (!memberHay.includes(member)) return false;
    }
    if (search) {
      const hay = [
        event.summary,
        event.action,
        event.memberName,
        event.memberMrn,
        event.clientId2,
        event.staffName,
        event.staffEmail,
        event.source,
        event.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    const ts = Date.parse(event.atIso);
    if (!Number.isNaN(fromMs) && (Number.isNaN(ts) || ts < fromMs)) return false;
    if (!Number.isNaN(toMs) && (Number.isNaN(ts) || ts > toMs)) return false;
    return true;
  });
}

/** Payload for writing a new unified log entry (Admin SDK). */
export type WriteGlobalChangeLogInput = {
  category: GlobalChangeCategory;
  action: string;
  summary: string;
  memberName?: string;
  memberMrn?: string;
  clientId2?: string;
  applicationId?: string;
  staffName?: string;
  staffEmail?: string;
  source: string;
  /** `collection/docId` of the legacy log row this mirrors, so readers can skip the duplicate. */
  sourceRef?: string;
  details?: Record<string, unknown>;
  href?: string;
  atIso?: string;
};

/** Lowercased identifiers stored on each unified event for `array-contains` member lookups. */
export function buildGlobalChangeMemberKeys(input: {
  clientId2?: unknown;
  memberMrn?: unknown;
  applicationId?: unknown;
}): string[] {
  return Array.from(
    new Set(
      [input.clientId2, input.memberMrn, input.applicationId]
        .map((value) => clean(value).toLowerCase())
        .filter(Boolean)
    )
  );
}
