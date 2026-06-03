import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELD_OVERRIDES: Record<string, string | string[]> = {
  // Kaiser ALFT: MRN field should come from MCP_CIN, not Medi-Cal number.
  p1_mrn: 'MCP_CIN',
  p2_home_street: ['Normal_Housing_Address', 'Normal_Housing_Street'],
  p2_home_city: 'Normal_Housing_City',
  p2_home_state: 'Normal_Housing_State',
  p2_home_zip: 'Normal_Housing_Zip',
  // Q3 current physical location should use strict ISP contact/location fields.
  p2_current_street: 'ISP_Contact_Address',
  p2_current_city: 'ISP_Contact_City',
  p2_current_state: 'ISP_Contact_State',
  p2_current_zip: 'ISP_Contact_Zip',
  p2_current_type: 'ISP_Location_Type',
  p2_current_type_other: 'ISP_Location_Type',
  p2_facility_name: 'ISP_Contact_Location',
  // Header responder details used by ALFT Transition prefill.
  p1_other_responder_name: 'ISP_Contact_Name',
  p1_other_responder_relationship: 'ISP_Contact_Relationship',
  // Explicit ISP contact fields for prefill verification visibility.
  isp_contact_first: 'ISP_Contact_First',
  isp_contact_last: 'ISP_Contact_Last',
  isp_contact_email: 'ISP_Contact_Email',
  isp_contact_phone: 'ISP_Contact_Phone',
  isp_contact_2_first: 'ISP_Contact_2_First',
  isp_contact_2_last: 'ISP_Contact_2_Last',
  isp_contact_2_relationship: 'ISP_Contact_2_Relationship',
  isp_contact_2_email: 'ISP_Contact_2_Email',
  isp_contact_2_phone: 'ISP_Contact_2_Phone',
  isp_contact_confirm_date: 'ISP_Contact_Confirm_Date',
  isp_location_type: 'ISP_Location_Type',
  isp_location_name: 'ISP_Contact_Location',
  isp_location_address: 'ISP_Contact_Address',
  isp_location_city: 'ISP_Contact_City',
  isp_location_state: 'ISP_Contact_State',
  isp_location_zip: 'ISP_Contact_Zip',
  isp_contact_street: 'ISP_Contact_Address',
  isp_contact_city: 'ISP_Contact_City',
  isp_contact_state: 'ISP_Contact_State',
  isp_contact_zip: 'ISP_Contact_Zip',
  isp_contact_type: 'ISP_Contact_Type',
  isp_mcp_cin: 'MCP_CIN',
};

function clean(value: unknown, max = 300) {
  if (value == null) return '';
  const next = String(value).trim();
  return next.length > max ? next.slice(0, max) : next;
}

