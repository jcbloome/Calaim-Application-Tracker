'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, Download, Loader2, RefreshCw, Save } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  buildKaiserSdsT2038Edi,
  missingKaiserSdsClaimSettings,
  type KaiserSdsClaimRow,
} from '@/lib/kaiser-sds-t2038-claims';
import {
  DEFAULT_T2038_CLAIM_SETTINGS,
  parseDateOnly,
  type T2038AuthWindow,
  type T2038ClaimSettings,
} from '@/lib/t2038-claims';
import { DEFAULT_EDI_270_SETTINGS, type Edi270Settings } from '@/lib/x12-270';

type FilterKey = 'billable' | 'claim_due' | 'ending_soon' | 'expired' | 'missing_dates' | 'all';

const WINDOW_LABEL: Record<T2038AuthWindow, string> = {
  in_window: 'In authorization',
  ending_soon: 'Ending soon',
  not_started: 'Not started',
  expired: 'Ended',
  missing_dates: 'Missing dates',
};

function todayInputValue() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

export default function KaiserSdsClaimsPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<KaiserSdsClaimRow[]>([]);
  const [settings, setSettings] = useState<T2038ClaimSettings>(DEFAULT_T2038_CLAIM_SETTINGS);
  const [edi, setEdi] = useState<Edi270Settings>(DEFAULT_EDI_270_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('billable');
  const [serviceDate, setServiceDate] = useState(todayInputValue);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const getToken = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) throw new Error('Please sign in again.');
    return user.getIdToken();
  }, [auth?.currentUser]);

  const loadAll = useCallback(
    async (refresh = false) => {
      if (!isAdmin) return;
      setIsLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [membersRes, settingsRes] = await Promise.all([
          fetch(`/api/admin/kaiser-sds-claims/members${refresh ? '?refresh=true' : ''}`, {
            headers,
            cache: 'no-store',
          }),
          fetch('/api/admin/kaiser-sds-claims/settings', { headers, cache: 'no-store' }),
        ]);
        const members = (await membersRes.json().catch(() => ({}))) as any;
        const saved = (await settingsRes.json().catch(() => ({}))) as any;
        if (!membersRes.ok || !members?.success) {
          throw new Error(members?.error || 'Failed to load authorizations');
        }
        setRows(Array.isArray(members.rows) ? members.rows : []);
        if (saved?.success) {
          if (saved.settings) setSettings(saved.settings);
          if (saved.edi) setEdi({ ...DEFAULT_EDI_270_SETTINGS, ...saved.edi });
        }
        setLastRefreshedAt(new Date());
        setHasLoaded(true);
      } catch (err: any) {
        setError(String(err?.message || 'Could not load Kaiser SDS claims.'));
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, isAdmin]
  );

  useEffect(() => {
    if (!isAdmin || hasLoaded || isLoading) return;
    void loadAll(false);
  }, [hasLoaded, isAdmin, isLoading, loadAll]);

  const summary = useMemo(() => {
    const inWindow = rows.filter((row) => row.window === 'in_window' || row.window === 'ending_soon');
    return {
      authorized: rows.length,
      inWindow: inWindow.length,
      endingSoon: rows.filter((row) => row.window === 'ending_soon').length,
      expired: rows.filter((row) => row.window === 'expired').length,
      missingDates: rows.filter((row) => row.window === 'missing_dates').length,
      claimDue: rows.filter(
        (row) => (row.window === 'in_window' || row.window === 'ending_soon') && row.claimDue
      ).length,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === 'claim_due') {
        return (row.window === 'in_window' || row.window === 'ending_soon') && row.claimDue;
      }
      if (filter === 'billable') return row.window === 'in_window' || row.window === 'ending_soon';
      if (filter === 'all') return true;
      return row.window === filter;
    });
  }, [filter, rows]);

  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selected[row.id]),
    [selected, visibleRows]
  );

  const missing = missingKaiserSdsClaimSettings(edi, settings);
  const ediReady = !missing.some(
    (m) =>
      m.includes('Sender') ||
      m.includes('Receiver') ||
      m.includes('Kaiser payer') ||
      m.includes('Provider') ||
      m.includes('NPI')
  );

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/kaiser-sds-claims/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Save failed');
      setSettings(data.settings);
      if (data.edi) setEdi({ ...DEFAULT_EDI_270_SETTINGS, ...data.edi });
      toast({ title: 'Billing settings saved' });
    } catch (err: any) {
      toast({
        title: 'Could not save settings',
        description: String(err?.message || ''),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const download837 = async () => {
    const dos = parseDateOnly(serviceDate);
    if (!dos) {
      toast({ title: 'Choose a date of service', variant: 'destructive' });
      return;
    }
    if (missing.length) {
      toast({
        title: 'Complete settings first',
        description: missing.join(', '),
        variant: 'destructive',
      });
      return;
    }
    const source = selectedRows.length
      ? selectedRows
      : visibleRows.filter((row) => row.window === 'in_window' || row.window === 'ending_soon');
    const built = buildKaiserSdsT2038Edi(source, edi, settings, dos);
    if (!built.included || !built.edi) {
      toast({
        title: 'No claims in the file',
        description: built.skipped[0]?.reason || 'Check authorization dates, MRNs, and billing settings.',
        variant: 'destructive',
      });
      return;
    }
    const fileName = `Kaiser-T2038-837P-${serviceDate.replace(/-/g, '')}-${built.included}.edi`;
    const blob = new Blob([built.edi], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: '837P downloaded',
      description: `${built.included} claim${built.included === 1 ? '' : 's'}${
        built.skipped.length ? `, ${built.skipped.length} skipped` : ''
      }. Upload this file in the Smart Data Solutions claims portal.`,
    });

    setIsLogging(true);
    try {
      const token = await getToken();
      await fetch('/api/admin/kaiser-sds-claims/runs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberCount: built.included,
          skippedCount: built.skipped.length,
          serviceDate,
          fileName,
          clientIds: built.claims.map((c) => c.patientControlNumber),
        }),
      });
    } catch {
      // Audit log is best-effort.
    } finally {
      setIsLogging(false);
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking access
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>Sign in as an admin to build Kaiser SDS claim batches.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kaiser SDS claims (837P)</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Authorized Kaiser members with open T2038 authorizations. Download an X12 837P EDI file and
            upload it in the Smart Data Solutions claims portal (procedure T2038). Subscriber ID is the
            Kaiser MRN; payer ID is North/South from SDS eligibility settings.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadAll(true)} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh from Caspio
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load members</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Authorized in date</CardDescription>
            <CardTitle>{summary.inWindow}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Kaiser T2038 only</CardContent>
        </Card>
        <Card className={summary.endingSoon ? 'border-amber-400' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Ending soon
            </CardDescription>
            <CardTitle>{summary.endingSoon}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Within {settings.warningDays} days of the authorization end date
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Claim due (30+ days)</CardDescription>
            <CardTitle>{summary.claimDue}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Based on last T2038 submit in Caspio</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ended / missing dates</CardDescription>
            <CardTitle>{summary.expired + summary.missingDates}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Ended {summary.expired} · Missing dates {summary.missingDates}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Smart Data Solutions EDI envelope</CardTitle>
          <CardDescription>
            Uses the same sender/receiver and Kaiser North/South payer IDs as the Batch Eligibility 270.
            {edi.senderId
              ? ` Sender ${edi.senderId} → receiver ${edi.receiverId} · NPI ${edi.providerNpi || '—'} · ${
                  edi.usage === 'P' ? 'production' : 'test'
                }.`
              : ' Not configured yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ediReady ? (
            <p className="text-muted-foreground">
              Envelope looks ready. Change IDs on the{' '}
              <Link href="/admin/tools/batch-eligibility-checker" className="underline">
                Batch Eligibility Checker
              </Link>{' '}
              (Kaiser SDS settings).
            </p>
          ) : (
            <Alert>
              <AlertTitle>EDI settings incomplete</AlertTitle>
              <AlertDescription>
                Fill sender/receiver ID, Kaiser payer ID(s), provider name, and NPI on the{' '}
                <Link href="/admin/tools/batch-eligibility-checker" className="underline">
                  Batch Eligibility Checker
                </Link>
                , then refresh this page.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. T2038 billing defaults</CardTitle>
          <CardDescription>
            Shared with the Claim.MD T2038 tool (Firestore). Kaiser defaults: diagnosis R69, CPT T2038,
            modifier U4, POS 13 (Assisted Living), ILS payer 81397, charge $432.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {(
            [
              ['billName', 'Billing name'],
              ['billNpi', 'Billing NPI'],
              ['billTaxId', 'Tax ID (9 digits)'],
              ['kaiserPayerId', 'Kaiser ILS payer ID'],
              ['charge', 'T2038 charge'],
              ['diag1', 'Diagnosis (R69)'],
              ['mod1', 'Modifier (Mod1)'],
              ['billAddress', 'Billing address'],
              ['billCity', 'City'],
              ['billState', 'State'],
              ['billZip', 'ZIP'],
              ['billTaxonomy', 'Taxonomy'],
              ['placeOfService', 'Place of service (13 = ALF)'],
              ['units', 'Units'],
              ['warningDays', 'Warn within (days)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`sds-${key}`}>{label}</Label>
              <Input
                id={`sds-${key}`}
                value={String(settings[key] ?? '')}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [key]: key === 'warningDays' ? Number(event.target.value) : event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => void saveSettings()} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save billing defaults
            </Button>
            {missing.length ? (
              <p className="text-sm text-amber-700">Still needed: {missing.join(', ')}.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Ready to build an 837P file.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>3. Download 837P for {serviceDate}</CardTitle>
            <CardDescription>
              One professional claim per selected (or all billable) member whose T2038 authorization
              covers this date of service. Upload the downloaded file in the Smart Data Solutions claims
              portal.
              {lastRefreshedAt ? ` Loaded ${format(lastRefreshedAt, 'M/d/yyyy h:mm a')}.` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="sds-dos">Date of service</Label>
              <Input
                id="sds-dos"
                type="date"
                value={serviceDate}
                onChange={(event) => setServiceDate(event.target.value)}
              />
            </div>
            <Button onClick={() => void download837()} disabled={!rows.length || isLogging || missing.length > 0}>
              {isLogging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download 837P EDI
              {selectedRows.length ? ` (${selectedRows.length})` : ''}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['billable', `In date (${summary.inWindow})`],
                ['claim_due', `Claim due 30+ days (${summary.claimDue})`],
                ['ending_soon', `Ending soon (${summary.endingSoon})`],
                ['expired', `Ended (${summary.expired})`],
                ['missing_dates', `Missing dates (${summary.missingDates})`],
                ['all', `All authorized (${summary.authorized})`],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? 'default' : 'outline'}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select visible members"
                      checked={visibleRows.length > 0 && visibleRows.every((row) => selected[row.id])}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setSelected((current) => {
                          const next = { ...current };
                          visibleRows.forEach((row) => {
                            next[row.id] = on;
                          });
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Last claim</TableHead>
                  <TableHead>MRN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      {isLoading ? 'Loading authorizations…' : 'No members in this view.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
                    <TableRow key={row.id} className={cn(row.window === 'ending_soon' && 'bg-amber-50')}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.memberName}`}
                          checked={Boolean(selected[row.id])}
                          onChange={(event) =>
                            setSelected((current) => ({ ...current, [row.id]: event.target.checked }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.memberName || 'Unnamed'}</div>
                        <div className="text-xs text-muted-foreground">{row.clientId2}</div>
                      </TableCell>
                      <TableCell className="text-xs">{row.region || '—'}</TableCell>
                      <TableCell>
                        <div>{row.authorizationNumber || 'No auth number'}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.authorizationStart || '—'} – {row.authorizationEnd || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.window === 'ending_soon' || row.window === 'expired'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {WINDOW_LABEL[row.window]}
                          {row.daysUntilEnd != null &&
                          (row.window === 'in_window' || row.window === 'ending_soon')
                            ? ` · ${row.daysUntilEnd}d`
                            : ''}
                        </Badge>
                        {row.batchBlockers.length ? (
                          <div className="mt-1 text-xs text-amber-800">{row.batchBlockers[0]}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {settings.diag1 || 'R69'}
                      </TableCell>
                      <TableCell>
                        <div>{row.lastClaimDate || 'No claim on file'}</div>
                        {row.claimDue ? (
                          <div className="text-xs font-medium text-amber-800">
                            {row.daysSinceLastClaim == null
                              ? 'Due — no T2038 claim yet'
                              : `Due — ${row.daysSinceLastClaim} days since last claim`}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {row.daysSinceLastClaim} days ago
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.memberId || '—'}</TableCell>
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
