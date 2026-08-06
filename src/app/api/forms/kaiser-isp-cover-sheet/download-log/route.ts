import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb, adminStorage } from '@/firebase-admin';

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

const writeGlobalActivityLog = async (params: {
  type: string;
  memberName: string;
  memberClientId: string;
  actorName: string;
  actorEmail: string;
  message: string;
}) => {
  const adminModule = await import('@/firebase-admin');
  const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
  await adminDb.collection('notifications').add({
    type: params.type,
    memberName: params.memberName || 'Unknown member',
    memberClientId: params.memberClientId || '',
    message: params.message,
    sentBy: params.actorName || params.actorEmail || 'System',
    senderName: params.actorName || params.actorEmail || 'System',
    senderEmail: params.actorEmail || '',
    sentAt: serverTimestamp,
    source: 'system',
    subtype: 'kaiser-isp-cover-sheet',
  });
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
        deleted: Boolean(data.deleted),
      };
    });

    const logs = logsRaw.filter((log) => {
      if (log.deleted) return false;
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
    const eventType = clean(body?.eventType).toLowerCase();
    if (eventType === 'start_over') {
      if (!authCheck.ok) {
        return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
      }
      const memberName = clean(body?.memberName) || 'Unknown member';
      const memberClientId = clean(body?.memberClientId);
      const actorName = clean(authCheck.name) || clean(authCheck.email).toLowerCase();
      const actorEmail = clean(authCheck.email).toLowerCase();
      await writeGlobalActivityLog({
        type: 'isp_cover_start_over',
        memberName,
        memberClientId,
        actorName,
        actorEmail,
        message: `ISP cover form reset/start over for ${memberName}${memberClientId ? ` (Client_ID2: ${memberClientId})` : ''}.`,
      });
      return NextResponse.json({ success: true });
    }

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

export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const logId = clean(req.nextUrl.searchParams.get('logId'));
    if (!logId) {
      return NextResponse.json({ success: false, error: 'logId is required' }, { status: 400 });
    }

    const logRef = authCheck.adminDb.collection('kaiser_isp_cover_sheet_download_logs').doc(logId);
    const logDoc = await logRef.get();
    if (!logDoc.exists) {
      return NextResponse.json({ success: false, error: 'Download log not found' }, { status: 404 });
    }
    const logData = logDoc.data() || {};

    const archivedStoragePath = clean(logData.archivedStoragePath);
    if (archivedStoragePath) {
      try {
        await adminStorage.bucket().file(archivedStoragePath).delete({ ignoreNotFound: true });
      } catch {
        // best-effort file delete; keep metadata delete operation going
      }
    }

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const actorName = clean(authCheck.name) || clean(authCheck.email).toLowerCase();
    const actorEmail = clean(authCheck.email).toLowerCase();
    const memberName = clean(logData.memberName) || 'Unknown member';
    const memberClientId = clean(logData.memberClientId);

    await logRef.set(
      {
        deleted: true,
        deletedAt: serverTimestamp,
        deletedAtIso: new Date().toISOString(),
        deletedByUid: clean(authCheck.uid),
        deletedByName: actorName,
        deletedByEmail: actorEmail,
      },
      { merge: true }
    );

    await writeGlobalActivityLog({
      type: 'isp_cover_download_deleted',
      memberName,
      memberClientId,
      actorName,
      actorEmail,
      message: `Deleted ISP cover download record for ${memberName}${memberClientId ? ` (Client_ID2: ${memberClientId})` : ''}.`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to delete download log entry') },
      { status: 500 }
    );
  }
}
