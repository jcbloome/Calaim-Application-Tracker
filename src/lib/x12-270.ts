/**
 * X12 270 (005010X279A1) batch eligibility inquiry builder, used for Kaiser via Smart Data Solutions.
 */
import type { BatchEligibilityMember } from '@/lib/batch-eligibility';

export const EDI_SETTINGS_DOC_ID = 'kaiser-270';

export type Edi270Settings = {
  senderQualifier: string;
  senderId: string;
  receiverQualifier: string;
  receiverId: string;
  gsSenderId: string;
  gsReceiverId: string;
  usage: 'P' | 'T';
  payerName: string;
  payerIdNorth: string;
  payerIdSouth: string;
  providerName: string;
  providerNpi: string;
  originatorId: string;
  memberIdSource: 'mrn' | 'medicalId';
  serviceType: string;
  maxPerTransaction: number;
  segmentPerLine: boolean;
  updatedAtIso?: string;
  updatedByEmail?: string;
};

export const DEFAULT_EDI_270_SETTINGS: Edi270Settings = {
  senderQualifier: 'ZZ',
  senderId: '',
  receiverQualifier: 'ZZ',
  receiverId: '',
  gsSenderId: '',
  gsReceiverId: '',
  usage: 'P',
  payerName: 'KAISER FOUNDATION HEALTH PLAN',
  payerIdNorth: '',
  payerIdSouth: '',
  providerName: '',
  providerNpi: '1508537325',
  originatorId: '',
  memberIdSource: 'mrn',
  serviceType: '30',
  maxPerTransaction: 99,
  segmentPerLine: false,
};

/** Settings that must be filled before a 270 file can be built. */
export function missingEdiSettings(settings: Edi270Settings): string[] {
  const missing: string[] = [];
  if (!settings.senderId.trim()) missing.push('Sender (submitter) ID');
  if (!settings.receiverId.trim()) missing.push('Receiver ID');
  if (!settings.payerIdNorth.trim() && !settings.payerIdSouth.trim()) missing.push('Kaiser payer ID');
  if (!settings.providerName.trim()) missing.push('Provider / organization name');
  if (!/^\d{10}$/.test(settings.providerNpi.trim())) missing.push('Provider NPI (10 digits)');
  return missing;
}

/** Payer ID for a member's region; falls back to whichever region ID is filled. */
export function payerIdForMember(member: BatchEligibilityMember, settings: Edi270Settings): string {
  const north = settings.payerIdNorth.trim();
  const south = settings.payerIdSouth.trim();
  if (member.region === 'Kaiser North') return north || south;
  if (member.region === 'Kaiser South') return south || north;
  return north || south;
}

export function memberIdFor(member: BatchEligibilityMember, settings: Edi270Settings): string {
  return (settings.memberIdSource === 'mrn' ? member.mrn : member.medicalId).replace(/[^A-Za-z0-9]/g, '');
}

const clean = (value: string, max: number) =>
  String(value || '')
    .toUpperCase()
    .replace(/[*~^:|\\\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const pad = (value: string, length: number) => clean(value, length).padEnd(length, ' ');

function ymd(raw: string): string {
  const v = String(raw || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`;
  return /^\d{8}$/.test(v) ? v : '';
}

/** Members that can't go in a 270: no member ID, name, or birth date. */
export function edi270Problems(member: BatchEligibilityMember, settings: Edi270Settings): string[] {
  const problems: string[] = [];
  if (!memberIdFor(member, settings)) problems.push(settings.memberIdSource === 'mrn' ? 'no MRN' : 'no Medi-Cal CIN');
  if (!member.lastName.trim() || !member.firstName.trim()) problems.push('missing name');
  if (!ymd(member.birthDate)) problems.push('no birth date');
  return problems;
}

/**
 * Build a 270 interchange. Members are grouped by payer ID and split into transactions of at most
 * `maxPerTransaction` subscribers. Each subscriber's TRN trace number is their Client_ID2 so the 271 can be matched back.
 */
export function build270(members: BatchEligibilityMember[], settings: Edi270Settings, now = new Date()): string {
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const control = String(Math.floor(now.getTime() / 1000) % 1_000_000_000).padStart(9, '0');
  const npi = settings.providerNpi.trim();
  const originator = (settings.originatorId.trim() || `9${npi.slice(0, 9)}`).slice(0, 10);
  const terminator = settings.segmentPerLine ? '~\r\n' : '~';
  const out: string[] = [];

  out.push(
    [
      'ISA',
      '00',
      pad('', 10),
      '00',
      pad('', 10),
      pad(settings.senderQualifier || 'ZZ', 2),
      pad(settings.senderId, 15),
      pad(settings.receiverQualifier || 'ZZ', 2),
      pad(settings.receiverId, 15),
      yyyymmdd.slice(2),
      hhmm,
      '^',
      '00501',
      control,
      '0',
      settings.usage === 'T' ? 'T' : 'P',
      ':',
    ].join('*')
  );
  out.push(
    [
      'GS',
      'HS',
      clean(settings.gsSenderId || settings.senderId, 15),
      clean(settings.gsReceiverId || settings.receiverId, 15),
      yyyymmdd,
      hhmm,
      '1',
      'X',
      '005010X279A1',
    ].join('*')
  );

  const byPayer = new Map<string, BatchEligibilityMember[]>();
  for (const member of members) {
    const payerId = payerIdForMember(member, settings);
    byPayer.set(payerId, [...(byPayer.get(payerId) || []), member]);
  }

  const max = Math.max(1, Math.min(9999, Number(settings.maxPerTransaction) || 99));
  let stCount = 0;
  for (const [payerId, payerMembers] of byPayer) {
    for (let start = 0; start < payerMembers.length; start += max) {
      stCount++;
      const stControl = String(stCount).padStart(4, '0');
      const seg: string[] = [];
      seg.push(`ST*270*${stControl}*005010X279A1`);
      seg.push(`BHT*0022*13*${control}${stControl}*${yyyymmdd}*${hhmm}`);
      seg.push('HL*1**20*1');
      seg.push(`NM1*PR*2*${clean(settings.payerName, 60)}*****PI*${clean(payerId, 80)}`);
      seg.push('HL*2*1*21*1');
      seg.push(`NM1*1P*2*${clean(settings.providerName, 60)}*****XX*${npi}`);
      let hl = 2;
      for (const member of payerMembers.slice(start, start + max)) {
        hl++;
        seg.push(`HL*${hl}*2*22*0`);
        seg.push(`TRN*1*${clean(member.clientId2, 50)}*${originator}`);
        seg.push(`NM1*IL*1*${clean(member.lastName, 60)}*${clean(member.firstName, 35)}****MI*${memberIdFor(member, settings)}`);
        const sex = member.sex === 'M' || member.sex === 'F' ? member.sex : '';
        seg.push(`DMG*D8*${ymd(member.birthDate)}${sex ? `*${sex}` : ''}`);
        seg.push(`DTP*291*D8*${yyyymmdd}`);
        seg.push(`EQ*${clean(settings.serviceType || '30', 2)}`);
      }
      seg.push(`SE*${seg.length + 1}*${stControl}`);
      out.push(...seg);
    }
  }

  out.push(`GE*${stCount}*1`);
  out.push(`IEA*1*${control}`);
  return out.join(terminator) + terminator;
}
