import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const isActive = Boolean(record?.isActive);
    if (!record) {
      return NextResponse.json({ error: 'Social worker access required' }, { status: 403 });
    }
    if (!isActive) {
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
    try {
      const merged = {
        ...(record || {}),
        email,
        isActive: true,
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

    const response = NextResponse.json({ success: true });
    response.cookies.set('calaim_sw_session', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
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
