import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACTION_SCOPED_STATUS_SET = new Set(
  [
    'T2038 received, Need First Contact',
    'T2038 received, Needs First Contact',
    'T2038 received, doc collection',
    'RCFE Needed',
    'R&B Needed',
    'R B Needed',
  ]
    .map((status) => String(status || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
);

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toCanonicalCalaimStatus = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return 'No Status';
  if (normalized === 'authorized') return 'Authorized';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'non active') return 'Non_Active';
  if (normalized === 'member died' || normalized === 'died') return 'Member Died';
  if (normalized === 'authorized on hold') return 'Authorized on hold';
  if (normalized === 'h2022') return 'H2022';
  if (normalized === 'authorization ended') return 'Authorization Ended';
  if (normalized === 'denied') return 'Denied';
  if (normalized === 'not interested') return 'Not interested';
  if (normalized === 'pending to switch') return 'Pending to switch';
  return String(value ?? '').trim() || 'No Status';
};

const isAuthorizedOrPending = (value: unknown) => {
  const canonical = toCanonicalCalaimStatus(value);
  return canonical === 'Authorized' || canonical === 'Pending';
};

const normalizeStaff = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unassigned';
  if (/^\d+$/.test(raw)) return 'Unassigned';
  return raw;
};

const getStaffAssignmentValue = (member: any): string =>
  String(
    member?.Staff_Assigned ||
      member?.Kaiser_User_Assignment ||
      member?.Staff_Assignment ||
      member?.Assigned_Staff ||
      member?.kaiser_user_assignment ||
      member?.SW_ID ||
      ''
  ).trim();

const getEffectiveKaiserStatus = (member: any) =>
  String(member?.Kaiser_Status || member?.Kaiser_ID_Status || member?.kaiserStatus || member?.status || '').trim() ||
  'Unknown';

const getPriorityBucket = (status: string): 'critical' | 'priority' | 'other' => {
  const normalized = normalizeText(status);
  const critical =
    normalized === 't2038 received' || normalized === 'received t2038' || normalized.includes('need first contact');
  if (critical) return 'critical';
  const priority =
    normalized.includes('doc collection') ||
    normalized === 'rcfe needed' ||
    normalized === 'r b needed' ||
    normalized === 'r&b needed';
  if (priority) return 'priority';
  return 'other';
};

const isNoActionForWeek = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return true;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return true;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - parsed.getTime() >= sevenDaysMs;
};

async function requireAdmin(idToken: string) {
  const adminCheck = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
  if (!adminCheck.ok) return adminCheck;
  const { adminDb, uid, email, decodedClaims } = adminCheck;
  const claimSuperAdmin = Boolean((decodedClaims as any)?.superAdmin);
  const claimKaiserManager = Boolean((decodedClaims as any)?.kaiserManager);

  let isAdmin = Boolean((decodedClaims as any)?.admin) || claimSuperAdmin;
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

  return {
    ok: true as const,
    uid,
    email,
    isSuperAdmin,
    isKaiserManager,
  };
}

type Payload = {
  staffName: string;
  members: Array<{ clientId2: string; memberName: string; currentStatus: string }>;
  metrics: {
    totalAssigned: number;
    activeAssigned: number;
    passiveAssigned: number;
    noActionTotal: number;
    noActionCritical: number;
    noActionPriority: number;
    notesTodayCount: number;
  };
};

