import { NextRequest, NextResponse } from 'next/server';
import { fetchCaspioRns, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const admin = adminModule.default;
  const adminDb = adminModule.adminDb;
  const adminAuth = adminModule.adminAuth;
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '')
    .trim()
    .toLowerCase();
  if (!uid) throw new Error('Invalid token');
  let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
  }
  if (!isAdmin) throw new Error('Admin access required');
  return { uid, email };
}

function buildRnResponse(rns: Awaited<ReturnType<typeof fetchCaspioRns>>, includeCounts: boolean) {
  const source = rns[0]?.source || 'CalAIM_tbl_RN';
  return {
    success: true,
    rns,
    count: rns.length,
    includeAssignmentCounts: includeCounts,
    source,
    message:
      `Found ${rns.length} RN(s) from ${source}` +
      (includeCounts ? ' (with RN_ID assignment counts)' : ''),
    memberFields: { id: 'RN_ID', name: 'RN_Assigned', table: 'CalAIM_tbl_RN' },
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const idToken = bearer || String(request.nextUrl.searchParams.get('idToken') || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken', rns: [] }, { status: 401 });
    }
    await assertAdmin(idToken);

    const includeCounts = request.nextUrl.searchParams.get('counts') === '1';
    const credentials = getCaspioCredentialsFromEnv();
    const rns = await fetchCaspioRns(credentials, { includeAssignmentCounts: includeCounts });
    return NextResponse.json(buildRnResponse(rns, includeCounts));
  } catch (error: any) {
    const message = String(error?.message || 'Failed to fetch Caspio RNs');
    const status = /admin access required|invalid token|missing/i.test(message) ? 401 : 500;
    console.error('❌ Error fetching Caspio RNs:', error);
    return NextResponse.json({ success: false, error: message, rns: [] }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      idToken?: string;
      includeAssignmentCounts?: boolean;
      counts?: boolean | number | string;
    };
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken', rns: [] }, { status: 401 });
    }
    await assertAdmin(idToken);
    const includeCounts =
      body?.includeAssignmentCounts === true ||
      body?.counts === true ||
      body?.counts === 1 ||
      String(body?.counts || '') === '1';
    const credentials = getCaspioCredentialsFromEnv();
    const rns = await fetchCaspioRns(credentials, { includeAssignmentCounts: includeCounts });
    return NextResponse.json(buildRnResponse(rns, includeCounts));
  } catch (error: any) {
    const message = String(error?.message || 'Failed to fetch Caspio RNs');
    const status = /admin access required|invalid token|missing/i.test(message) ? 401 : 500;
    console.error('❌ Error fetching Caspio RNs:', error);
    return NextResponse.json({ success: false, error: message, rns: [] }, { status });
  }
}
