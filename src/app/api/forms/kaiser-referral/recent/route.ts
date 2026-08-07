import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

const toIso = (value: any) => {
  if (!value) return '';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? '' : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const parseMemberFromSubject = (subject: string) => {
  const raw = clean(subject);
  if (!raw) return { memberName: '', memberMrn: '' };
  const match = raw.match(/for\s+(.+?)\s+and\s+MRN:\s*(.+)$/i);
  if (!match) return { memberName: '', memberMrn: '' };
  return {
    memberName: clean(match[1]),
    memberMrn: clean(match[2]),
  };
};

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const requestedLimitRaw = Number(req.nextUrl.searchParams.get('limit') || '10');
    const requestedLimit = Number.isFinite(requestedLimitRaw)
      ? Math.max(1, Math.min(25, Math.floor(requestedLimitRaw)))
      : 10;

    const snap = await authCheck.adminDb
      .collection('emailLogs')
      .orderBy('createdAt', 'desc')
      .limit(120)
      .get();

    const rows = snap.docs
      .map((doc: any) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((row: any) => {
        const template = clean(row?.template).toLowerCase();
        const source = clean(row?.source).toLowerCase();
        return template === 'kaiser-referral-intake' || source.includes('/kaiser-referral/send-intake');
      })
      .slice(0, requestedLimit)
      .map((row: any) => {
        const inferred = parseMemberFromSubject(clean(row?.subject));
        const metadata = (row?.metadata && typeof row.metadata === 'object') ? row.metadata : {};
        return {
          id: clean(row?.id),
          memberName: clean(metadata.memberName) || inferred.memberName || 'Unknown member',
          memberMrn: clean(metadata.memberMrn) || inferred.memberMrn,
          submittedBy: clean(metadata.submitterName) || clean(metadata.submitterEmail) || 'Unknown staff',
          status: clean(row?.status).toLowerCase() || 'unknown',
          createdAt: toIso(row?.createdAt),
        };
      });

    return NextResponse.json({ success: true, referrals: rows, count: rows.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load recent referrals') },
      { status: 500 }
    );
  }
}

