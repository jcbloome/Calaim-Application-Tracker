import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isHoldValue(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return false;
  return v.includes('hold') || v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'x';
}

function parseCaspioDateToLocalDate(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) {
    const y = Number(isoLike[1]);
    const m = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }

  const usLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usLike) {
    const m = Number(usLike[1]);
    const d = Number(usLike[2]);
    const y = Number(usLike[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }

  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
}

function isKaiserMember(member: any): boolean {
  const planRaw =
    member?.CalAIM_MCO ??
    member?.CalAIM_MCP ??
    member?.Health_Plan ??
    member?.healthPlan ??
    member?.health_plan ??
    '';
  const plan = String(planRaw ?? '').trim().toLowerCase();
  return plan.includes('kaiser');
}

function isAuthExpiredForSwVisits(member: any): { expired: boolean; endDate: Date | null } {
  if (!isKaiserMember(member)) return { expired: false, endDate: null };

  const endRaw =
    member?.Authorization_End_Date_T2038 ??
    member?.authorization_end_date_t2038 ??
    member?.Auth_End_Date_T2038 ??
    member?.authEndDateT2038 ??
    '';
  const endDate = parseCaspioDateToLocalDate(endRaw);
  if (!endDate) return { expired: false, endDate: null };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return { expired: endDate.getTime() < todayStart.getTime(), endDate };
}

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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const visitData = (await req.json().catch(() => ({}))) as any;
    const requestedVisitId = String(visitData?.visitId || '').trim();
    if (!requestedVisitId) {
      return NextResponse.json({ success: false, error: 'visitId is required' }, { status: 400 });
    }

    const claimDay = toDayKey(visitData?.claimDay || visitData?.visitDate || '');
    if (!claimDay) {
      return NextResponse.json({ success: false, error: 'visitDate (YYYY-MM-DD) is required' }, { status: 400 });
    }
    const visitMonth = claimDay.slice(0, 7);

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

    const memberId = String(visitData?.memberId || '').trim();
    const rcfeId = String(visitData?.rcfeId || '').trim();
    const rcfeName = String(visitData?.rcfeName || '').trim();

    // Enforce portal rules (same as submit): Authorized, not on Hold, and (for Kaiser) not past auth end.
    try {
      const isAuthorized = (value: unknown) => {
        const v = String(value ?? '').trim().toLowerCase();
        if (!v) return false;
        return v === 'authorized' || v.startsWith('authorized ');
      };
      if (memberId) {
        const memberSnap = await adminDb.collection('caspio_members_cache').doc(memberId).get();
        const member = memberSnap.exists ? (memberSnap.data() as any) : null;
        if (member) {
          const status = member?.CalAIM_Status ?? member?.calaim_status ?? member?.CalAIMStatus ?? member?.calaimStatus;
          if (!isAuthorized(status)) {
            return NextResponse.json(
              { success: false, error: 'Monthly questionnaires are only allowed for Authorized members.' },
              { status: 403 }
            );
          }

          const hold = isHoldValue(
            member?.Hold_For_Social_Worker ??
              member?.Hold_for_Social_Worker ??
              member?.Hold_For_Social_Worker_Visit ??
              member?.Hold_for_Social_Worker_Visit
          );
          if (hold) {
            return NextResponse.json(
              { success: false, error: 'This member is currently on hold for SW visits and cannot be saved.' },
              { status: 403 }
            );
          }

          const authExpiry = isAuthExpiredForSwVisits(member);
          if (authExpiry.expired) {
            const endLabel = authExpiry.endDate ? authExpiry.endDate.toLocaleDateString() : 'the authorization end date';
            return NextResponse.json(
              {
                success: false,
                error: `This member's Kaiser authorization ended on ${endLabel}. SW visits are suspended after the authorization end date.`,
              },
              { status: 403 }
            );
          }
        }
      }
    } catch {
      // best-effort validation only
    }

    let socialWorkerName =
      String(visitData?.socialWorkerName || '').trim() ||
      String(visitData?.socialWorkerId || '').trim() ||
      (email || '') ||
      'Social Worker';

    // Best-effort: resolve friendly SW name from synced directory.
    try {
      const snap = await adminDb.collection('syncedSocialWorkers').where('email', '==', email).limit(1).get();
      if (!snap.empty) {
        const n = String((snap.docs[0].data() as any)?.name || '').trim();
        if (n) socialWorkerName = n;
      }
    } catch {
      // ignore
    }

    const toMs = (value: any): number => {
      if (!value) return 0;
      if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
      const seconds = typeof value?.seconds === 'number' ? value.seconds : undefined;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.floor(seconds * 1000);
      const asDate = new Date(String(value));
      const ms = asDate.getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    let effectiveVisitId = requestedVisitId;
    let ref = adminDb.collection('sw_visit_records').doc(effectiveVisitId);
    let existingSnap = await ref.get();

    const norm = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    // Enforce "one draft per member per day" by reusing an existing draft (best-effort; avoids composite indexes).
    if (!existingSnap.exists && memberId && rcfeId && claimDay) {
      try {
        const snap = await adminDb
          .collection('sw_visit_records')
          .where('socialWorkerEmail', '==', email)
          .limit(2000)
          .get();

        const sameKeyDrafts = snap.docs
          .map((d) => (d.data() as any) || {})
          .filter((v: any) => {
            const vStatus = String(v?.status || '').trim().toLowerCase();
            if (vStatus !== 'draft') return false;
            if (Boolean(v?.signedOff)) return false;
            const vRcfeId = String(v?.rcfeId || '').trim();
            if (vRcfeId !== rcfeId) {
              const legacy = vRcfeId.startsWith('rcfe-');
              const nameMatch = rcfeName && norm(v?.rcfeName) === norm(rcfeName);
              if (!(legacy && nameMatch)) return false;
            }
            if (String(v?.memberId || '').trim() !== memberId) return false;
            const day = toDayKey(v?.claimDay || v?.visitDate || v?.completedAt || v?.submittedAt);
            return day === claimDay;
          })
          .map((v: any) => ({
            visitId: String(v?.visitId || v?.id || '').trim(),
            updatedMs: Math.max(toMs(v?.updatedAt), toMs(v?.createdAt)),
          }))
          .filter((v: any) => Boolean(v.visitId));

        if (sameKeyDrafts.length > 0) {
          sameKeyDrafts.sort((a, b) => Number(b.updatedMs || 0) - Number(a.updatedMs || 0));
          const canonical = String(sameKeyDrafts[0].visitId || '').trim();
          if (canonical) {
            effectiveVisitId = canonical;
            ref = adminDb.collection('sw_visit_records').doc(effectiveVisitId);
            existingSnap = await ref.get();

            // Best-effort cleanup of older duplicates.
            const toDelete = sameKeyDrafts.slice(1).map((x) => String(x.visitId || '').trim()).filter(Boolean);
            if (toDelete.length > 0) {
              const batch = adminDb.batch();
              toDelete.forEach((id) => batch.delete(adminDb.collection('sw_visit_records').doc(id)));
              await batch.commit().catch(() => null);
            }
          }
        }
      } catch {
        // best-effort only
      }
    }

    if (existingSnap.exists) {
      const existing = existingSnap.data() as any;
      const owner = String(existing?.socialWorkerEmail || '').trim().toLowerCase();
      if (owner && owner !== email) {
        return NextResponse.json({ success: false, error: 'Visit does not belong to this social worker' }, { status: 403 });
      }
      if (Boolean(existing?.signedOff)) {
        return NextResponse.json({ success: false, error: 'This visit has been signed off and cannot be edited.' }, { status: 409 });
      }
      const claimStatus = String(existing?.claimStatus || '').trim().toLowerCase();
      if (Boolean(existing?.claimSubmitted) || Boolean(existing?.claimPaid) || (claimStatus && claimStatus !== 'draft')) {
        return NextResponse.json(
          { success: false, error: 'This visit is already tied to a submitted/paid claim and cannot be edited.' },
          { status: 409 }
        );
      }
      const existingStatus = String(existing?.status || '').trim().toLowerCase();
      if (existingStatus && existingStatus !== 'draft') {
        return NextResponse.json(
          { success: false, error: `This visit is already ${existingStatus} and cannot be edited as a draft.` },
          { status: 409 }
        );
      }
    }

    const flagged = Boolean(visitData?.visitSummary?.flagged);
    const totalScore = Number(visitData?.visitSummary?.totalScore || 0);

    const payload: Record<string, any> = {
      id: effectiveVisitId,
      visitId: effectiveVisitId,
      status: 'draft',
      socialWorkerUid: uid,
      socialWorkerEmail: email,
      socialWorkerName,
      socialWorkerId: String(visitData?.socialWorkerId || email || '').trim() || email,
      memberId,
      memberName: String(visitData?.memberName || '').trim(),
      memberRoomNumber: String(visitData?.memberRoomNumber || '').trim() || null,
      rcfeId,
      rcfeName: String(visitData?.rcfeName || '').trim(),
      rcfeAddress: String(visitData?.rcfeAddress || '').trim(),
      visitDate: claimDay,
      claimDay,
      visitMonth,
      flagged,
      totalScore,
      raw: { ...visitData, visitId: effectiveVisitId },
      signedOff: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!existingSnap.exists) {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await ref.set(payload, { merge: true });

    return NextResponse.json({ success: true, visitId: effectiveVisitId, status: 'draft', claimDay, visitMonth });
  } catch (error: any) {
    console.error('❌ Error saving SW visit draft:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save draft' },
      { status: 500 }
    );
  }
}

