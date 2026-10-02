/**
 * Maps rows from the older per-feature log collections into GlobalChangeEvents.
 * Used both when reading legacy history and when mirroring new rows into
 * `global_change_log` at write time, so the two always agree.
 */
import {
  categorizeEmailLog,
  categorizeMemberActivityType,
  categorizeMifAuditAction,
  toGlobalChangeIso,
  type GlobalChangeEvent,
  type WriteGlobalChangeLogInput,
} from '@/lib/global-change-log';

type Data = Record<string, any>;

const clean = (value: unknown) => String(value ?? '').trim();

export function mapMemberActivityLog(id: string, data: Data): GlobalChangeEvent {
  const clientId2 = clean(data.clientId2);
  return {
    id: `member-activity-${id}`,
    sourceRef: `member_activities/${id}`,
    atIso: toGlobalChangeIso(data.timestamp) || toGlobalChangeIso(data.createdAt),
    category: categorizeMemberActivityType(data.activityType, data.category),
    action: clean(data.activityType) || clean(data.fieldChanged) || 'member_activity',
    summary: clean(data.title) || clean(data.description) || 'Member activity',
    memberName: clean(data.relatedData?.memberName) || clean(data.memberName) || undefined,
    memberMrn: clean(data.relatedData?.memberMrn) || clean(data.memberMrn) || undefined,
    clientId2: clientId2 || undefined,
    staffName: clean(data.changedByName) || undefined,
    staffEmail: clean(data.changedBy) || undefined,
    source: 'member_activities',
    details: {
      description: clean(data.description) || undefined,
      oldValue: data.oldValue ?? undefined,
      newValue: data.newValue ?? undefined,
      fieldChanged: clean(data.fieldChanged) || undefined,
      priority: data.priority,
    },
    href: clientId2 ? `/admin/members/${encodeURIComponent(clientId2)}` : undefined,
  };
}

export function mapMifAuditLog(id: string, data: Data): GlobalChangeEvent {
  const action = clean(data.action) || 'mif_audit';
  const memberName =
    clean(data.memberLastName) && clean(data.memberFirstName)
      ? `${clean(data.memberLastName)}, ${clean(data.memberFirstName)}`
      : clean(data.memberName) || undefined;
  return {
    id: `mif-audit-${id}`,
    sourceRef: `ils_mif_audit_log/${id}`,
    atIso: toGlobalChangeIso(data.atIso) || toGlobalChangeIso(data.atServer),
    category: categorizeMifAuditAction(action),
    action,
    summary: clean(data.summary) || action,
    memberName,
    memberMrn: clean(data.memberMrn) || undefined,
    clientId2: clean(data.clientId2) || undefined,
    staffName: clean(data.actor) || undefined,
    staffEmail: clean(data.actor).includes('@') ? clean(data.actor) : undefined,
    source: 'ils_mif_audit_log',
    details: {
      authorizationNumberT2038: data.authorizationNumberT2038,
      previousKaiserStatus: data.previousKaiserStatus,
      kaiserStatus: data.kaiserStatus,
      runId: data.runId,
      authorizedCount: data.authorizedCount,
      updatedCount: data.updatedCount,
    },
    href: '/admin/tools/ils-mif-consolidator',
  };
}

export function mapEmailLog(id: string, data: Data): GlobalChangeEvent {
  const template = clean(data.template);
  const source = clean(data.source);
  const subject = clean(data.subject);
  const category = categorizeEmailLog(template, source, subject);
  const meta: Data = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const memberName =
    clean(meta.memberName) ||
    clean(meta.memberFullName) ||
    [clean(meta.memberLastName), clean(meta.memberFirstName)].filter(Boolean).join(', ') ||
    undefined;
  const toList = Array.isArray(data.to) ? data.to.map(clean).filter(Boolean) : [];
  return {
    id: `email-${id}`,
    sourceRef: `emailLogs/${id}`,
    atIso: toGlobalChangeIso(data.createdAt) || toGlobalChangeIso(data.sentAt),
    category,
    action: template || 'email_sent',
    summary:
      subject ||
      (category === 'referral'
        ? `Kaiser referral email${memberName ? ` · ${memberName}` : ''}`
        : `Email sent${template ? ` (${template})` : ''}`),
    memberName,
    memberMrn: clean(meta.memberMrn) || clean(meta.mrn) || undefined,
    clientId2: clean(meta.clientId2) || clean(meta.memberClientId) || undefined,
    applicationId: clean(meta.applicationId) || undefined,
    staffName: clean(data.sentByName) || clean(meta.sentByName) || clean(data.from) || undefined,
    staffEmail: clean(data.sentByEmail) || clean(meta.sentByEmail) || clean(data.from) || undefined,
    source: 'emailLogs',
    details: {
      status: data.status,
      to: toList,
      template,
      source,
      providerMessageId: data.providerMessageId,
    },
    href: category === 'referral' ? '/admin/email-logs/kaiser-referrals' : '/admin/email-logs',
  };
}

