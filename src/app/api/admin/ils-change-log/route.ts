import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, default as admin } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const SPECIAL_ILS_STAFF_EMAILS = new Set<string>(['jocelyn@ilshealth.com']);
const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyClinicalLabel = (...values: unknown[]) => {
  const merged = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ');
  if (!merged) return false;
  return /\b(rn|nurse|social worker|msw|lcsw|lmft|clinical|therapist)\b/.test(merged);
};

async function canAccessIlsLog(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  if (
    Boolean((decoded as any)?.admin) ||
    Boolean((decoded as any)?.superAdmin) ||
    isHardcodedAdminEmail(email) ||
    SPECIAL_ILS_STAFF_EMAILS.has(email)
  ) {
    return { ok: true as const, uid, email };
  }

  const [adminRole, superAdminRole, ilsAccess] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
    adminDb.collection('system_settings').doc('ils_member_access').get(),
  ]);

  let isAdmin = adminRole.exists || superAdminRole.exists;
  if (!isAdmin && email) {
    const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
  }
  if (isAdmin) return { ok: true as const, uid, email };

  const allowedEmails = ilsAccess.exists ? ((ilsAccess.data()?.allowedEmails || []) as unknown[]) : [];
  const allowed = allowedEmails.map(normalizeEmail).includes(email);
  if (allowed || SPECIAL_ILS_STAFF_EMAILS.has(email)) return { ok: true as const, uid, email };

  const [userByUid, userByEmail, swByUid, swByEmail] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection('users').doc(email).get(),
    adminDb.collection('socialWorkers').doc(uid).get(),
    adminDb.collection('socialWorkers').doc(email).get(),
  ]);
  const userData = userByUid.exists
    ? (userByUid.data() as any)
    : userByEmail.exists
      ? (userByEmail.data() as any)
      : null;
  const hasStaffFlag = Boolean(
    userData?.isStaff ||
    userData?.isKaiserStaff ||
    userData?.isHealthNetStaff ||
    userData?.isClaimsStaff ||
    userData?.isKaiserAssignmentManager
  );
  const socialWorkerData = swByUid.exists
    ? (swByUid.data() as any)
    : swByEmail.exists
      ? (swByEmail.data() as any)
      : null;
  const isSocialWorker = Boolean(socialWorkerData && socialWorkerData.isActive !== false);
  const clinicalLike = isLikelyClinicalLabel(
    (decoded as any)?.name,
    email,
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
  if (!hasStaffFlag || isSocialWorker || clinicalLike) {
    return { ok: false as const, status: 403, error: 'Unauthorized' };
  }
  return { ok: true as const, uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const idToken = String(body?.idToken || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const authz = await canAccessIlsLog(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    if (action === 'create') {
      const memberId = String(body?.memberId || '').trim();
      const clientId2 = String(body?.clientId2 || '').trim();
      const memberName = String(body?.memberName || '').trim() || 'Member';
      const queue = String(body?.queue || '').trim() || 'unknown';
      const changes = body?.changes && typeof body.changes === 'object' ? body.changes : {};
      const eventType = String(body?.eventType || 'queue_change').trim() || 'queue_change';
      const queueChangeFlag = Boolean(body?.queueChangeFlag ?? true);
      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);

      const ref = adminDb.collection('ils_change_log').doc();
      await ref.set({
        memberId,
        clientId2,
        memberName,
        queue,
        eventType,
        queueChangeFlag,
        changes,
        changedByUid: authz.uid,
        changedByEmail: authz.email,
        dateKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtIso: now.toISOString(),
      });
      return NextResponse.json({ success: true, id: ref.id });
    }

    // default list
    const dateKey = String(body?.dateKey || '').trim(); // optional yyyy-mm-dd
    const limit = Math.min(500, Math.max(1, Number(body?.limit || 200)));
    let q: FirebaseFirestore.Query = adminDb.collection('ils_change_log').limit(limit);
    if (dateKey) q = adminDb.collection('ils_change_log').where('dateKey', '==', dateKey).limit(limit);
    const snap = await q.get();
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a: any, b: any) => String(b?.createdAtIso || '').localeCompare(String(a?.createdAtIso || '')));
    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to process ILS change log' }, { status: 500 });
  }
}
