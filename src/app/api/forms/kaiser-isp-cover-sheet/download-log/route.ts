import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();
const formatDownloadDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
const buildDownloadName = (memberName: string, memberMrn: string, createdAtIso: string) => {
  const safeMember = clean(memberName) || 'Unknown Member';
  const safeMrn = clean(memberMrn) || 'N/A';
  const safeDate = formatDownloadDate(createdAtIso) || 'Unknown Date';
  return `ISP Cover Sheet, ${safeMember}, MRN ${safeMrn}, ${safeDate}`;
};

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
    const search = clean(req.nextUrl.searchParams.get('search')).toLowerCase();
    const staff = clean(req.nextUrl.searchParams.get('staff')).toLowerCase();
    const member = clean(req.nextUrl.searchParams.get('member')).toLowerCase();
    const from = clean(req.nextUrl.searchParams.get('from'));
    const to = clean(req.nextUrl.searchParams.get('to'));
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : NaN;
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : NaN;

    const snap = await authCheck.adminDb
      .collection('kaiser_isp_cover_sheet_download_logs')
      .orderBy('createdAt', 'desc')
      .limit(Math.max(limit, 500))
      .get();

    const logsRaw = snap.docs.map((doc: any) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        downloadName: clean(data.downloadName),
        memberName: clean(data.memberName),
        memberMrn: clean(data.memberMrn),
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

    const logs = logsRaw.filter((log) => {
      const haystack = `${log.downloadName} ${log.memberName} ${log.memberMrn} ${log.memberClientId} ${log.staffName} ${log.staffEmail} ${log.coverPageType}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (staff) {
        const staffHaystack = `${log.staffName} ${log.staffEmail}`.toLowerCase();
        if (!staffHaystack.includes(staff)) return false;
      }
      if (member) {
        const memberHaystack = `${log.downloadName} ${log.memberName} ${log.memberMrn} ${log.memberClientId}`.toLowerCase();
        if (!memberHaystack.includes(member)) return false;
      }
      if (!Number.isNaN(fromTime) || !Number.isNaN(toTime)) {
        const ts = new Date(log.createdAt || '').getTime();
        if (Number.isNaN(ts)) return false;
        if (!Number.isNaN(fromTime) && ts < fromTime) return false;
        if (!Number.isNaN(toTime) && ts > toTime) return false;
      }
      return true;
    }).slice(0, limit);

    return NextResponse.json({ success: true, logs, count: logs.length });
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

    const body = (await req.json().catch(() => ({} as any))) as any;
    const memberName = clean(body?.memberName);
    const memberMrn = clean(body?.memberMrn);
    const memberClientId = clean(body?.memberClientId);
    const coverPageType = clean(body?.coverPageType);
    const verified = Boolean(body?.verified);
    const fallbackStaffName = clean(body?.fallbackStaffName);
    const fallbackStaffEmail = clean(body?.fallbackStaffEmail).toLowerCase();
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
    const createdAtIso = new Date().toISOString();
    const downloadName = buildDownloadName(memberName, memberMrn, createdAtIso);
    const isVerifiedAuth = authCheck.ok;
    const staffEmail = isVerifiedAuth
      ? clean(authCheck.email).toLowerCase()
      : fallbackStaffEmail || 'unknown-staff@local';
    const staffName = isVerifiedAuth
      ? clean(authCheck.name) || clean(authCheck.email).toLowerCase()
      : fallbackStaffName || fallbackStaffEmail || 'Unknown staff (no auth token)';
    const staffUid = isVerifiedAuth ? authCheck.uid : '';
    const docRef = await adminDb.collection('kaiser_isp_cover_sheet_download_logs').add({
      formType: 'kaiser-isp-cover-sheet',
      downloadName,
      memberName,
      memberMrn,
      memberClientId,
      coverPageType,
      verified: true,
      archived: false,
      staffUid,
      staffEmail,
      staffName,
      authVerified: isVerifiedAuth,
      createdAt: serverTimestamp,
      createdAtIso,
    });

    return NextResponse.json({
      success: true,
      log: {
        id: docRef.id,
        downloadName,
        memberName,
        memberMrn,
        memberClientId,
        coverPageType,
        verified: true,
        staffEmail,
        staffName,
        authVerified: isVerifiedAuth,
        createdAt: createdAtIso,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to create download log entry') },
      { status: 500 }
    );
  }
}
