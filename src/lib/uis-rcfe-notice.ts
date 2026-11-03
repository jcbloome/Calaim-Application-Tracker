/** Health Net UIS (unsatisfactory immigration status) → Medi-Cal FFS transition notice for RCFEs. */

export const UIS_NOTICE_SUBJECT =
  'Health Net notice: Medi-Cal UIS member transition to Fee-for-Service (January 1, 2027)';

export const UIS_HEALTH_NET_HOME_URL = 'https://www.healthnet.com/content/healthnet/en_us.html';
export const UIS_HEALTH_NET_TRANSITION_URL =
  'https://www.healthnet.com/content/healthnet/en_us/providers/medi-cal-ffs-uis-member-transition.html';

export const UIS_CUSTOMER_SUPPORT_PHONE = '800-675-6110';

export type UisMatchedMember = {
  mediCalId: string;
  clientId2: string;
  firstName: string;
  lastName: string;
  dob: string;
  calaimStatus: string;
  mco: string;
  rcfeName: string;
  rcfeAddress: string;
  rcfeCity: string;
  rcfeAdminName: string;
  emails: string[];
};

export type UisRcfeGroup = {
  key: string;
  rcfeName: string;
  rcfeAddress: string;
  rcfeCity: string;
  emails: string[];
  members: UisMatchedMember[];
};

export const normalizeMediCalId = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const normalizeEmail = (value: unknown) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw || !raw.includes('@')) return '';
  return raw;
};

export const normalizeRcfeKey = (name: unknown, address: unknown) => {
  const n = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const a = String(address || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${n}|${a}`.trim() || 'unknown-rcfe';
};

/** Plain-text body used for preview / copy. */
export function buildUisNoticePlainText(): string {
  return [
    'Dear RCFE Provider,',
    '',
    'Health Net is preparing for the January 1, 2027, transition of Medi-Cal members with unsatisfactory immigration status (UIS) from managed care to the Medi-Cal Fee-for-Service (FFS) delivery system.',
    '',
    'Attached is a list of members impacted by this notice. Please review the list to help identify impacted members and begin transition planning as appropriate.',
    '',
    'Your role in supporting these members includes:',
    '',
    '• Continuing authorized Community Supports services through December 31, 2026.',
    '• Discussing ongoing needs with impacted members and helping them prepare for the transition.',
    '• Coordinating with primary care providers, behavioral health providers, county and social service agencies, community-based organizations, and other care team partners to help minimize service disruptions.',
    '• Identifying alternative services and supports that may be available through Medi-Cal FFS, county programs, behavioral health systems, home and community-based services, or local community resources.',
    '• Collaborating with Health Net care management staff, as applicable.',
    '• Supporting referrals, warm handoffs, and permissible information sharing with receiving providers or organizations.',
    '• Considering referrals to Community Health Worker organizations when appropriate, since CHW services will remain available as a Medi-Cal FFS benefit.',
    '',
    'Please note that Community Supports are not available under Medi-Cal FFS. Members transitioning on January 1, 2027 will no longer have access to Community Supports through Managed Care Medi-Cal after December 31, 2026. Early planning is therefore important to help connect members with available alternative resources and services.',
    '',
    'DHCS is expected to notify impacted members directly regarding the transition. Health Net will share additional operational guidance and member support resources as they become available.',
    '',
    `If you need assistance coordinating services for a member, please contact our customer support team at ${UIS_CUSTOMER_SUPPORT_PHONE}. The following websites also have additional information:`,
    '',
    UIS_HEALTH_NET_HOME_URL,
    UIS_HEALTH_NET_TRANSITION_URL,
    '',
    'Thank you,',
    'Connections ILS / CalAIM',
  ].join('\n');
}

/** HTML body for Resend. */
export function buildUisNoticeHtml(): string {
  const link = (href: string) =>
    `<a href="${href}" style="color:#0b57d0; word-break:break-all;">${href}</a>`;
  return `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 680px; margin: 0 auto; color: #111; font-size: 14px; line-height: 1.55;">
  <p>Dear RCFE Provider,</p>
  <p>Health Net is preparing for the January 1, 2027, transition of Medi-Cal members with unsatisfactory immigration status (UIS) from managed care to the Medi-Cal Fee-for-Service (FFS) delivery system.</p>
  <p>Attached is a list of members impacted by this notice. Please review the list to help identify impacted members and begin transition planning as appropriate.</p>
  <p><strong>Your role in supporting these members includes:</strong></p>
  <ul>
    <li>Continuing authorized Community Supports services through December 31, 2026.</li>
    <li>Discussing ongoing needs with impacted members and helping them prepare for the transition.</li>
    <li>Coordinating with primary care providers, behavioral health providers, county and social service agencies, community-based organizations, and other care team partners to help minimize service disruptions.</li>
    <li>Identifying alternative services and supports that may be available through Medi-Cal FFS, county programs, behavioral health systems, home and community-based services, or local community resources.</li>
    <li>Collaborating with Health Net care management staff, as applicable.</li>
    <li>Supporting referrals, warm handoffs, and permissible information sharing with receiving providers or organizations.</li>
    <li>Considering referrals to Community Health Worker organizations when appropriate, since CHW services will remain available as a Medi-Cal FFS benefit.</li>
  </ul>
  <p>Please note that Community Supports are not available under Medi-Cal FFS. Members transitioning on January 1, 2027 will no longer have access to Community Supports through Managed Care Medi-Cal after December 31, 2026. Early planning is therefore important to help connect members with available alternative resources and services.</p>
  <p>DHCS is expected to notify impacted members directly regarding the transition. Health Net will share additional operational guidance and member support resources as they become available.</p>
  <p>If you need assistance coordinating services for a member, please contact our customer support team at <strong>${UIS_CUSTOMER_SUPPORT_PHONE}</strong>. The following websites also have additional information:</p>
  <p>${link(UIS_HEALTH_NET_HOME_URL)}<br/>${link(UIS_HEALTH_NET_TRANSITION_URL)}</p>
  <p>Thank you,<br/>Connections ILS / CalAIM</p>
</div>`.trim();
}

export function groupMatchedMembersByRcfe(members: UisMatchedMember[]): UisRcfeGroup[] {
  const byKey = new Map<string, UisRcfeGroup>();
  for (const member of members) {
    const key = normalizeRcfeKey(member.rcfeName, member.rcfeAddress);
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(member);
      for (const email of member.emails) {
        if (!existing.emails.includes(email)) existing.emails.push(email);
      }
      continue;
    }
    byKey.set(key, {
      key,
      rcfeName: member.rcfeName || 'Unknown RCFE',
      rcfeAddress: member.rcfeAddress || '',
      rcfeCity: member.rcfeCity || '',
      emails: [...member.emails],
      members: [member],
    });
  }
  return [...byKey.values()].sort((a, b) => a.rcfeName.localeCompare(b.rcfeName));
}

/** Guess Medi-Cal ID column from spreadsheet headers. */
export function findMediCalColumnIndex(headers: string[]): number {
  const norms = headers.map((h) =>
    String(h || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
  const preferred = [
    'medi cal number',
    'medi cal id',
    'medi cal cin',
    'medicaid id',
    'mcp cin',
    'cin',
    'member id',
    'subscriber id',
    'medical id',
    'medi cal',
  ];
  for (const pref of preferred) {
    const idx = norms.findIndex((h) => h === pref || h.includes(pref));
    if (idx >= 0) return idx;
  }
  return norms.findIndex((h) => h.includes('cin') || (h.includes('medi') && h.includes('cal')));
}
