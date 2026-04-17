import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'kaiser_no_action_overrides';

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const clientIdsParam = String(req.nextUrl.searchParams.get('clientIds') || '').trim();
    const activeOnly = req.nextUrl.searchParams.get('activeOnly') !== 'false';
    const nowMs = Date.now();

    const clientIds = clientIdsParam
      .split(',')
      .map((id) => String(id || '').trim())
      .filter(Boolean);

    const docs: any[] = [];
    if (clientIds.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < clientIds.length; i += 10) chunks.push(clientIds.slice(i, i + 10));
      for (const chunk of chunks) {
        const snap = await adminDb.collection(COLLECTION).where('memberId', 'in', chunk).get();
        snap.forEach((docSnap: any) => docs.push({ id: docSnap.id, ...docSnap.data() }));
      }
    } else {
      const snap = await adminDb.collection(COLLECTION).limit(5000).get();
      snap.forEach((docSnap: any) => docs.push({ id: docSnap.id, ...docSnap.data() }));
    }

    const filtered = docs.filter((row) => {
      if (!activeOnly) return true;
      if (row?.active === false) return false;
      const expiresAtMs = Number(row?.expiresAtMs || 0);
      return !Number.isFinite(expiresAtMs) || expiresAtMs <= 0 || expiresAtMs >= nowMs;
    });

    const byMemberId = filtered.reduce((acc, row) => {
      const memberId = String(row?.memberId || row?.id || '').trim();
      if (!memberId) return acc;
      acc[memberId] = row;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      count: filtered.length,
      overrides: filtered,
      byMemberId,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ [KAISER-NO-ACTION-OVERRIDES] GET failed:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load overrides' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const memberId = String(body?.memberId || body?.clientId2 || '').trim();
    const reason = String(body?.reason || '').trim();
    const managerNote = String(body?.managerNote || '').trim();
    const expiresAtIso = String(body?.expiresAt || '').trim();
    const expiresAtMs = Number.isFinite(new Date(expiresAtIso).getTime()) ? new Date(expiresAtIso).getTime() : 0;

    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: 'reason is required' }, { status: 400 });
    }
    if (!expiresAtMs || expiresAtMs <= Date.now()) {
      return NextResponse.json({ success: false, error: 'expiresAt must be a future date' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const uid = adminCheck.uid;
    const email = adminCheck.email;
    const isSuperAdmin = adminCheck.isSuperAdmin;
    const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null as any);
    const userData = userDoc && typeof userDoc?.exists === 'function' && userDoc.exists() ? (userDoc.data() as any) : null;
    const roleLabel = String(userData?.role || '').trim().toLowerCase();
    const isKaiserManager = Boolean(
      userData?.isKaiserManager ||
      roleLabel.includes('kaiser manager')
    );
    const displayName = String(
      userData?.displayName ||
      `${String(userData?.firstName || '').trim()} ${String(userData?.lastName || '').trim()}`.trim() ||
      adminCheck.name ||
      email ||
      uid
    ).trim();
    if (!isSuperAdmin && !isKaiserManager) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin or Kaiser Manager can set manager overrides' },
        { status: 403 }
      );
    }
    const admin = adminModule.default;

    const nowMs = Date.now();
    const payload = {
      memberId,
      reason,
      reasonNormalized: normalizeText(reason),
      managerNote: managerNote || null,
      active: true,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      updatedAtMs: nowMs,
      updatedAtIso: new Date(nowMs).toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: email,
      updatedByName: displayName || null,
      updatedByRole: isSuperAdmin ? 'Super Admin' : 'Kaiser Manager',
    };

    await adminDb.collection(COLLECTION).doc(memberId).set(payload, { merge: true });
    return NextResponse.json({ success: true, override: payload });
  } catch (error: any) {
    console.error('❌ [KAISER-NO-ACTION-OVERRIDES] POST failed:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save override' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const memberId = String(body?.memberId || body?.clientId2 || '').trim();
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const uid = adminCheck.uid;
    const email = adminCheck.email;
    const isSuperAdmin = adminCheck.isSuperAdmin;
    const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null as any);
    const userData = userDoc && typeof userDoc?.exists === 'function' && userDoc.exists() ? (userDoc.data() as any) : null;
    const roleLabel = String(userData?.role || '').trim().toLowerCase();
    const isKaiserManager = Boolean(
      userData?.isKaiserManager ||
      roleLabel.includes('kaiser manager')
    );
    const displayName = String(
      userData?.displayName ||
      `${String(userData?.firstName || '').trim()} ${String(userData?.lastName || '').trim()}`.trim() ||
      adminCheck.name ||
      email ||
      uid
    ).trim();
    if (!isSuperAdmin && !isKaiserManager) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin or Kaiser Manager can clear manager overrides' },
        { status: 403 }
      );
    }
    const admin = adminModule.default;
    const nowMs = Date.now();

    await adminDb.collection(COLLECTION).doc(memberId).set(
      {
        active: false,
        clearedAtMs: nowMs,
        clearedAtIso: new Date(nowMs).toISOString(),
        clearedAt: admin.firestore.FieldValue.serverTimestamp(),
        clearedByUid: uid,
        clearedByEmail: email,
        clearedByName: displayName || null,
        clearedByRole: isSuperAdmin ? 'Super Admin' : 'Kaiser Manager',
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, memberId });
  } catch (error: any) {
    console.error('❌ [KAISER-NO-ACTION-OVERRIDES] DELETE failed:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to clear override' }, { status: 500 });
  }
}