function getCaseInsensitive(source: Record<string, unknown>, key: string): unknown {
  const wanted = key.toLowerCase();
  const direct = source[key];
  if (direct != null && String(direct).trim() !== '') return direct;
  for (const [k, value] of Object.entries(source || {})) {
    if (k.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function getDirectRawValue(source: Record<string, unknown>, key: string): string {
  const raw = getCaseInsensitive(source, key);
  const next = clean(raw, 300);
  // Do not follow Caspio alias tokens for strict MCP_CIN reads.
  if (/^\[@field:[^\]]+\]$/i.test(next)) return '';
  return next;
}

function resolveAliasToken(rawValue: unknown, source: Record<string, unknown>): string {
  let value = clean(rawValue, 1200);
  const visited = new Set<string>();
  while (/^\[@field:[^\]]+\]$/i.test(value)) {
    if (visited.has(value.toLowerCase())) break;
    visited.add(value.toLowerCase());
    const tokenField = value.replace(/^\[@field:/i, '').replace(/\]$/, '').trim();
    const next = getCaseInsensitive(source, tokenField);
    if (next == null) return '';
    value = clean(next, 1200);
  }
  return value;
}

function formatSocialWorkerName(raw: unknown): string {
  let value = clean(raw, 180).replace(/\s+\d+$/, '').trim();
  if (!value) return '';
  if (value.includes(',')) {
    const [last, first] = value.split(',', 2).map((part) => clean(part, 120));
    value = `${first || ''} ${last || ''}`.trim();
  }
  return value
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim();
}

function toTitleCase(raw: unknown): string {
  const value = clean(raw, 240);
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim();
}

function sanitizeNamePart(raw: unknown): string {
  return clean(raw, 180).replace(/\s+\d+$/, '').trim();
}

function normalizeMemberName(parts: { first?: unknown; last?: unknown; full?: unknown }): string {
  const first = toTitleCase(sanitizeNamePart(parts.first));
  const last = toTitleCase(sanitizeNamePart(parts.last));
  if (first || last) return `${first} ${last}`.trim();
  const full = clean(parts.full, 240);
  if (!full) return '';
  if (full.includes(',')) {
    const [ln, fn] = full.split(',', 2);
    const cleanFirst = toTitleCase(sanitizeNamePart(fn));
    const cleanLast = toTitleCase(sanitizeNamePart(ln));
    return `${cleanFirst} ${cleanLast}`.trim();
  }
  const stripped = full.replace(/\s+\d+$/, '').trim();
  return toTitleCase(stripped);
}

function applyPreviewFormatting(field: string, value: string): string {
  const next = clean(value, 240);
  if (!next) return '';
  if (field === 'p1_dob' || field === 'p1_assessment_date' || field === 'isp_contact_confirm_date') {
    const iso = next.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return `${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}-${iso[1]}`;
    const us = next.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return `${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}-${us[3]}`;
  }
  if (
    field === 'p2_current_street' ||
    field === 'p2_current_city' ||
    field === 'p2_home_street' ||
    field === 'p2_home_city' ||
    field === 'p2_facility_name' ||
    field === 'p2_current_type_other' ||
    field === 'p1_other_responder_name' ||
    field === 'p1_other_responder_relationship' ||
    field === 'isp_contact_first' ||
    field === 'isp_contact_last' ||
    field === 'isp_contact_2_first' ||
    field === 'isp_contact_2_last' ||
    field === 'isp_contact_2_relationship' ||
    field === 'isp_contact_2_email' ||
    field === 'isp_contact_2_phone' ||
    field === 'isp_location_name' ||
    field === 'isp_location_address' ||
    field === 'isp_location_city' ||
    field === 'isp_contact_street' ||
    field === 'isp_contact_city' ||
    field === 'isp_contact_type'
  ) {
    return toTitleCase(next);
  }
  if (
    field === 'p2_current_state' ||
    field === 'p2_home_state' ||
    field === 'isp_contact_state' ||
    field === 'isp_location_state'
  ) {
    // Keep 2-letter codes uppercase; otherwise title-case full state names.
    return /^[A-Za-z]{2}$/.test(next) ? next.toUpperCase() : toTitleCase(next);
  }
  return next;
}

function pickMappedValue(
  targetField: string,
  mappingRows: Record<string, { primary?: string }>,
  source: Record<string, unknown>
) {
  const forced = FIELD_OVERRIDES[targetField];
  const candidates = Array.isArray(forced)
    ? forced.map((v) => clean(v, 200)).filter(Boolean)
    : [clean(forced, 200)].filter(Boolean);
  if (candidates.length === 0) {
    const mappedPrimary = clean(mappingRows?.[targetField]?.primary, 200);
    if (mappedPrimary) candidates.push(mappedPrimary);
  }
  for (const primary of candidates) {
    const value = getCaseInsensitive(source, primary);
    if (value == null || clean(value) === '') continue;
    const resolved = resolveAliasToken(value, source);
    if (!resolved) continue;
    if (targetField === 'p1_assessor_name') {
      return formatSocialWorkerName(resolved);
    }
    return resolved;
  }
  return '';
}

async function fetchMemberByClientId(params: {
  memberId: string;
  credentials: { baseUrl: string; clientId: string; clientSecret: string };
  fieldNames: string[];
}) {
  const { memberId, credentials } = params;
  const accessToken = await getCaspioToken(credentials);
  const escapedMemberId = String(memberId || '').replace(/'/g, "''");
  const whereCandidates = [`Client_ID2='${escapedMemberId}'`, `client_ID2='${escapedMemberId}'`];

  for (const where of whereCandidates) {
    const url = `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records` +
      `?q.where=${encodeURIComponent(where)}` +
      `&q.select=${encodeURIComponent('*')}` +
      `&q.limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) continue;
    const data = (await res.json().catch(() => ({}))) as any;
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    if (rows.length > 0) return rows[0] as Record<string, unknown>;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: string; memberId?: string };
    const idToken = clean(body.idToken, 4000);
    const memberId = clean(body.memberId, 200);
    if (!idToken || !memberId) {
      return NextResponse.json({ ok: false, error: 'idToken and memberId are required' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = String(decoded?.uid || '');
    const userEmail = String(decoded?.email || '').toLowerCase();
    const userRole = String((decoded as any)?.role || '').toLowerCase();
    const roles = Array.isArray((decoded as any)?.roles)
      ? (decoded as any).roles.map((r: any) => String(r).toLowerCase())
      : [];
    let isAdmin = userRole === 'admin' || roles.includes('admin') || isHardcodedAdminEmail(userEmail);
    let isKaiserStaff = userRole.includes('kaiser') || roles.includes('kaiserstaff') || roles.includes('kaiser_staff');
    let isKaiserManager = userRole.includes('kaiser manager') || roles.includes('kaisermanager') || roles.includes('kaiser_manager');

    if (!isAdmin || (!isKaiserStaff && !isKaiserManager)) {
      const [adminRoleByUid, superAdminRoleByUid, userDocByUid] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get().catch(() => null),
        adminDb.collection('roles_super_admin').doc(uid).get().catch(() => null),
        adminDb.collection('users').doc(uid).get().catch(() => null),
      ]);
      const userData = userDocByUid?.exists ? (userDocByUid.data() as any) : null;
      const roleLabel = String(userData?.role || '').trim().toLowerCase();
      if (!isAdmin) {
        isAdmin = Boolean(adminRoleByUid?.exists || superAdminRoleByUid?.exists);
      }
      isKaiserStaff = Boolean(
        isKaiserStaff ||
          userData?.isKaiserStaff ||
          userData?.isKaiserManager ||
          userData?.isKaiserAssignmentManager ||
          roleLabel.includes('kaiser staff') ||
          roleLabel.includes('kaiser manager')
      );
      isKaiserManager = Boolean(
        isKaiserManager ||
          userData?.isKaiserManager ||
          userData?.isKaiserAssignmentManager ||
          roleLabel.includes('kaiser manager')
      );
    }

    if (!isAdmin && !isKaiserStaff && !isKaiserManager) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }

    const mappingSnap = await adminDb.doc('admin-settings/alft-caspio-field-mapping').get();
    const mappingRows = (mappingSnap.exists ? mappingSnap.data()?.rows : {}) as Record<string, { primary?: string }>;
    const mappedFields = Object.values(mappingRows || {})
      .map((r) => clean(r?.primary, 200))
      .filter(Boolean);
    const forcedHome = Object.values(FIELD_OVERRIDES).flatMap((v) => (Array.isArray(v) ? v : [v]));

    const credentials = getCaspioCredentialsFromEnv();
    const source = await fetchMemberByClientId({
      memberId,
      credentials,
      fieldNames: [...mappedFields, ...forcedHome],
    });

    if (!source) {
      return NextResponse.json({ ok: false, error: 'Member not found in Caspio' }, { status: 404 });
    }

    const targets = [
      'p1_member_name',
      'p1_assessor_name',
      'p1_first_name',
      'p1_last_name',
      'p1_phone',
      'p1_dob',
      'p1_sex',
      'p1_primary_language',
      'p1_other_responder',
      'p1_other_responder_name',
      'p1_other_responder_relationship',
      'isp_contact_first',
      'isp_contact_last',
      'isp_contact_2_first',
      'isp_contact_2_last',
      'isp_contact_2_relationship',
      'isp_contact_2_email',
      'isp_contact_2_phone',
      'isp_contact_email',
      'isp_contact_phone',
      'isp_contact_confirm_date',
      'isp_location_type',
      'isp_location_name',
      'isp_location_address',
      'isp_location_city',
      'isp_location_state',
      'isp_location_zip',
      'isp_contact_street',
      'isp_contact_city',
      'isp_contact_state',
      'isp_contact_zip',
      'isp_contact_type',
      'isp_mcp_cin',
      'p2_current_street',
      'p2_current_city',
      'p2_current_state',
      'p2_current_zip',
      'p2_current_type',
      'p2_current_type_other',
      'p2_assessment_site',
      'p2_home_street',
      'p2_home_city',
      'p2_home_state',
      'p2_home_zip',
      'p2_facility_name',
      'p1_plan_id',
      'p1_mrn',
      'p1_purpose',
    ];

    const resolved = Object.fromEntries(
      targets.map((field) => {
        const raw = pickMappedValue(field, mappingRows, source);
        return [field, applyPreviewFormatting(field, raw)];
      })
    );
    if (!String(resolved.p1_other_responder_name || '').trim()) {
      const contactFirst = clean(resolved.isp_contact_first || getCaseInsensitive(source, 'ISP_Contact_First'), 120);
      const contactLast = clean(resolved.isp_contact_last || getCaseInsensitive(source, 'ISP_Contact_Last'), 120);
      const combined = `${contactFirst} ${contactLast}`.trim();
      if (combined) resolved.p1_other_responder_name = toTitleCase(combined);
    }
    if (!String(resolved.p1_other_responder_relationship || '').trim()) {
      const relationship = clean(getCaseInsensitive(source, 'ISP_Contact_Relationship'), 180);
      if (relationship) resolved.p1_other_responder_relationship = toTitleCase(relationship);
    }
    if (!String(resolved.p1_other_responder || '').trim()) {
      const responderName = String(resolved.p1_other_responder_name || '').trim();
      const responderRelationship = String(resolved.p1_other_responder_relationship || '').trim();
      resolved.p1_other_responder = responderName || responderRelationship ? 'yes' : 'no';
    }
    // Strict rule: MRN/Plan ID come from MCP_CIN only.
    const mcpCinDirect = clean(
      getDirectRawValue(source, 'MCP_CIN') || getDirectRawValue(source, 'MCP CIN'),
      80
    );
    const mcpCinAliasResolved = clean(
      resolveAliasToken(getCaseInsensitive(source, 'MCP_CIN') || getCaseInsensitive(source, 'MCP CIN'), source),
      80
    );
    const mcpCin = mcpCinDirect || mcpCinAliasResolved;
    // Force strict raw MCP_CIN into resolver output so UI cannot fall back
    // to alias-resolved values for this field.
    resolved.isp_mcp_cin = mcpCin;
    resolved.p1_mrn = mcpCin;
    resolved.p1_member_name = normalizeMemberName({
      first: resolved.p1_first_name,
      last: resolved.p1_last_name,
      full: resolved.p1_member_name,
    });
    // Kaiser workflow: Plan ID should match MRN/MCP_CIN.
    resolved.p1_plan_id = mcpCin;

    return NextResponse.json({ ok: true, resolved, source });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
