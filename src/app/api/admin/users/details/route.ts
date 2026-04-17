import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toIso = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return null;
};

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const targetUid = String(searchParams.get('uid') || '').trim();
    if (!targetUid) {
      return NextResponse.json({ success: false, error: 'uid is required' }, { status: 400 });
    }

    const user = await adminCheck.adminAuth.getUser(targetUid);

    // Avoid requiring a composite Firestore index (where + orderBy) by falling back to
    // a simple equality query and sorting in-memory if needed.
    let loginLogsDocs: any[] = [];
    try {
      const snap = await adminCheck.adminDb
        .collection('loginLogs')
        .where('userId', '==', targetUid)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();
      loginLogsDocs = snap.docs;
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isIndexError = msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION');
      if (!isIndexError) throw e;
      const snap = await adminCheck.adminDb.collection('loginLogs').where('userId', '==', targetUid).limit(50).get();
      loginLogsDocs = snap.docs;
    }

    const loginLogs = loginLogsDocs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        email: String(data?.email || ''),
        role: String(data?.role || ''),
        displayName: String(data?.displayName || ''),
        timestamp: toIso(data?.timestamp) || null,
      };
    }).sort((a: any, b: any) => {
      const am = a?.timestamp ? Date.parse(String(a.timestamp)) : 0;
      const bm = b?.timestamp ? Date.parse(String(b.timestamp)) : 0;
      return (Number.isFinite(bm) ? bm : 0) - (Number.isFinite(am) ? am : 0);
    }).slice(0, 20);

    let uploadsDocs: any[] = [];
    try {
      const snap = await adminCheck.adminDb
        .collection('standalone_upload_submissions')
        .where('userId', '==', targetUid)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      uploadsDocs = snap.docs;
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isIndexError = msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION');
      if (!isIndexError) throw e;
      const snap = await adminCheck.adminDb.collection('standalone_upload_submissions').where('userId', '==', targetUid).limit(25).get();
      uploadsDocs = snap.docs;
    }

    const uploads = uploadsDocs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        status: String(data?.status || ''),
        docType: String(data?.docType || ''),
        fileName: String(data?.fileName || ''),
        storagePath: String(data?.storagePath || ''),
        createdAt: toIso(data?.createdAt) || null,
      };
    }).sort((a: any, b: any) => {
      const am = a?.createdAt ? Date.parse(String(a.createdAt)) : 0;
      const bm = b?.createdAt ? Date.parse(String(b.createdAt)) : 0;
      return (Number.isFinite(bm) ? bm : 0) - (Number.isFinite(am) ? am : 0);
    }).slice(0, 10);

    return NextResponse.json({
      success: true,
      user: {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        disabled: Boolean(user.disabled),
        createdAt: user.metadata?.creationTime || null,
        lastSignInAt: user.metadata?.lastSignInTime || null,
        providerIds: Array.isArray(user.providerData) ? user.providerData.map((p) => p?.providerId).filter(Boolean) : [],
      },
      loginLogs,
      uploads,
    });
  } catch (error: any) {
    console.error('❌ Error fetching user details:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch user details' }, { status: 500 });
  }
}

