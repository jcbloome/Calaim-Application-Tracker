import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

async function resolveSwDisplayName(params: {
  adminDb: any;
  record: any;
  email: string;
}): Promise<string> {
  const fromRecord = clean(params.record?.displayName, 140) || clean(params.record?.name, 140);
  if (fromRecord) return fromRecord;

  const email = clean(params.email, 200).toLowerCase();
  const swId = clean(params.record?.sw_id || params.record?.SW_ID, 80);

  try {
    if (email) {
      const s1 = await params.adminDb.collection('syncedSocialWorkers').where('email', '==', email).limit(1).get();
      if (!s1.empty) {
        const name = clean(s1.docs[0].data()?.name, 140);
        if (name) return name;
      }
    }
  } catch {
    // ignore best-effort
  }

  try {
    if (swId) {
      const s2 = await params.adminDb.collection('syncedSocialWorkers').where('sw_id', '==', swId).limit(1).get();
      if (!s2.empty) {
        const name = clean(s2.docs[0].data()?.name, 140);
        if (name) return name;
      }
    }
  } catch {
    // ignore best-effort
  }

  return '';
}

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    const uid = decoded.uid;

    if (!email || !uid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Enforce lane separation: admin accounts cannot establish SW sessions.
    // Connections staff emails (leslie@carehomefinders.com, *@carehomefinders.com) also stay on Admin login.
    const { isRnPortalExcludedStaffEmail } = await import('@/lib/rn-portal-access');
    const [uidAdminDoc, uidSuperAdminDoc, emailAdminDoc, emailSuperAdminDoc] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    const isAdminLaneAccount =
      isHardcodedAdminEmail(email) ||
      isRnPortalExcludedStaffEmail(email) ||
      uidAdminDoc.exists ||
      uidSuperAdminDoc.exists ||
      emailAdminDoc.exists ||
      emailSuperAdminDoc.exists;
    if (isAdminLaneAccount) {
      return NextResponse.json(
        {
          error:
            'This email is reserved for admin/staff login. RNs doing ALFT assessments need a non-staff portal email at /sw-login.',
        },
        { status: 403 }
      );
    }

    // Determine SW eligibility and active flag from Firestore (admin privileges).
    const candidates: Array<{ ref: FirebaseFirestore.DocumentReference; data: any }> = [];

    const uidDoc = await adminDb.collection('socialWorkers').doc(uid).get();
    if (uidDoc.exists) candidates.push({ ref: uidDoc.ref, data: uidDoc.data() });

    const emailDoc = await adminDb.collection('socialWorkers').doc(email).get();
    if (emailDoc.exists) candidates.push({ ref: emailDoc.ref, data: emailDoc.data() });

    if (candidates.length === 0) {
      const qSnap = await adminDb
        .collection('socialWorkers')
        .where('email', '==', email)
        .limit(1)
        .get();
      if (!qSnap.empty) {
        const docSnap = qSnap.docs[0];
        candidates.push({ ref: docSnap.ref, data: docSnap.data() });
      }
    }

    const record = candidates[0]?.data || null;
    let isActive = Boolean(record?.isActive);

    // Heal RN portal users who have Auth + users.isRnPortal but missing/inactive socialWorkers doc.
    if ((!record || !isActive) && email) {
      try {
        const userSnap = await adminDb.collection('users').doc(uid).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const isRnPortalUser =
          Boolean(userData?.isRnPortal) ||
          Boolean(record?.isRnPortal) ||
          String(record?.portalKind || '').toLowerCase() === 'rn';
        if (isRnPortalUser) {
          const { ensureSocialWorkerAuthUser } = await import('@/lib/sw-auth-provision');
          await ensureSocialWorkerAuthUser({
            email,
            displayName:
              clean(record?.displayName, 140) ||
              clean(userData?.displayName, 140) ||
              clean(decoded.name, 140) ||
              email.split('@')[0],
            swId: clean(record?.rn_id || record?.RN_ID || userData?.rn_id || userData?.RN_ID, 80),
            createdBy: 'sw-session-rn-heal',
            activatePortal: true,
            portalKind: 'rn',
          });
          const healed = await adminDb.collection('socialWorkers').doc(email).get();
          if (healed.exists) {
            candidates.unshift({ ref: healed.ref, data: healed.data() });
            isActive = true;
          }
        }
      } catch (healError) {
        console.warn('RN portal session heal skipped:', healError);
      }
    }

    const finalRecord = candidates[0]?.data || record;
    if (!finalRecord) {
      return NextResponse.json({ error: 'Social worker access required' }, { status: 403 });
    }
    if (!isActive && !Boolean(finalRecord?.isActive)) {
      return NextResponse.json({ error: 'Social worker account is inactive' }, { status: 403 });
    }

    // Merge custom claims (do not overwrite existing admin/superAdmin claims).
    try {
      const userRecord = await adminAuth.getUser(uid);
      const existing = (userRecord.customClaims || {}) as Record<string, any>;
      await adminAuth.setCustomUserClaims(uid, {
        ...existing,
        socialWorker: true,
      });
    } catch (claimError) {
      console.warn('Failed to set socialWorker claim:', claimError);
    }

    // Ensure there is a UID-keyed SW doc for rules / consistent lookups.
    let displayNameResolved = '';
    try {
      displayNameResolved = await resolveSwDisplayName({ adminDb, record: finalRecord || {}, email });
      const merged = {
        ...(finalRecord || {}),
        email,
        isActive: true,
        displayName: displayNameResolved || (finalRecord?.displayName ?? finalRecord?.name ?? null),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!uidDoc.exists) {
        merged.createdAt = admin.firestore.FieldValue.serverTimestamp();
        merged.createdBy = merged.createdBy || 'system';
      }
      await adminDb.collection('socialWorkers').doc(uid).set(merged, { merge: true });
    } catch (syncError) {
      console.warn('Failed to sync SW UID doc:', syncError);
    }

    const response = NextResponse.json({
      success: true,
      displayName: displayNameResolved || null,
    });
    response.cookies.set('calaim_sw_session', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: any) {
    console.error('SW session creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to establish social worker session', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('calaim_sw_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
