import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  GLOBAL_CHANGE_LOG_COLLECTION,
  categorizeEmailLog,
  categorizeMemberActivityType,
  categorizeMifAuditAction,
  filterGlobalChangeEvents,
  toGlobalChangeIso,
  type GlobalChangeEvent,
  type WriteGlobalChangeLogInput,
} from '@/lib/global-change-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();

const safeQuery = async <T>(label: string, fn: () => Promise<T[]>, fallback: T[] = []): Promise<T[]> => {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[global-change-log] ${label} failed:`, error);
    return fallback;
  }
};

const dedupeKey = (event: GlobalChangeEvent) =>
  `${event.source}|${event.action}|${event.atIso}|${event.memberName || ''}|${event.summary}`.toLowerCase();

async function loadUnifiedLog(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb
    .collection(GLOBAL_CHANGE_LOG_COLLECTION)
    .orderBy('atIso', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: `unified-${doc.id}`,
      atIso: toGlobalChangeIso(data.atIso) || toGlobalChangeIso(data.createdAt),
      category: (clean(data.category) as GlobalChangeEvent['category']) || 'other',
      action: clean(data.action) || 'change',
      summary: clean(data.summary) || clean(data.action) || 'Change logged',
      memberName: clean(data.memberName) || undefined,
      memberMrn: clean(data.memberMrn) || undefined,
      clientId2: clean(data.clientId2) || undefined,
      applicationId: clean(data.applicationId) || undefined,
      staffName: clean(data.staffName) || undefined,
      staffEmail: clean(data.staffEmail) || undefined,
      source: clean(data.source) || 'global_change_log',
      details: data.details && typeof data.details === 'object' ? data.details : undefined,
      href: clean(data.href) || undefined,
    } satisfies GlobalChangeEvent;
  });
}

async function loadMemberActivities(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  let snap;
  try {
    snap = await adminDb.collection('member_activities').orderBy('timestamp', 'desc').limit(limit).get();
  } catch {
    snap = await adminDb.collection('member_activities').orderBy('createdAt', 'desc').limit(limit).get();
  }
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    const atIso = toGlobalChangeIso(data.timestamp) || toGlobalChangeIso(data.createdAt);
    const clientId2 = clean(data.clientId2);
    return {
      id: `member-activity-${doc.id}`,
      atIso,
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
      href: clientId2 ? `/admin/member-notes?clientId2=${encodeURIComponent(clientId2)}` : undefined,
    } satisfies GlobalChangeEvent;
  });
}

async function loadMifAudit(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb.collection('ils_mif_audit_log').orderBy('atIso', 'desc').limit(limit).get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    const action = clean(data.action) || 'mif_audit';
    const memberName =
      clean(data.memberLastName) && clean(data.memberFirstName)
        ? `${clean(data.memberLastName)}, ${clean(data.memberFirstName)}`
        : clean(data.memberName) || undefined;
    return {
      id: `mif-audit-${doc.id}`,
      atIso: toGlobalChangeIso(data.atIso) || toGlobalChangeIso(data.atServer),
      category: categorizeMifAuditAction(action),
      action,
      summary: clean(data.summary) || action,
      memberName,
      memberMrn: clean(data.memberMrn) || undefined,
      clientId2: clean(data.clientId2) || undefined,
      staffName: clean(data.actor) || undefined,
      staffEmail: clean(data.actor)?.includes('@') ? clean(data.actor) : undefined,
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
    } satisfies GlobalChangeEvent;
  });
}

async function loadEmailLogs(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb.collection('emailLogs').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    const template = clean(data.template);
    const source = clean(data.source);
    const subject = clean(data.subject);
    const category = categorizeEmailLog(template, source, subject);
    const meta = data.metadata && typeof data.metadata === 'object' ? (data.metadata as Record<string, unknown>) : {};
    const memberName =
      clean(meta.memberName) ||
      clean(meta.memberFullName) ||
      [clean(meta.memberLastName), clean(meta.memberFirstName)].filter(Boolean).join(', ') ||
      undefined;
    const toList = Array.isArray(data.to) ? data.to.map(clean).filter(Boolean) : [];
    return {
      id: `email-${doc.id}`,
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
      staffName: clean(data.sentByName) || clean(data.from) || undefined,
      staffEmail: clean(data.sentByEmail) || clean(data.from) || undefined,
      source: 'emailLogs',
      details: {
        status: data.status,
        to: toList,
        template,
        source,
        providerMessageId: data.providerMessageId,
      },
      href:
        category === 'referral'
          ? '/admin/email-logs/kaiser-referrals'
          : '/admin/email-logs',
    } satisfies GlobalChangeEvent;
  });
}

async function loadCoverSheetLogs(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb
    .collection('kaiser_isp_cover_sheet_download_logs')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs
    .filter((doc) => !Boolean(doc.data()?.deleted))
    .map((doc) => {
      const data = doc.data() || {};
      const memberName = clean(data.memberName) || undefined;
      const coverPageType = clean(data.coverPageType);
      return {
        id: `cover-${doc.id}`,
        atIso: toGlobalChangeIso(data.createdAt) || toGlobalChangeIso(data.createdAtIso),
        category: 'cover_sheet' as const,
        action: 'cover_sheet_generated',
        summary: `Cover sheet generated${coverPageType ? ` (${coverPageType})` : ''}${
          memberName ? ` · ${memberName}` : ''
        }`,
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
      } satisfies GlobalChangeEvent;
    });
}

async function loadAlftDownloadLogs(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb.collection('alft_isp_download_logs').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs
    .filter((doc) => !Boolean(doc.data()?.deleted))
    .map((doc) => {
      const data = doc.data() || {};
      const memberName = clean(data.memberName) || undefined;
      return {
        id: `alft-${doc.id}`,
        atIso: toGlobalChangeIso(data.createdAt) || toGlobalChangeIso(data.createdAtIso),
        category: 'isp_alft' as const,
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
      } satisfies GlobalChangeEvent;
    });
}

async function loadPathwayReviewHints(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  // Recent applications with form review / completion timestamps (pathway file reviews).
  let snap;
  try {
    snap = await adminDb.collection('applications').orderBy('updatedAt', 'desc').limit(Math.min(limit, 120)).get();
  } catch {
    try {
      snap = await adminDb.collection('applications').orderBy('createdAt', 'desc').limit(Math.min(limit, 120)).get();
    } catch {
      return [];
    }
  }

  const events: GlobalChangeEvent[] = [];
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const memberName =
      `${clean(data.memberLastName) || clean(data.lastName)}, ${clean(data.memberFirstName) || clean(data.firstName)}`
        .replace(/^,\s*/, '')
        .replace(/,\s*$/, '') || clean(data.memberName);
    const forms = Array.isArray(data.forms) ? data.forms : [];
    forms.forEach((form: any, index: number) => {
      const formName = clean(form?.name) || clean(form?.formName) || `Form ${index + 1}`;
      const reviewedAt =
        toGlobalChangeIso(form?.reviewedAt) ||
        toGlobalChangeIso(form?.adminReviewedAt) ||
        toGlobalChangeIso(form?.completedAt) ||
        toGlobalChangeIso(form?.uploadedAt);
      if (!reviewedAt) return;
      const reviewedBy =
        clean(form?.reviewedByName) ||
        clean(form?.reviewedBy) ||
        clean(form?.completedByName) ||
        clean(form?.uploadedByName);
      const isPathway =
        /pathway|proof of income|cs summary|cs member|waiver|authorization/i.test(formName) ||
        Boolean(form?.needsReview);
      events.push({
        id: `app-form-${doc.id}-${index}-${reviewedAt}`,
        atIso: reviewedAt,
        category: isPathway ? 'pathway_review' : 'document',
        action: form?.reviewedAt || form?.adminReviewedAt ? 'file_reviewed' : 'file_uploaded_or_completed',
        summary: `${formName}${memberName ? ` · ${memberName}` : ''}`,
        memberName: memberName || undefined,
        memberMrn: clean(data.memberMrn) || clean(data.medicalRecordNumber) || undefined,
        clientId2: clean(data.client_ID2) || clean(data.clientId2) || undefined,
        applicationId: doc.id,
        staffName: reviewedBy || undefined,
        staffEmail: clean(form?.reviewedByEmail) || undefined,
        source: 'applications.forms',
        details: { formName, formIndex: index },
        href: `/admin/applications/${doc.id}`,
      });
    });

    const actionLog = Array.isArray(data.memberActionLog) ? data.memberActionLog : [];
    actionLog.forEach((entry: any, index: number) => {
      const atIso = toGlobalChangeIso(entry?.atIso);
      if (!atIso) return;
      events.push({
        id: `app-action-${doc.id}-${clean(entry?.id) || index}`,
        atIso,
        category: 'application',
        action: clean(entry?.actionKey) || 'member_action',
        summary: clean(entry?.label) || clean(entry?.actionKey) || 'Application action',
        memberName: memberName || undefined,
        memberMrn: clean(data.memberMrn) || undefined,
        clientId2: clean(data.client_ID2) || clean(data.clientId2) || undefined,
        applicationId: doc.id,
        staffName: clean(entry?.byName) || undefined,
        staffEmail: clean(entry?.byEmail) || undefined,
        source: 'applications.memberActionLog',
        details: { details: clean(entry?.details) || undefined },
        href: `/admin/applications/${doc.id}`,
      });
    });
  });

  return events.sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso)).slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: true, requireSuperAdmin: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const { searchParams } = request.nextUrl;
    const limitRaw = Number(searchParams.get('limit') || 400);
    const perSourceLimit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 50), 800) : 400;
    const category = clean(searchParams.get('category')) || 'all';
    const staff = clean(searchParams.get('staff'));
    const member = clean(searchParams.get('member'));
    const search = clean(searchParams.get('search'));
    const from = clean(searchParams.get('from'));
    const to = clean(searchParams.get('to'));
    const fromIso = from ? `${from}T00:00:00.000` : '';
    const toIso = to ? `${to}T23:59:59.999` : '';

    const adminDb = authz.adminDb;
    const chunk = Math.min(250, Math.ceil(perSourceLimit / 2));

    const [
      unified,
      memberActivities,
      mifAudit,
      emails,
      covers,
      alft,
      pathway,
    ] = await Promise.all([
      safeQuery('unified', () => loadUnifiedLog(adminDb, chunk)),
      safeQuery('member_activities', () => loadMemberActivities(adminDb, chunk)),
      safeQuery('ils_mif_audit_log', () => loadMifAudit(adminDb, chunk)),
      safeQuery('emailLogs', () => loadEmailLogs(adminDb, chunk)),
      safeQuery('cover_sheets', () => loadCoverSheetLogs(adminDb, chunk)),
      safeQuery('alft_downloads', () => loadAlftDownloadLogs(adminDb, chunk)),
      safeQuery('pathway_reviews', () => loadPathwayReviewHints(adminDb, chunk)),
    ]);

    const merged = [...unified, ...memberActivities, ...mifAudit, ...emails, ...covers, ...alft, ...pathway]
      .filter((event) => event.atIso)
      .sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso));

    const seen = new Set<string>();
    const deduped: GlobalChangeEvent[] = [];
    for (const event of merged) {
      const key = dedupeKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(event);
    }

    const filtered = filterGlobalChangeEvents(deduped, {
      category,
      staff,
      member,
      fromIso,
      toIso,
      search,
    }).slice(0, perSourceLimit);

    const staffFilterOptions = Array.from(
      new Set(
        deduped
          .map((e) => clean(e.staffEmail) || clean(e.staffName))
          .filter(Boolean)
      )
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 250);

    return NextResponse.json({
      success: true,
      count: filtered.length,
      scanned: deduped.length,
      events: filtered,
      staffOptions: staffFilterOptions,
      sources: {
        unified: unified.length,
        memberActivities: memberActivities.length,
        mifAudit: mifAudit.length,
        emails: emails.length,
        covers: covers.length,
        alft: alft.length,
        pathway: pathway.length,
      },
    });
  } catch (error: any) {
    console.error('Global change log failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load global change log') },
      { status: 500 }
    );
  }
}

/** Optional write endpoint so tools can dual-write into the unified collection. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: true, requireSuperAdmin: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await request.json().catch(() => ({}))) as WriteGlobalChangeLogInput;
    const category = clean(body?.category) as WriteGlobalChangeLogInput['category'];
    const action = clean(body?.action);
    const summary = clean(body?.summary);
    if (!category || !action || !summary) {
      return NextResponse.json(
        { success: false, error: 'category, action, and summary are required' },
        { status: 400 }
      );
    }

    const atIso = toGlobalChangeIso(body.atIso) || new Date().toISOString();
    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const ref = await authz.adminDb.collection(GLOBAL_CHANGE_LOG_COLLECTION).add({
      category,
      action,
      summary,
      memberName: clean(body.memberName) || null,
      memberMrn: clean(body.memberMrn) || null,
      clientId2: clean(body.clientId2) || null,
      applicationId: clean(body.applicationId) || null,
      staffName: clean(body.staffName) || clean(authz.name) || null,
      staffEmail: clean(body.staffEmail) || clean(authz.email) || null,
      source: clean(body.source) || 'manual',
      details: body.details && typeof body.details === 'object' ? body.details : null,
      href: clean(body.href) || null,
      atIso,
      createdAt: serverTimestamp,
    });

    return NextResponse.json({ success: true, id: ref.id, atIso });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to write global change log') },
      { status: 500 }
    );
  }
}
