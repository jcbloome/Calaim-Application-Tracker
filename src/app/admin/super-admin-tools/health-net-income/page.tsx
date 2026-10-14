'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  buildKaiserIncomeEstimate,
  DEFAULT_KAISER_INCOME_ASSUMPTIONS,
  formatUsd,
  isCurrentlyAuthorizedHealthNetMember,
  type KaiserAuthMemberLite,
  type KaiserIncomeAssumptions,
} from '@/lib/kaiser-income-estimate';
import { IncomeEstimateNav } from '../income-estimate-nav';

type HealthNetInputKey =
  | 'healthNetYtdPaid'
  | 'revenueYtdThroughMonth'
  | 'paymentLagMonths'
  | 'healthNetMonthlyDeclinePct'
  | 'healthNetProgramEndMonth'
  | 'priorYearHealthNetGross';

const INPUTS: Array<{ key: HealthNetInputKey; label: string; step?: number; hint?: string }> = [
  { key: 'healthNetYtdPaid', label: 'Health Net paid so far this year ($)', step: 1000 },
  { key: 'revenueYtdThroughMonth', label: 'Paid-so-far is through month (1–12)', hint: '0 = this month' },
  { key: 'paymentLagMonths', label: 'Payment lag (months)', step: 0.5 },
  { key: 'healthNetMonthlyDeclinePct', label: 'Monthly decline (%)' },
  { key: 'healthNetProgramEndMonth', label: 'Program ends (month 1–12)', hint: '12 = December' },
  { key: 'priorYearHealthNetGross', label: 'Last year Health Net gross ($)', step: 1000 },
];

