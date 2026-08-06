import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cleanEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const evaluateReadiness = async (adminCheck: any, email: string) => {
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
      blockedPortal,
      laneConflictWouldBlock,
    },
  };
};

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
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

