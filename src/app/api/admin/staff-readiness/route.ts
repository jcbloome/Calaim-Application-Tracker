import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cleanEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeRole = (value: unknown) => String(value || '').trim().toLowerCase();
const isStaffLikeRole = (value: unknown) => {
  const role = normalizeRole(value);
  return role === 'admin' || role === 'super admin' || role === 'super_admin' || role === 'staff';
};

type StaffReadinessEvaluation = {
  email: string;
  readyForAdminPortal: boolean;
  reasons: string[];
  checks: {
    authUserExists: boolean;
    authUserDisabled: boolean;
    uid: string | null;
    hasUsersDocByUid: boolean;
    usersRole: string | null;
    usersIsStaff: boolean | null;
    hasHardcodedAdmin: boolean;
    hasAdminCustomClaim: boolean;
    hasRoleAdminByUid: boolean;
    hasRoleSuperByUid: boolean;
    hasRoleAdminByEmail: boolean;
    hasRoleSuperByEmail: boolean;
    hasAnyAdminRole: boolean;
    hasSwDocByUid: boolean;
    hasSwDocByEmail: boolean;
    hasSwByEmailQuery: boolean;
    hasSwLaneRecord: boolean;
    swRecordIsActive: boolean | null;
    blockedPortal: boolean;
    laneConflictWouldBlock: boolean;
  };
};

type BatchResult = {
  mode: 'all_users' | 'all_social_workers';
  summary: { total: number; ready: number; notReady: number };
  results: StaffReadinessEvaluation[];
};

const evaluateReadiness = async (adminCheck: any, email: string): Promise<StaffReadinessEvaluation> => {
  const authUserResult = await adminCheck.adminAuth.getUserByEmail(email).catch((error: any) => {
    if (String(error?.code || '').trim() === 'auth/user-not-found') return null;
    throw error;
  });

  const userUid = String(authUserResult?.uid || '').trim();
  const [usersDocByUid, rolesAdminByUid, rolesSuperByUid, rolesAdminByEmail, rolesSuperByEmail] = await Promise.all([
    userUid ? adminCheck.adminDb.collection('users').doc(userUid).get() : Promise.resolve(null),
    userUid ? adminCheck.adminDb.collection('roles_admin').doc(userUid).get() : Promise.resolve(null),
    userUid ? adminCheck.adminDb.collection('roles_super_admin').doc(userUid).get() : Promise.resolve(null),
    adminCheck.adminDb.collection('roles_admin').doc(email).get(),
    adminCheck.adminDb.collection('roles_super_admin').doc(email).get(),
  ]);

  const [swDocByUid, swDocByEmail, swByEmailQuery] = await Promise.all([
    userUid ? adminCheck.adminDb.collection('socialWorkers').doc(userUid).get() : Promise.resolve(null),
    adminCheck.adminDb.collection('socialWorkers').doc(email).get(),
    adminCheck.adminDb.collection('socialWorkers').where('email', '==', email).limit(1).get(),
  ]);

  const hasRoleAdminByUid = Boolean(rolesAdminByUid?.exists);
  const hasRoleSuperByUid = Boolean(rolesSuperByUid?.exists);
  const hasRoleAdminByEmail = Boolean(rolesAdminByEmail?.exists);
  const hasRoleSuperByEmail = Boolean(rolesSuperByEmail?.exists);
  const hasHardcodedAdmin = isHardcodedAdminEmail(email);
  const hasAnyAdminRole = hasHardcodedAdmin || hasRoleAdminByUid || hasRoleSuperByUid || hasRoleAdminByEmail || hasRoleSuperByEmail;

  const hasSwLaneRecord =
    Boolean(swDocByUid?.exists) || Boolean(swDocByEmail?.exists) || Boolean(swByEmailQuery?.empty === false);
  const swDocData = swDocByUid?.exists
    ? swDocByUid.data()
    : swDocByEmail?.exists
      ? swDocByEmail.data()
      : swByEmailQuery?.empty === false
        ? swByEmailQuery.docs[0]?.data()
        : null;
  const swRecordIsActive =
    swDocData && Object.prototype.hasOwnProperty.call(swDocData, 'isActive')
      ? Boolean((swDocData as any)?.isActive)
      : null;
  const blockedPortal = isBlockedPortalEmail(email);
  const authUserExists = Boolean(authUserResult);
  const authUserDisabled = Boolean(authUserResult?.disabled);
  const customClaims = (authUserResult?.customClaims || {}) as Record<string, unknown>;
  const hasAdminCustomClaim = Boolean(customClaims.admin) || Boolean(customClaims.superAdmin);

  // Mirrors /api/auth/admin-session behavior:
  // - blocked emails are denied
  // - account must have admin access
  // - SW lane record only blocks if there is no admin access
  const laneConflictWouldBlock = hasSwLaneRecord && !hasAnyAdminRole && !hasAdminCustomClaim;
  const readyForAdminPortal = authUserExists && !authUserDisabled && !blockedPortal && !laneConflictWouldBlock && (hasAnyAdminRole || hasAdminCustomClaim);

  const reasons: string[] = [];
  if (!authUserExists) reasons.push('No Firebase Auth user exists for this email.');
  if (authUserDisabled) reasons.push('Firebase Auth user is currently disabled.');
  if (!hasAnyAdminRole && !hasAdminCustomClaim) reasons.push('No admin role found (roles_admin / roles_super_admin / custom claims).');
  if (blockedPortal) reasons.push('Email is explicitly blocked from admin portal login.');
  if (laneConflictWouldBlock) reasons.push('Account is in social worker lane without admin privileges.');

  return {
    email,
    readyForAdminPortal,
    reasons,
    checks: {
      authUserExists,
      authUserDisabled,
      uid: userUid || null,
      hasUsersDocByUid: Boolean(usersDocByUid?.exists),
      usersRole: usersDocByUid?.exists ? String((usersDocByUid.data() as any)?.role || '').trim() || null : null,
      usersIsStaff: usersDocByUid?.exists ? Boolean((usersDocByUid.data() as any)?.isStaff) : null,
      hasHardcodedAdmin,
      hasAdminCustomClaim,
      hasRoleAdminByUid,
      hasRoleSuperByUid,
      hasRoleAdminByEmail,
      hasRoleSuperByEmail,
      hasAnyAdminRole,
      hasSwDocByUid: Boolean(swDocByUid?.exists),
      hasSwDocByEmail: Boolean(swDocByEmail?.exists),
      hasSwByEmailQuery: Boolean(swByEmailQuery?.empty === false),
      hasSwLaneRecord,
      swRecordIsActive,
      blockedPortal,
      laneConflictWouldBlock,
    },
  };
};

