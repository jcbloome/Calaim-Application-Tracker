import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

const toIso = (value: unknown) => {
  try {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate?.toDate === 'function') {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    const d = new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  } catch {
    return '';
  }
};

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    const snap = await authCheck.adminDb
      .collection('kaiser_isp_cover_sheet_download_logs')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const logs = snap.docs.map((doc: any) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        memberName: clean(data.memberName),
        memberClientId: clean(data.memberClientId),
        coverPageType: clean(data.coverPageType),
        staffName: clean(data.staffName),
        staffEmail: clean(data.staffEmail).toLowerCase(),
        createdAt: toIso(data.createdAt) || toIso(data.createdAtIso) || '',
        verified: Boolean(data.verified),
        archived: Boolean(data.archived),
        archivedAt: toIso(data.archivedAt),
        archivedStoragePath: clean(data.archivedStoragePath),
      };
    });

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load download logs') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const memberName = clean(body?.memberName);
    const memberClientId = clean(body?.memberClientId);
    const coverPageType = clean(body?.coverPageType);
    const verified = Boolean(body?.verified);
    if (!memberName || !memberClientId || !coverPageType) {
      return NextResponse.json(
        { success: false, error: 'memberName, memberClientId, and coverPageType are required' },
        { status: 400 }
      );
    }
    if (!verified) {
      return NextResponse.json(
        { success: false, error: 'Verification is required before download logging.' },
        { status: 400 }
      );
    }

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const docRef = await authCheck.adminDb.collection('kaiser_isp_cover_sheet_download_logs').add({
      formType: 'kaiser-isp-cover-sheet',
      memberName,
      memberClientId,
      coverPageType,
      verified: true,
      archived: false,
      staffUid: authCheck.uid,
      staffEmail: clean(authCheck.email).toLowerCase(),
      staffName: clean(authCheck.name) || clean(authCheck.email).toLowerCase(),
      createdAt: serverTimestamp,
      createdAtIso: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      log: {
        id: docRef.id,
        memberName,
        memberClientId,
        coverPageType,
        verified: true,
        staffEmail: clean(authCheck.email).toLowerCase(),
        staffName: clean(authCheck.name) || clean(authCheck.email).toLowerCase(),
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to create download log entry') },
      { status: 500 }
    );
  }
}
