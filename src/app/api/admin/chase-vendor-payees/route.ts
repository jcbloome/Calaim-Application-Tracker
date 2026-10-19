import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchCaspioRecords, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'CalAIM_tbl_New_RCFE_Registration';

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const mask = (value: string) => {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
};

type VendorPayee = {
  rcfeName: string;
  routingNumber: string;
  accountNumber: string;
  tin: string;
  einOrSsn: string;
  npi: string;
  bankName: string;
  ready: boolean;
};

const toVendor = (row: Record<string, unknown>): VendorPayee | null => {
  const rcfeName = clean(row.RCFE_Name);
  if (!rcfeName) return null;
  const routingNumber = digits(row.Bank_Routing_Number);
  const accountNumber = digits(row.Bank_Account_Number);
  return {
    rcfeName,
    routingNumber,
    accountNumber,
    tin: clean(row.TIN),
    einOrSsn: clean(row.EIN_or_SSN),
    npi: digits(row.NPI) || clean(row.NPI),
    bankName: clean(row.Bank_Name),
    ready: routingNumber.length === 9 && accountNumber.length >= 4,
  };
};

async function loadVendors() {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const records = await fetchCaspioRecords(credentials, token, TABLE, '1=1', 1000);
  const vendors = (Array.isArray(records) ? records : [])
    .map((row) => toVendor((row || {}) as Record<string, unknown>))
    .filter((row): row is VendorPayee => Boolean(row))
    .sort((a, b) => a.rcfeName.localeCompare(b.rcfeName));
  return vendors;
}

const sheetRows = (vendors: VendorPayee[]) => [
  ['Payee Name', 'Routing Number', 'Account Number', 'TIN', 'EIN or SSN', 'NPI', 'Bank Name'],
  ...vendors.map((vendor) => [
    vendor.rcfeName,
    vendor.routingNumber,
    vendor.accountNumber,
    vendor.tin,
    vendor.einOrSsn,
    vendor.npi,
    vendor.bankName,
  ]),
];

const asTextSheet = (rows: string[][]) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const textColumns = new Set([1, 2, 3, 4, 5]);
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    textColumns.forEach((columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      if (!cell) return;
      cell.t = 's';
      cell.v = String(rows[rowIndex][columnIndex] ?? '');
      cell.z = '@';
    });
  }
  sheet['!cols'] = [
    { wch: 36 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
  ];
  return sheet;
};

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const vendors = await loadVendors();
    const ready = vendors.filter((vendor) => vendor.ready);
    const missingBank = vendors.filter((vendor) => !vendor.ready);

    if (request.nextUrl.searchParams.get('download') === '1') {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, asTextSheet(sheetRows(ready)), 'Chase vendor payees');
      XLSX.utils.book_append_sheet(workbook, asTextSheet(sheetRows(missingBank)), 'Missing bank info');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(Buffer.from(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="chase-vendor-payees-${stamp}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      success: true,
      source: TABLE,
      total: vendors.length,
      readyCount: ready.length,
      missingBankCount: missingBank.length,
      vendors: vendors.map((vendor) => ({
        rcfeName: vendor.rcfeName,
        routingNumberMasked: mask(vendor.routingNumber),
        accountNumberMasked: mask(vendor.accountNumber),
        tin: vendor.tin,
        einOrSsn: vendor.einOrSsn,
        npi: vendor.npi,
        bankName: vendor.bankName,
        ready: vendor.ready,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Could not load RCFE vendor payees') },
      { status: 500 }
    );
  }
}
