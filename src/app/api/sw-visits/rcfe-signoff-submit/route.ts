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

const DAY_MS = 24 * 60 * 60 * 1000;

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

const shortHash = (value: string): string => {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 10);
};

const safeToken = (value: unknown): string => {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const toServiceLineId = (params: { claimDay: string; memberName: string; memberId: string }) => {
  const day = String(params.claimDay || '').trim();
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const datePart = m ? `${m[2]}_${m[3]}_${m[1]}` : safeToken(day || 'UNKNOWN_DATE');

  const name = String(params.memberName || '').trim().replace(/\s+/g, ' ');
  const parts = name.split(' ').filter(Boolean);
  const last = parts.length >= 2 ? parts[parts.length - 1] : (parts[0] || 'UNKNOWN_LAST');
  const first = parts.length >= 2 ? parts.slice(0, -1).join('_') : 'UNKNOWN_FIRST';

  const memberId = safeToken(params.memberId || 'UNKNOWN_ID') || 'UNKNOWN_ID';
  return `${datePart}_${safeToken(last)}_${safeToken(first)}_(${memberId})`;
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
    const requestedRcfeName = String(body?.rcfeName || '').trim();
    const claimDay = toDayKey(body?.claimDay || '');
    const selectedVisitIds: string[] = Array.isArray(body?.selectedVisitIds)
      ? body.selectedVisitIds.map((v: any) => String(v || '').trim()).filter(Boolean)
      : [];

    const staffName = String(body?.staffName || '').trim();
    const staffTitle = String(body?.staffTitle || '').trim();
    const signature = String(body?.signature || '').trim();
    const attestRcfeStaffOnly = Boolean(body?.attestRcfeStaffOnly);
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
    const geolocationOverride = Boolean(body?.geolocationOverride);
    const geolocationOverrideReason = String(body?.geolocationOverrideReason || '').trim();
    const locationOverridden = Boolean(!geolocation && geolocationOverride);

    if (!rcfeId) return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    if (!claimDay) {
      return NextResponse.json({ success: false, error: 'claimDay (YYYY-MM-DD) is required' }, { status: 400 });
    }
    if (selectedVisitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'selectedVisitIds is required' }, { status: 400 });
    }
    if (!attestRcfeStaffOnly) {
      return NextResponse.json(
        { success: false, error: 'Sign-off must be completed by RCFE staff/authorized representative.' },
        { status: 400 }
      );
    }
    if (!staffName || !signature) {
      return NextResponse.json({ success: false, error: 'RCFE staff name and signature are required' }, { status: 400 });
    }
    if (!staffTitle) {
      return NextResponse.json({ success: false, error: 'RCFE staff title is required' }, { status: 400 });
    }
    if (!geolocation && !geolocationOverride) {
      return NextResponse.json(
        {
          success: false,
          error: 'Geolocation is required for sign-off. Please allow location permissions and verify location.',
        },
        { status: 400 }
      );
    }
    if (!geolocation && geolocationOverride && geolocationOverrideReason.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: 'Geolocation override reason is required (min 8 characters).',
        },
        { status: 400 }
      );
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

    const norm = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const invalid = visits.find((v) => {
      const owner = String(v?.socialWorkerEmail || '').trim().toLowerCase();
      if (owner && owner !== email) return true;
      const status = String(v?.status || '').trim().toLowerCase();
      if (status !== 'draft') return true;
      const vRcfeId = String(v?.rcfeId || '').trim();
      if (vRcfeId !== rcfeId) {
        // Backward-compat: older drafts used a slug rcfeId. Allow matching by rcfeName only for legacy ids.
        const legacy = vRcfeId.startsWith('rcfe-');
        const nameMatch = requestedRcfeName && norm(v?.rcfeName) === norm(requestedRcfeName);
        if (!(legacy && nameMatch)) return true;
      }
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

    // Hard-block duplicate questionnaires for the same member in this submission payload.
    const memberIds = completedVisits.map((v) => String(v.memberId || '').trim()).filter(Boolean);
    if (memberIds.length > 0) {
      const unique = new Set(memberIds);
      if (unique.size !== memberIds.length) {
        const dupMembers = completedVisits
          .filter((v, idx) => memberIds.indexOf(v.memberId) !== idx)
          .map((v) => String(v.memberName || v.memberId || '').trim())
          .filter(Boolean);
        const line = dupMembers.length > 0 ? ` Duplicates: ${Array.from(new Set(dupMembers)).join(', ')}` : '';
        return NextResponse.json(
          {
            success: false,
            error: `Duplicate questionnaires for the same member cannot be submitted together.${line}`,
          },
          { status: 409 }
        );
      }
    }

    // Enforce rolling 30-day protection per member (not calendar-month based).
    const claimDayDate = toDayDate(claimDay);
    if (claimDayDate) {
      const selectedVisitIdSet = new Set(selectedVisitIds.map((v) => String(v).trim()).filter(Boolean));
      const membersToCheck = Array.from(
        new Set(
          completedVisits
            .map((v) => String(v.memberId || '').trim())
            .filter(Boolean)
        )
      );
      const conflictRows: Array<{ memberId: string; memberName: string; priorDay: string }> = [];
      await Promise.all(
        membersToCheck.map(async (memberId) => {
          const snap = await adminDb
            .collection('sw_visit_records')
            .where('memberId', '==', memberId)
            .limit(5000)
            .get()
            .catch(() => null as any);
          const docs = snap?.docs || [];
          const matchingName = String(
            completedVisits.find((v) => String(v.memberId || '').trim() === memberId)?.memberName || memberId
          ).trim();
          for (const doc of docs) {
            const row = (doc.data() as any) || {};
            const visitId = String(row?.visitId || row?.id || '').trim();
            if (selectedVisitIdSet.has(visitId)) continue;
            const status = String(row?.status || '').trim().toLowerCase();
            const finalized = status !== 'draft' || Boolean(row?.signedOff) || Boolean(row?.claimSubmitted) || Boolean(row?.claimPaid);
            if (!finalized) continue;
            const priorDay = toDayKey(row?.visitDate || row?.claimDay || row?.completedAt || row?.submittedAt || '');
            const priorDate = toDayDate(priorDay);
            if (!priorDate) continue;
            const daysApart = Math.floor((claimDayDate.getTime() - priorDate.getTime()) / DAY_MS);
            if (Number.isFinite(daysApart) && daysApart >= 0 && daysApart < 30) {
              conflictRows.push({ memberId, memberName: matchingName, priorDay });
              break;
            }
          }
        })
      );

      if (conflictRows.length > 0) {
        const first = conflictRows[0];
        const priorDate = toDayDate(first.priorDay);
        const nextAllowed = priorDate ? new Date(priorDate.getTime() + 30 * DAY_MS) : null;
        const nextAllowedLabel = nextAllowed
          ? `${nextAllowed.getFullYear()}-${String(nextAllowed.getMonth() + 1).padStart(2, '0')}-${String(nextAllowed.getDate()).padStart(2, '0')}`
          : 'after 30 days';
        const names = conflictRows.map((r) => r.memberName).filter(Boolean);
        return NextResponse.json(
          {
            success: false,
            error: `A visit was already submitted for one or more members within the last 30 days. Next allowed date starts ${nextAllowedLabel}.`,
            conflicts: names,
          },
          { status: 409 }
        );
      }
    }

    const attestationText = `I acknowledge that ${socialWorkerName} is present at this facility today. This does not confirm individual member visits.`;

    const signOffRef = adminDb.collection('sw_signoff_records').doc();
    const signOffId = signOffRef.id;
    let createdClaimNumber = '';

    // Transaction: locks + signoff record + claim + finalize visits
    try {
      await adminDb.runTransaction(async (tx) => {
        const claimRef = adminDb.collection('sw-claims').doc(claimId);
        const claimSnap = await tx.get(claimRef);
        if (claimSnap.exists) {
          const existingStatus = String((claimSnap.data() as any)?.status || '').trim();
          throw new Error(`CLAIM_ALREADY_EXISTS:${existingStatus || 'exists'}`);
        }

        // Human-friendly claim number for bookkeeping (month-based sequence).
        const counterRef = adminDb.collection('sw_counters').doc(`sw_claim_number_${visitMonth}`);
        const counterSnap = await tx.get(counterRef);
        const curNextRaw = (counterSnap.exists ? (counterSnap.data() as any)?.next : null) ?? 1;
        const curNext = Number(curNextRaw);
        const seq = Number.isFinite(curNext) && curNext > 0 ? Math.floor(curNext) : 1;
        const claimNumber = `SW-${visitMonth.replace('-', '')}-${String(seq).padStart(6, '0')}`;
        createdClaimNumber = claimNumber;

        // All transaction reads must occur before any writes.
        // Now that we've read claim + counter docs, we can safely write.
        tx.set(
          counterRef,
          {
            month: visitMonth,
            next: seq + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

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
          claimNumber,
          updatedAtIso: nowIso,
        };

        const hasFlaggedVisits = visits.some((v) => {
          const raw = (v?.raw || {}) as any;
          return (
            Boolean(raw?.visitSummary?.flagged) ||
            raw?.memberConcerns?.urgencyLevel === 'critical' ||
            Boolean(raw?.memberConcerns?.actionRequired) ||
            Boolean(raw?.rcfeAssessment?.flagForReview)
          );
        });

        tx.set(
          claimRef,
          {
            claimNumber,
            claimSequence: seq,
            claimSequenceMonth: visitMonth,
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
            // Post-signoff flow:
            // - Claim remains a draft until the monthly CCL check is completed.
            status: 'draft',
            reviewStatus: 'not_submitted',
            paymentStatus: 'unpaid',
            hasFlaggedVisits,
            requiresCclCheck: true,
            cclCheckMonth: visitMonth,
            cclCheckCompleted: false,
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
            claimId,
            claimNumber,
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
              geolocationOverride: locationOverridden,
              geolocationOverrideReason: locationOverridden ? geolocationOverrideReason : '',
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
          const serviceLineId = toServiceLineId({
            claimDay,
            memberName: String(v?.memberName || '').trim(),
            memberId: String(v?.memberId || '').trim(),
          });
          tx.set(
            visitRef,
            {
              status: 'signed_off',
              claimDay,
              visitMonth,
              completedAt: nowIso,
              signedOff: true,
              signedOffAt: signedAtIso,
              signOffId,
              rcfeStaffName: staffName,
              rcfeStaffTitle: staffTitle,
              rcfeStaffGeolocation: geolocation,
              rcfeStaffGeolocationOverride: locationOverridden,
              rcfeStaffGeolocationOverrideReason: locationOverridden ? geolocationOverrideReason : '',
              claimId,
              claimNumber,
              serviceLineId,
              claimMonth: visitMonth,
              claimStatus: 'draft',
              claimSubmitted: false,
              requiresCclCheck: true,
              cclCheckMonth: visitMonth,
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

    // Keep a simple per-member last-submitted index for fast 30-day eligibility checks.
    try {
      const indexBatch = adminDb.batch();
      let indexWrites = 0;
      completedVisits.forEach((visit) => {
        const memberId = String(visit?.memberId || '').trim();
        if (!memberId) return;
        const ref = adminDb.collection('sw_member_last_submitted_visit').doc(memberId);
        indexBatch.set(
          ref,
          {
            memberId,
            memberName: String(visit?.memberName || '').trim() || null,
            lastSubmittedDate: claimDay,
            lastVisitId: String(visit?.visitId || '').trim() || null,
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

    return NextResponse.json({
      success: true,
      claimId,
      claimNumber: createdClaimNumber || undefined,
      signOffId,
      rcfeId,
      claimDay,
      totalVisits: visits.length,
      status: 'signed_off',
      locationVerified,
      locationOverridden,
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

