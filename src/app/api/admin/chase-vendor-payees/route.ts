import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchCaspioRecords, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'CalAIM_tbl_New_RCFE_Registration';

/** Exact Excel columns for the Chase vendor payment list. */
const EXCEL_HEADERS = ['RCFE_Name', 'Bank_Routing_Number', 'Bank_Account_Number', 'TIN'] as const;

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');

type VendorPayee = {
  rcfeName: string;
  routingNumber: string;
  accountNumber: string;
  tin: string;
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
    npi: digits(row.NPI) || clean(row.NPI),
    bankName: clean(row.Bank_Name),
    ready: routingNumber.length === 9 && accountNumber.length >= 4,
  };
};

async function loadVendors() {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const records = await fetchCaspioRecords(credentials, token, TABLE, '1=1', 1000);
  return (Array.isArray(records) ? records : [])
    .map((row) => toVendor((row || {}) as Record<string, unknown>))
    .filter((row): row is VendorPayee => Boolean(row))
    .sort((a, b) => a.rcfeName.localeCompare(b.rcfeName));
}

const buildWorkbook = (vendors: VendorPayee[]) => {
  const rows: string[][] = [
    [...EXCEL_HEADERS],
    ...vendors.map((vendor) => [
      vendor.rcfeName,
      vendor.routingNumber,
      vendor.accountNumber,
      vendor.tin,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  // Keep routing, account, and TIN as text so Excel does not drop digits.
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    for (const columnIndex of [1, 2, 3]) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      if (!cell) continue;
      cell.t = 's';
      cell.v = String(rows[rowIndex][columnIndex] ?? '');
      cell.z = '@';
    }
  }
  sheet['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 22 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Chase payees');
  return workbook;
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
      const workbook = buildWorkbook(ready);
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(Buffer.from(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="chase-rcfe-payees-${stamp}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      success: true,
      source: TABLE,
      headers: EXCEL_HEADERS,
      total: vendors.length,
      readyCount: ready.length,
      missingBankCount: missingBank.length,
      vendors: vendors.map((vendor) => ({
        rcfeName: vendor.rcfeName,
        routingNumber: vendor.routingNumber,
        accountNumber: vendor.accountNumber,
        tin: vendor.tin,
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
