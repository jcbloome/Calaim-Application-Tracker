'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Download, Loader2, RefreshCw, Upload } from 'lucide-react';
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
  buildT2038ClaimMdCsv,
  buildT2038TrackerWorkbook,
  DEFAULT_T2038_CLAIM_SETTINGS,
  missingBillingSettings,
  parseDateOnly,
  type T2038AuthWindow,
  type T2038ClaimMemberRow,
  type T2038ClaimSettings,
} from '@/lib/t2038-claims';

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

export default function T2038ClaimsPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<T2038ClaimMemberRow[]>([]);
  const [settings, setSettings] = useState<T2038ClaimSettings>(DEFAULT_T2038_CLAIM_SETTINGS);
  const [claimMdConfigured, setClaimMdConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('billable');
  const [planFilter, setPlanFilter] = useState<'all' | 'Health Net' | 'Kaiser'>('all');
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
          fetch(`/api/admin/t2038-claims/members${refresh ? '?refresh=true' : ''}`, {
            headers,
            cache: 'no-store',
          }),
          fetch('/api/admin/t2038-claims/settings', { headers, cache: 'no-store' }),
        ]);
        const members = (await membersRes.json().catch(() => ({}))) as any;
        const saved = (await settingsRes.json().catch(() => ({}))) as any;
        if (!membersRes.ok || !members?.success) {
          throw new Error(members?.error || 'Failed to load authorizations');
        }
        setRows(Array.isArray(members.rows) ? members.rows : []);
        setClaimMdConfigured(Boolean(members.claimMdConfigured || saved.claimMdConfigured));
        if (saved?.success && saved.settings) setSettings(saved.settings);
        setLastRefreshedAt(new Date());
        setHasLoaded(true);
      } catch (err: any) {
        setError(String(err?.message || 'Could not load T2038 claims.'));
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
      healthNet: rows.filter((row) => row.plan === 'Health Net').length,
      kaiser: rows.filter((row) => row.plan === 'Kaiser').length,
      inWindow: inWindow.length,
      healthNetInWindow: inWindow.filter((row) => row.plan === 'Health Net').length,
      kaiserInWindow: inWindow.filter((row) => row.plan === 'Kaiser').length,
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
      if (planFilter !== 'all' && row.plan !== planFilter) return false;
      if (filter === 'claim_due') {
        return (row.window === 'in_window' || row.window === 'ending_soon') && row.claimDue;
      }
      if (filter === 'billable') return row.window === 'in_window' || row.window === 'ending_soon';
      if (filter === 'all') return true;
      return row.window === filter;
    });
  }, [filter, planFilter, rows]);

  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selected[row.id]),
    [selected, visibleRows]
  );

  const billingMissing = missingBillingSettings(
    settings,
    planFilter === 'all' ? ['Health Net', 'Kaiser'] : [planFilter]
  );

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/t2038-claims/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Save failed');
      setSettings(data.settings);
      toast({ title: 'Claim settings saved' });
      await loadAll(false);
    } catch (err: any) {
      toast({ title: 'Could not save settings', description: String(err?.message || ''), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const downloadCsv = () => {
    const dos = parseDateOnly(serviceDate);
    if (!dos) {
      toast({ title: 'Choose a date of service', variant: 'destructive' });
      return;
    }
    const source = selectedRows.length ? selectedRows : visibleRows.filter((row) => row.window === 'in_window' || row.window === 'ending_soon');
    const built = buildT2038ClaimMdCsv(source, settings, dos);
    if (!built.included) {
      toast({
        title: 'No claims in the file',
        description: built.skipped[0]?.reason || 'Check authorization dates, member IDs, and billing settings.',
        variant: 'destructive',
      });
      return;
    }
    const blob = new Blob([built.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Connections-T2038-${serviceDate.replace(/-/g, '')}-${built.included}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Claim.MD CSV downloaded',
      description: `${built.included} claim${built.included === 1 ? '' : 's'}${built.skipped.length ? `, ${built.skipped.length} skipped` : ''}.`,
    });
  };

  const downloadTracker = () => {
    const bytes = buildT2038TrackerWorkbook(rows);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `T2038 authorization tracker ${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadBatch = async () => {
    const source = selectedRows.length ? selectedRows : [];
    if (!source.length) {
      toast({ title: 'Select members to upload', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`Upload ${source.length} selected member${source.length === 1 ? '' : 's'} to Claim.MD for date of service ${serviceDate}?`)) {
      return;
    }
    setIsUploading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/t2038-claims/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: source, settings, serviceDate }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Upload failed');
      }
      toast({
        title: 'Claim.MD batch uploaded',
        description: `${data.included} claim${data.included === 1 ? '' : 's'} in ${data.filename}.`,
      });
    } catch (err: any) {
      toast({ title: 'Claim.MD upload failed', description: String(err?.message || ''), variant: 'destructive' });
    } finally {
      setIsUploading(false);
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
    return <Alert><AlertTitle>Admin only</AlertTitle><AlertDescription>Sign in as an admin to use T2038 claims.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">T2038 claims</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Authorized Health Net and Kaiser members, counted only while today falls inside the T2038
            authorization dates. Ending dates inside {settings.warningDays} days are flagged. Batch files
            use Claim.MD&apos;s professional CSV (one row per claim, procedure T2038).
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
          <CardHeader className="pb-2"><CardDescription>Authorized in date</CardDescription><CardTitle>{summary.inWindow}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Health Net {summary.healthNetInWindow} · Kaiser {summary.kaiserInWindow}</CardContent>
        </Card>
        <Card className={summary.endingSoon ? 'border-amber-400' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Ending soon</CardDescription>
            <CardTitle>{summary.endingSoon}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Within {settings.warningDays} days of the authorization end date</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Authorized (all dates)</CardDescription><CardTitle>{summary.authorized}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Health Net {summary.healthNet} · Kaiser {summary.kaiser}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Ended / missing dates</CardDescription><CardTitle>{summary.expired + summary.missingDates}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Ended {summary.expired} · Missing dates {summary.missingDates}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claim.MD billing profile</CardTitle>
          <CardDescription>
            Saved in Firestore. The account key stays in server env <code>CLAIMMD_ACCOUNT_KEY</code>
            {claimMdConfigured ? ' and is configured.' : ' and is not set on this server yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {(
            [
              ['billName', 'Billing name'],
              ['billNpi', 'Billing NPI'],
              ['billTaxId', 'Tax ID (9 digits)'],
              ['healthNetPayerId', 'Health Net payer ID'],
              ['healthNetPayerName', 'Health Net payer name'],
              ['kaiserPayerId', 'Kaiser payer ID'],
              ['kaiserPayerName', 'Kaiser payer name'],
              ['charge', 'T2038 charge'],
              ['diag1', 'Kaiser diagnosis fallback'],
              ['billAddress', 'Billing / facility address'],
              ['billCity', 'City'],
              ['billState', 'State'],
              ['billZip', 'ZIP'],
              ['billTaxonomy', 'Taxonomy'],
              ['placeOfService', 'Place of service'],
              ['units', 'Units'],
              ['warningDays', 'Warn within (days)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
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
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save billing profile
            </Button>
            <p className="w-full text-sm text-muted-foreground">
              Health Net diagnosis always comes from Caspio Diagnostic_ICD_Code_1. Patient account number is Client_ID2.
              Facility and billing provider default to Connections Care Home Consultants, 1763 East Sandalwood Drive, Palm Springs, CA 92262, taxonomy 251B00000X.
            </p>
            {billingMissing.length ? (
              <p className="text-sm text-amber-700">Still needed before upload: {billingMissing.join(', ')}.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Billing profile is complete for a Claim.MD CSV.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Batch for {serviceDate}</CardTitle>
            <CardDescription>
              One professional claim per member whose authorization covers this date of service. Prior auth is the T2038 number.
              {lastRefreshedAt ? ` Loaded ${format(lastRefreshedAt, 'M/d/yyyy h:mm a')}.` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="dos">Date of service</Label>
              <Input id="dos" type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
            </div>
            <Button variant="outline" onClick={downloadTracker} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" /> Tracker Excel
            </Button>
            <Button variant="outline" onClick={downloadCsv} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" /> Claim.MD CSV
            </Button>
            <Button onClick={() => void uploadBatch()} disabled={isUploading || !selectedRows.length}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload selected
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
              <Button key={key} size="sm" variant={filter === key ? 'default' : 'outline'} onClick={() => setFilter(key)}>
                {label}
              </Button>
            ))}
            {(['all', 'Health Net', 'Kaiser'] as const).map((plan) => (
              <Button key={plan} size="sm" variant={planFilter === plan ? 'secondary' : 'ghost'} onClick={() => setPlanFilter(plan)}>
                {plan === 'all' ? 'Both plans' : plan}
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
                  <TableHead>Plan</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Last claim</TableHead>
                  <TableHead>Member ID</TableHead>
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
                      <TableCell>{row.plan}</TableCell>
                      <TableCell>
                        <div>{row.authorizationNumber || 'No auth number'}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.authorizationStart || '—'} – {row.authorizationEnd || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.window === 'ending_soon' || row.window === 'expired' ? 'destructive' : 'secondary'}>
                          {WINDOW_LABEL[row.window]}
                          {row.daysUntilEnd != null && (row.window === 'in_window' || row.window === 'ending_soon')
                            ? ` · ${row.daysUntilEnd}d`
                            : ''}
                        </Badge>
                        {row.batchBlockers.length ? (
                          <div className="mt-1 text-xs text-amber-800">{row.batchBlockers[0]}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.diagnosisCode || '—'}</TableCell>
                      <TableCell>
                        <div>{row.lastClaimDate || 'No claim on file'}</div>
                        {row.claimDue ? (
                          <div className="text-xs font-medium text-amber-800">
                            {row.daysSinceLastClaim == null
                              ? 'Due — no T2038 claim yet'
                              : `Due — ${row.daysSinceLastClaim} days since last claim`}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">{row.daysSinceLastClaim} days ago</div>
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
