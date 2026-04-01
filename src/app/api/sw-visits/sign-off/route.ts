import { NextRequest, NextResponse } from 'next/server';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayKey = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const toDayDate = (value: unknown): Date | null => {
  const day = toDayKey(value);
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
};

async function attachSignoffToClaims(params: {
  adminDb: any;
  admin: any;
  visitIds: string[];
  signOffRecord: any;
}) {
  const { adminDb, admin, visitIds, signOffRecord } = params;
  if (!Array.isArray(visitIds) || visitIds.length === 0) return;

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

  const signOffId = String(signOffRecord?.id || '').trim();
  if (!signOffId) return;

  const summary = {
    signOffId,
    rcfeId: String(signOffRecord?.rcfeId || '').trim(),
    rcfeName: String(signOffRecord?.rcfeName || '').trim(),
    claimDay: String(signOffRecord?.claimDay || '').trim(),
    visitIds: Array.isArray(signOffRecord?.visitIds) ? signOffRecord.visitIds : [],
    memberNames: Array.isArray(signOffRecord?.completedVisits)
      ? Array.from(
          new Set(
            signOffRecord.completedVisits
              .map((v: any) => String(v?.memberName || '').trim())
              .filter(Boolean)
          )
        )
      : [],
    signedByName: String(signOffRecord?.rcfeStaff?.name || '').trim(),
    signedByTitle: String(signOffRecord?.rcfeStaff?.title || '').trim(),
    signedAt: String(signOffRecord?.rcfeStaff?.signedAt || '').trim(),
    locationVerified: Boolean(signOffRecord?.rcfeStaff?.locationVerified),
    updatedAtIso: new Date().toISOString(),
  };

  for (const claimId of claimIds.slice(0, 25)) {
    const claimRef = adminDb.collection('sw-claims').doc(String(claimId));
    await claimRef.set(
      {
        signoffById: {
          [signOffId]: summary,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
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
    const signedAtDate = new Date(signedAtIso);
    const signedAtSafeDate = Number.isNaN(signedAtDate.getTime()) ? new Date() : signedAtDate;

    const visitIds: string[] = Array.isArray(signOffData?.completedVisits)
      ? signOffData.completedVisits
          .map((v: any) => String(v?.visitId || v?.id || '').trim())
          .filter(Boolean)
      : [];
    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid visit IDs to sign off' }, { status: 400 });
    }

    // Enforce rolling 30-day protection per member before finalizing sign-off.
    const claimDayDate = toDayDate(claimDay);
    if (claimDayDate) {
      const visitRefs = visitIds.slice(0, 500).map((id) => adminDb.collection('sw_visit_records').doc(String(id)));
      const visitSnaps = await adminDb.getAll(...visitRefs);
      const selectedVisits = visitSnaps
        .filter((s: any) => s?.exists)
        .map((s: any) => (s.data() as any) || {});
      const selectedVisitIdSet = new Set(
        selectedVisits.map((v: any) => String(v?.visitId || v?.id || '').trim()).filter(Boolean)
      );
      const membersToCheck = Array.from(
        new Set(selectedVisits.map((v: any) => String(v?.memberId || '').trim()).filter(Boolean))
      );
      const conflictNames: string[] = [];
      await Promise.all(
        membersToCheck.map(async (memberId) => {
          const rows = await adminDb
            .collection('sw_visit_records')
            .where('memberId', '==', memberId)
            .limit(5000)
            .get()
            .catch(() => null as any);
          const docs = rows?.docs || [];
          const memberName = String(
            selectedVisits.find((v: any) => String(v?.memberId || '').trim() === memberId)?.memberName || memberId
          ).trim();
          for (const d of docs) {
            const row = (d.data() as any) || {};
            const rowVisitId = String(row?.visitId || row?.id || '').trim();
            if (selectedVisitIdSet.has(rowVisitId)) continue;
            const status = String(row?.status || '').trim().toLowerCase();
            const finalized = status !== 'draft' || Boolean(row?.signedOff) || Boolean(row?.claimSubmitted) || Boolean(row?.claimPaid);
            if (!finalized) continue;
            const priorDate = toDayDate(row?.visitDate || row?.claimDay || row?.completedAt || row?.submittedAt || '');
            if (!priorDate) continue;
            const daysApart = Math.floor((claimDayDate.getTime() - priorDate.getTime()) / DAY_MS);
            if (Number.isFinite(daysApart) && daysApart >= 0 && daysApart < 30) {
              conflictNames.push(memberName);
              break;
            }
          }
        })
      );
      if (conflictNames.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `One or more members already had a submitted visit within the last 30 days: ${Array.from(
              new Set(conflictNames)
            ).join(', ')}.`,
          },
          { status: 409 }
        );
      }
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
          submittedAt: signedAtSafeDate.toISOString(),
          submittedAtTs: admin.firestore.Timestamp.fromDate(signedAtSafeDate),
          completedAt: signedAtSafeDate.toISOString(),
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

    // Keep a simple per-member last-submitted index for fast 30-day eligibility checks.
    try {
      const memberByVisitId = new Map<string, { memberId: string; memberName: string }>();
      const selected = Array.isArray(signOffData?.completedVisits) ? signOffData.completedVisits : [];
      selected.forEach((row: any) => {
        const visitId = String(row?.visitId || row?.id || '').trim();
        const memberId = String(row?.memberId || '').trim();
        const memberName = String(row?.memberName || '').trim();
        if (!visitId || !memberId) return;
        memberByVisitId.set(visitId, { memberId, memberName });
      });
      const indexBatch = adminDb.batch();
      let indexWrites = 0;
      visitIds.forEach((visitId) => {
        const mapped = memberByVisitId.get(String(visitId || '').trim());
        if (!mapped?.memberId) return;
        const ref = adminDb.collection('sw_member_last_submitted_visit').doc(mapped.memberId);
        indexBatch.set(
          ref,
          {
            memberId: mapped.memberId,
            memberName: mapped.memberName || null,
            lastSubmittedDate: claimDay,
            lastVisitId: String(visitId || '').trim() || null,
            lastSocialWorkerUid: uid,
            lastSocialWorkerEmail: email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        indexWrites += 1;
      });
      if (indexWrites > 0) await indexBatch.commit();
    } catch {
      // best-effort only
    }

    // Keep a log on the claim(s) so SWs can review sign-offs before manually submitting.
    try {
      await attachSignoffToClaims({
        adminDb,
        admin,
        visitIds,
        signOffRecord: record,
      });
    } catch (e) {
      console.warn('⚠️ Attaching sign-off summary to claims failed (best-effort):', e);
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