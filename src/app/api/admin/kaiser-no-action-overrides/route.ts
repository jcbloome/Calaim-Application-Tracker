import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

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

async function requireAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;
  const decoded = await adminAuth.verifyIdToken(idToken);

  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  const claimSuperAdmin = Boolean((decoded as any)?.superAdmin);
  const claimKaiserManager = Boolean((decoded as any)?.kaiserManager);

  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  let isAdmin = Boolean((decoded as any)?.admin) || claimSuperAdmin;
  if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
  let isSuperAdmin = claimSuperAdmin || isHardcodedAdminEmail(email);
  let isKaiserManager = claimKaiserManager;

  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    isSuperAdmin = isSuperAdmin || superAdminRole.exists;
  }

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null as any);
  const userData = userDoc && typeof userDoc?.exists === 'function' && userDoc.exists() ? (userDoc.data() as any) : null;
  const roleLabel = String(userData?.role || '').trim().toLowerCase();
  isKaiserManager = Boolean(
    isKaiserManager ||
      userData?.isKaiserManager ||
      roleLabel.includes('kaiser manager')
  );
  const displayName = String(
    userData?.displayName ||
      `${String(userData?.firstName || '').trim()} ${String(userData?.lastName || '').trim()}`.trim() ||
      String((decoded as any)?.name || '').trim() ||
      email ||
      uid
  ).trim();

  return { ok: true as const, adminDb, uid, email, isSuperAdmin, isKaiserManager, displayName };
}

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
}

export async function GET(req: NextRequest) {
  try {
    const idToken = getBearerToken(req);
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminCheck = await requireAdmin(idToken);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb } = adminCheck;
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
    const idToken = getBearerToken(req);
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }
    const adminCheck = await requireAdmin(idToken);
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

    const { adminDb, uid, email, isSuperAdmin, isKaiserManager, displayName } = adminCheck;
    if (!isSuperAdmin && !isKaiserManager) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin or Kaiser Manager can set manager overrides' },
        { status: 403 }
      );
    }
    const adminModule = await import('@/firebase-admin');
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
    const idToken = getBearerToken(req);
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }
    const adminCheck = await requireAdmin(idToken);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const memberId = String(body?.memberId || body?.clientId2 || '').trim();
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }

    const { adminDb, uid, email, isSuperAdmin, isKaiserManager, displayName } = adminCheck;
    if (!isSuperAdmin && !isKaiserManager) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin or Kaiser Manager can clear manager overrides' },
        { status: 403 }
      );
    }
    const adminModule = await import('@/firebase-admin');
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
