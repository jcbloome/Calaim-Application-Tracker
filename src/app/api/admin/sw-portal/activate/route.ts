import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { sendPasswordResetEmail } from '@/lib/password-reset';
import { ensureSocialWorkerAuthUser } from '@/lib/sw-auth-provision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 220) => String(value ?? '').trim().slice(0, max);

export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const email = clean(body?.email, 220).toLowerCase();
    const displayName = clean(body?.displayName || body?.name, 140);
    const swId = clean(body?.swId || body?.sw_id || body?.SW_ID || body?.rnId || body?.rn_id || body?.RN_ID, 80);
    const county = clean(body?.county, 120);
    const portalKind = clean(body?.portalKind, 20).toLowerCase() === 'rn' ? 'rn' : 'sw';
    const active = body?.active === undefined ? true : Boolean(body.active);
    const sendInvite = body?.sendInvite === undefined ? active : Boolean(body.sendInvite);

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid social worker email is required.' }, { status: 400 });
    }

    if (!active) {
      const adminDb = authz.adminDb;
      const admin = (await import('@/firebase-admin')).default;
      const updates = {
        isActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: authz.email || authz.uid,
      };
      await Promise.all([
        adminDb.collection('socialWorkers').doc(email).set(updates, { merge: true }),
        adminDb
          .collection('socialWorkers')
          .where('email', '==', email)
          .limit(10)
          .get()
          .then(async (snap: any) => {
            await Promise.all(snap.docs.map((docSnap: any) => docSnap.ref.set(updates, { merge: true })));
          }),
      ]);
      return NextResponse.json({ success: true, email, active: false, portalKind });
    }

    const provisioned = await ensureSocialWorkerAuthUser({
      email,
      displayName,
      swId,
      county,
      createdBy: authz.email || authz.uid,
      activatePortal: true,
      portalKind,
    });

    // Tag RN portal users so ISP Workflow can route ALFT + final RN approval to them.
    if (portalKind === 'rn') {
      try {
        const adminDb = authz.adminDb;
        const admin = (await import('@/firebase-admin')).default;
        const nameParts = displayName.split(/\s+/).filter(Boolean);
        await adminDb.collection('users').doc(provisioned.uid).set(
          {
            email,
            displayName: provisioned.displayName,
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' ') || '',
            isRnStaff: true,
            isRnPortal: true,
            rn_id: swId || null,
            RN_ID: swId || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: authz.email || authz.uid,
          },
          { merge: true }
        );
      } catch (rnFlagError) {
        console.warn('Failed to set isRnStaff for RN portal user:', rnFlagError);
      }
    }

    let inviteSent = false;
    let inviteError = '';
    let inviteProviderMessageId: string | null = null;
    if (sendInvite) {
      try {
        const result = await sendPasswordResetEmail(request, email, 'sw');
        inviteSent = result.status >= 200 && result.status < 300;
        inviteProviderMessageId = String((result.body as any)?.providerMessageId || '').trim() || null;
        if (!inviteSent) {
          inviteError = String((result.body as any)?.error || 'Failed to send password setup email.');
        }
      } catch (error: any) {
        inviteError = String(error?.message || 'Failed to send password setup email.');
      }
    }

    try {
      if (sendInvite) {
        const admin = (await import('@/firebase-admin')).default;
        await authz.adminDb.collection('socialWorkers').doc(email).set(
          {
            lastPasswordSetupEmailAt: admin.firestore.FieldValue.serverTimestamp(),
            lastPasswordSetupEmailStatus: inviteSent ? 'success' : 'failure',
            lastPasswordSetupEmailError: inviteError || null,
            lastPasswordSetupEmailProviderId: inviteProviderMessageId,
            lastPasswordSetupEmailTo: email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: authz.email || authz.uid,
          },
          { merge: true }
        );
      }
    } catch {
      // best-effort status stamp
    }

    return NextResponse.json({
      success: true,
      email: provisioned.email,
      uid: provisioned.uid,
      active: true,
      portalKind,
      authCreated: provisioned.created,
      inviteSent,
      inviteError: inviteError || null,
      inviteProviderMessageId,
      message: provisioned.created
        ? portalKind === 'rn'
          ? 'RN portal access enabled and login account created. RN should set a password from the setup email (or Forgot password on /sw-login).'
          : 'Portal access enabled and login account created. SW should set a password from the setup email (or Forgot password).'
        : portalKind === 'rn'
          ? 'RN portal access enabled. Existing login account found.'
          : 'Portal access enabled. Existing login account found.',
    });
  } catch (error: any) {
    console.error('SW portal activate failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update social worker portal access.' },
      { status: 500 }
    );
  }
}
