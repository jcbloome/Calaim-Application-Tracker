import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);

const toIso = (value: unknown) => {
  try {
    if (!value) return '';
    if (typeof (value as any)?.toDate === 'function') {
      const date = (value as any).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  } catch {
    return '';
  }
};

const memberNameOf = (data: any) =>
  [clean(data?.memberFirstName), clean(data?.memberLastName)].filter(Boolean).join(' ') ||
  clean(data?.memberName) ||
  'Member';

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const q = clean(request.nextUrl.searchParams.get('q'), 120).toLowerCase();
  if (q.length < 2) {
    return NextResponse.json({ success: false, error: 'Enter a member name or MRN.' }, { status: 400 });
  }

  const { adminDb } = await import('@/firebase-admin');
  if (!adminDb) {
    return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
  }

  const snap = await adminDb.collection('applications').limit(2500).get();
  const members = snap.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      const name = memberNameOf(data);
      const mrn = clean(data.memberMrn || data.memberMRN || data.mrn || data.Member_MRN);
      const haystack = `${name} ${mrn}`.toLowerCase();
      if (!haystack.includes(q)) return null;
      const forms = Array.isArray(data.forms) ? data.forms : [];
      const items = [
        ...forms.map((form: any) => ({
          at: toIso(form?.dateCompleted || form?.uploadedAt || data.lastUpdated),
          item: clean(form?.name) || 'Application item',
          detail: clean(form?.status) || 'Updated',
          by: clean(form?.uploadedByName || form?.uploadedByEmail || data.referrerName),
        })),
        ...(Array.isArray(data.memberActionLog) ? data.memberActionLog : []).map((entry: any) => ({
          at: toIso(entry?.timestamp || entry?.at),
          item: clean(entry?.action) || 'Activity',
          detail: clean(entry?.details, 500),
          by: clean(entry?.performedBy),
        })),
      ]
        .filter((item) => item.item)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));

      return {
        id: docSnap.id,
        name,
        mrn,
        pathway: clean(data.pathway),
        healthPlan: clean(data.healthPlan),
        status: clean(data.status),
        items,
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  return NextResponse.json({ success: true, members });
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const body = await request.json().catch(() => ({}));
  const mrn = clean(body?.mrn, 40);
  const name = clean(body?.name, 120);
  if (!mrn && !name) {
    return NextResponse.json({ success: false, error: 'A member MRN or name is required.' }, { status: 400 });
  }

  try {
    const config = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(config);
    const fields = ['Member_MRN', 'Kaiser_MRN', 'MRN', 'Medical_Record_Number', 'MCP_CIN'];
    let row: Record<string, any> | null = null;
    if (mrn) {
      for (const field of fields) {
        const where = `${field}='${mrn.replace(/'/g, "''")}'`;
        const url =
          `${config.restBaseUrl}/tables/CalAIM_tbl_Members/records` +
          `?q.where=${encodeURIComponent(where)}` +
          `&q.select=${encodeURIComponent('Senior_First,Senior_Last,Member_MRN,Kaiser_MRN,MCP_CIN,Kaiser_Status,Kaiser_ID_Status')}` +
          `&q.limit=1`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) continue;
        const json = await response.json().catch(() => ({}));
        const found = Array.isArray(json?.Result) ? json.Result[0] : null;
        if (found) {
          row = found;
          break;
        }
      }
    }

    const kaiserStatus = clean(row?.Kaiser_Status || row?.Kaiser_ID_Status);
    return NextResponse.json({
      success: true,
      found: Boolean(row),
      kaiserStatus: kaiserStatus || 'No Kaiser_Status on the Caspio record',
      memberName: [clean(row?.Senior_First), clean(row?.Senior_Last)].filter(Boolean).join(' ') || name,
      mrn: clean(row?.Member_MRN || row?.Kaiser_MRN || row?.MCP_CIN) || mrn,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Could not pull Kaiser_Status') },
      { status: 500 }
    );
  }
}
