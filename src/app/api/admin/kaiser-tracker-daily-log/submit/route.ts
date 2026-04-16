import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_COLLECTION = 'kaiser_tracker_daily_logs';
const MEMBER_NOTES_COLLECTION = 'member-notes';
const MEMBER_ACTIVITY_COLLECTION = 'member_activities';

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const NO_ACTION_SCOPED_STATUS_SET = new Set(
  [
    'T2038 received, Need First Contact',
    'T2038 received, Needs First Contact',
    'T2038 received, doc collection',
    'RCFE Needed',
    'R&B Needed',
    'R B Needed',
  ].map((status) => normalizeText(status))
);

const toEtDayKey = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return ET_DATE_FMT.format(parsed);
};

const toIso = (value: any): string => {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
};

const toMs = (value: any): number => {
  const iso = toIso(value);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const getNameVariants = (value: unknown): string[] => {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const tokens = normalized.split(' ').filter(Boolean);
  const variants = new Set<string>([normalized]);
  if (tokens.length >= 2) {
    variants.add(`${tokens[tokens.length - 1]} ${tokens.slice(0, -1).join(' ')}`.trim());
  }
  return Array.from(variants).filter(Boolean);
};

const getPriorityBucket = (status: string): 'critical' | 'priority' | 'other' => {
  const normalized = normalizeText(status);
  const critical =
    normalized === 't2038 received' ||
    normalized === 'received t2038' ||
    normalized.includes('need first contact');
  if (critical) return 'critical';
  const priority =
    normalized.includes('doc collection') ||
    normalized === 'rcfe needed' ||
    normalized === 'r b needed' ||
    normalized === 'r&b needed';
  if (priority) return 'priority';
  return 'other';
};

const noteMatchesStaff = (staffName: string, note: any): boolean => {
  const staffVariants = new Set(getNameVariants(staffName));
  const noteNames = [note?.createdByName, note?.createdBy].map((v) => normalizeText(v)).filter(Boolean);
  if (staffVariants.size === 0 || noteNames.length === 0) return false;

  for (const staffVariant of staffVariants) {
    const staffTokens = staffVariant.split(' ').filter(Boolean);
    for (const noteName of noteNames) {
      if (noteName === staffVariant || noteName.includes(staffVariant) || staffVariant.includes(noteName)) return true;
      const noteTokens = noteName.split(' ').filter(Boolean);
      if (staffTokens.length > 0 && staffTokens.every((token) => token.length > 1 && noteTokens.includes(token))) return true;
    }
  }
  return false;
};

async function requireAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;
  const decoded = await adminAuth.verifyIdToken(idToken);

  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  const claimSuperAdmin = Boolean((decoded as any)?.superAdmin);
  const claimKaiserManager = Boolean((decoded as any)?.kaiserManager);

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isAdmin = Boolean((decoded as any)?.admin) || claimSuperAdmin;
  if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
  let isSuperAdmin = claimSuperAdmin || isHardcodedAdminEmail(email);
  let isKaiserManager = claimKaiserManager;
  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    isSuperAdmin = isSuperAdmin || superAdminRole.exists;
    if (!isAdmin && email) {
      const [adminRoleByEmail, superAdminRoleByEmail] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = adminRoleByEmail.exists || superAdminRoleByEmail.exists;
      isSuperAdmin = isSuperAdmin || superAdminRoleByEmail.exists;
    }
  }

  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };

  const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null as any);
  const userData = userDoc && userDoc.exists ? (userDoc.data() as any) : {};
  const roleLabel = normalizeText(userData?.role || '');
  isKaiserManager = Boolean(isKaiserManager || userData?.isKaiserManager || roleLabel.includes('kaiser manager'));
  const displayName = String(
    userData?.displayName ||
      `${String(userData?.firstName || '').trim()} ${String(userData?.lastName || '').trim()}`.trim() ||
      String((decoded as any)?.name || '').trim() ||
      email
  ).trim();

  return { ok: true as const, adminDb, uid, email, displayName, userData, decoded, isSuperAdmin, isKaiserManager };
}

