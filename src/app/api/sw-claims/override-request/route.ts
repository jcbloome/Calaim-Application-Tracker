import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const shortHash = (value: string): string => {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 10);
};

const toDayKey = (value: unknown): string => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

async function requireSocialWorker(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String(decoded?.email || '').trim().toLowerCase();
  const name = String((decoded as any)?.name || '').trim();
  const hasSwClaim = Boolean((decoded as any)?.socialWorker);

  if (!uid || !email) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  // Fast-path: accept SW claim when present (set by /api/auth/sw-session).
  if (hasSwClaim) {
    return { ok: true as const, adminDb, uid, email, name };
  }

  // Otherwise, confirm active SW record in Firestore (same logic as sw-session).
  const candidates: any[] = [];
  const uidDoc = await adminDb.collection('socialWorkers').doc(uid).get();
  if (uidDoc.exists) candidates.push(uidDoc.data());
  const emailDoc = await adminDb.collection('socialWorkers').doc(email).get();
  if (emailDoc.exists) candidates.push(emailDoc.data());
  if (candidates.length === 0) {
    const qSnap = await adminDb.collection('socialWorkers').where('email', '==', email).limit(1).get();
    if (!qSnap.empty) candidates.push(qSnap.docs[0].data());
  }

  const record = candidates[0] || null;
  if (!record) {
    return { ok: false as const, status: 403, error: 'Social worker access required' };
  }
  if (!Boolean(record?.isActive)) {
    return { ok: false as const, status: 403, error: 'Social worker account is inactive' };
  }

  return { ok: true as const, adminDb, uid, email, name };
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
    const rcfeId = String(body?.rcfeId || '').trim();
    const rcfeName = String(body?.rcfeName || '').trim();
    const rcfeAddress = String(body?.rcfeAddress || '').trim();
    const claimDay = toDayKey(body?.claimDay || '');
    const reason = String(body?.reason || '').trim();
    const visitIds: string[] = Array.isArray(body?.visitIds)
      ? body.visitIds.map((v: any) => String(v || '').trim()).filter(Boolean)
      : [];

    if (!rcfeId) return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    if (!claimDay) return NextResponse.json({ success: false, error: 'claimDay (YYYY-MM-DD) is required' }, { status: 400 });
    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Select at least one draft visit for this RCFE/date.' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: 'A reason is required' }, { status: 400 });
    }

    const swCheck = await requireSocialWorker({ idToken });
    if (!swCheck.ok) {
      return NextResponse.json({ success: false, error: swCheck.error }, { status: swCheck.status });
    }

    const { adminDb, uid, email, name } = swCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const claimMonth = claimDay.slice(0, 7);
    const baseId = `ovr_${uid}_${claimDay.replace(/-/g, '')}_${shortHash(rcfeId)}`;

    // Prevent duplicates: reuse the same request id while pending.
    const existing = await adminDb.collection('sw_claim_override_requests').doc(baseId).get();
    if (existing.exists) {
      const ex = (existing.data() as any) || {};
      if (String(ex?.status || '').trim().toLowerCase() === 'pending') {
        return NextResponse.json(
          { success: false, error: 'An override request is already pending for this RCFE/date.', requestId: baseId },
          { status: 409 }
        );
      }
    }

    const ref = adminDb.collection('sw_claim_override_requests').doc(baseId);
    const nowIso = new Date().toISOString();
    const nowTs = admin.firestore.Timestamp.now();

    await ref.set(
      {
        id: baseId,
        status: 'pending',
        claimDay,
        claimMonth,
        rcfeId,
        rcfeName: rcfeName || null,
        rcfeAddress: rcfeAddress || null,
        visitIds: visitIds.slice(0, 500),
        visitCount: visitIds.length,
        reason,
        socialWorkerUid: uid,
        socialWorkerEmail: email,
        socialWorkerName: String(name || email || 'Social Worker').trim() || 'Social Worker',
        createdAtIso: nowIso,
        createdAt: nowTs,
        updatedAtIso: nowIso,
        updatedAt: nowTs,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, requestId: baseId });
  } catch (e: any) {
    console.error('❌ Error creating SW override request:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to create override request' },
      { status: 500 }
    );
  }
}

