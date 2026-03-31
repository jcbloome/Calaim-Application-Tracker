import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';

const SETTINGS_DOC = adminDb.collection('system_settings').doc('ils_member_access');

type Requester = {
  uid: string;
  email: string;
  displayName: string;
  isSuperAdmin: boolean;
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildUserTokens = (requester: Requester) => {
  const tokens = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizeText(value);
    if (!normalized) return;
    tokens.add(normalized);
    normalized.split(' ').forEach((part) => {
      if (part.length >= 3) tokens.add(part);
    });
  };
  add(requester.displayName);
  add(requester.email);
  const local = String(requester.email || '').split('@')[0] || '';
  add(local);
  return Array.from(tokens);
};

const assignmentMatchesRequester = (assignment: unknown, requester: Requester): boolean => {
  const normalizedAssignment = normalizeText(assignment);
  if (!normalizedAssignment || /^\d+$/.test(normalizedAssignment.replace(/\s+/g, ''))) return false;
  const tokens = buildUserTokens(requester);
  return tokens.some(
    (token) =>
      normalizedAssignment === token ||
      normalizedAssignment.includes(token) ||
      token.includes(normalizedAssignment)
  );
};

const isLikelyClinicalLabel = (...values: unknown[]) => {
  const merged = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ');
  if (!merged) return false;
  return /\b(rn|nurse|social worker|msw|lcsw|lmft|clinical|therapist)\b/.test(merged);
};

async function hasCoreStaffAccess(requester: Requester): Promise<boolean> {
  try {
    const [userByUid, userByEmail, adminRoleByUid, adminRoleByEmail, swByUid, swByEmail] = await Promise.all([
      adminDb.collection('users').doc(requester.uid).get(),
      adminDb.collection('users').doc(requester.email).get(),
      adminDb.collection('roles_admin').doc(requester.uid).get(),
      adminDb.collection('roles_admin').doc(requester.email).get(),
      adminDb.collection('socialWorkers').doc(requester.uid).get(),
      adminDb.collection('socialWorkers').doc(requester.email).get(),
    ]);

    const userData = userByUid.exists
      ? (userByUid.data() as any)
      : userByEmail.exists
        ? (userByEmail.data() as any)
        : null;

    const socialWorkerData = swByUid.exists
      ? (swByUid.data() as any)
      : swByEmail.exists
        ? (swByEmail.data() as any)
        : null;
    const isSocialWorker = Boolean(socialWorkerData && socialWorkerData.isActive !== false);

    const hasStaffFlag = Boolean(
      userData?.isStaff ||
      userData?.isKaiserStaff ||
      userData?.isHealthNetStaff ||
      userData?.isClaimsStaff ||
      userData?.isKaiserAssignmentManager ||
      adminRoleByUid.exists ||
      adminRoleByEmail.exists
    );

    if (!hasStaffFlag) return false;
    if (isSocialWorker) return false;

    const clinicalLike = isLikelyClinicalLabel(
      requester.displayName,
      requester.email,
      userData?.firstName,
      userData?.lastName,
      userData?.displayName,
      userData?.role,
      userData?.roleType,
      userData?.title,
      userData?.jobTitle,
      userData?.discipline,
      userData?.credentials
    );
    if (clinicalLike) return false;

    // Keep compatibility for legacy Kaiser assignment-based staff grants.
    const cacheSnap = await adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_MCO', '==', 'Kaiser')
      .limit(5000)
      .get();
    for (const doc of cacheSnap.docs) {
      const row = doc.data() as any;
      if (
        [row?.Kaiser_User_Assignment, row?.Staff_Assigned, row?.staff_assigned, row?.kaiser_user_assignment].some(
          (candidate) => assignmentMatchesRequester(candidate, requester)
        )
      ) {
        return true;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function getRequester(request: NextRequest): Promise<Requester | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = String(decoded.uid || '').trim();
    const email = normalizeEmail((decoded as any).email);
    const displayName = String((decoded as any).name || '').trim();
    if (!uid || !email) return null;
    if (isBlockedPortalEmail(email)) return null;

    let isSuperAdmin = Boolean((decoded as any).superAdmin) || isHardcodedAdminEmail(email);
    if (!isSuperAdmin) {
      const [byUid, byEmail] = await Promise.all([
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isSuperAdmin = byUid.exists || byEmail.exists;
    }

    return { uid, email, displayName, isSuperAdmin };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const requester = await getRequester(request);
    if (!requester) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await SETTINGS_DOC.get();
    const data = (doc.exists ? doc.data() : {}) as any;
    const allowedEmails = Array.isArray(data?.allowedEmails) ? data.allowedEmails.map(normalizeEmail).filter(Boolean) : [];
    const weeklyEmailEnabled = Boolean(data?.weeklyEmailEnabled);
    const weeklyEmailRecipients = Array.isArray(data?.weeklyEmailRecipients)
      ? data.weeklyEmailRecipients.map(normalizeEmail).filter(Boolean)
      : [];

    const hasCoreStaff = await hasCoreStaffAccess(requester);
    const canAccessIlsMembersPage =
      requester.isSuperAdmin || allowedEmails.includes(requester.email) || hasCoreStaff;

    return NextResponse.json({
      success: true,
      canAccessIlsMembersPage,
      isSuperAdmin: requester.isSuperAdmin,
      grantedBy: requester.isSuperAdmin
        ? 'super_admin'
        : allowedEmails.includes(requester.email)
          ? 'allowlist'
          : hasCoreStaff
            ? 'core_staff'
            : 'none',
      settings: requester.isSuperAdmin
        ? {
            allowedEmails,
            weeklyEmailEnabled,
            weeklyEmailRecipients,
            weeklySendDay: 'wednesday',
          }
        : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load ILS access settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const requester = await getRequester(request);
    if (!requester?.isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Super Admin required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const allowedEmails = Array.isArray(body?.allowedEmails)
      ? body.allowedEmails.map(normalizeEmail).filter((email: string) => Boolean(email) && !isBlockedPortalEmail(email))
      : [];
    const weeklyEmailEnabled = Boolean(body?.weeklyEmailEnabled);
    const weeklyEmailRecipients = Array.isArray(body?.weeklyEmailRecipients)
      ? body.weeklyEmailRecipients
          .map(normalizeEmail)
          .filter((email: string) => Boolean(email) && !isBlockedPortalEmail(email))
      : [];

    await SETTINGS_DOC.set(
      {
        allowedEmails: Array.from(new Set(allowedEmails)),
        weeklyEmailEnabled,
        weeklyEmailRecipients: Array.from(new Set(weeklyEmailRecipients)),
        weeklySendDay: 'wednesday',
        updatedAt: new Date().toISOString(),
        updatedByUid: requester.uid,
        updatedByEmail: requester.email,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save ILS access settings' }, { status: 500 });
  }
}

