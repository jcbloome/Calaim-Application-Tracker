import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid, email } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const encodedTable = encodeURIComponent('CalAIM_Kaiser_Status');

    const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${encodedTable}/records?q.select=${encodeURIComponent(
      'Kaiser_ID_Status,Status,Sort_Order'
    )}&q.pageSize=1000&q.pageNumber=1`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: `Caspio status fetch failed (${res.status}) ${text}` },
        { status: 502 }
      );
    }

    const data = (await res.json().catch(() => ({}))) as any;
    const resultRows = Array.isArray(data?.Result) ? data.Result : [];

    const rows = resultRows
      .map((row: any) => {
        const id = toNumber(row?.Kaiser_ID_Status);
        const status = String(row?.Status || '').trim();
        const sortOrder = toNumber(row?.Sort_Order);
        if (id == null || !status || sortOrder == null) return null;
        return { id: Number(id), status, sortOrder: Number(sortOrder) };
      })
      .filter(Boolean) as Array<{ id: number; status: string; sortOrder: number }>;

    rows.sort((a, b) => a.sortOrder - b.sortOrder);

    await adminDb
      .collection('admin-settings')
      .doc('kaiser-statuses')
      .set(
        {
          rows,
          source: 'caspio',
          count: rows.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByUid: uid,
          updatedByEmail: email,
        },
        { merge: true }
      );

    return NextResponse.json(
      { success: true, rows, count: rows.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('❌ Error syncing Kaiser statuses:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync Kaiser statuses' },
      { status: 500 }
    );
  }
}

