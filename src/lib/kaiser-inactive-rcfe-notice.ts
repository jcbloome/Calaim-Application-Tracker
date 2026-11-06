import type { EligibilityResultRow } from '@/lib/batch-eligibility-results';

/** Kaiser Medi-Cal inactive notice to RCFEs after batch eligibility decode. */

export const KAISER_INACTIVE_NOTICE_SUBJECT =
  'Kaiser Medi-Cal eligibility inactive - please have member/POA reinstate';

export const KAISER_ELIGIBILITY_CHECK_NCAL_URL =
  'https://epiclink-guest-cn.kp.org/claims_cn/tapestry/enrollment/GuestEligWrapper.asp';
export const KAISER_ELIGIBILITY_CHECK_SCAL_URL =
  'https://epiclink-guest-cs.kp.org/claims_cs/tapestry/enrollment/GuestEligWrapper.asp';

/** Always CC so Connections receives a copy of each RCFE notice. */
export const KAISER_INACTIVE_NOTICE_CC = 'jason@carehomefinders.com';

export type KaiserInactiveMember = {
  clientId2: string;
  firstName: string;
  lastName: string;
  mrn: string;
  medicalId: string;
  birthDate: string;
  region: string;
  rcfeName: string;
  rcfeAdminEmail: string;
  calaimStatus: string;
};

export type KaiserInactiveRcfeGroup = {
  key: string;
  rcfeName: string;
  emails: string[];
  members: KaiserInactiveMember[];
};

export const normalizeEmail = (value: unknown) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw || !raw.includes('@')) return '';
  return raw;
};

const normalizeRcfeKey = (name: unknown) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() || 'unknown-rcfe';

export function rowToKaiserInactiveMember(row: EligibilityResultRow): KaiserInactiveMember | null {
  if (row.result.outcome !== 'inactive') return null;
  const member = row.member;
  return {
    clientId2: String(member?.clientId2 || '').trim(),
    firstName: String(member?.firstName || row.result.firstName || '').trim(),
    lastName: String(member?.lastName || row.result.lastName || '').trim(),
    mrn: String(member?.mrn || row.result.memberId || '').trim(),
    medicalId: String(member?.medicalId || '').trim(),
    birthDate: String(member?.birthDate || row.result.birthDate || '').trim(),
    region: String(member?.region || '').trim(),
    rcfeName: String(member?.rcfeName || '').trim() || 'No RCFE on file',
    rcfeAdminEmail: normalizeEmail(member?.rcfeAdminEmail),
    calaimStatus: String(member?.calaimStatus || '').trim(),
  };
}

/** Group inactive Kaiser rows by RCFE for bulk notice emails. */
export function groupKaiserInactiveByRcfe(rows: EligibilityResultRow[]): KaiserInactiveRcfeGroup[] {
  const byKey = new Map<string, KaiserInactiveRcfeGroup>();
  for (const row of rows) {
    const member = rowToKaiserInactiveMember(row);
    if (!member) continue;
    const key = normalizeRcfeKey(member.rcfeName);
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(member);
      if (member.rcfeAdminEmail && !existing.emails.includes(member.rcfeAdminEmail)) {
        existing.emails.push(member.rcfeAdminEmail);
      }
    } else {
      byKey.set(key, {
        key,
        rcfeName: member.rcfeName,
        emails: member.rcfeAdminEmail ? [member.rcfeAdminEmail] : [],
        members: [member],
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.rcfeName.localeCompare(b.rcfeName));
}

export function buildKaiserInactiveNoticePlainText(opts?: { memberCount?: number; rcfeName?: string }) {
  const count = Number(opts?.memberCount || 0);
  const rcfe = String(opts?.rcfeName || '').trim();
  return [
    'Dear RCFE Administrator,',
    '',
    rcfe
      ? `Our latest Kaiser Medi-Cal eligibility check shows ${count || 'one or more'} member(s) at ${rcfe} as inactive with Kaiser Medi-Cal.`
      : `Our latest Kaiser Medi-Cal eligibility check shows ${count || 'one or more'} member(s) as inactive with Kaiser Medi-Cal.`,
    '',
    'Please have the member and/or their Power of Attorney (POA) contact Kaiser to reinstate Medi-Cal eligibility as soon as possible so Community Supports / CalAIM services can continue without interruption.',
    '',
    "Members and RCFEs can also check monthly Medi-Cal eligibility on Kaiser's guest eligibility websites:",
    '',
    `Kaiser Northern California (NCAL): ${KAISER_ELIGIBILITY_CHECK_NCAL_URL}`,
    `Kaiser Southern California (SCAL): ${KAISER_ELIGIBILITY_CHECK_SCAL_URL}`,
    '',
    'A list of impacted members for your facility is attached.',
    '',
    'Thank you,',
    'Connections ILS / CalAIM',
    'jason@carehomefinders.com',
  ].join('\n');
}

export function buildKaiserInactiveNoticeHtml(opts?: { memberCount?: number; rcfeName?: string }) {
  const count = Number(opts?.memberCount || 0);
  const rcfe = String(opts?.rcfeName || '').trim();
  const link = (href: string) =>
    `<a href="${href}" style="color:#0b57d0;word-break:break-all;">${href}</a>`;
  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;font-size:14px;line-height:1.5;color:#111;">
  <p>Dear RCFE Administrator,</p>
  <p>${
    rcfe
      ? `Our latest Kaiser Medi-Cal eligibility check shows <strong>${count || 'one or more'} member(s)</strong> at <strong>${rcfe}</strong> as <strong>inactive</strong> with Kaiser Medi-Cal.`
      : `Our latest Kaiser Medi-Cal eligibility check shows <strong>${count || 'one or more'} member(s)</strong> as <strong>inactive</strong> with Kaiser Medi-Cal.`
  }</p>
  <p>Please have the member and/or their Power of Attorney (POA) contact Kaiser to reinstate Medi-Cal eligibility as soon as possible so Community Supports / CalAIM services can continue without interruption.</p>
  <p>Members and RCFEs can also check monthly Medi-Cal eligibility on Kaiser's guest eligibility websites:</p>
  <ul>
    <li><strong>Kaiser Northern California (NCAL):</strong> ${link(KAISER_ELIGIBILITY_CHECK_NCAL_URL)}</li>
    <li><strong>Kaiser Southern California (SCAL):</strong> ${link(KAISER_ELIGIBILITY_CHECK_SCAL_URL)}</li>
  </ul>
  <p>A list of impacted members for your facility is attached.</p>
  <p>Thank you,<br/>Connections ILS / CalAIM<br/><a href="mailto:jason@carehomefinders.com">jason@carehomefinders.com</a></p>
</div>`.trim();
}

export function buildKaiserInactiveMembersCsv(members: KaiserInactiveMember[]): string {
  const escape = (value: unknown) => {
    const raw = String(value ?? '');
    return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  const columns = [
    'Last name',
    'First name',
    'MRN',
    'Medi-Cal ID',
    'DOB',
    'Kaiser region',
    'Client_ID2',
    'CalAIM status',
    'RCFE name',
    'RCFE admin email',
  ];
  const rows = members.map((m) =>
    [
      m.lastName,
      m.firstName,
      m.mrn,
      m.medicalId,
      m.birthDate,
      m.region,
      m.clientId2,
      m.calaimStatus,
      m.rcfeName,
      m.rcfeAdminEmail,
    ]
      .map(escape)
      .join(',')
  );
  return [columns.join(','), ...rows].join('\r\n');
}
