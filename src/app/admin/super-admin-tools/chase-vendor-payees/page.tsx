'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, ShieldAlert } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { adminFetch, firebaseAuthHeaders } from '@/lib/admin-fetch';
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
  rcfeName: string;
  routingNumber: string;
  accountNumber: string;
  tin: string;
  npi: string;
  bankName: string;
  ready: boolean;
};

const EXCEL_HEADERS = ['RCFE_Name', 'Bank_Routing_Number', 'Bank_Account_Number', 'TIN'];

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
      setError(String(loadError?.message || 'Could not load vendor payees'));
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      const headers = await firebaseAuthHeaders();
      const response = await fetch('/api/admin/chase-vendor-payees?download=1', {
        headers,
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(String(body?.error || 'Could not download the Excel file'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chase-rcfe-payees-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError: any) {
      setError(String(downloadError?.message || 'Could not download the Excel file'));
    } finally {
      setDownloading(false);
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (readyOnly && !vendor.ready) return false;
      if (!needle) return true;
      return `${vendor.rcfeName} ${vendor.npi} ${vendor.tin} ${vendor.bankName} ${vendor.routingNumber} ${vendor.accountNumber}`
        .toLowerCase()
        .includes(needle);
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
          The download has only these four columns, with full routing and account numbers:{' '}
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
            <Button type="button" variant="secondary" onClick={() => void download()} disabled={downloading}>
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
              placeholder="Search name, TIN, NPI, routing, or account"
              className="max-w-sm"
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RCFE_Name</TableHead>
                  <TableHead>Bank_Routing_Number</TableHead>
                  <TableHead>Bank_Account_Number</TableHead>
                  <TableHead>TIN</TableHead>
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
                    <TableRow key={`${vendor.rcfeName}-${vendor.tin}-${index}`}>
                      <TableCell className="font-medium">{vendor.rcfeName}</TableCell>
                      <TableCell className="font-mono">{vendor.routingNumber || '—'}</TableCell>
                      <TableCell className="font-mono">{vendor.accountNumber || '—'}</TableCell>
                      <TableCell className="font-mono">{vendor.tin || '—'}</TableCell>
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