export function mapCoverSheetLog(id: string, data: Data): GlobalChangeEvent {
  const memberName = clean(data.memberName) || undefined;
  const coverPageType = clean(data.coverPageType);
  return {
    id: `cover-${id}`,
    sourceRef: `kaiser_isp_cover_sheet_download_logs/${id}`,
    atIso: toGlobalChangeIso(data.createdAt) || toGlobalChangeIso(data.createdAtIso),
    category: 'cover_sheet',
    action: 'cover_sheet_generated',
    summary: `Cover sheet generated${coverPageType ? ` (${coverPageType})` : ''}${memberName ? ` · ${memberName}` : ''}`,
    memberName,
    memberMrn: clean(data.memberMrn) || undefined,
    clientId2: clean(data.memberClientId) || undefined,
    staffName: clean(data.staffName) || undefined,
    staffEmail: clean(data.staffEmail) || undefined,
    source: 'kaiser_isp_cover_sheet_download_logs',
    details: {
      downloadName: clean(data.downloadName) || undefined,
      coverPageType: coverPageType || undefined,
      verified: Boolean(data.verified),
    },
    href: '/admin/tools/kaiser-isp-cover-sheet',
  };
}

export function mapAlftDownloadLog(id: string, data: Data): GlobalChangeEvent {
  const memberName = clean(data.memberName) || undefined;
  return {
    id: `alft-${id}`,
    sourceRef: `alft_isp_download_logs/${id}`,
    atIso: toGlobalChangeIso(data.createdAt) || toGlobalChangeIso(data.createdAtIso),
    category: 'isp_alft',
    action: clean(data.formType) || 'alft_isp_download',
    summary: `ISP/ALFT packet downloaded${memberName ? ` · ${memberName}` : ''}`,
    memberName,
    memberMrn: clean(data.memberMrn) || undefined,
    clientId2: clean(data.memberClientId) || undefined,
    staffName: clean(data.downloadedByName) || clean(data.staffName) || undefined,
    staffEmail: clean(data.downloadedBy) || clean(data.staffEmail) || undefined,
    source: 'alft_isp_download_logs',
    details: {
      downloadName: clean(data.downloadName) || undefined,
      intakeId: clean(data.intakeId) || undefined,
      versionNumber: data.versionNumber,
    },
    href: '/admin/tools/isp-workflow',
  };
}

export function mapKaiserReferralGenerationLog(id: string, data: Data): GlobalChangeEvent {
  const eventType = clean(data.eventType) || 'generated';
  const memberName = clean(data.memberName) || undefined;
  return {
    id: `kaiser-gen-${id}`,
    sourceRef: `kaiser_referral_generation_logs/${id}`,
    atIso: toGlobalChangeIso(data.atIso) || toGlobalChangeIso(data.createdAt),
    category: 'referral',
    action: `kaiser_referral_${eventType}`,
    summary: `Kaiser referral form ${eventType}${memberName ? ` · ${memberName}` : ''}${
      clean(data.memberMrn) ? ` · MRN ${clean(data.memberMrn)}` : ''
    }`,
    memberName,
    memberMrn: clean(data.memberMrn) || undefined,
    clientId2: clean(data.clientId2) || undefined,
    applicationId: clean(data.applicationId) || undefined,
    staffName: clean(data.staffName) || undefined,
    staffEmail: clean(data.staffEmail) || undefined,
    source: clean(data.source) || 'kaiser_referral_generation_logs',
    details: {
      eventType,
      fileName: clean(data.fileName) || undefined,
      region: clean(data.region) || undefined,
      referralContext: clean(data.referralContext) || undefined,
    },
    href: '/admin/email-logs/kaiser-referrals',
  };
}

/** Converts a mapped legacy event into a unified-log write (timestamp defaults to now when unresolved). */
export function toChangeEventInput(event: GlobalChangeEvent): WriteGlobalChangeLogInput {
  const { id: _id, ...rest } = event;
  return { ...rest, atIso: event.atIso || undefined };
}