async function getMemberMeta(origin: string, member: any, staffName: string) {
  const clientId2 = String(member?.client_ID2 || member?.Client_ID2 || '').trim();
  if (!clientId2) {
    return {
      clientId2,
      assignedStaffNotesTodayCount: 0,
      lastAssignedStaffActionAt: '',
    };
  }
  const query = new URLSearchParams({
    clientId2,
    skipSync: 'true',
    metaOnly: 'true',
    assignedStaff: staffName,
  });
  const res = await fetch(`${origin}/api/member-notes?${query.toString()}`, { method: 'GET', cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    return {
      clientId2,
      assignedStaffNotesTodayCount: 0,
      lastAssignedStaffActionAt: '',
    };
  }
  return {
    clientId2,
    assignedStaffNotesTodayCount: Number(data?.assignedStaffNotesTodayCount || 0),
    lastAssignedStaffActionAt: String(data?.lastAssignedStaffActionAt || '').trim(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const authz = await requireAdmin(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    if (!authz.isSuperAdmin && !authz.isKaiserManager) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin or Kaiser Manager can pull all daily logs.' },
        { status: 403 }
      );
    }

    const origin = req.nextUrl.origin;
    const membersRes = await fetch(`${origin}/api/kaiser-members`, { method: 'GET', cache: 'no-store' });
    const membersData = await membersRes.json().catch(() => ({}));
    if (!membersRes.ok || !membersData?.success) {
      return NextResponse.json({ success: false, error: 'Failed to load Kaiser members from cache.' }, { status: 502 });
    }

    const members = Array.isArray(membersData?.members) ? membersData.members : [];
    const staffGroups = members.reduce((acc: Record<string, any[]>, member: any) => {
      if (!isAuthorizedOrPending(member?.CalAIM_Status ?? member?.calaim_status ?? member?.CALAIM_STATUS)) return acc;
      const staffName = normalizeStaff(getStaffAssignmentValue(member));
      if (!acc[staffName]) acc[staffName] = [];
      acc[staffName].push(member);
      return acc;
    }, {});

    const staffNames = Object.keys(staffGroups);
    let success = 0;
    let failed = 0;
    const failedStaff: Array<{ staffName: string; error: string }> = [];

    for (const staffName of staffNames) {
      const staffMembers = staffGroups[staffName] || [];
      const payloadMembers = staffMembers
        .map((member: any) => ({
          clientId2: String(member?.client_ID2 || member?.Client_ID2 || '').trim(),
          memberName: `${String(member?.memberFirstName || '').trim()} ${String(member?.memberLastName || '').trim()}`.trim(),
          currentStatus: getEffectiveKaiserStatus(member),
        }))
        .filter((row: any) => row.clientId2);

      const activeMembers = staffMembers.filter((member: any) =>
        NO_ACTION_SCOPED_STATUS_SET.has(normalizeText(getEffectiveKaiserStatus(member)))
      );
      const activeAssigned = activeMembers.length;
      const passiveAssigned = Math.max(0, payloadMembers.length - activeAssigned);

      const memberMeta = await Promise.all(staffMembers.map((member: any) => getMemberMeta(origin, member, staffName)));
      const notesTodayCount = memberMeta.reduce(
        (sum, row) => sum + Number(row?.assignedStaffNotesTodayCount || 0),
        0
      );

      let noActionTotal = 0;
      let noActionCritical = 0;
      let noActionPriority = 0;
      for (let i = 0; i < activeMembers.length; i += 1) {
        const member = activeMembers[i];
        const status = getEffectiveKaiserStatus(member);
        const clientId2 = String(member?.client_ID2 || member?.Client_ID2 || '').trim();
        const meta = memberMeta.find((row) => row.clientId2 === clientId2);
        if (!isNoActionForWeek(String(meta?.lastAssignedStaffActionAt || ''))) continue;
        noActionTotal += 1;
        const bucket = getPriorityBucket(status);
        if (bucket === 'critical') noActionCritical += 1;
        if (bucket === 'priority') noActionPriority += 1;
      }

      const submitPayload: Payload = {
        staffName,
        members: payloadMembers,
        metrics: {
          totalAssigned: payloadMembers.length,
          activeAssigned,
          passiveAssigned,
          noActionTotal,
          noActionCritical,
          noActionPriority,
          notesTodayCount,
        },
      };

      try {
        const submitRes = await fetch(`${origin}/api/admin/kaiser-tracker-daily-log/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, ...submitPayload }),
        });
        const submitData = await submitRes.json().catch(() => ({}));
        if (!submitRes.ok || !submitData?.success) {
          failed += 1;
          failedStaff.push({ staffName, error: String(submitData?.error || 'Submit failed') });
          continue;
        }
        success += 1;
      } catch (error: any) {
        failed += 1;
        failedStaff.push({ staffName, error: String(error?.message || 'Submit failed') });
      }
    }

    return NextResponse.json({
      success: true,
      totalStaff: staffNames.length,
      success,
      failed,
      failedStaff,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to pull all daily logs' },
      { status: 500 }
    );
  }
}

