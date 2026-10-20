import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TABLE = 'CalAIM_tbl_New_RCFE_Registration';
const SELECT = 'RCFE_Name,Bank_Routing_Number,Bank_Account_Number';

/** Exact Excel columns for the Chase RCFE payee list, in order. */
const EXCEL_HEADERS = ['Payee', 'Account', 'Routing', 'Checking'] as const;

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');

type VendorPayee = {
  payee: string;
  account: string;
  routing: string;
  ready: boolean;
};

const toVendor = (row: Record<string, unknown>): VendorPayee | null => {
  const payee = clean(row.RCFE_Name);
  if (!payee) return null;
  const routing = digits(row.Bank_Routing_Number);
  const account = digits(row.Bank_Account_Number);
  return {
    payee,
    account,
    routing,
    ready: routing.length === 9 && account.length >= 4,
  };
};

async function loadVendors() {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const pageSize = 1000;
  const maxPages = 20;
  const all: Record<string, unknown>[] = [];

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const params = new URLSearchParams({
      'q.where': '1=1',
      'q.select': SELECT,
      'q.pageSize': String(pageSize),
      'q.pageNumber': String(pageNumber),
    });
    const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${encodeURIComponent(TABLE)}/records?${params}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Caspio RCFE registration fetch failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`
      );
    }
    const json = (await response.json().catch(() => ({}))) as { Result?: unknown[] };
    const page = Array.isArray(json?.Result) ? json.Result : [];
    if (!page.length) break;
    page.forEach((row) => all.push((row || {}) as Record<string, unknown>));
    if (page.length < pageSize) break;
  }

  return all
    .map((row) => toVendor(row))
    .filter((row): row is VendorPayee => Boolean(row))
    .sort((a, b) => a.payee.localeCompare(b.payee));
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const vendors = await loadVendors();
    const ready = vendors.filter((vendor) => vendor.ready);
    const missingBank = vendors.filter((vendor) => !vendor.ready);

    return NextResponse.json({
      success: true,
      source: TABLE,
      headers: EXCEL_HEADERS,
      total: vendors.length,
      readyCount: ready.length,
      missingBankCount: missingBank.length,
      vendors: vendors.map((vendor) => ({
        payee: vendor.payee,
        account: vendor.account,
        routing: vendor.routing,
        checking: 'Checking',
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