const listAllAuthUsersByEmail = async (adminAuth: any) => {
  const byEmail = new Map<string, { uid: string; disabled: boolean; customClaims: Record<string, unknown> }>();
  let pageToken: string | undefined = undefined;
  let pages = 0;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    (page.users || []).forEach((user: any) => {
      const email = cleanEmail(user?.email);
      if (!email) return;
      byEmail.set(email, {
        uid: String(user?.uid || '').trim(),
        disabled: Boolean(user?.disabled),
        customClaims: (user?.customClaims || {}) as Record<string, unknown>,
      });
    });
    pageToken = page.pageToken || undefined;
    pages += 1;
  } while (pageToken && pages < 20);
  return byEmail;
};

const runAllUsersReadiness = async (adminCheck: any): Promise<BatchResult> => {
  const [usersSnap, authByEmail] = await Promise.all([
    adminCheck.adminDb.collection('users').limit(5000).get(),
    listAllAuthUsersByEmail(adminCheck.adminAuth),
  ]);

  const results: StaffReadinessEvaluation[] = [];
  usersSnap.docs.forEach((docSnap: any) => {
    const data = docSnap.data() || {};
    const email = cleanEmail(data?.email || (String(docSnap.id || '').includes('@') ? docSnap.id : ''));
    if (!email) return;
    if (Boolean(data?.isStaff) || isStaffLikeRole(data?.role)) return;

    const authUser = authByEmail.get(email);
    const authUserExists = Boolean(authUser);
    const authUserDisabled = Boolean(authUser?.disabled);
    const reasons: string[] = [];
    if (!authUserExists) reasons.push('No Firebase Auth user exists for this user email.');
    if (authUserDisabled) reasons.push('Firebase Auth user is currently disabled.');
    const readyForAdminPortal = authUserExists && !authUserDisabled;

    results.push({
      email,
      readyForAdminPortal,
      reasons,
      checks: {
        authUserExists,
        authUserDisabled,
        uid: authUser?.uid || String(docSnap.id || '') || null,
        hasUsersDocByUid: true,
        usersRole: String(data?.role || '').trim() || null,
        usersIsStaff: Boolean(data?.isStaff),
        hasHardcodedAdmin: false,
        hasAdminCustomClaim: false,
        hasRoleAdminByUid: false,
        hasRoleSuperByUid: false,
        hasRoleAdminByEmail: false,
        hasRoleSuperByEmail: false,
        hasAnyAdminRole: false,
        hasSwDocByUid: false,
        hasSwDocByEmail: false,
        hasSwByEmailQuery: false,
        hasSwLaneRecord: false,
        swRecordIsActive: null,
        blockedPortal: false,
        laneConflictWouldBlock: false,
      },
    });
  });

  const ready = results.filter((r) => r.readyForAdminPortal).length;
  return {
    mode: 'all_users',
    summary: { total: results.length, ready, notReady: results.length - ready },
    results: results.sort((a, b) => a.email.localeCompare(b.email)),
  };
};

