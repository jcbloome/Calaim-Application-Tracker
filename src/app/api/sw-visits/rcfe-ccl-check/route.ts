import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

const safeDocId = (value: string) =>
  clean(value, 240)
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 240);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rcfeId = clean(searchParams.get('rcfeId'), 120);
    const month = clean(searchParams.get('month'), 10);
    if (!rcfeId) return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month (YYYY-MM) is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = clean(decoded?.email, 200).toLowerCase();
    if (!email) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const docId = safeDocId(`${rcfeId}_${month}`);
    const snap = await adminDb.collection('rcfe_monthly_ccl_checks').doc(docId).get();
    if (!snap.exists) {
      return NextResponse.json({ success: true, rcfeId, month, check: null });
    }
    const data = snap.data() as any;
    return NextResponse.json({
      success: true,
      rcfeId,
      month,
      check: {
        id: snap.id,
        rcfeId: clean(data?.rcfeId, 140) || rcfeId,
        rcfeName: clean(data?.rcfeName, 200),
        month: clean(data?.month, 10) || month,
        latestReportDate: clean(data?.latestReportDate, 10),
        typeAViolations: Number(data?.typeAViolations ?? 0) || 0,
        typeBViolations: Number(data?.typeBViolations ?? 0) || 0,
        seriousViolationComments: clean(data?.seriousViolationComments, 4000),
        checkedAt: data?.checkedAt?.toDate?.()?.toISOString?.() || clean(data?.checkedAt, 50) || '',
        checkedByName: clean(data?.checkedByName, 140),
        checkedByEmail: clean(data?.checkedByEmail, 200),
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || clean(data?.updatedAt, 50) || '',
      },
    });
  } catch (error: any) {
    console.error('❌ Error reading RCFE CCL check:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch check' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 200);
    const email = clean(decoded?.email, 200).toLowerCase();
    if (!uid || !email) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as any;
    const rcfeId = clean(body?.rcfeId, 120);
    const rcfeName = clean(body?.rcfeName, 200);
    const month = clean(body?.month, 10);
    const latestReportDate = clean(body?.latestReportDate, 10);
    const typeA = Number(body?.typeAViolations ?? NaN);
    const typeB = Number(body?.typeBViolations ?? NaN);
    const seriousViolationComments = clean(body?.seriousViolationComments, 4000);

    if (!rcfeId) return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month (YYYY-MM) is required' }, { status: 400 });
    }
    if (!latestReportDate || !/^\d{4}-\d{2}-\d{2}$/.test(latestReportDate)) {
      return NextResponse.json({ success: false, error: 'latestReportDate (YYYY-MM-DD) is required' }, { status: 400 });
    }
    if (!Number.isFinite(typeA) || typeA < 0 || !Number.isFinite(typeB) || typeB < 0) {
      return NextResponse.json({ success: false, error: 'typeAViolations/typeBViolations must be 0 or greater' }, { status: 400 });
    }

    const docId = safeDocId(`${rcfeId}_${month}`);
    const ref = adminDb.collection('rcfe_monthly_ccl_checks').doc(docId);

    await ref.set(
      {
        rcfeId,
        rcfeName,
        month,
        latestReportDate,
        typeAViolations: Math.floor(typeA),
        typeBViolations: Math.floor(typeB),
        seriousViolationComments,
        facilitySearchUrl: 'https://www.ccld.dss.ca.gov/carefacilitysearch/',
        checkedByUid: uid,
        checkedByEmail: email,
        checkedByName: clean(body?.checkedByName, 140) || email,
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Auto-submit any pending draft claims for this RCFE/month for this SW.
    const claimsSnap = await adminDb
      .collection('sw-claims')
      .where('socialWorkerEmail', '==', email)
      .limit(5000)
      .get()
      .catch(() => null as any);

    const claims = claimsSnap?.docs?.map((d: any) => ({ id: d.id, ...(d.data() as any) })) || [];
    const eligible = claims.filter((c: any) => {
      const status = String(c?.status || '').trim().toLowerCase();
      if (status !== 'draft') return false;
      if (String(c?.rcfeId || '').trim() !== rcfeId) return false;
      if (String(c?.claimMonth || '').trim() !== month) return false;
      return true;
    });

    const now = admin.firestore.Timestamp.now();
    let submitted = 0;
    for (const c of eligible.slice(0, 200)) {
      const claimRef = adminDb.collection('sw-claims').doc(String(c.id));
      await claimRef.set(
        {
          status: 'submitted',
          submittedAt: now,
          requiresCclCheck: false,
          cclCheckCompleted: true,
          cclCheckId: docId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const visitIds: string[] = Array.isArray(c?.visitIds) ? c.visitIds : [];
      if (visitIds.length > 0) {
        const batch = adminDb.batch();
        visitIds.slice(0, 500).forEach((visitId: any) => {
          const visitRef = adminDb.collection('sw_visit_records').doc(String(visitId));
          batch.set(
            visitRef,
            {
              claimStatus: 'submitted',
              claimSubmitted: true,
              claimSubmittedAt: now,
              requiresCclCheck: false,
              cclCheckId: docId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
      submitted += 1;
    }

    return NextResponse.json({
      success: true,
      rcfeId,
      month,
      checkId: docId,
      autoSubmittedClaims: submitted,
    });
  } catch (error: any) {
    console.error('❌ Error saving RCFE CCL check:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save check' }, { status: 500 });
  }
}

