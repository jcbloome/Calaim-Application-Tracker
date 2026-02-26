import { NextRequest, NextResponse } from 'next/server';

async function maybeAutoSubmitClaimsAfterSignOff(params: {
  adminDb: any;
  admin: any;
  visitIds: string[];
  signOffId: string;
}) {
  const { adminDb, admin, visitIds, signOffId } = params;

  if (!Array.isArray(visitIds) || visitIds.length === 0) return;

  // Determine which claim(s) these visits belong to.
  const visitRefs = visitIds.slice(0, 500).map((id) => adminDb.collection('sw_visit_records').doc(String(id)));
  const visitSnaps = await adminDb.getAll(...visitRefs);

  const claimIds = Array.from(
    new Set(
      visitSnaps
        .map((s: any) => (s?.exists ? String((s.data() as any)?.claimId || '').trim() : ''))
        .filter(Boolean)
    )
  );
  if (claimIds.length === 0) return;

  for (const claimId of claimIds.slice(0, 25)) {
    const claimRef = adminDb.collection('sw-claims').doc(String(claimId));
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) continue;

    const claim = claimSnap.data() as any;
    const status = String(claim?.status || 'draft').toLowerCase();
    if (status !== 'draft') continue;

    const claimVisitIds: string[] = Array.isArray(claim?.visitIds) ? claim.visitIds.map((v: any) => String(v || '').trim()).filter(Boolean) : [];
    if (claimVisitIds.length === 0) continue;

    // Only auto-submit when ALL visits on that claim are signed off.
    const claimVisitRefs = claimVisitIds.slice(0, 500).map((id) => adminDb.collection('sw_visit_records').doc(String(id)));
    const claimVisitSnaps = await adminDb.getAll(...claimVisitRefs);
    const allSignedOff = claimVisitSnaps.every((s: any) => s?.exists && Boolean((s.data() as any)?.signedOff));
    if (!allSignedOff) continue;

    const now = admin.firestore.Timestamp.now();
    await claimRef.set(
      {
        status: 'submitted',
        submittedAt: now,
        submittedSource: 'sign_off',
        submittedBySignOffId: signOffId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const batch = adminDb.batch();
    claimVisitIds.slice(0, 500).forEach((visitId) => {
      const visitRef = adminDb.collection('sw_visit_records').doc(String(visitId));
      batch.set(
        visitRef,
        {
          claimId,
          claimStatus: 'submitted',
          claimSubmitted: true,
          claimSubmittedAt: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const signOffData = await request.json();
    
    console.log('📋 SW Visit Sign-Off Submission:', {
      rcfeName: signOffData.rcfeName,
      socialWorkerId: signOffData.socialWorkerId,
      completedVisits: signOffData.completedVisits?.length || 0,
      staffName: signOffData.signOffData?.rcfeStaffName,
      hasGeolocation: !!signOffData.signOffData?.geolocation,
      submittedAt: signOffData.submittedAt
    });

    // Validate required fields
    if (!signOffData.rcfeId || !signOffData.socialWorkerId || !signOffData.completedVisits?.length) {
      return NextResponse.json({
        success: false,
        error: 'Missing required sign-off data'
      }, { status: 400 });
    }

    // Validate RCFE staff signature
    if (!signOffData.signOffData?.signature || !signOffData.signOffData?.rcfeStaffName) {
      return NextResponse.json({
        success: false,
        error: 'RCFE staff signature and name required'
      }, { status: 400 });
    }

    const locationVerified = !!signOffData.signOffData?.geolocation;

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = String(decoded?.uid || '').trim();
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!uid || !email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const claimDay = String(signOffData?.claimDay || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const signedAtIso = String(signOffData?.signOffData?.signedAt || '').trim() || new Date().toISOString();

    const visitIds: string[] = Array.isArray(signOffData?.completedVisits)
      ? signOffData.completedVisits
          .map((v: any) => String(v?.visitId || v?.id || '').trim())
          .filter(Boolean)
      : [];
    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid visit IDs to sign off' }, { status: 400 });
    }

    const recordRef = adminDb.collection('sw_signoff_records').doc();
    const record = {
      id: recordRef.id,
      rcfeId: String(signOffData.rcfeId),
      rcfeName: String(signOffData.rcfeName || ''),
      socialWorkerId: String(signOffData.socialWorkerId || ''),
      socialWorkerUid: String(signOffData.socialWorkerUid || uid),
      socialWorkerEmail: String(signOffData.socialWorkerEmail || email).toLowerCase(),
      socialWorkerName: String(signOffData.socialWorkerName || ''),
      claimDay,
      visitIds,
      completedVisits: signOffData.completedVisits,
      invoice: signOffData.invoice || null,
      rcfeStaff: {
        name: String(signOffData.signOffData.rcfeStaffName || ''),
        title: String(signOffData.signOffData.rcfeStaffTitle || ''),
        signature: String(signOffData.signOffData.signature || ''),
        signedAt: signedAtIso,
        geolocation: signOffData.signOffData.geolocation || null,
        locationVerified,
      },
      submittedAt: String(signOffData.submittedAt || new Date().toISOString()),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await recordRef.set(record, { merge: true });

    // Mark visits as signed-off so admin reports can show completion.
    const batch = adminDb.batch();
    for (const visitId of visitIds.slice(0, 500)) {
      const visitRef = adminDb.collection('sw_visit_records').doc(visitId);
      batch.set(
        visitRef,
        {
          signedOff: true,
          status: 'signed_off',
          signedOffAt: signedAtIso,
          signOffId: recordRef.id,
          rcfeStaffName: String(signOffData.signOffData.rcfeStaffName || ''),
          rcfeStaffTitle: String(signOffData.signOffData.rcfeStaffTitle || ''),
          claimDay,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    // Auto-submit the SW claim once all visits on that daily claim are signed off.
    try {
      await maybeAutoSubmitClaimsAfterSignOff({
        adminDb,
        admin,
        visitIds,
        signOffId: recordRef.id,
      });
    } catch (e) {
      console.warn('⚠️ Auto-submit claims after sign-off failed (best-effort):', e);
    }

    // Check for flagged visits and send notifications
    const flaggedVisits = signOffData.completedVisits.filter((visit: any) => visit.flagged);
    if (flaggedVisits.length > 0) {
      console.log('🚨 Flagged visits detected, notifying supervisors:', {
        count: flaggedVisits.length,
        visits: flaggedVisits.map((v: any) => v.memberName)
      });
      
      // Here you would send notifications to John Amber and Jason Bloome
      // about the flagged visits requiring immediate attention
    }

    return NextResponse.json({
      success: true,
      message: `Sign-off completed successfully for ${signOffData.completedVisits.length} visits`,
      signOffId: recordRef.id,
      flaggedVisits: flaggedVisits.length,
      locationVerified,
      data: {
        rcfeName: signOffData.rcfeName,
        totalVisits: signOffData.completedVisits.length,
        flaggedCount: flaggedVisits.length,
        staffVerification: {
          name: signOffData.signOffData.rcfeStaffName,
          title: signOffData.signOffData.rcfeStaffTitle,
          verifiedAt: signOffData.signOffData.signedAt,
          locationVerified
        }
      }
    });

  } catch (error) {
    console.error('❌ Sign-off submission error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process sign-off submission'
    }, { status: 500 });
  }
}