const runAllSocialWorkersReadiness = async (adminCheck: any): Promise<BatchResult> => {
  const [swSnap, rolesAdminSnap, rolesSuperSnap, authByEmail] = await Promise.all([
    adminCheck.adminDb.collection('socialWorkers').limit(5000).get(),
    adminCheck.adminDb.collection('roles_admin').limit(5000).get(),
    adminCheck.adminDb.collection('roles_super_admin').limit(5000).get(),
    listAllAuthUsersByEmail(adminCheck.adminAuth),
  ]);

  const roleAdminDocIds = new Set(rolesAdminSnap.docs.map((docSnap: any) => String(docSnap.id || '').trim().toLowerCase()).filter(Boolean));
  const roleSuperDocIds = new Set(rolesSuperSnap.docs.map((docSnap: any) => String(docSnap.id || '').trim().toLowerCase()).filter(Boolean));

  const byEmail = new Map<string, { isActive: boolean; uidLikeDocExists: boolean }>();
  swSnap.docs.forEach((docSnap: any) => {
    const data = docSnap.data() || {};
    const docId = String(docSnap.id || '').trim();
    const email = cleanEmail(data?.email || (docId.includes('@') ? docId : ''));
    if (!email) return;
    const existing = byEmail.get(email) || { isActive: false, uidLikeDocExists: false };
    const hasExplicitActive = Object.prototype.hasOwnProperty.call(data, 'isActive');
    const currentIsActive = hasExplicitActive ? Boolean(data?.isActive) : false;
    byEmail.set(email, {
      isActive: existing.isActive || currentIsActive,
      uidLikeDocExists: existing.uidLikeDocExists || !docId.includes('@'),
    });
  });

  const results: StaffReadinessEvaluation[] = [];
  Array.from(byEmail.entries()).forEach(([email, swMeta]) => {
    const authUser = authByEmail.get(email);
    const uid = String(authUser?.uid || '').trim();
    const hasAdminCustomClaim = Boolean(authUser?.customClaims?.admin) || Boolean(authUser?.customClaims?.superAdmin);
    const hasHardcodedAdmin = isHardcodedAdminEmail(email);
    const hasRoleAdminByUid = uid ? roleAdminDocIds.has(uid.toLowerCase()) : false;
    const hasRoleSuperByUid = uid ? roleSuperDocIds.has(uid.toLowerCase()) : false;
    const hasRoleAdminByEmail = roleAdminDocIds.has(email);
    const hasRoleSuperByEmail = roleSuperDocIds.has(email);
    const hasAnyAdminRole = hasHardcodedAdmin || hasRoleAdminByUid || hasRoleSuperByUid || hasRoleAdminByEmail || hasRoleSuperByEmail;
    const authUserExists = Boolean(authUser);
    const authUserDisabled = Boolean(authUser?.disabled);
    const hasAdminLaneAccess = hasAnyAdminRole || hasAdminCustomClaim;

    const reasons: string[] = [];
    if (!authUserExists) reasons.push('No Firebase Auth user exists for this social worker email.');
    if (authUserDisabled) reasons.push('Firebase Auth user is currently disabled.');
    if (!swMeta.isActive) reasons.push('Social worker record is missing active status (`isActive: true`).');
    if (hasAdminLaneAccess) reasons.push('This email appears to be configured for admin lane and is blocked from SW session creation.');

    const readyForAdminPortal = authUserExists && !authUserDisabled && swMeta.isActive && !hasAdminLaneAccess;
    results.push({
      email,
      readyForAdminPortal,
      reasons,
      checks: {
        authUserExists,
        authUserDisabled,
        uid: uid || null,
        hasUsersDocByUid: false,
        usersRole: null,
        usersIsStaff: null,
        hasHardcodedAdmin,
        hasAdminCustomClaim,
        hasRoleAdminByUid,
        hasRoleSuperByUid,
        hasRoleAdminByEmail,
        hasRoleSuperByEmail,
        hasAnyAdminRole,
        hasSwDocByUid: swMeta.uidLikeDocExists,
        hasSwDocByEmail: true,
        hasSwByEmailQuery: true,
        hasSwLaneRecord: true,
        swRecordIsActive: swMeta.isActive,
        blockedPortal: false,
        laneConflictWouldBlock: false,
      },
    });
  });

  const ready = results.filter((r) => r.readyForAdminPortal).length;
  return {
    mode: 'all_social_workers',
    summary: { total: results.length, ready, notReady: results.length - ready },
    results: results.sort((a, b) => a.email.localeCompare(b.email)),
  };
};

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const modeRaw = String(body?.mode || '').trim().toLowerCase();
    const mode: 'staff_single' | 'all_users' | 'all_social_workers' =
      modeRaw === 'all_users' || modeRaw === 'all_social_workers' ? (modeRaw as any) : 'staff_single';

    if (mode === 'all_users') {
      const batch = await runAllUsersReadiness(adminCheck);
      return NextResponse.json({ success: true, ...batch });
    }
    if (mode === 'all_social_workers') {
      const batch = await runAllSocialWorkersReadiness(adminCheck);
      return NextResponse.json({ success: true, ...batch });
    }

    const email = cleanEmail(body?.email);
    const autoFix = Boolean(body?.autoFix);
    if (!email) {
      return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
    }

    const fixesApplied: string[] = [];
    const warnings: string[] = [];
    let evaluation = await evaluateReadiness(adminCheck, email);

    if (autoFix) {
      const targetUid = String(evaluation?.checks?.uid || '').trim();
      if (!evaluation?.checks?.authUserExists || !targetUid) {
        warnings.push('Cannot auto-fix because no Firebase Auth account exists for this email.');
      } else {
        if (evaluation?.checks?.authUserDisabled) {
          await adminCheck.adminAuth.updateUser(targetUid, { disabled: false });
          fixesApplied.push('Enabled Firebase Auth user (was disabled).');
        }

        if (!evaluation?.checks?.hasAnyAdminRole && !evaluation?.checks?.hasAdminCustomClaim) {
          const nowTs = (await import('@/firebase-admin')).default.firestore.FieldValue.serverTimestamp();
          await Promise.all([
            adminCheck.adminDb.collection('roles_admin').doc(targetUid).set(
              {
                enabled: true,
                source: 'staff_readiness_auto_fix',
                updatedByUid: adminCheck.uid,
                updatedByEmail: adminCheck.email,
                updatedAt: nowTs,
                createdAt: nowTs,
              },
              { merge: true }
            ),
            adminCheck.adminDb.collection('roles_admin').doc(email).set(
              {
                enabled: true,
                source: 'staff_readiness_auto_fix_legacy_email_doc',
                linkedUid: targetUid,
                updatedByUid: adminCheck.uid,
                updatedByEmail: adminCheck.email,
                updatedAt: nowTs,
                createdAt: nowTs,
              },
              { merge: true }
            ),
            adminCheck.adminDb.collection('users').doc(targetUid).set(
              {
                email,
                isStaff: true,
                role: 'Admin',
                updatedAt: nowTs,
              },
              { merge: true }
            ),
          ]);
          fixesApplied.push('Added admin role records and synced users profile as Admin staff.');
        }
      }
      if (evaluation?.checks?.blockedPortal) {
        warnings.push('Email is in blocked portal list; code-level policy update is required to unblock it.');
      }
      evaluation = await evaluateReadiness(adminCheck, email);
    }

    return NextResponse.json({
      success: true,
      mode,
      ...evaluation,
      autoFixAttempted: autoFix,
      fixesApplied,
      warnings,
    });
  } catch (error: any) {
    console.error('staff-readiness check failed:', error);
    return NextResponse.json({ success: false, error: String(error?.message || 'Failed to check staff readiness') }, { status: 500 });
  }
}

