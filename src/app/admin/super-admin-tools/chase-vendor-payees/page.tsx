'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { Download, Loader2, ShieldAlert } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { adminFetch } from '@/lib/admin-fetch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type VendorRow = {
  payee: string;
  account: string;
  routing: string;
  checking: string;
  ready: boolean;
};

const EXCEL_HEADERS = ['Payee', 'Account', 'Routing', 'Checking'] as const;

export default function ChaseVendorPayeesPage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [missingBankCount, setMissingBankCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [readyOnly, setReadyOnly] = useState(true);

  useEffect(() => {
    if (!isAdminLoading && !isSuperAdmin) router.push('/admin');
  }, [isAdminLoading, isSuperAdmin, router]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminFetch<{
        vendors: VendorRow[];
        readyCount: number;
        missingBankCount: number;
      }>('/api/admin/chase-vendor-payees');
      setVendors(Array.isArray(data.vendors) ? data.vendors : []);
      setReadyCount(Number(data.readyCount || 0));
      setMissingBankCount(Number(data.missingBankCount || 0));
    } catch (loadError: any) {
      const message = String(loadError?.message || 'Could not load vendor payees');
      setError(
        message === 'Failed to fetch'
          ? 'Could not reach the server while loading Caspio. Refresh the page and try Load from Caspio again.'
          : message
      );
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    setError('');
    const rows = vendors.filter((vendor) => vendor.ready && vendor.payee && vendor.account && vendor.routing);
    if (!rows.length) {
      setError('Load from Caspio first, then download. Only payees with full account and routing numbers are included.');
      return;
    }
    setDownloading(true);
    try {
      const sheetRows: string[][] = [
        [...EXCEL_HEADERS],
        ...rows.map((vendor) => [vendor.payee, vendor.account, vendor.routing, 'Checking']),
      ];
      const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
      for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
        for (const columnIndex of [1, 2]) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = sheet[address];
          if (!cell) continue;
          cell.t = 's';
          cell.v = String(sheetRows[rowIndex][columnIndex] ?? '');
          cell.z = '@';
        }
      }
      sheet['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 12 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Chase payees');
      XLSX.writeFile(workbook, `chase-rcfe-payees-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (downloadError: any) {
      setError(String(downloadError?.message || 'Could not build the Excel file'));
    } finally {
      setDownloading(false);
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (readyOnly && !vendor.ready) return false;
      if (!needle) return true;
      return `${vendor.payee} ${vendor.account} ${vendor.routing}`.toLowerCase().includes(needle);
    });
  }, [query, readyOnly, vendors]);

  if (isAdminLoading || !isSuperAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Chase RCFE payees</h1>
          <p className="text-muted-foreground">
            Excel list from CalAIM_tbl_New_RCFE_Registration for uploading RCFE vendors to Chase.
          </p>
        </div>
        <ShieldAlert className="h-8 w-8 text-amber-700" />
      </div>

      <Alert>
        <AlertTitle>Excel columns</AlertTitle>
        <AlertDescription>
          The download has only these four columns, in this order, with full account and routing numbers. Every row is
          Checking:{' '}
          <span className="font-mono text-xs">{EXCEL_HEADERS.join(', ')}</span>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Vendor list</CardTitle>
          <CardDescription>
            {vendors.length
              ? `${readyCount} ready for Chase · ${missingBankCount} missing a 9-digit routing number or account number`
              : 'Load the current RCFE registration table.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Load from Caspio
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => download()}
              disabled={downloading || !readyCount}
            >
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download Excel
            </Button>
            <Button
              type="button"
              variant={readyOnly ? 'default' : 'outline'}
              onClick={() => setReadyOnly((value) => !value)}
            >
              {readyOnly ? 'Showing ready payees' : 'Showing all facilities'}
            </Button>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search payee, account, or routing"
              className="max-w-sm"
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payee</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Routing</TableHead>
                  <TableHead>Checking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {vendors.length ? 'No facilities match this filter.' : 'Load from Caspio to see vendors.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((vendor, index) => (
                    <TableRow key={`${vendor.payee}-${vendor.account}-${index}`}>
                      <TableCell className="font-medium">{vendor.payee}</TableCell>
                      <TableCell className="font-mono">{vendor.account || '—'}</TableCell>
                      <TableCell className="font-mono">{vendor.routing || '—'}</TableCell>
                      <TableCell>{vendor.checking || 'Checking'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