function canSubmitForStaff(staffName: string, authz: { email: string; displayName: string; userData: any; decoded: any }) {
  const expected = normalizeText(staffName);
  if (!expected) return false;
  const candidates = new Set<string>();
  const add = (value: unknown) => {
    getNameVariants(value).forEach((variant) => candidates.add(variant));
  };
  add(authz.displayName);
  add(authz.userData?.displayName);
  add(`${String(authz.userData?.firstName || '').trim()} ${String(authz.userData?.lastName || '').trim()}`.trim());
  add((authz.decoded as any)?.name);
  add(String(authz.email || '').split('@')[0]);
  const aliases = Array.isArray(authz.userData?.staffAliases) ? authz.userData.staffAliases : [];
  aliases.forEach((alias: unknown) => add(alias));
  return candidates.has(expected);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    const staffName = String(body?.staffName || '').trim();
    const members = Array.isArray(body?.members) ? body.members : [];
    const metrics = body?.metrics && typeof body.metrics === 'object' ? body.metrics : {};

    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!staffName) return NextResponse.json({ success: false, error: 'staffName is required' }, { status: 400 });

    const authz = await requireAdmin(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    if (!authz.isSuperAdmin && !authz.isKaiserManager && !canSubmitForStaff(staffName, authz)) {
      return NextResponse.json(
        { success: false, error: 'You can only submit the daily update for your own staff card.' },
        { status: 403 }
      );
    }

    const todayEt = toEtDayKey(new Date());
    const memberRows = members
      .map((member: any) => ({
        clientId2: String(member?.clientId2 || member?.client_ID2 || '').trim(),
        memberName: String(member?.memberName || '').trim(),
        currentStatus: String(member?.currentStatus || '').trim(),
      }))
      .filter((row: any) => row.clientId2);
    const memberMap = new Map(memberRows.map((row: any) => [row.clientId2, row]));
    const clientIds = Array.from(memberMap.keys());

    const notesToday = [] as Array<{
      id: string;
      clientId2: string;
      memberName: string;
      noteText: string;
      createdAt: string;
      createdByName: string;
      source: string;
    }>;

    for (const clientId2 of clientIds) {
      const notesSnap = await authz.adminDb.collection(MEMBER_NOTES_COLLECTION).where('clientId2', '==', clientId2).get();
      notesSnap.forEach((docSnap: any) => {
        const note = docSnap.data() || {};
        if (note?.deleted) return;
        const createdAtIso = toIso(note?.createdAt || note?.timestamp || note?.syncedAt);
        if (!createdAtIso || toEtDayKey(createdAtIso) !== todayEt) return;
        if (!noteMatchesStaff(staffName, note)) return;
        notesToday.push({
          id: String(docSnap.id),
          clientId2,
          memberName: String(note?.memberName || memberMap.get(clientId2)?.memberName || '').trim() || clientId2,
          noteText: String(note?.noteText || '').trim(),
          createdAt: createdAtIso,
          createdByName: String(note?.createdByName || note?.createdBy || '').trim() || 'Unknown',
          source: String(note?.source || '').trim() || 'Unknown',
        });
      });
    }
    notesToday.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

    const activitySnap = await authz.adminDb.collection(MEMBER_ACTIVITY_COLLECTION).limit(5000).get();
    const statusChangesToday = activitySnap.docs
      .map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((row: any) => clientIds.includes(String(row?.clientId2 || '').trim()))
      .filter((row: any) => String(row?.activityType || '').trim().toLowerCase() === 'status_change')
      .map((row: any) => ({
        id: String(row?.id || ''),
        clientId2: String(row?.clientId2 || '').trim(),
        memberName:
          memberMap.get(String(row?.clientId2 || '').trim())?.memberName ||
          String(row?.relatedData?.memberName || '').trim() ||
          String(row?.clientId2 || '').trim(),
        oldStatus: String(row?.oldValue || '').trim(),
        newStatus: String(row?.newValue || '').trim(),
        fieldChanged: String(row?.fieldChanged || '').trim(),
        changedByName: String(row?.changedByName || '').trim() || 'Unknown',
        timestamp: toIso(row?.timestamp || row?.createdAt),
      }))
      .filter((row: any) => Boolean(row.timestamp) && toEtDayKey(row.timestamp) === todayEt)
      .sort((a: any, b: any) => toMs(a.timestamp) - toMs(b.timestamp));

    const noActionTransitionsToday = statusChangesToday
      .map((event: any) => {
        const oldInScope = NO_ACTION_SCOPED_STATUS_SET.has(normalizeText(event.oldStatus));
        const newInScope = NO_ACTION_SCOPED_STATUS_SET.has(normalizeText(event.newStatus));
        if (oldInScope === newInScope) return null;
        return {
          type: newInScope ? 'entered_scope' : 'left_scope',
          clientId2: event.clientId2,
          memberName: event.memberName,
          fromStatus: event.oldStatus,
          toStatus: event.newStatus,
          timestamp: event.timestamp,
          changedByName: event.changedByName,
        };
      })
      .filter(Boolean) as any[];

    const endTotals = {
      totalAssigned: Number(metrics?.totalAssigned || memberRows.length || 0),
      activeAssigned: Number(metrics?.activeAssigned || 0),
      passiveAssigned: Number(metrics?.passiveAssigned || 0),
      noActionTotal: Number(metrics?.noActionTotal || 0),
      noActionCritical: Number(metrics?.noActionCritical || 0),
      noActionPriority: Number(metrics?.noActionPriority || 0),
      notesTodayCount: Number(metrics?.notesTodayCount || notesToday.length),
    };

    let startActive = endTotals.activeAssigned;
    let startNoActionTotal = endTotals.noActionTotal;
    let startNoActionCritical = endTotals.noActionCritical;
    let startNoActionPriority = endTotals.noActionPriority;

    const reversed = [...statusChangesToday].reverse();
    for (const event of reversed) {
      const oldInScope = NO_ACTION_SCOPED_STATUS_SET.has(normalizeText(event.oldStatus));
      const newInScope = NO_ACTION_SCOPED_STATUS_SET.has(normalizeText(event.newStatus));
      const oldBucket = getPriorityBucket(event.oldStatus);
      const newBucket = getPriorityBucket(event.newStatus);

      if (newInScope && !oldInScope) {
        startActive = Math.max(0, startActive - 1);
        startNoActionTotal = Math.max(0, startNoActionTotal - 1);
        if (newBucket === 'critical') startNoActionCritical = Math.max(0, startNoActionCritical - 1);
        if (newBucket === 'priority') startNoActionPriority = Math.max(0, startNoActionPriority - 1);
      } else if (!newInScope && oldInScope) {
        startActive += 1;
        startNoActionTotal += 1;
        if (oldBucket === 'critical') startNoActionCritical += 1;
        if (oldBucket === 'priority') startNoActionPriority += 1;
      } else if (newInScope && oldInScope && oldBucket !== newBucket) {
        if (newBucket === 'critical') startNoActionCritical = Math.max(0, startNoActionCritical - 1);
        if (newBucket === 'priority') startNoActionPriority = Math.max(0, startNoActionPriority - 1);
        if (oldBucket === 'critical') startNoActionCritical += 1;
        if (oldBucket === 'priority') startNoActionPriority += 1;
      }
    }

    const startPassive = Math.max(0, endTotals.totalAssigned - startActive);
    const dayComparison = {
      startOfDay: {
        activeAssigned: startActive,
        passiveAssigned: startPassive,
        noActionTotal: startNoActionTotal,
        noActionCritical: startNoActionCritical,
        noActionPriority: startNoActionPriority,
      },
      endOfDay: {
        activeAssigned: endTotals.activeAssigned,
        passiveAssigned: endTotals.passiveAssigned,
        noActionTotal: endTotals.noActionTotal,
        noActionCritical: endTotals.noActionCritical,
        noActionPriority: endTotals.noActionPriority,
      },
      delta: {
        activeAssigned: endTotals.activeAssigned - startActive,
        passiveAssigned: endTotals.passiveAssigned - startPassive,
        noActionTotal: endTotals.noActionTotal - startNoActionTotal,
        noActionCritical: endTotals.noActionCritical - startNoActionCritical,
        noActionPriority: endTotals.noActionPriority - startNoActionPriority,
      },
    };

    const nowIso = new Date().toISOString();
    const docId = `${todayEt}__${slug(staffName)}`;
    await authz.adminDb.collection(LOG_COLLECTION).doc(docId).set(
      {
        id: docId,
        dateKey: todayEt,
        staffName,
        submittedByUid: authz.uid,
        submittedByEmail: authz.email,
        submittedByName: authz.displayName,
        submittedAt: nowIso,
        lastUpdatedAt: nowIso,
        metrics: endTotals,
        membersInScope: memberRows,
        todayNotes: notesToday,
        kaiserStatusChangesToday: statusChangesToday,
        noActionChangesToday: noActionTransitionsToday,
        dayComparison,
        replaceStrategy: 'same_day_replace_latest',
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      id: docId,
      dateKey: todayEt,
      staffName,
      submittedAt: nowIso,
      notesTodayCount: notesToday.length,
      statusChangesCount: statusChangesToday.length,
      noActionChangesCount: noActionTransitionsToday.length,
    });
  } catch (error: any) {
    console.error('❌ [KAISER-DAILY-LOG-SUBMIT] failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to submit daily log' },
      { status: 500 }
    );
  }
}

