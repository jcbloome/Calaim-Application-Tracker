import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const shortHash = (value: string): string => {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 10);
};

const safeToken = (value: unknown): string => {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const toDayKey = (value: unknown): string => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  // Common forms: "YYYY-MM-DD" or ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
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

async function requireAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  const name = String((decoded as any)?.name || '').trim();

  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  const hasAdminClaim = Boolean((decoded as any)?.admin);
  const hasSuperAdminClaim = Boolean((decoded as any)?.superAdmin);
  let isAdmin = hasAdminClaim || hasSuperAdminClaim;
  let isSuperAdmin = hasSuperAdminClaim;

  // Email allow-list always wins.
  if (isHardcodedAdminEmail(email)) {
    isAdmin = true;
    isSuperAdmin = true;
  }

  // Even if the token only has `admin` (not `superAdmin`), upgrade to superadmin
  // when the Firestore role indicates it. This avoids false 403s for true superadmins.
  if (!isAdmin || !isSuperAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);

    isAdmin = isAdmin || adminRole.exists || superAdminRole.exists;
    isSuperAdmin = isSuperAdmin || superAdminRole.exists;

    // Backward-compat: some roles were stored by email instead of UID.
    if (email && (!isAdmin || !isSuperAdmin)) {
      const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = isAdmin || emailAdminRole.exists || emailSuperAdminRole.exists;
      isSuperAdmin = isSuperAdmin || emailSuperAdminRole.exists;
    }
  }

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, uid, email, name, adminDb, isSuperAdmin };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const visitIds: string[] = Array.isArray(body?.visitIds)
      ? body.visitIds.map((v: any) => String(v || '').trim()).filter(Boolean)
      : [];
    const rcfeStaffName = String(body?.rcfeStaffName || '').trim();
    const rcfeStaffTitle = String(body?.rcfeStaffTitle || '').trim();
    const reason = String(body?.reason || '').trim();

    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No visitIds provided' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid: actorUid, email: actorEmail, name: actorName } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const nowIso = new Date().toISOString();
    const actorLabel = String(actorName || actorEmail || 'Admin').trim() || 'Admin';

    // Load visits (best-effort; skip missing docs).
    const snaps = await Promise.all(visitIds.slice(0, 500).map((id) => adminDb.collection('sw_visit_records').doc(id).get()));
    const visits = snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...(s.data() as any) }))
      .filter(Boolean);

    if (visits.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching visits found' }, { status: 404 });
    }

    // Group by RCFE + Social Worker + Day so we submit one claim per SW/RCFE/day.
    const byGroup = new Map<string, { rcfeId: string; swKey: string; claimDay: string; visits: any[] }>();
    for (const v of visits) {
      const rcfeId = String(v?.rcfeId || '').trim() || 'unknown-rcfe';
      const swKey = String(v?.socialWorkerUid || v?.socialWorkerEmail || v?.socialWorkerId || '').trim() || 'unknown-sw';
      const claimDay = toDayKey(v?.claimDay || v?.visitDate || v?.submittedAt || nowIso) || nowIso.slice(0, 10);
      const key = `${rcfeId}__${shortHash(swKey)}__${claimDay}`;
      const cur = byGroup.get(key) || { rcfeId, swKey, claimDay, visits: [] as any[] };
      cur.visits.push(v);
      byGroup.set(key, cur);
    }

    const results: Array<{ rcfeId: string; signOffId: string; claimId: string; claimNumber: string; visitCount: number }> = [];

    for (const group of byGroup.values()) {
      const rcfeId = group.rcfeId;
      const swKey = group.swKey;
      const claimDay = group.claimDay;
      const rcfeVisits = group.visits.slice(0, 500);

      const rcfeName = String(rcfeVisits?.[0]?.rcfeName || '').trim();
      const rcfeAddress = String(rcfeVisits?.[0]?.rcfeAddress || '').trim();
      const socialWorkerUid = String(rcfeVisits?.[0]?.socialWorkerUid || '').trim() || null;
      const socialWorkerEmail = String(rcfeVisits?.[0]?.socialWorkerEmail || '').trim().toLowerCase() || null;
      const socialWorkerName = String(rcfeVisits?.[0]?.socialWorkerName || rcfeVisits?.[0]?.socialWorkerId || '').trim() || null;

      const claimMonth = claimDay.slice(0, 7);
      const claimKey = claimDay.replace(/-/g, '');
      const rcfeKey = shortHash(rcfeId);
      const claimId = `swClaim_${swKey}_${claimKey}_${rcfeKey}`;

      const signOffRef = adminDb.collection('sw_signoff_records').doc();
      const signOffId = signOffRef.id;

      const completedVisits = rcfeVisits.map((v) => ({
        visitId: String(v?.visitId || v?.id || '').trim(),
        memberId: String(v?.memberId || '').trim(),
        memberName: String(v?.memberName || '').trim(),
        memberRoomNumber: String(v?.memberRoomNumber || '').trim(),
        flagged: Boolean(v?.flagged || v?.raw?.visitSummary?.flagged),
      }));

      const visitFeeRate = 45;
      const gasAmount = rcfeVisits.length >= 1 ? 20 : 0;
      const totalMemberVisitFees = rcfeVisits.length * visitFeeRate;
      const totalAmount = totalMemberVisitFees + gasAmount;
      const hasFlaggedVisits = completedVisits.some((v) => Boolean(v.flagged));

      let createdClaimNumber = '';

      try {
        await adminDb.runTransaction(async (tx: any) => {
          const claimRef = adminDb.collection('sw-claims').doc(claimId);
          const claimSnap = await tx.get(claimRef);
          if (claimSnap.exists) {
            throw new Error('CLAIM_ALREADY_EXISTS');
          }

          // Human-friendly claim number for bookkeeping (month-based sequence).
          const counterRef = adminDb.collection('sw_counters').doc(`sw_claim_number_${claimMonth}`);
          const counterSnap = await tx.get(counterRef);
          const curNextRaw = (counterSnap.exists ? (counterSnap.data() as any)?.next : null) ?? 1;
          const curNext = Number(curNextRaw);
          const seq = Number.isFinite(curNext) && curNext > 0 ? Math.floor(curNext) : 1;
          const claimNumber = `SW-${claimMonth.replace('-', '')}-${String(seq).padStart(6, '0')}`;
          createdClaimNumber = claimNumber;
          tx.set(
            counterRef,
            {
              month: claimMonth,
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
            visitIds: rcfeVisits.map((v) => String(v?.visitId || v?.id || '').trim()).filter(Boolean),
            memberNames: Array.from(new Set(completedVisits.map((v) => String(v?.memberName || '').trim()).filter(Boolean))),
            signedByName: rcfeStaffName || actorLabel,
            signedByTitle: rcfeStaffTitle || 'Admin',
            signedAt: nowIso,
            locationVerified: false,
            updatedAtIso: nowIso,
          };

          tx.set(
            signOffRef,
            {
              id: signOffId,
              attestationText: 'ADMIN_OVERRIDE: RCFE staff sign-off could not be obtained.',
              attestationVersion: 'admin_override_signoff_v1',
              rcfeId,
              rcfeName,
              socialWorkerUid,
              socialWorkerEmail,
              socialWorkerName,
              claimId,
              claimNumber,
              claimDay,
              visitIds: rcfeVisits.map((v) => String(v?.visitId || v?.id || '').trim()).filter(Boolean),
              completedVisits,
              invoice: null,
              rcfeStaff: {
                name: rcfeStaffName || actorLabel,
                title: rcfeStaffTitle || 'Admin',
                signature: 'ADMIN_OVERRIDE',
                signedAt: nowIso,
                geolocation: null,
                locationVerified: false,
              },
              submittedAt: nowIso,
              source: 'admin_override',
              overrideReason: reason || null,
              actorUid,
              actorEmail,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          tx.set(
            claimRef,
            {
              id: claimId,
              claimId,
              claimNumber,
              claimMonth,
              claimDay,
              rcfeId,
              rcfeName,
              rcfeAddress,
              socialWorkerUid,
              socialWorkerEmail,
              socialWorkerName,
              visitIds: rcfeVisits.map((v) => String(v?.visitId || v?.id || '').trim()).filter(Boolean),
              visitCount: rcfeVisits.length,
              visitFeeRate,
              gasPolicy: 'perDayIfAnyVisit',
              gasAmount,
              gasReimbursement: gasAmount,
              totalMemberVisitFees,
              totalAmount,
              memberVisits: rcfeVisits.map((v) => ({
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
              reviewStatus: 'pending',
              paymentStatus: 'unpaid',
              hasFlaggedVisits,
              submittedAt: admin.firestore.FieldValue.serverTimestamp(),
              submittedBy: actorLabel,
              submittedByAdmin: true,
              override: {
                kind: 'admin_signoff_override',
                reason: reason || null,
                actorUid,
                actorEmail,
                createdAtIso: nowIso,
              },
              signoffById: {
                [signOffId]: signoffSummary,
              },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // Audit event for claim creation/submission.
          const eventRef = adminDb.collection('sw_claim_events').doc();
          tx.set(
            eventRef,
            {
              id: eventRef.id,
              claimId,
              claimMonth,
              socialWorkerEmail,
              rcfeId,
              rcfeName,
              fromStatus: 'draft',
              toStatus: 'submitted',
              notes: `ADMIN_OVERRIDE sign-off: ${reason || 'No reason provided'}`,
              actorUid,
              actorEmail,
              actorName: actorLabel,
              createdAtIso: nowIso,
              createdAt: admin.firestore.Timestamp.now(),
            },
            { merge: true }
          );

          // Finalize visits
          for (const v of rcfeVisits) {
            const visitId = String(v?.visitId || v?.id || '').trim();
            if (!visitId) continue;
            const visitRef = adminDb.collection('sw_visit_records').doc(visitId);
            const serviceLineId = toServiceLineId({
              claimDay,
              memberName: String(v?.memberName || '').trim(),
              memberId: String(v?.memberId || '').trim(),
            });
            tx.set(
              visitRef,
              {
                signedOff: true,
                status: 'signed_off',
                signedOffAt: nowIso,
                signOffId,
                rcfeStaffName: rcfeStaffName || actorLabel,
                rcfeStaffTitle: rcfeStaffTitle || 'Admin',
                claimDay,
                visitMonth: claimMonth,
                signedOffByAdminUid: actorUid,
                signedOffByAdminEmail: actorEmail,
                signedOffOverrideReason: reason || null,
                claimId,
                claimNumber,
                serviceLineId,
                claimMonth,
                claimStatus: 'submitted',
                claimSubmitted: true,
                claimSubmittedAt: admin.firestore.Timestamp.now(),
                claimVisitFeeRate: visitFeeRate,
                claimGasAmount: gasAmount,
                claimTotalAmount: totalAmount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        });
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('CLAIM_ALREADY_EXISTS')) {
          return NextResponse.json(
            { success: false, error: 'A claim already exists for this SW/RCFE/day. (Sign-off override already applied?)' },
            { status: 409 }
          );
        }
        throw e;
      }

      // Best-effort: also attach the signoff summary to any existing claim docs referenced by visits.
      try {
        await attachSignoffToClaims({
          adminDb,
          admin,
          visitIds: rcfeVisits.map((v) => String(v?.visitId || v?.id || '').trim()).filter(Boolean),
          signOffRecord: { id: signOffId, rcfeId, rcfeName, claimDay, visitIds: rcfeVisits.map((v) => String(v?.visitId || v?.id || '').trim()), completedVisits, rcfeStaff: { name: rcfeStaffName || actorLabel, title: rcfeStaffTitle || 'Admin', signedAt: nowIso, locationVerified: false } },
        });
      } catch (err) {
        console.warn('⚠️ Attaching sign-off summary to claims failed (best-effort):', err);
      }

      results.push({ rcfeId, signOffId, claimId, claimNumber: createdClaimNumber, visitCount: rcfeVisits.length });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('❌ Error overriding sign-off:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to override sign-off' },
      { status: 500 }
    );
  }
}

