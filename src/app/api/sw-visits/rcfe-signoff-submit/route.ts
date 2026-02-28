import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  sendFlaggedVisitNotification,
  generateFlagReasons,
  getNotificationUrgency,
} from '@/lib/visit-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

const shortHash = (value: string): string => {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 10);
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const rcfeId = String(body?.rcfeId || '').trim();
    const claimDay = toDayKey(body?.claimDay || '');
    const selectedVisitIds: string[] = Array.isArray(body?.selectedVisitIds)
      ? body.selectedVisitIds.map((v: any) => String(v || '').trim()).filter(Boolean)
      : [];

    const staffName = String(body?.staffName || '').trim();
    const staffTitle = String(body?.staffTitle || '').trim();
    const signature = String(body?.signature || '').trim();
    const signedAtIso = String(body?.signedAt || '').trim() || new Date().toISOString();
    const geoRaw = body?.geolocation && typeof body.geolocation === 'object' ? body.geolocation : null;
    const geoLat = geoRaw ? Number((geoRaw as any)?.latitude) : NaN;
    const geoLng = geoRaw ? Number((geoRaw as any)?.longitude) : NaN;
    const geoAcc = geoRaw ? Number((geoRaw as any)?.accuracy) : NaN;
    const geolocation =
      Number.isFinite(geoLat) && Number.isFinite(geoLng)
        ? ({
            latitude: geoLat,
            longitude: geoLng,
            ...(Number.isFinite(geoAcc) ? { accuracy: geoAcc } : {}),
          } as const)
        : null;
    const locationVerified = Boolean(geolocation);

    if (!rcfeId) return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    if (!claimDay) {
      return NextResponse.json({ success: false, error: 'claimDay (YYYY-MM-DD) is required' }, { status: 400 });
    }
    if (selectedVisitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'selectedVisitIds is required' }, { status: 400 });
    }
    if (!staffName || !signature) {
      return NextResponse.json({ success: false, error: 'RCFE staff name and signature are required' }, { status: 400 });
    }

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

    // Best-effort SW friendly name
    let socialWorkerName = String(body?.socialWorkerName || '').trim() || (email ? email : 'Social Worker');
    try {
      const snap = await adminDb.collection('syncedSocialWorkers').where('email', '==', email).limit(1).get();
      if (!snap.empty) {
        const n = String((snap.docs[0].data() as any)?.name || '').trim();
        if (n) socialWorkerName = n;
      }
    } catch {
      // ignore
    }

    // Load the selected draft visits by ID (no composite index).
    const visitRefs = selectedVisitIds.slice(0, 250).map((id) => adminDb.collection('sw_visit_records').doc(id));
    const snaps = await adminDb.getAll(...visitRefs);

    const visits = snaps
      .map((s: any) => (s?.exists ? ((s.data() as any) || null) : null))
      .filter(Boolean) as any[];

    if (visits.length !== visitRefs.length) {
      return NextResponse.json({ success: false, error: 'One or more selected visits were not found' }, { status: 404 });
    }

    const invalid = visits.find((v) => {
      const owner = String(v?.socialWorkerEmail || '').trim().toLowerCase();
      if (owner && owner !== email) return true;
      const status = String(v?.status || '').trim().toLowerCase();
      if (status !== 'draft') return true;
      const vRcfeId = String(v?.rcfeId || '').trim();
      if (vRcfeId !== rcfeId) return true;
      const vDay = toDayKey(v?.claimDay || v?.visitDate || '');
      if (vDay !== claimDay) return true;
      if (Boolean(v?.signedOff)) return true;
      if (Boolean(v?.claimSubmitted) || Boolean(v?.claimPaid)) return true;
      const claimStatus = String(v?.claimStatus || '').trim().toLowerCase();
      if (claimStatus && claimStatus !== 'draft') return true;
      return false;
    });
    if (invalid) {
      return NextResponse.json(
        { success: false, error: 'One or more selected visits are no longer eligible to submit. Please refresh.' },
        { status: 409 }
      );
    }

    const rcfeName = String(visits[0]?.rcfeName || '').trim();
    const rcfeAddress = String(visits[0]?.rcfeAddress || '').trim();
    const visitMonth = claimDay.slice(0, 7);

    const claimKey = claimDay.replace(/-/g, '');
    const swKey = uid || email || 'unknown';
    const rcfeKey = shortHash(rcfeId);
    const claimId = `swClaim_${swKey}_${claimKey}_${rcfeKey}`;

    const visitFeeRate = 45;
    const gasAmount = visits.length >= 1 ? 20 : 0;
    const totalMemberVisitFees = visits.length * visitFeeRate;
    const totalAmount = totalMemberVisitFees + gasAmount;
    const nowIso = new Date().toISOString();
    const nowTs = admin.firestore.Timestamp.now();

    const completedVisits = visits.map((v) => ({
      visitId: String(v?.visitId || v?.id || '').trim(),
      memberId: String(v?.memberId || '').trim(),
      memberName: String(v?.memberName || '').trim(),
      memberRoomNumber: String(v?.memberRoomNumber || '').trim(),
      flagged: Boolean(v?.flagged || v?.raw?.visitSummary?.flagged),
    }));

    const attestationText = `I acknowledge that ${socialWorkerName} is at this location to visit the below members.`;

    const signOffRef = adminDb.collection('sw_signoff_records').doc();
    const signOffId = signOffRef.id;

    // Transaction: locks + signoff record + claim + finalize visits
    try {
      await adminDb.runTransaction(async (tx) => {
        const claimRef = adminDb.collection('sw-claims').doc(claimId);
        const claimSnap = await tx.get(claimRef);
        if (claimSnap.exists) {
          const existingStatus = String((claimSnap.data() as any)?.status || '').trim();
          throw new Error(`CLAIM_ALREADY_EXISTS:${existingStatus || 'exists'}`);
        }

        // Enforce monthly lock for each member.
        const lockRefs = visits.map((v) =>
          adminDb.collection('sw_member_monthly_visits').doc(`${String(v.memberId)}_${visitMonth}`)
        );
        const lockSnaps = await Promise.all(lockRefs.map((r) => tx.get(r)));

        const conflicts: { memberId: string; memberName: string; existingVisitId: string }[] = [];
        lockSnaps.forEach((s, idx) => {
          if (!s.exists) return;
          const existing = s.data() as any;
          const existingVisitId = String(existing?.visitId || '').trim();
          const thisVisitId = String(visits[idx]?.visitId || visits[idx]?.id || '').trim();
          if (existingVisitId && thisVisitId && existingVisitId !== thisVisitId) {
            conflicts.push({
              memberId: String(visits[idx]?.memberId || '').trim(),
              memberName: String(visits[idx]?.memberName || '').trim(),
              existingVisitId,
            });
          }
        });
        if (conflicts.length > 0) {
          const err: any = new Error('MONTHLY_MEMBER_VISIT_ALREADY_COMPLETED');
          err.conflicts = conflicts;
          throw err;
        }

        // Write/refresh locks
        lockRefs.forEach((ref, idx) => {
          const v = visits[idx] || {};
          tx.set(
            ref,
            {
              memberId: String(v?.memberId || '').trim(),
              visitMonth,
              visitId: String(v?.visitId || v?.id || '').trim(),
              socialWorkerUid: uid,
              socialWorkerEmail: email,
              socialWorkerName,
              claimId,
              rcfeId,
              rcfeName,
              claimDay,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });

        const signoffSummary = {
          signOffId,
          rcfeId,
          rcfeName,
          claimDay,
          visitIds: selectedVisitIds,
          memberNames: Array.from(new Set(completedVisits.map((v) => String(v.memberName || '').trim()).filter(Boolean))),
          signedByName: staffName,
          signedByTitle: staffTitle,
          signedAt: signedAtIso,
          locationVerified,
          updatedAtIso: nowIso,
        };

        tx.set(
          claimRef,
          {
            socialWorkerUid: uid,
            socialWorkerEmail: email,
            socialWorkerName,
            claimDay,
            claimMonth: visitMonth,
            claimDate: admin.firestore.Timestamp.fromDate(new Date(`${claimDay}T00:00:00.000Z`)),
            rcfeId,
            rcfeName,
            rcfeAddress,
            visitIds: selectedVisitIds,
            visitCount: visits.length,
            visitFeeRate,
            gasPolicy: 'perDayIfAnyVisit',
            gasAmount,
            gasReimbursement: gasAmount,
            totalMemberVisitFees,
            totalAmount,
            memberVisits: visits.map((v) => ({
              id: String(v?.visitId || v?.id || '').trim(),
              memberName: String(v?.memberName || '').trim(),
              memberRoomNumber: String(v?.memberRoomNumber || '').trim(),
              rcfeName,
              rcfeAddress,
              visitDate: claimDay,
              visitTime: '',
              notes: '',
            })),
            status: 'submitted',
            submittedAt: nowTs,
            signoffById: {
              [signOffId]: signoffSummary,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.set(
          signOffRef,
          {
            id: signOffId,
            attestationText,
            attestationVersion: 'rcfeSignoffSubmit_v1',
            rcfeId,
            rcfeName,
            socialWorkerUid: uid,
            socialWorkerEmail: email,
            socialWorkerName,
            claimDay,
            visitIds: selectedVisitIds,
            completedVisits,
            invoice: {
              visitFeeRate,
              gasAmount,
              visitCount: visits.length,
              totalMemberVisitFees,
              totalAmount,
            },
            rcfeStaff: {
              name: staffName,
              title: staffTitle,
              signature,
              signedAt: signedAtIso,
              geolocation,
              locationVerified,
            },
            submittedAt: nowIso,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Finalize visits
        visits.forEach((v) => {
          const visitId = String(v?.visitId || v?.id || '').trim();
          if (!visitId) return;

          const raw = (v?.raw || {}) as any;
          const shouldNotify =
            Boolean(raw?.visitSummary?.flagged) ||
            raw?.memberConcerns?.urgencyLevel === 'critical' ||
            Boolean(raw?.memberConcerns?.actionRequired) ||
            Boolean(raw?.rcfeAssessment?.flagForReview);
          const flagReasons = shouldNotify ? generateFlagReasons(raw) : [];

          const visitRef = adminDb.collection('sw_visit_records').doc(visitId);
          tx.set(
            visitRef,
            {
              status: 'signed_off',
              claimDay,
              visitMonth,
              submittedAt: nowIso,
              completedAt: nowIso,
              submittedAtTs: nowTs,
              signedOff: true,
              signedOffAt: signedAtIso,
              signOffId,
              rcfeStaffName: staffName,
              rcfeStaffTitle: staffTitle,
              rcfeStaffGeolocation: geolocation,
              claimId,
              claimMonth: visitMonth,
              claimStatus: 'submitted',
              claimSubmitted: true,
              claimSubmittedAt: nowTs,
              claimVisitFeeRate: visitFeeRate,
              claimGasAmount: gasAmount,
              claimTotalAmount: totalAmount,
              flagged: Boolean(shouldNotify),
              flagReasons,
              totalScore: Number(raw?.visitSummary?.totalScore || v?.totalScore || 0),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.startsWith('CLAIM_ALREADY_EXISTS:')) {
        return NextResponse.json({ success: false, error: 'A submitted claim already exists for this RCFE/day.' }, { status: 409 });
      }
      if (msg.includes('MONTHLY_MEMBER_VISIT_ALREADY_COMPLETED')) {
        const conflicts = Array.isArray(e?.conflicts) ? e.conflicts : [];
        const names = conflicts.map((c: any) => String(c?.memberName || c?.memberId || '').trim()).filter(Boolean);
        const line = names.length > 0 ? ` Conflicts: ${names.join(', ')}` : '';
        return NextResponse.json(
          { success: false, error: `Only one member visit per month is allowed for the same member.${line}`, conflicts },
          { status: 409 }
        );
      }
      throw e;
    }

    // Best-effort notifications (after commit)
    const flaggedRawVisits = visits
      .map((v) => (v?.raw ? v.raw : null))
      .filter(Boolean)
      .filter((raw: any) => {
        return (
          Boolean(raw?.visitSummary?.flagged) ||
          raw?.memberConcerns?.urgencyLevel === 'critical' ||
          Boolean(raw?.memberConcerns?.actionRequired) ||
          Boolean(raw?.rcfeAssessment?.flagForReview)
        );
      });

    for (const raw of flaggedRawVisits.slice(0, 20)) {
      try {
        const urgency = getNotificationUrgency({
          visitId: String(raw?.visitId || '').trim(),
          memberName: String(raw?.memberName || '').trim(),
          rcfeName: String(raw?.rcfeName || '').trim(),
          rcfeAddress: String(raw?.rcfeAddress || '').trim(),
          socialWorkerName: String(raw?.socialWorkerId || socialWorkerName || '').trim(),
          socialWorkerId: String(raw?.socialWorkerId || '').trim(),
          visitDate: String(raw?.visitDate || claimDay).trim(),
          totalScore: Number(raw?.visitSummary?.totalScore || 0),
          flagReasons: generateFlagReasons(raw),
          urgencyLevel: raw?.memberConcerns?.urgencyLevel as any,
          memberConcerns: String(raw?.memberConcerns?.detailedConcerns || '').trim(),
          rcfeIssues: String(raw?.rcfeAssessment?.notes || '').trim(),
          actionRequired: Boolean(raw?.memberConcerns?.actionRequired),
          geolocation: raw?.geolocation,
        });
        console.log('🚨 Flagged visit submitted via sign-off-submit:', { urgency });
        await sendFlaggedVisitNotification(raw);
      } catch (err) {
        console.warn('⚠️ Failed sending flagged visit notification (best-effort):', err);
      }
    }

    return NextResponse.json({
      success: true,
      claimId,
      signOffId,
      rcfeId,
      claimDay,
      totalVisits: visits.length,
      status: 'submitted',
      locationVerified,
      geolocation,
    });
  } catch (error: any) {
    console.error('❌ Error in rcfe signoff submit:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to submit questionnaires and claim' },
      { status: 500 }
    );
  }
}

