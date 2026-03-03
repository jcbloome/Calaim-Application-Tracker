'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileUp, Download, FileText } from 'lucide-react';

type EraRow = {
  payer?: string;
  remittance_date?: string | null;
  page?: number;
  member_name?: string;
  hic?: string | null;
  medi_cal_number?: string | null;
  acnt?: string | null;
  icn?: string | null;
  proc?: string;
  service_from?: string | null;
  service_to?: string | null;
  billed?: number | null;
  allowed?: number | null;
  paid?: number | null;
  source_line?: string;
};

type EraSummary = {
  total_rows?: number;
  t2038?: { rows?: number; members?: number; total_paid?: number };
  h2022?: { rows?: number; members?: number; total_paid?: number };
};

const toCsv = (rows: EraRow[]) => {
  const header = [
    'payer',
    'remittance_date',
    'page',
    'member_name',
    'hic',
    'medi_cal_number',
    'acnt',
    'icn',
    'proc',
    'service_from',
    'service_to',
    'billed',
    'allowed',
    'paid',
  ];
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map((k) => esc((r as any)[k])).join(','));
  }
  return lines.join('\n');
};

export default function EraParserPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading } = useAdmin();
  const auth = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [rows, setRows] = useState<EraRow[]>([]);
  const [summary, setSummary] = useState<EraSummary | null>(null);
  const [payer, setPayer] = useState<string>('Health Net');

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) router.replace('/admin');
  }, [isLoading, isSuperAdmin, router]);

  const parsedAtLabel = useMemo(() => new Date().toLocaleString(), []);

  const downloadCsv = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `era_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParse = async () => {
    if (!file) return;
    if (!auth?.currentUser) return;
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setRows([]);
    setSummary(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/admin/era/parse', {
        method: 'POST',
        headers: { authorization: `Bearer ${idToken}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        const msg = String(data?.error || `Failed (HTTP ${res.status})`);
        const details = data?.details ? JSON.stringify(data.details, null, 2) : '';
        setErrorDetails(details || null);
        throw new Error(msg);
      }
      setPayer(String(data?.payer || 'Health Net'));
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary((data?.summary || null) as any);
    } catch (e: any) {
      setError(e?.message || 'Failed to parse ERA PDF.');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            ERA Parser (Health Net)
          </CardTitle>
          <CardDescription>
            Upload a Health Net “Remittance Advice” PDF and extract H2022/T2038 lines for Caspio export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Parse failed</AlertTitle>
              <AlertDescription className="space-y-2">
                <div>{error}</div>
                {errorDetails ? (
                  <pre className="max-h-40 overflow-auto rounded-md bg-white/60 p-2 text-xs whitespace-pre-wrap">
                    {errorDetails}
                  </pre>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">ERA PDF</div>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="text-xs text-muted-foreground">
                Best results when the PDF has selectable text (not a scanned image).
              </div>
            </div>
            <Button onClick={handleParse} disabled={!file || uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Parse ERA
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Parsed {payer} ERA at {parsedAtLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">T2038 total paid</div>
              <div className="text-2xl font-semibold">${Number(summary?.t2038?.total_paid || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.t2038?.members || 0} members • {summary?.t2038?.rows || 0} rows
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">H2022 total paid</div>
              <div className="text-2xl font-semibold">${Number(summary?.h2022?.total_paid || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.h2022?.members || 0} members • {summary?.h2022?.rows || 0} rows
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total extracted rows</div>
              <div className="text-2xl font-semibold">{summary?.total_rows || rows.length}</div>
              <div className="text-xs text-muted-foreground">H2022 + T2038 only</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Extracted lines</CardTitle>
              <CardDescription>
                Showing {Math.min(rows.length, 200)} of {rows.length}. Download CSV for full export.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={downloadCsv}>
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 whitespace-nowrap">Member</th>
                    <th className="px-3 py-2 whitespace-nowrap">ACNT</th>
                    <th className="px-3 py-2 whitespace-nowrap">HIC</th>
                    <th className="px-3 py-2 whitespace-nowrap">PROC</th>
                    <th className="px-3 py-2 whitespace-nowrap">Svc from</th>
                    <th className="px-3 py-2 whitespace-nowrap">Svc to</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, idx) => (
                    <tr key={`${idx}-${r.member_name}-${r.proc}`} className="border-t">
                      <td className="px-3 py-2 max-w-[360px] truncate">{r.member_name || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.acnt || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.hic || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{r.proc || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.service_from || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.service_to || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        {r.paid === null || r.paid === undefined ? '—' : `$${Number(r.paid).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

