/**
 * Kaiser T2038 → Smart Data Solutions 837P batch helpers.
 */
import { resolveKaiserRegion } from '@/lib/kaiser-region';
import {
  formatCompactDate,
  parseDateOnly,
  serviceDateWithinAuth,
  startOfToday,
  T2038_PROC_CODE,
  type T2038ClaimMemberRow,
  type T2038ClaimSettings,
} from '@/lib/t2038-claims';
import {
  build837P,
  missing837Settings,
  type X12_837P_Billing,
  type X12_837P_ClaimInput,
} from '@/lib/x12-837p';
import { type Edi270Settings } from '@/lib/x12-270';

export type KaiserSdsClaimRow = T2038ClaimMemberRow & {
  region: string;
};

export function billingFromT2038Settings(settings: T2038ClaimSettings): X12_837P_Billing {
  return {
    billName: settings.billName,
    billNpi: settings.billNpi,
    billTaxId: settings.billTaxId,
    billAddress: settings.billAddress,
    billCity: settings.billCity,
    billState: settings.billState,
    billZip: settings.billZip,
    billTaxonomy: settings.billTaxonomy,
  };
}

/** SDS claims use ILS payer 81397 (settings.kaiserPayerId) plus envelope + billing. */
export function missingKaiserSdsClaimSettings(edi: Edi270Settings, settings: T2038ClaimSettings): string[] {
  const missing = missing837Settings(edi, billingFromT2038Settings(settings), settings.charge);
  if (!settings.kaiserPayerId.trim()) missing.push('Kaiser ILS payer ID (81397)');
  if (!(settings.diag1 || 'R69').trim()) missing.push('Kaiser diagnosis (R69)');
  if (!/^\d{2}$/.test(settings.placeOfService.trim())) missing.push('Place of service (13)');
  return missing;
}

export function filterKaiserAuthorizedRows(rows: T2038ClaimMemberRow[]): T2038ClaimMemberRow[] {
  return rows.filter((row) => row.plan === 'Kaiser');
}

/** Attach Kaiser North/South from Caspio county/city/MRN when building the members API. */
export function withKaiserRegion(
  row: T2038ClaimMemberRow,
  raw?: Record<string, unknown> | null
): KaiserSdsClaimRow {
  const region = resolveKaiserRegion({
    county: raw?.Member_County || raw?.memberCounty,
    city: raw?.MemberCity || raw?.Member_City,
    mrn: row.memberId,
  });
  return { ...row, region };
}

export function sdsClaimBlockers(
  row: KaiserSdsClaimRow,
  settings: T2038ClaimSettings,
  serviceDate: Date
): string[] {
  const blockers: string[] = [...row.batchBlockers];
  if (row.window !== 'in_window' && row.window !== 'ending_soon') {
    blockers.push('Not inside the current authorization window');
  }
  if (!serviceDateWithinAuth(row, serviceDate)) {
    blockers.push('Date of service is outside the authorization');
  }
  if (!row.dateOfBirth) blockers.push('Missing date of birth');
  if (!row.memberId) blockers.push('Missing Kaiser MRN');
  if (!row.clientId2) blockers.push('Missing Client_ID2');
  if (!row.authorizationNumber) blockers.push('Missing T2038 authorization number');
  // Kaiser T2038 diagnosis is always R69 from settings (not Caspio member ICD).
  const diagnosis = (settings.diag1 || 'R69').replace(/\./g, '').toUpperCase();
  if (!diagnosis) blockers.push('Missing diagnosis code (Kaiser default R69)');
  if (!settings.kaiserPayerId.trim()) blockers.push('Kaiser ILS payer ID (81397)');
  if (!/^\d{9}$/.test(settings.billTaxId.replace(/\D/g, ''))) blockers.push('Billing tax ID (9 digits)');
  const charge = Number(settings.charge);
  if (!Number.isFinite(charge) || charge <= 0) blockers.push('T2038 charge amount');
  return [...new Set(blockers)];
}

export function to837ClaimInput(
  row: KaiserSdsClaimRow,
  settings: T2038ClaimSettings,
  serviceDate: Date
): X12_837P_ClaimInput | null {
  const dos = startOfToday(serviceDate);
  const dosYmd = formatCompactDate(dos);
  const dob = formatCompactDate(parseDateOnly(row.dateOfBirth));
  const diagnosis = (settings.diag1 || 'R69').replace(/\./g, '').toUpperCase();
  const chargeNumber = Number(settings.charge);
  if (!dosYmd || !dob || !row.memberId || !row.clientId2 || !diagnosis) return null;
  if (!Number.isFinite(chargeNumber) || chargeNumber <= 0) return null;
  return {
    patientControlNumber: `T2038-${row.clientId2}-${dosYmd}`.slice(0, 38),
    lastName: row.memberLastName,
    firstName: row.memberFirstName,
    birthDateYyyymmdd: dob,
    sex: row.gender === 'M' || row.gender === 'F' ? row.gender : '',
    memberId: row.memberId.replace(/[^A-Za-z0-9]/g, ''),
    address: row.address,
    city: row.city,
    state: row.state || 'CA',
    zip: row.zip,
    region: row.region,
    priorAuth: row.authorizationNumber,
    diagnosis,
    serviceDateYyyymmdd: dosYmd,
    charge: chargeNumber.toFixed(2),
    units: settings.units || '1',
    placeOfService: settings.placeOfService || '13',
    procedureCode: T2038_PROC_CODE,
    mod1: settings.mod1 || 'U4',
    payerId: settings.kaiserPayerId || '81397',
  };
}

export function buildKaiserSdsT2038Edi(
  rows: KaiserSdsClaimRow[],
  edi: Edi270Settings,
  settings: T2038ClaimSettings,
  serviceDate: Date
): {
  edi: string;
  included: number;
  skipped: Array<{ id: string; memberName: string; reason: string }>;
  claims: X12_837P_ClaimInput[];
} {
  const skipped: Array<{ id: string; memberName: string; reason: string }> = [];
  const claims: X12_837P_ClaimInput[] = [];
  for (const row of rows) {
    const blockers = sdsClaimBlockers(row, settings, serviceDate);
    if (blockers.length) {
      skipped.push({ id: row.id, memberName: row.memberName, reason: blockers.join('; ') });
      continue;
    }
    const input = to837ClaimInput(row, settings, serviceDate);
    if (!input) {
      skipped.push({ id: row.id, memberName: row.memberName, reason: 'Could not build claim line' });
      continue;
    }
    claims.push(input);
  }
  if (!claims.length) {
    return { edi: '', included: 0, skipped, claims };
  }
  return {
    edi: build837P(claims, edi, billingFromT2038Settings(settings)),
    included: claims.length,
    skipped,
    claims,
  };
}
