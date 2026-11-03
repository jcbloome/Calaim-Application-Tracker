import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  groupMatchedMembersByRcfe,
  normalizeEmail,
  normalizeMediCalId,
  type UisMatchedMember,
} from '@/lib/uis-rcfe-notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const s = (value: unknown) => String(value ?? '').trim();

const first = (...values: unknown[]) => values.map(s).find(Boolean) || '';

function collectEmails(row: Record<string, unknown>): string[] {
  const keys = [
    'RCFE_Admin_Email',
    'RCFE_Administrator_Email',
    'RCFE_AdminEmail',
    'CalAIM_RCFE_Owner_Email',
    'RCFE_Owner_Email',
    'CalAIM_RCFE_OwnerEmail',
  ];
  const emails: string[] = [];
  for (const key of keys) {
    const email = normalizeEmail(row[key]);
    if (email && !emails.includes(email)) emails.push(email);
  }
  return emails;
}

function mediCalCandidates(row: Record<string, unknown>): string[] {
  const values = [
    row.MCP_CIN,
    row.MediCal_Number,
    row.Medical_Number,
    row.memberMediCalNum,
    row.Medi_Cal_Number,
    row.CIN,
    row.memberMrn,
    row.MRN,
    row.Member_MRN,
  ];
  const out: string[] = [];
  for (const value of values) {
    const id = normalizeMediCalId(value);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function toMatchedMember(row: Record<string, unknown>, matchedId: string): UisMatchedMember {
  return {
    mediCalId: matchedId,
    clientId2: first(row.Client_ID2, row.client_ID2),
    firstName: first(row.Senior_First, row.memberFirstName),
    lastName: first(row.Senior_Last, row.memberLastName),
    dob: first(row.Birth_Date, row.memberDob),
    calaimStatus: first(row.CalAIM_Status, row.caspioCalAIMStatus) || '(no status)',
    mco: first(row.CalAIM_MCO),
    rcfeName: first(row.RCFE_Name, row.Facility_Name),
    rcfeAddress: first(row.RCFE_Address, row.RCFE_Street, row.RCFE_Street_Address),
    rcfeCity: first(row.RCFE_City),
    rcfeAdminName: first(row.RCFE_Admin_Name, row.RCFE_Administrator, row.RCFE_Admin),
    emails: collectEmails(row),
  };
}

/** Match uploaded Medi-Cal IDs to Caspio cache members and group by RCFE. */
export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
  if (!authCheck.ok) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { mediCalIds?: unknown };
    const rawIds = Array.isArray(body.mediCalIds) ? body.mediCalIds : [];
    const uploadedIds = [
      ...new Set(rawIds.map((id) => normalizeMediCalId(id)).filter((id) => id.length >= 5)),
    ];

    if (!uploadedIds.length) {
      return NextResponse.json(
        { success: false, error: 'Upload at least one Medi-Cal number (5+ characters).' },
        { status: 400 }
      );
    }

    const snap = await authCheck.adminDb.collection('caspio_members_cache').limit(15000).get();
    const byMediCal = new Map<string, Record<string, unknown>>();
    for (const doc of snap.docs as Array<{ data: () => Record<string, unknown> }>) {
      const row = doc.data() || {};
      if (row.deletedFromCaspio === true) continue;
      for (const id of mediCalCandidates(row)) {
        if (!byMediCal.has(id)) byMediCal.set(id, row);
      }
    }

    const matched: UisMatchedMember[] = [];
    const unmatched: string[] = [];
    const matchedUploadIds = new Set<string>();

    for (const id of uploadedIds) {
      const row = byMediCal.get(id);
      if (!row) {
        unmatched.push(id);
        continue;
      }
      matchedUploadIds.add(id);
      matched.push(toMatchedMember(row, id));
    }

    const rcfeGroups = groupMatchedMembersByRcfe(matched);
    const withEmail = rcfeGroups.filter((g) => g.emails.length > 0);
    const withoutEmail = rcfeGroups.filter((g) => g.emails.length === 0);

    return NextResponse.json({
      success: true,
      uploadedCount: uploadedIds.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      unmatched,
      rcfeCount: rcfeGroups.length,
      rcfeWithEmailCount: withEmail.length,
      rcfeWithoutEmailCount: withoutEmail.length,
      members: matched,
      rcfeGroups,
    });
  } catch (error: any) {
    console.error('[uis-rcfe-notice/match] failed', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to match Medi-Cal IDs') },
      { status: 500 }
    );
  }
}
