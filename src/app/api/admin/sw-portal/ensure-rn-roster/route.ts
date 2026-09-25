import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { ensureSocialWorkerAuthUser } from '@/lib/sw-auth-provision';
import { isEligibleRnPortalEmail, isRnPortalExcludedStaffEmail } from '@/lib/rn-portal-access';
import { sendPasswordResetEmail } from '@/lib/password-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 220) => String(value ?? '').trim().slice(0, max);

type RnRow = {
  email?: string;
  displayName?: string;
  name?: string;
  rnId?: string;
  rn_id?: string;
  county?: string;
};

/**
 * Ensure every eligible Caspio RN has active /sw-login portal access.
 * Skips Connections staff emails (e.g. leslie@carehomefinders.com).
 * Password setup emails are only sent for newly created Auth accounts.
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      rns?: RnRow[];
      sendInvitesForNewAccounts?: boolean;
    };
    const rows = Array.isArray(body.rns) ? body.rns : [];
    const sendInvitesForNewAccounts = body.sendInvitesForNewAccounts !== false;

    const admin = (await import('@/firebase-admin')).default;
    const adminDb = authz.adminDb;

    let enabled = 0;
    let created = 0;
    let invitesSent = 0;
    let skippedStaff = 0;
    let skippedInvalid = 0;
    let alreadyActive = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const row of rows) {
      const email = clean(row.email, 220).toLowerCase();
      if (!email.includes('@')) {
        skippedInvalid += 1;
        continue;
      }
      if (isRnPortalExcludedStaffEmail(email) || !isEligibleRnPortalEmail(email)) {
        skippedStaff += 1;
        // Ensure staff cannot stay accidentally active on the SW portal lane.
        try {
          await adminDb.collection('socialWorkers').doc(email).set(
            {
              isActive: false,
              portalKind: 'rn',
              isRnPortal: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedBy: authz.email || authz.uid,
              portalBlockedReason: 'connections_staff_email',
            },
            { merge: true }
          );
        } catch {
          // best-effort
        }
        continue;
      }

      const displayName = clean(row.displayName || row.name, 140) || email.split('@')[0] || 'RN';
      const rnId = clean(row.rnId || row.rn_id, 80);
      const county = clean(row.county, 120);

      try {
        const existing = await adminDb.collection('socialWorkers').doc(email).get();
        const alreadyOn = existing.exists && Boolean((existing.data() as any)?.isActive);

        const provisioned = await ensureSocialWorkerAuthUser({
          email,
          displayName,
          swId: rnId || undefined,
          county: county || undefined,
          createdBy: authz.email || authz.uid || 'ensure-rn-roster',
          activatePortal: true,
          portalKind: 'rn',
        });

        const nameParts = displayName.split(/\s+/).filter(Boolean);
        await adminDb.collection('users').doc(provisioned.uid).set(
          {
            email,
            displayName: provisioned.displayName,
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' ') || '',
            isRnStaff: true,
            isRnPortal: true,
            rn_id: rnId || null,
            RN_ID: rnId || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: authz.email || authz.uid,
          },
          { merge: true }
        );

        if (alreadyOn && !provisioned.created) {
          alreadyActive += 1;
        } else {
          enabled += 1;
        }
        if (provisioned.created) created += 1;

        if (sendInvitesForNewAccounts && provisioned.created) {
          try {
            const result = await sendPasswordResetEmail(request, email, 'sw');
            const ok = result.status >= 200 && result.status < 300;
            if (ok) invitesSent += 1;
            await adminDb.collection('socialWorkers').doc(email).set(
              {
                lastPasswordSetupEmailAt: admin.firestore.FieldValue.serverTimestamp(),
                lastPasswordSetupEmailStatus: ok ? 'success' : 'failure',
                lastPasswordSetupEmailError: ok
                  ? null
                  : String((result.body as any)?.error || 'Failed to send password setup email.'),
                lastPasswordSetupEmailTo: email,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          } catch (inviteError: any) {
            errors.push({
              email,
              error: `Provisioned but invite failed: ${String(inviteError?.message || inviteError)}`,
            });
          }
        }
      } catch (error: any) {
        errors.push({ email, error: String(error?.message || error) });
      }
    }

    return NextResponse.json({
      success: true,
      enabled,
      created,
      invitesSent,
      alreadyActive,
      skippedStaff,
      skippedInvalid,
      errorCount: errors.length,
      errors: errors.slice(0, 25),
      message: `RN portal roster: ${enabled + alreadyActive} active, ${created} new login(s), ${skippedStaff} staff skipped.`,
    });
  } catch (error: any) {
    console.error('ensure-rn-roster failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to ensure RN portal roster.' },
      { status: 500 }
    );
  }
}