export default function HealthNetIncomePage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const [assumptions, setAssumptions] = useState<KaiserIncomeAssumptions>(() => ({
    ...DEFAULT_KAISER_INCOME_ASSUMPTIONS,
  }));
  const [members, setMembers] = useState<KaiserAuthMemberLite[]>([]);
  const [censusLoading, setCensusLoading] = useState(false);
  const [censusError, setCensusError] = useState('');
  const [censusSource, setCensusSource] = useState('');
  const [censusLiveError, setCensusLiveError] = useState('');
  const autoLoadStartedRef = useRef(false);

  const loadCensus = useCallback(async (source: 'live' | 'cache') => {
    setCensusLoading(true);
    setCensusError('');
    setCensusLiveError('');
    try {
      const params = new URLSearchParams({ plan: 'healthnet', source });
      if (source === 'live') params.set('fallback', 'cache');
      const response = await fetch(`/api/admin/kaiser-income-estimate?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to load Health Net census (HTTP ${response.status})`));
      }
      setMembers(Array.isArray(payload?.members) ? payload.members : []);
      setCensusSource(String(payload?.source || source));
      setCensusLiveError(String(payload?.liveError || '').trim());
    } catch (err: any) {
      setCensusError(String(err?.message || 'Could not load Health Net members.'));
    } finally {
      setCensusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin || autoLoadStartedRef.current) return;
    autoLoadStartedRef.current = true;
    void loadCensus('live');
  }, [isSuperAdmin, loadCensus]);

  const authorizedCount = useMemo(
    () => members.filter((member) => isCurrentlyAuthorizedHealthNetMember(member)).length,
    [members]
  );
  const authorizedStatusCount = useMemo(
    () =>
      members.filter((member) => {
        const status = String(member.memberStatus || member.calaimStatus || '').toLowerCase();
        return status.includes('authorized') && !status.includes('ended');
      }).length,
    [members]
  );

  const { cash, accrual } = useMemo(() => {
    const healthNetOnly: KaiserIncomeAssumptions = {
      ...assumptions,
      kaiserYtdPaid: 0,
      newMembersPerMonth: 0,
    };
    return {
      cash: buildKaiserIncomeEstimate({
        members: [],
        assumptions: { ...healthNetOnly, taxYearBasis: 'cash' },
      }),
      accrual: buildKaiserIncomeEstimate({
        members: [],
        assumptions: { ...healthNetOnly, taxYearBasis: 'accrual' },
      }),
    };
  }, [assumptions]);

  const updateNumber = (key: HealthNetInputKey, raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setAssumptions((prev) => ({ ...prev, [key]: next }));
  };

  if (isAdminLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>Only Super Admins can access the Health Net income page.</AlertDescription>
      </Alert>
    );
  }

  const annualization = cash.healthNetAnnualization;
  const year = cash.calendarYear.year;
  const remainingMonths = cash.projection.filter((row) => row.monthlyHealthNetRevenue > 0);
  const cashTotal = cash.calendarYear.healthNetTotal;
  const accrualTotal = accrual.calendarYear.healthNetTotal;
  const paidNextYear = Math.max(0, accrualTotal - cashTotal);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <IncomeEstimateNav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Health Net Income</h1>
          <p className="text-muted-foreground">
            What Health Net has paid this year, what is still coming before the program ends, and the {year}{' '}
            total. Payroll, costs, and taxes are on the Consolidated page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadCensus('live')} disabled={censusLoading}>
            {censusLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh live Caspio
          </Button>
          <Button variant="ghost" onClick={() => void loadCensus('cache')} disabled={censusLoading}>
            Use cache
          </Button>
        </div>
      </div>

      {censusError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load Health Net members</AlertTitle>
          <AlertDescription>{censusError}</AlertDescription>
        </Alert>
      ) : null}
      {censusLiveError ? (
        <Alert>
          <AlertTitle>Live Caspio unavailable — using cache</AlertTitle>
          <AlertDescription>{censusLiveError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Currently authorized Health Net members</CardDescription>
          <CardTitle className="text-3xl">
            {censusLoading && !members.length ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              authorizedCount.toLocaleString()
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {members.length
            ? `${members.length.toLocaleString()} Health Net records in Caspio${
                censusSource ? ` (${censusSource})` : ''
              }; counted when status is Authorized and the T2038 auth window covers today. ${authorizedStatusCount.toLocaleString()} have status Authorized regardless of auth dates.`
            : censusLoading
              ? 'Pulling Health Net members from Caspio. This can take a minute.'
              : 'No Health Net census loaded.'}
          {authorizedCount > 0 ? (
            <>
              {' '}
              Current run rate ≈ {formatUsd(annualization.impliedMonthlyRunRate / authorizedCount)} per authorized
              member per month.
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>
            Changes here only affect this page. The Consolidated page has the same inputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INPUTS.map((input) => (
            <div key={input.key} className="space-y-2">
              <Label htmlFor={`hn-${input.key}`}>{input.label}</Label>
              <Input
                id={`hn-${input.key}`}
                type="number"
                step={input.step ?? 1}
                value={assumptions[input.key]}
                onChange={(e) => updateNumber(input.key, e.target.value)}
              />
              {input.hint ? <p className="text-xs text-muted-foreground">{input.hint}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid so far in {year}</CardDescription>
            <CardTitle className="text-2xl">{formatUsd(annualization.ytdPaid)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Covers about {annualization.serviceMonthsRepresented} months of service (through month{' '}
            {annualization.ytdThroughMonth}, minus {annualization.paymentLagMonths} month lag)
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly run rate</CardDescription>
            <CardTitle className="text-2xl">{formatUsd(annualization.impliedMonthlyRunRate)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Paid so far ÷ service months; the starting point for the decline
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-900/80">{year} total (cash by Dec 31)</CardDescription>
            <CardTitle className="text-2xl text-emerald-950">{formatUsd(cashTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-emerald-900/80">
            {formatUsd(annualization.ytdPaid)} paid + {formatUsd(cash.calendarYear.healthNetRestOfYear)} still
            to arrive this year
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{year} services earned (accrual)</CardDescription>
            <CardTitle className="text-2xl">{formatUsd(accrualTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatUsd(paidNextYear)} of this is paid in {year + 1} because of the lag
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Remaining months until the program ends</CardTitle>
          <CardDescription>
            Run rate declining {assumptions.healthNetMonthlyDeclinePct}% each month; $0 after the program ends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service month</TableHead>
                <TableHead className="text-right">Health Net revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remainingMonths.map((row) => (
                <TableRow key={row.monthIndex}>
                  <TableCell>{row.monthLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsd(row.monthlyHealthNetRevenue)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total remaining services</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsd(cash.yearHealthNetRevenueTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compared with last year</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span>Last year Health Net gross</span>
            <span className="font-medium">{formatUsd(assumptions.priorYearHealthNetGross)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>{year} Health Net (cash by Dec 31)</span>
            <span className="font-medium">{formatUsd(cashTotal)}</span>
          </div>
          <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
            <span>Increase</span>
            <span>{formatUsd(cashTotal - assumptions.priorYearHealthNetGross)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
