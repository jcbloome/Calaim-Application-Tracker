/**
 * X12 837P (005010X222A1) professional claim batch builder for Kaiser via Smart Data Solutions.
 */
import type { Edi270Settings } from '@/lib/x12-270';
import { missingEdiSettings, payerIdForMember } from '@/lib/x12-270';

export type X12_837P_ClaimInput = {
  /** Patient control / claim ID (CLM01) — Client_ID2 + DOS. */
  patientControlNumber: string;
  lastName: string;
  firstName: string;
  birthDateYyyymmdd: string;
  sex: 'M' | 'F' | '';
  memberId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  region: string;
  priorAuth: string;
  diagnosis: string;
  serviceDateYyyymmdd: string;
  charge: string;
  units: string;
  placeOfService: string;
  procedureCode: string;
  /** Procedure modifier 1 (e.g. U4). */
  mod1?: string;
  /** Claim payer ID (ILS 81397 for Kaiser). When set, overrides region-based EDI payer IDs. */
  payerId?: string;
};

export type X12_837P_Billing = {
  billName: string;
  billNpi: string;
  billTaxId: string;
  billAddress: string;
  billCity: string;
  billState: string;
  billZip: string;
  billTaxonomy: string;
};

const clean = (value: string, max: number) =>
  String(value || '')
    .toUpperCase()
    .replace(/[*~^:|\\\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const pad = (value: string, length: number) => clean(value, length).padEnd(length, ' ');

/** Envelope + billing fields required before building an 837P. */
export function missing837Settings(edi: Edi270Settings, billing: X12_837P_Billing, charge: string): string[] {
  const missing = [...missingEdiSettings(edi)];
  if (!billing.billName.trim()) missing.push('Billing name');
  if (!billing.billAddress.trim()) missing.push('Billing address');
  if (!billing.billCity.trim()) missing.push('Billing city');
  if (!/^[A-Z]{2}$/i.test(billing.billState.trim())) missing.push('Billing state');
  if (!billing.billZip.trim()) missing.push('Billing ZIP');
  if (!billing.billTaxonomy.trim()) missing.push('Billing taxonomy');
  if (!/^\d{10}$/.test(billing.billNpi.trim())) missing.push('Billing NPI (10 digits)');
  if (!/^\d{9}$/.test(billing.billTaxId.trim().replace(/\D/g, ''))) missing.push('Billing tax ID (9 digits)');
  const amount = Number(charge);
  if (!Number.isFinite(amount) || amount <= 0) missing.push('T2038 charge amount');
  return missing;
}

/**
 * Build an 837P interchange. Claims are grouped by Kaiser payer ID and split into
 * transactions of at most `maxPerTransaction` claims.
 */
export function build837P(
  claims: X12_837P_ClaimInput[],
  edi: Edi270Settings,
  billing: X12_837P_Billing,
  now = new Date()
): string {
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const control = String(Math.floor(now.getTime() / 1000) % 1_000_000_000).padStart(9, '0');
  const npi = billing.billNpi.trim() || edi.providerNpi.trim();
  const taxId = billing.billTaxId.replace(/\D/g, '').slice(0, 9);
  const terminator = edi.segmentPerLine ? '~\r\n' : '~';
  const out: string[] = [];

  out.push(
    [
      'ISA',
      '00',
      pad('', 10),
      '00',
      pad('', 10),
      pad(edi.senderQualifier || 'ZZ', 2),
      pad(edi.senderId, 15),
      pad(edi.receiverQualifier || 'ZZ', 2),
      pad(edi.receiverId, 15),
      yyyymmdd.slice(2),
      hhmm,
      '^',
      '00501',
      control,
      '0',
      edi.usage === 'T' ? 'T' : 'P',
      ':',
    ].join('*')
  );
  out.push(
    [
      'GS',
      'HC',
      clean(edi.gsSenderId || edi.senderId, 15),
      clean(edi.gsReceiverId || edi.receiverId, 15),
      yyyymmdd,
      hhmm,
      '1',
      'X',
      '005010X222A1',
    ].join('*')
  );

  const byPayer = new Map<string, X12_837P_ClaimInput[]>();
  for (const claim of claims) {
    const payerId =
      clean(claim.payerId || '', 80) || payerIdForMember({ region: claim.region }, edi);
    byPayer.set(payerId, [...(byPayer.get(payerId) || []), claim]);
  }

  const max = Math.max(1, Math.min(9999, Number(edi.maxPerTransaction) || 99));
  let stCount = 0;
  const billName = clean(billing.billName || edi.providerName, 60);
  const billAddress = clean(billing.billAddress, 55);
  const billCity = clean(billing.billCity, 30);
  const billState = clean(billing.billState, 2);
  const billZip = billing.billZip.replace(/\D/g, '').slice(0, 9);
  const taxonomy = clean(billing.billTaxonomy, 50);

  for (const [payerId, payerClaims] of byPayer) {
    for (let start = 0; start < payerClaims.length; start += max) {
      stCount++;
      const stControl = String(stCount).padStart(4, '0');
      const batchId = clean(`${control}${stControl}`, 30);
      const chunk = payerClaims.slice(start, start + max);
      const seg: string[] = [];
      seg.push(`ST*837*${stControl}*005010X222A1`);
      seg.push(`BHT*0019*00*${batchId}*${yyyymmdd}*${hhmm}*CH`);
      seg.push(`NM1*41*2*${billName}*****46*${clean(edi.senderId, 80)}`);
      seg.push(`NM1*40*2*${clean(edi.payerName || 'SMART DATA SOLUTIONS', 60)}*****46*${clean(edi.receiverId, 80)}`);
      seg.push('HL*1**20*1');
      seg.push(`PRV*BI*PXC*${taxonomy}`);
      seg.push(`NM1*85*2*${billName}*****XX*${npi}`);
      seg.push(`N3*${billAddress}`);
      seg.push(`N4*${billCity}*${billState}*${billZip}`);
      seg.push(`REF*EI*${taxId}`);

      let hl = 1;
      for (const claim of chunk) {
        hl++;
        const charge = Number(claim.charge);
        const chargeStr = Number.isFinite(charge) && charge > 0 ? charge.toFixed(2) : clean(claim.charge, 18);
        const pos = clean(claim.placeOfService || '13', 2);
        const diag = clean(claim.diagnosis.replace(/\./g, ''), 30);
        const sex = claim.sex === 'M' || claim.sex === 'F' ? claim.sex : '';
        const patZip = claim.zip.replace(/\D/g, '').slice(0, 9);
        const proc = clean(claim.procedureCode || 'T2038', 48);
        const mod1 = clean(claim.mod1 || '', 2);
        const procComposite = mod1 ? `HC:${proc}:${mod1}` : `HC:${proc}`;
        seg.push(`HL*${hl}*1*22*0`);
        seg.push('SBR*P*18*******MC');
        seg.push(
          `NM1*IL*1*${clean(claim.lastName, 60)}*${clean(claim.firstName, 35)}****MI*${clean(claim.memberId, 80)}`
        );
        if (claim.address.trim()) {
          seg.push(`N3*${clean(claim.address, 55)}`);
          seg.push(`N4*${clean(claim.city, 30)}*${clean(claim.state || 'CA', 2)}*${patZip}`);
        }
        seg.push(`DMG*D8*${clean(claim.birthDateYyyymmdd, 8)}${sex ? `*${sex}` : ''}`);
        seg.push(`NM1*PR*2*${clean(edi.payerName, 60)}*****PI*${clean(payerId, 80)}`);
        seg.push(
          `CLM*${clean(claim.patientControlNumber, 38)}*${chargeStr}***${pos}:B:1*Y*A*Y*Y`
        );
        if (claim.priorAuth.trim()) {
          seg.push(`REF*G1*${clean(claim.priorAuth, 50)}`);
        }
        seg.push(`HI*ABK:${diag}`);
        seg.push('LX*1');
        seg.push(`SV1*${procComposite}*${chargeStr}*UN*${clean(claim.units || '1', 15)}***1`);
        seg.push(`DTP*472*D8*${clean(claim.serviceDateYyyymmdd, 8)}`);
      }

      seg.push(`SE*${seg.length + 1}*${stControl}`);
      out.push(...seg);
    }
  }

  out.push(`GE*${stCount}*1`);
  out.push(`IEA*1*${control}`);
  return out.join(terminator) + terminator;
}
