import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  GLOBAL_CHANGE_LOG_COLLECTION,
  filterGlobalChangeEvents,
  toGlobalChangeIso,
  type GlobalChangeEvent,
  type WriteGlobalChangeLogInput,
} from '@/lib/global-change-log';
import { writeChangeEvent } from '@/lib/global-change-log-server';
import {
  mapAlftDownloadLog,
  mapCoverSheetLog,
  mapEmailLog,
  mapKaiserReferralGenerationLog,
  mapMemberActivityLog,
  mapMifAuditLog,
} from '@/lib/global-change-log-mappers';

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

async function loadUnifiedLog(adminDb: any, limit: number, memberKey?: string): Promise<GlobalChangeEvent[]> {
  // array-contains alone needs no composite index; sort happens after merge.
  const snap = memberKey
    ? await adminDb
        .collection(GLOBAL_CHANGE_LOG_COLLECTION)
        .where('memberKeys', 'array-contains', memberKey)
        .limit(limit)
        .get()
    : await adminDb.collection(GLOBAL_CHANGE_LOG_COLLECTION).orderBy('atIso', 'desc').limit(limit).get();
  return snap.docs.map((doc: any) => {
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
      sourceRef: clean(data.sourceRef) || undefined,
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
  return snap.docs.map((doc: any) => mapMemberActivityLog(doc.id, doc.data() || {}));
}

async function loadMifAudit(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb.collection('ils_mif_audit_log').orderBy('atIso', 'desc').limit(limit).get();
  return snap.docs.map((doc: any) => mapMifAuditLog(doc.id, doc.data() || {}));
}

async function loadEmailLogs(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb.collection('emailLogs').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc: any) => mapEmailLog(doc.id, doc.data() || {}));
}

async function loadCoverSheetLogs(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb
    .collection('kaiser_isp_cover_sheet_download_logs')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs
    .filter((doc: any) => !Boolean(doc.data()?.deleted))
    .map((doc: any) => mapCoverSheetLog(doc.id, doc.data() || {}));
}

async function loadAlftDownloadLogs(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb.collection('alft_isp_download_logs').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs
    .filter((doc: any) => !Boolean(doc.data()?.deleted))
    .map((doc: any) => mapAlftDownloadLog(doc.id, doc.data() || {}));
}

async function loadKaiserReferralGenerations(adminDb: any, limit: number): Promise<GlobalChangeEvent[]> {
  const snap = await adminDb
    .collection('kaiser_referral_generation_logs')
    .orderBy('atIso', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc: any) => mapKaiserReferralGenerationLog(doc.id, doc.data() || {}));
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
  snap.docs.forEach((doc: any) => {
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
    const { searchParams } = request.nextUrl;
    // Per-member history (Member 360) is open to all admins; the site-wide view stays Super Admin only.
    const memberKey = clean(searchParams.get('memberKey')).toLowerCase();
    // Read-only: match other admin log readers (2FA not required for listing).
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false, requireSuperAdmin: !memberKey });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

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
    // The unified collection is the primary source; legacy collections only fill in history
    // from before dual-writing started, so they get a smaller window.
    const unifiedLimit = memberKey ? 500 : Math.min(1000, perSourceLimit * 2);

    const [
      unified,
      memberActivities,
      mifAudit,
      emails,
      covers,
      alft,
      pathway,
      referralGens,
    ] = await Promise.all([
      safeQuery('unified', () => loadUnifiedLog(adminDb, unifiedLimit, memberKey || undefined)),
      safeQuery('member_activities', () => loadMemberActivities(adminDb, chunk)),
      safeQuery('ils_mif_audit_log', () => loadMifAudit(adminDb, chunk)),
      safeQuery('emailLogs', () => loadEmailLogs(adminDb, chunk)),
      safeQuery('cover_sheets', () => loadCoverSheetLogs(adminDb, chunk)),
      safeQuery('alft_downloads', () => loadAlftDownloadLogs(adminDb, chunk)),
      safeQuery('pathway_reviews', () => loadPathwayReviewHints(adminDb, chunk)),
      safeQuery('kaiser_referral_generations', () => loadKaiserReferralGenerations(adminDb, chunk)),
    ]);

    const mirroredRefs = new Set(unified.map((event) => event.sourceRef).filter(Boolean) as string[]);
    const legacy = [
      ...memberActivities,
      ...mifAudit,
      ...emails,
      ...covers,
      ...alft,
      ...pathway,
      ...referralGens,
    ].filter((event) => !event.sourceRef || !mirroredRefs.has(event.sourceRef));
    const memberScopedLegacy = memberKey
      ? legacy.filter((event) =>
          [event.clientId2, event.memberMrn, event.applicationId].some(
            (value) => clean(value).toLowerCase() === memberKey
          )
        )
      : legacy;

    const merged = [...unified, ...memberScopedLegacy]
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
        legacyAlreadyMirrored: mirroredRefs.size,
        memberActivities: memberActivities.length,
        mifAudit: mifAudit.length,
        emails: emails.length,
        covers: covers.length,
        alft: alft.length,
        pathway: pathway.length,
        referralGenerations: referralGens.length,
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

/** Write endpoint so browser-side tools can record events in the unified collection. */
export async function POST(request: NextRequest) {
  try {
    // Any admin may append; staff identity always comes from the verified token, not the body.
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
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
    const id = await writeChangeEvent(
      {
        category,
        action,
        summary,
        memberName: body.memberName,
        memberMrn: body.memberMrn,
        clientId2: body.clientId2,
        applicationId: body.applicationId,
        staffName: clean(authz.name) || clean(authz.email),
        staffEmail: clean(authz.email),
        source: clean(body.source) || 'app',
        sourceRef: body.sourceRef,
        details: body.details && typeof body.details === 'object' ? body.details : undefined,
        href: body.href,
        atIso,
      },
      { adminDb: authz.adminDb }
    );
    if (!id) {
      return NextResponse.json({ success: false, error: 'Failed to write global change log' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id, atIso });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to write global change log') },
      { status: 500 }
    );
  }
}
