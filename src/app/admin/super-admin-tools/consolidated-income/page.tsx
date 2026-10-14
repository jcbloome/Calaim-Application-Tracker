'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert, DollarSign } from 'lucide-react';
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
  STATE_EMPLOYER_UNEMPLOYMENT,
  US_STATE_OPTIONS,
  type KaiserAuthMemberLite,
  type KaiserIncomeAssumptions,
  type UsStateCode,
} from '@/lib/kaiser-income-estimate';
import { IncomeEstimateNav } from '../income-estimate-nav';

type RevenueView = 'combined' | 'kaiser' | 'healthNet';

const REVENUE_VIEW_LABELS: Record<RevenueView, string> = {
  combined: 'Combined',
  kaiser: 'Kaiser only',
  healthNet: 'Health Net only',
};

export default function ConsolidatedIncomeEstimatePage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const [members, setMembers] = useState<KaiserAuthMemberLite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [rawMemberCount, setRawMemberCount] = useState(0);
  const [dataSource, setDataSource] = useState('');
  const [liveError, setLiveError] = useState('');
  const [censusSource, setCensusSource] = useState<'live' | 'cache'>('live');
  const [assumptions, setAssumptions] = useState<KaiserIncomeAssumptions>(() => ({
    ...DEFAULT_KAISER_INCOME_ASSUMPTIONS,
    averageAuthMonthsOverride: 0,
    fixedStaffAnnual: DEFAULT_KAISER_INCOME_ASSUMPTIONS.fixedStaffAnnual.map((row) => ({
      ...row,
    })),
    ownerAnnualPayroll: DEFAULT_KAISER_INCOME_ASSUMPTIONS.ownerAnnualPayroll.map((row) => ({
      ...row,
    })),
    monthlyBusinessCosts: DEFAULT_KAISER_INCOME_ASSUMPTIONS.monthlyBusinessCosts.map((row) => ({
      ...row,
    })),
  }));
  const autoLoadStartedRef = useRef(false);

  const loadMembers = useCallback(async (source: 'live' | 'cache' = 'live') => {
    setIsLoading(true);
    setError(null);
    setLiveError('');
    setCensusSource(source);
    try {
      const params = new URLSearchParams();
      if (source === 'cache') {
        params.set('source', 'cache');
      } else {
        params.set('source', 'live');
        params.set('fallback', 'cache');
      }
      const response = await fetch(`/api/admin/kaiser-income-estimate?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to load Kaiser census (HTTP ${response.status})`));
      }
      const nextMembers = Array.isArray(payload?.members) ? payload.members : [];
      setMembers(nextMembers);
      setRawMemberCount(Number(payload?.totalCount || nextMembers.length || 0));
      setHasLoaded(true);
      setDataSource(String(payload?.source || source));
      setLiveError(String(payload?.liveError || '').trim());
    } catch (err: any) {
      setError(String(err?.message || 'Could not load Kaiser authorization census.'));
      setHasLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin || autoLoadStartedRef.current) return;
    autoLoadStartedRef.current = true;
    void loadMembers('live');
  }, [isSuperAdmin, loadMembers]);

  const revenueView: RevenueView = 'combined';

  const estimatesByView = useMemo(
    () => ({
      combined: buildKaiserIncomeEstimate({ members, assumptions }),
      kaiser: buildKaiserIncomeEstimate({
        members,
        assumptions: { ...assumptions, healthNetYtdPaid: 0 },
      }),
      healthNet: buildKaiserIncomeEstimate({
        members: [],
        assumptions: { ...assumptions, newMembersPerMonth: 0, kaiserYtdPaid: 0 },
      }),
    }),
    [members, assumptions]
  );
  const estimate = estimatesByView[revenueView];

  const updateNumber = (key: keyof KaiserIncomeAssumptions, raw: string) => {
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
        <AlertDescription>
          Only Super Admins can access the Kaiser income estimate page.
        </AlertDescription>
      </Alert>
    );
  }

  const [monicaName, jasonName] = estimate.assumptions.ownerNames;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <IncomeEstimateNav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Consolidated Income Estimate</h1>
          <p className="text-muted-foreground">
            Kaiser + Health Net together, for combined taxes, cash balance plan, and owner pay. Kaiser census
            is Caspio authorized × ${estimate.assumptions.monthlyRatePerMember}/member/month; Health Net is YTD
            cash with payment lag and the wind-down to December.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadMembers('live')} disabled={isLoading}>
            {isLoading && censusSource === 'live' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh live Caspio
          </Button>
          <Button variant="ghost" onClick={() => void loadMembers('cache')} disabled={isLoading}>
            Use cache
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>
            {censusSource === 'live' ? 'Loading live Caspio census' : 'Loading Kaiser cache'}
          </AlertTitle>
          <AlertDescription>
            {censusSource === 'live'
              ? 'Pulling Kaiser members and authorization dates directly from Caspio. This can take a minute.'
              : 'Reading synced Firestore caspio_members_cache.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load Kaiser census</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void loadMembers('live')} disabled={isLoading}>
              Try live again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {hasLoaded && !error && liveError ? (
        <Alert>
          <AlertTitle>Live Caspio unavailable — using cache fallback</AlertTitle>
          <AlertDescription>{liveError}</AlertDescription>
        </Alert>
      ) : null}

      {hasLoaded && !error ? (
        <p className="text-xs text-muted-foreground">
          Loaded {rawMemberCount.toLocaleString()} Kaiser records
          {dataSource ? ` (${dataSource})` : ''} ·{' '}
          {estimate.currentAuthorizedCount.toLocaleString()} currently authorized in census.
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Summary: combined vs each payer</CardTitle>
              <CardDescription>
                Each column carries the full staff payroll, business costs, and cash balance, so Kaiser only
                shows what the company looks like once Health Net ends. Everything below this card is combined.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />

                {(Object.keys(REVENUE_VIEW_LABELS) as RevenueView[]).map((view) => (
                  <TableHead
                    key={view}
                    className={`text-right ${revenueView === view ? 'font-semibold text-foreground' : ''}`}
                  >
                    {REVENUE_VIEW_LABELS[view]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  [`${estimate.calendarYear.year} tax year (Jan–Dec, incl. YTD paid)`, null],
                  ['Health Net revenue', (e: typeof estimate) => e.calendarYear.healthNetTotal],
                  ['Kaiser revenue', (e: typeof estimate) => e.calendarYear.kaiserTotal],
                  ['Taxable revenue (incl. grant)', (e: typeof estimate) => e.calendarYear.revenueTotal],
                  ['Business taxable income', (e: typeof estimate) => e.calendarYear.businessTaxableIncome],
                  ['Cash balance room', (e: typeof estimate) => e.calendarYear.cashBalanceSuggested],
                  ['Estimated total taxes', (e: typeof estimate) => e.calendarYear.totalTaxesEstimated],
                  [
                    `Next 12 months (${estimate.projection[0]?.monthLabel ?? ''} – ${
                      estimate.projection[estimate.projection.length - 1]?.monthLabel ?? ''
                    }, forward only)`,
                    null,
                  ],
                  ['Revenue', (e: typeof estimate) => e.yearRevenueTotal],
                  ['Operating profit (before cash balance)', (e: typeof estimate) => e.yearOperatingProfit],
                  ['Cash balance room (age max vs profit)', (e: typeof estimate) => e.cashBalanceSuggestedAnnual],
                  ['Earnings after cash balance', (e: typeof estimate) => e.yearEarningsAfterCashBalance],
                  ['Estimated total taxes', (e: typeof estimate) => e.yearTotalTaxesEstimated],
                  ['Each owner after personal taxes', (e: typeof estimate) => e.yearPerOwnerAfterTaxEstimate],
                ] as Array<[string, ((e: typeof estimate) => number) | null]>
              ).map(([label, pick], i) =>
                pick === null ? (
                  <TableRow key={`section-${i}`} className="bg-slate-50 hover:bg-slate-50">
                    <TableCell colSpan={4} className="font-semibold text-slate-900">
                      {label}
                    </TableCell>
                  </TableRow>
                ) : (
                <TableRow key={`${i}-${label}`}>
                  <TableCell>{label}</TableCell>
                  {(Object.keys(REVENUE_VIEW_LABELS) as RevenueView[]).map((view) => (
                    <TableCell
                      key={view}
                      className={`text-right tabular-nums ${revenueView === view ? 'font-semibold' : ''}`}
                    >
                      {formatUsd(pick(estimatesByView[view]))}
                    </TableCell>
                  ))}
                </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {estimate.calendarYear.year} tax year estimate ({REVENUE_VIEW_LABELS[revenueView]})
          </CardTitle>
          <CardDescription>
            Jan 1–Dec 31: YTD cash already collected plus the rest of the year from the projection. Payroll
            stops at each person&apos;s last day worked, and the state grant counts for the months it covered.
            Last year: {formatUsd(assumptions.priorYearTaxableIncome)} taxable on{' '}
            {formatUsd(assumptions.priorYearHealthNetGross + assumptions.priorYearKaiserGross)} gross.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Revenue basis</Label>
              <div className="flex gap-2">
                {(['cash', 'accrual'] as const).map((basis) => (
                  <Button
                    key={basis}
                    type="button"
                    size="sm"
                    variant={assumptions.taxYearBasis === basis ? 'default' : 'outline'}
                    onClick={() => setAssumptions((prev) => ({ ...prev, taxYearBasis: basis }))}
                  >
                    {basis === 'cash' ? 'Cash received by Dec 31' : 'Services earned in year'}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-months">Grant months covered this year</Label>
              <Input
                id="grant-months"
                type="number"
                min={0}
                max={12}
                className="w-28"
                value={assumptions.grantMonthsCoveredThisYear}
                onChange={(e) => updateNumber('grantMonthsCoveredThisYear', e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={assumptions.grantIsTaxableIncome}
                onChange={(e) =>
                  setAssumptions((prev) => ({ ...prev, grantIsTaxableIncome: e.target.checked }))
                }
              />
              Grant counts as taxable income
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-2 text-sm">
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">Income</div>
              <div className="flex justify-between gap-4">
                <span>Health Net YTD paid</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.healthNetYtdCash)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Health Net rest of year (−{assumptions.healthNetMonthlyDeclinePct}%/mo, ends Dec)</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.healthNetRestOfYear)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Kaiser YTD paid</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.kaiserYtdCash)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Kaiser rest of year (census)</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.kaiserRestOfYear)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>
                  State grant ({assumptions.grantMonthsCoveredThisYear} mo
                  {estimate.calendarYear.grantIsTaxableIncome ? '' : ', not taxed'})
                </span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.grantFunding)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                <span>Taxable revenue</span>
                <span>{formatUsd(estimate.calendarYear.revenueTotal)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">Expenses</div>
              <div className="flex justify-between gap-4">
                <span>Staff wages (prorated by last day)</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.staffWages)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>
                  Owner base W-2 ({monicaName} + {jasonName})
                </span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.ownerWages)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Employer payroll taxes</span>
                <span className="font-medium">
                  {formatUsd(
                    estimate.calendarYear.employerFederalPayrollTax +
                      estimate.calendarYear.employerStatePayrollTax
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>401(k) employer</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.k401Employer)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>MSW + business costs</span>
                <span className="font-medium">
                  {formatUsd(estimate.calendarYear.mswCost + estimate.calendarYear.businessCost)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Cash balance plan</span>
                <span className="font-medium">{formatUsd(estimate.calendarYear.cashBalancePlan)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                <span>Business taxable income</span>
                <span>{formatUsd(estimate.calendarYear.businessTaxableIncome)}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Cash balance room this year</div>
              <div className="text-lg font-semibold">{formatUsd(estimate.calendarYear.cashBalanceSuggested)}</div>
              <div className="text-xs text-muted-foreground">Lower of age max and operating profit</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Federal taxes</div>
              <div className="text-lg font-semibold">{formatUsd(estimate.calendarYear.totalFederalTaxes)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">State taxes (incl. CA entity)</div>
              <div className="text-lg font-semibold">{formatUsd(estimate.calendarYear.totalStateTaxes)}</div>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="text-xs text-emerald-900/80">Total taxes (incl. owner FICA)</div>
              <div className="text-lg font-semibold text-emerald-950">
                {formatUsd(estimate.calendarYear.totalTaxesEstimated)}
              </div>
              <div className="text-xs text-emerald-900/80">
                Each owner after tax ≈ {formatUsd(estimate.calendarYear.perOwnerAfterTax)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Annual pay</TableHead>
                  <TableHead>Last day</TableHead>
                  <TableHead className="text-right">Wages {estimate.calendarYear.year}</TableHead>
                  <TableHead className="text-right">Grant funded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimate.calendarYear.payrollLines.map((line) => (
                  <TableRow key={`${line.isOwner ? 'owner' : 'staff'}-${line.name}`}>
                    <TableCell>
                      {line.name}
                      {line.isOwner ? ' (owner)' : ''}
                      {!line.isOwner && line.annualSalary === 0 ? (
                        <span className="ml-2 text-xs text-amber-700">enter salary</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(line.annualSalary)}</TableCell>
                    <TableCell>{line.endDate || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(line.wagesInYear)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.grantFunding ? formatUsd(line.grantFunding) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Currently authorized Kaiser</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading && !hasLoaded ? '…' : estimate.currentAuthorizedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Kaiser + CalAIM Authorized with an active auth window when dates exist.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg auth length (billable)</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading && !hasLoaded ? '…' : `${estimate.effectiveAverageAuthMonths} mo`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Typical auth {estimate.researchedAverageAuthMonths} mo −{' '}
            {estimate.assumptions.authMonthsLessThanPeriod} mo lag. Research: median{' '}
            {estimate.authDuration.medianMonths || '—'} mo · mean{' '}
            {estimate.authDuration.averageMonths || '—'} mo ·{' '}
            {estimate.authDuration.sampleSize.toLocaleString()} primary pairs.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auth endings next 12 mo</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading && !hasLoaded ? '…' : estimate.authDuration.endingInNext12Months}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Known end dates on currently authorized members. Projection also ends members without dates
            after avg auth length.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>12-mo operating profit (est.)</CardDescription>
            <CardTitle className="text-3xl">{formatUsd(estimate.yearOperatingProfit)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Kaiser + Health Net after staff, MSW, ER taxes, 401(k), business costs. Year revenue{' '}
            {formatUsd(estimate.yearRevenueTotal)}.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Health Net + combined annual revenue</CardTitle>
          <CardDescription>
            Enter YTD cash collected. Annualizes with a {assumptions.paymentLagMonths}-month payment lag so
            this month&apos;s services are not treated as collected yet. Health Net then declines{' '}
            {assumptions.healthNetMonthlyDeclinePct}% each month through month{' '}
            {assumptions.healthNetProgramEndMonth} (program end), then $0. Last year: HN{' '}
            {formatUsd(assumptions.priorYearHealthNetGross)} + Kaiser{' '}
            {formatUsd(assumptions.priorYearKaiserGross)} gross → ~
            {formatUsd(assumptions.priorYearTaxableIncome)} taxable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="hn-ytd">Health Net YTD paid ($)</Label>
              <Input
                id="hn-ytd"
                type="number"
                value={assumptions.healthNetYtdPaid}
                onChange={(e) => updateNumber('healthNetYtdPaid', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kaiser-ytd-cash">Kaiser YTD paid ($)</Label>
              <Input
                id="kaiser-ytd-cash"
                type="number"
                value={assumptions.kaiserYtdPaid}
                onChange={(e) => updateNumber('kaiserYtdPaid', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-lag">Payment lag (months)</Label>
              <Input
                id="pay-lag"
                type="number"
                step="0.5"
                min={0}
                value={assumptions.paymentLagMonths}
                onChange={(e) => updateNumber('paymentLagMonths', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ytd-through-month">YTD through month (1–12, 0 = today)</Label>
              <Input
                id="ytd-through-month"
                type="number"
                min={0}
                max={12}
                value={assumptions.revenueYtdThroughMonth}
                onChange={(e) => updateNumber('revenueYtdThroughMonth', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hn-decline">HN monthly decline %</Label>
              <Input
                id="hn-decline"
                type="number"
                min={0}
                max={100}
                value={assumptions.healthNetMonthlyDeclinePct}
                onChange={(e) => updateNumber('healthNetMonthlyDeclinePct', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hn-end-month">HN program end month (1–12)</Label>
              <Input
                id="hn-end-month"
                type="number"
                min={1}
                max={12}
                value={assumptions.healthNetProgramEndMonth}
                onChange={(e) => updateNumber('healthNetProgramEndMonth', e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="prior-hn">Prior year HN gross ($)</Label>
              <Input
                id="prior-hn"
                type="number"
                value={assumptions.priorYearHealthNetGross}
                onChange={(e) => updateNumber('priorYearHealthNetGross', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prior-kaiser">Prior year Kaiser gross ($)</Label>
              <Input
                id="prior-kaiser"
                type="number"
                value={assumptions.priorYearKaiserGross}
                onChange={(e) => updateNumber('priorYearKaiserGross', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prior-taxable">Prior year taxable income ($)</Label>
              <Input
                id="prior-taxable"
                type="number"
                value={assumptions.priorYearTaxableIncome}
                onChange={(e) => updateNumber('priorYearTaxableIncome', e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">HN service months in YTD cash</div>
              <div className="text-lg font-semibold">
                {estimate.healthNetAnnualization.serviceMonthsRepresented}
              </div>
              <div className="text-xs text-muted-foreground">
                Through month {estimate.healthNetAnnualization.ytdThroughMonth} −{' '}
                {estimate.healthNetAnnualization.paymentLagMonths} mo lag
              </div>
            </div>
            <div className="rounded-md border border-sky-200 bg-sky-50/60 p-3">
              <div className="text-xs text-sky-900/80">
                Health Net proj. ({assumptions.healthNetMonthlyDeclinePct}%/mo → mo{' '}
                {assumptions.healthNetProgramEndMonth})
              </div>
              <div className="text-lg font-semibold text-sky-950">
                {formatUsd(estimate.currentAnnualHealthNetRevenue)}
              </div>
              <div className="text-xs text-sky-900/80">
                Starts {formatUsd(estimate.currentMonthlyHealthNetRevenue)}/mo · flat-if-no-decline{' '}
                {formatUsd(estimate.healthNetFlatAnnualIfNoDecline)} · YTD{' '}
                {formatUsd(estimate.healthNetAnnualization.ytdPaid)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Kaiser cash → annual (ref.)</div>
              <div className="text-lg font-semibold">
                {formatUsd(estimate.kaiserCashAnnualization.estimatedAnnual)}
              </div>
              <div className="text-xs text-muted-foreground">
                YTD {formatUsd(estimate.kaiserCashAnnualization.ytdPaid)} · census proj.{' '}
                {formatUsd(estimate.yearKaiserRevenueTotal)}
              </div>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="text-xs text-emerald-900/80">Combined est. annual revenue</div>
              <div className="text-lg font-semibold text-emerald-950">
                {formatUsd(estimate.yearRevenueTotal)}
              </div>
              <div className="text-xs text-emerald-900/80">
                HN {formatUsd(estimate.yearHealthNetRevenueTotal)} + Kaiser census{' '}
                {formatUsd(estimate.yearKaiserRevenueTotal)}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Unpaid accrued (lag buffer) on HN ≈ {formatUsd(estimate.healthNetAnnualization.unpaidAccruedEstimate)}.
            Wind-down: each month × (1 − {assumptions.healthNetMonthlyDeclinePct}/100) through month{' '}
            {assumptions.healthNetProgramEndMonth}, then $0 (e.g. Oct → Nov −20% → Dec −20% again). Combined
            revenue feeds operating profit, cash balance, CA entity tax, and owner residual/draw below.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authorization period research</CardTitle>
          <CardDescription>
            Kaiser primary auth start/end pairs from the loaded census are used to estimate how long members
            stay paid before auth ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Pairs with both dates</div>
            <div className="text-lg font-semibold">{estimate.authDuration.withBothDates}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Start only / end only</div>
            <div className="text-lg font-semibold">
              {estimate.authDuration.withStartOnly} / {estimate.authDuration.withEndOnly}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Authorized with known end</div>
            <div className="text-lg font-semibold">
              {estimate.authDuration.currentlyAuthorizedWithKnownEnd}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Kaiser monthly (census)</div>
            <div className="text-lg font-semibold">{formatUsd(estimate.currentMonthlyKaiserRevenue)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members by auth period length</CardTitle>
          <CardDescription>
            Count of Kaiser members whose primary authorization start→end length falls in each range (
            {estimate.authDuration.sampleSize.toLocaleString()} measured periods).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {(estimate.authDuration.periodBuckets || []).map((bucket) => {
              const pct =
                estimate.authDuration.sampleSize > 0
                  ? (bucket.count / estimate.authDuration.sampleSize) * 100
                  : 0;
              return (
                <div key={bucket.key} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{bucket.label}</div>
                  <div className="text-2xl font-semibold">{bucket.count.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{pct.toFixed(1)}% of measured</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Assumptions
            </CardTitle>
            <CardDescription>Adjust rates to remodel income and owner pay.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monthly-rate">Pay per member / month</Label>
              <Input
                id="monthly-rate"
                type="number"
                value={assumptions.monthlyRatePerMember}
                onChange={(e) => updateNumber('monthlyRatePerMember', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-members">New Kaiser members / month</Label>
              <Input
                id="new-members"
                type="number"
                value={assumptions.newMembersPerMonth}
                onChange={(e) => updateNumber('newMembersPerMonth', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msw-fee">MSW reassessment fee</Label>
              <Input
                id="msw-fee"
                type="number"
                value={assumptions.mswReassessmentFee}
                onChange={(e) => updateNumber('mswReassessmentFee', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msw-months">MSW every N months</Label>
              <Input
                id="msw-months"
                type="number"
                value={assumptions.mswReassessmentMonths}
                onChange={(e) => updateNumber('mswReassessmentMonths', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-payroll-pct">Owner payroll share (%)</Label>
              <Input
                id="owner-payroll-pct"
                type="number"
                value={assumptions.ownerPayrollSharePct}
                onChange={(e) => updateNumber('ownerPayrollSharePct', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="avg-auth-override">
                Auth months override (0 = auto; use 3+ only to force a value)
              </Label>
              <Input
                id="avg-auth-override"
                type="number"
                min={0}
                value={assumptions.averageAuthMonthsOverride}
                onChange={(e) => updateNumber('averageAuthMonthsOverride', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="auth-months-less">
                Months less than each auth period (billing lag)
              </Label>
              <Input
                id="auth-months-less"
                type="number"
                min={0}
                value={assumptions.authMonthsLessThanPeriod}
                onChange={(e) => updateNumber('authMonthsLessThanPeriod', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Typical auth: {estimate.researchedAverageAuthMonths} mo −{' '}
              {assumptions.authMonthsLessThanPeriod} mo lag ={' '}
              <strong>{estimate.effectiveAverageAuthMonths} mo</strong> billable per auth
              {assumptions.averageAuthMonthsOverride >= 3
                ? ' (manual override).'
                : ` (auto from research; median ${estimate.authDuration.medianMonths || '—'}, mean ${estimate.authDuration.averageMonths || '—'}).`}{' '}
              MSW modeled at {formatUsd(estimate.mswAnnualPerMember)}/member/year. After payroll, employer
              taxes, {assumptions.k401EmployerContributionPct}% 401(k) on eligible FT staff, cash balance,
              and CA entity tax,
              residual owner pool uses {assumptions.ownerPayrollSharePct}% payroll /{' '}
              {100 - assumptions.ownerPayrollSharePct}% company draw, split evenly between {monicaName} and{' '}
              {jasonName} (on top of base W-2). Owners live in VA; business taxed in CA.
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fixed staff payroll</CardTitle>
            <CardDescription>
              Annual salaries and residence/work state (drives employer SUI). Check 401(k) for full-time
              staff with 1+ year. Business entity remains CA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 overflow-x-auto">
            <div className="grid grid-cols-[minmax(10rem,1fr)_88px_120px_140px_110px_56px_40px] items-center gap-3 text-xs text-muted-foreground">
              <span>Staff name</span>
              <span>State</span>
              <span>Annual pay</span>
              <span>Last day worked</span>
              <span>Grant $/yr</span>
              <span className="text-center">401(k)</span>
              <span />
            </div>
            {assumptions.fixedStaffAnnual.map((row, idx) => (
              <div
                key={`fixed-staff-${idx}`}
                className="grid grid-cols-[minmax(10rem,1fr)_88px_120px_140px_110px_56px_40px] items-center gap-3"
              >
                <Input
                  value={row.name}
                  aria-label={`Staff name ${idx + 1}`}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setAssumptions((prev) => {
                      const next = [...prev.fixedStaffAnnual];
                      next[idx] = { ...next[idx], name: nextName };
                      return { ...prev, fixedStaffAnnual: next };
                    });
                  }}
                />
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  aria-label={`${row.name || `Staff ${idx + 1}`} state`}
                  value={row.state || 'CA'}
                  onChange={(e) => {
                    const nextState = e.target.value as UsStateCode;
                    setAssumptions((prev) => {
                      const next = [...prev.fixedStaffAnnual];
                      next[idx] = { ...next[idx], state: nextState };
                      return { ...prev, fixedStaffAnnual: next };
                    });
                  }}
                >
                  {US_STATE_OPTIONS.map((code) => (
                    <option key={code} value={code}>
                      {code === 'CO' ? 'CO (Colombia)' : code}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  aria-label={`${row.name || `Staff ${idx + 1}`} annual pay`}
                  value={row.annualSalary}
                  onChange={(e) => {
                    const nextSalary = Number(e.target.value);
                    if (!Number.isFinite(nextSalary)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.fixedStaffAnnual];
                      next[idx] = { ...next[idx], annualSalary: Math.max(0, nextSalary) };
                      return { ...prev, fixedStaffAnnual: next };
                    });
                  }}
                />
                <Input
                  type="date"
                  aria-label={`${row.name || `Staff ${idx + 1}`} last day worked`}
                  value={row.endDate || ''}
                  onChange={(e) => {
                    const nextEnd = e.target.value;
                    setAssumptions((prev) => {
                      const next = [...prev.fixedStaffAnnual];
                      next[idx] = { ...next[idx], endDate: nextEnd || undefined };
                      return { ...prev, fixedStaffAnnual: next };
                    });
                  }}
                />
                <Input
                  type="number"
                  aria-label={`${row.name || `Staff ${idx + 1}`} grant covered per year`}
                  value={row.grantAnnualCovered || 0}
                  onChange={(e) => {
                    const nextGrant = Number(e.target.value);
                    if (!Number.isFinite(nextGrant)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.fixedStaffAnnual];
                      next[idx] = { ...next[idx], grantAnnualCovered: Math.max(0, nextGrant) };
                      return { ...prev, fixedStaffAnnual: next };
                    });
                  }}
                />
                <label className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(row.k401Eligible)}
                    aria-label={`${row.name || `Staff ${idx + 1}`} 401(k) eligible`}
                    onChange={(e) => {
                      const nextEligible = e.target.checked;
                      setAssumptions((prev) => {
                        const next = [...prev.fixedStaffAnnual];
                        next[idx] = { ...next[idx], k401Eligible: nextEligible };
                        return { ...prev, fixedStaffAnnual: next };
                      });
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  disabled={assumptions.fixedStaffAnnual.length <= 1}
                  aria-label={`Remove ${row.name || `staff ${idx + 1}`}`}
                  onClick={() =>
                    setAssumptions((prev) => ({
                      ...prev,
                      fixedStaffAnnual: prev.fixedStaffAnnual.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  ×
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAssumptions((prev) => ({
                    ...prev,
                    fixedStaffAnnual: [
                      ...prev.fixedStaffAnnual,
                      { name: 'New staff', annualSalary: 0, state: 'CA', k401Eligible: false },
                    ],
                  }))
                }
              >
                Add staff
              </Button>
              <span className="text-xs text-muted-foreground">
                {assumptions.fixedStaffAnnual.length} staff line
                {assumptions.fixedStaffAnnual.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="border-t pt-3 text-xs font-medium text-muted-foreground">Owner base W-2</div>
            <div className="grid grid-cols-[minmax(10rem,1fr)_72px_72px_140px_110px_56px] items-center gap-3 text-xs text-muted-foreground">
              <span />
              <span>Age</span>
              <span>State</span>
              <span>Annual W-2</span>
              <span>Grant $/yr</span>
              <span className="text-center">401(k)</span>
            </div>
            {assumptions.ownerAnnualPayroll.map((row, idx) => (
              <div key={row.name} className="grid grid-cols-[minmax(10rem,1fr)_72px_72px_140px_110px_56px] items-center gap-3">
                <div className="text-sm font-medium">{row.name}</div>
                <Input
                  type="number"
                  min={18}
                  max={100}
                  aria-label={`${row.name} age`}
                  placeholder="Age"
                  value={Number.isFinite(row.age) ? row.age : ''}
                  onChange={(e) => {
                    const nextAge = Number(e.target.value);
                    if (!Number.isFinite(nextAge)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.ownerAnnualPayroll];
                      next[idx] = { ...next[idx], age: Math.min(100, Math.max(0, nextAge)) };
                      return { ...prev, ownerAnnualPayroll: next };
                    });
                  }}
                />
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  aria-label={`${row.name} state`}
                  value={row.state || 'VA'}
                  onChange={(e) => {
                    const nextState = e.target.value as UsStateCode;
                    setAssumptions((prev) => {
                      const next = [...prev.ownerAnnualPayroll];
                      next[idx] = { ...next[idx], state: nextState };
                      return { ...prev, ownerAnnualPayroll: next };
                    });
                  }}
                >
                  {US_STATE_OPTIONS.map((code) => (
                    <option key={code} value={code}>
                      {code === 'CO' ? 'CO (Colombia)' : code}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  aria-label={`${row.name} annual W-2`}
                  value={row.annualSalary}
                  onChange={(e) => {
                    const nextSalary = Number(e.target.value);
                    if (!Number.isFinite(nextSalary)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.ownerAnnualPayroll];
                      next[idx] = { ...next[idx], annualSalary: nextSalary };
                      return { ...prev, ownerAnnualPayroll: next };
                    });
                  }}
                />
                <Input
                  type="number"
                  aria-label={`${row.name} grant covered per year`}
                  value={row.grantAnnualCovered || 0}
                  onChange={(e) => {
                    const nextGrant = Number(e.target.value);
                    if (!Number.isFinite(nextGrant)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.ownerAnnualPayroll];
                      next[idx] = { ...next[idx], grantAnnualCovered: Math.max(0, nextGrant) };
                      return { ...prev, ownerAnnualPayroll: next };
                    });
                  }}
                />
                <label className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(row.k401Eligible)}
                    aria-label={`${row.name} 401(k) eligible`}
                    onChange={(e) => {
                      const nextEligible = e.target.checked;
                      setAssumptions((prev) => {
                        const next = [...prev.ownerAnnualPayroll];
                        next[idx] = { ...next[idx], k401Eligible: nextEligible };
                        return { ...prev, ownerAnnualPayroll: next };
                      });
                    }}
                  />
                </label>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              States drive employer unemployment tax. Nick NY · Deydry TN · Leidy & Lilo FL · Monica, James &
              Jason VA · Alberto & John CA · Valentina Colombia (CO — no US payroll taxes in this model).
              FL/TN have no state income tax (owner personal tax still uses VA+CA for Monica/Jason). 401(k)
              eligible (FT + 1 year): James, Monica, Nick, Jason, Alberto, Deydry.
            </p>
            <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground space-y-1">
              {US_STATE_OPTIONS.filter((code) => code !== 'OTHER').map((code) => {
                const info = STATE_EMPLOYER_UNEMPLOYMENT[code];
                return (
                  <div key={code}>
                    {code} ({info.label}):{' '}
                    {info.applyUsPayrollTaxes
                      ? `UI ${info.ratePct}% on first ${formatUsd(info.wageBase)}${
                          info.ettPct ? ` + ETT ${info.ettPct}%` : ''
                        }`
                      : 'no US FICA/FUTA/SUI'}{' '}
                    — {info.notes}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="k401-pct">
                Employer 401(k) (% of eligible salaries only — FT with 1+ year)
              </Label>
              <Input
                id="k401-pct"
                type="number"
                value={assumptions.k401EmployerContributionPct}
                onChange={(e) => updateNumber('k401EmployerContributionPct', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {assumptions.k401EmployerContributionPct}% of eligible payroll{' '}
                {formatUsd(estimate.k401EligiblePayrollAnnual)} (
                {estimate.k401EligibleNames.join(', ') || 'none checked'}) ={' '}
                {formatUsd(estimate.k401EmployerAnnual)}/year (
                {formatUsd(estimate.currentMonthlyK401Cost)}/month). Not applied to John, Lilo, Leidy,
                Valentina unless you check 401(k) on their row.
              </p>
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="cash-balance-annual">Cash balance plan (annual)</Label>
              <Input
                id="cash-balance-annual"
                type="number"
                value={assumptions.cashBalancePlanAnnual}
                onChange={(e) => updateNumber('cashBalancePlanAnnual', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Employer contribution used to offset earnings (
                {formatUsd(estimate.currentMonthlyCashBalanceCost)}/month). Illustrative max for ages{' '}
                {estimate.estimatedCashBalanceMaxByOwner
                  .map((o) => `${o.name} ${o.age} ≈ ${formatUsd(o.estimatedMax)}`)
                  .join('; ')}
                ; combined ≈ {formatUsd(estimate.estimatedCashBalanceMaxAnnual)} (actuary must confirm).
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div className="flex justify-between gap-4">
                  <span>Age-based max ({monicaName} + {jasonName})</span>
                  <span className="font-medium">{formatUsd(estimate.estimatedCashBalanceMaxAnnual)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Profit available before cash balance ({REVENUE_VIEW_LABELS[revenueView]})</span>
                  <span className="font-medium">{formatUsd(estimate.cashBalanceProfitRoomAnnual)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
                  <span>Planning contribution (lower of the two)</span>
                  <span>{formatUsd(estimate.cashBalanceSuggestedAnnual)}</span>
                </div>
                <p className="text-muted-foreground">
                  Only W-2 pay counts toward the benefit; S-corp draws don&apos;t. The actuary&apos;s
                  certified number can come in under the age max.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAssumptions((prev) => ({
                    ...prev,
                    cashBalancePlanAnnual: estimate.cashBalanceSuggestedAnnual,
                  }))
                }
              >
                Use planning contribution ({formatUsd(estimate.cashBalanceSuggestedAnnual)})
              </Button>
            </div>
            <div className="border-t pt-3 text-sm font-medium">
              Total staff payroll (incl. Monica & Jason): {formatUsd(estimate.totalStaffPayrollAnnual)}
              /year ({formatUsd(estimate.currentMonthlyStaffPayrollCost)}/month)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly business costs</CardTitle>
            <CardDescription>
              Recurring operating expenses (rent, software, insurance, etc.). Edit or add lines.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3 text-xs text-muted-foreground">
              <span>Cost name</span>
              <span>$ / month</span>
              <span />
            </div>
            {assumptions.monthlyBusinessCosts.map((row, idx) => (
              <div key={`biz-cost-${idx}`} className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                <Input
                  value={row.name}
                  aria-label={`Business cost name ${idx + 1}`}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setAssumptions((prev) => {
                      const next = [...prev.monthlyBusinessCosts];
                      next[idx] = { ...next[idx], name: nextName };
                      return { ...prev, monthlyBusinessCosts: next };
                    });
                  }}
                />
                <Input
                  type="number"
                  value={row.monthlyAmount}
                  aria-label={`Business cost amount ${idx + 1}`}
                  onChange={(e) => {
                    const nextAmount = Number(e.target.value);
                    if (!Number.isFinite(nextAmount)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.monthlyBusinessCosts];
                      next[idx] = { ...next[idx], monthlyAmount: Math.max(0, nextAmount) };
                      return { ...prev, monthlyBusinessCosts: next };
                    });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  disabled={assumptions.monthlyBusinessCosts.length <= 1}
                  onClick={() =>
                    setAssumptions((prev) => ({
                      ...prev,
                      monthlyBusinessCosts: prev.monthlyBusinessCosts.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  ×
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAssumptions((prev) => ({
                    ...prev,
                    monthlyBusinessCosts: [
                      ...prev.monthlyBusinessCosts,
                      { name: 'New cost', monthlyAmount: 0 },
                    ],
                  }))
                }
              >
                Add cost line
              </Button>
              <span className="text-sm font-medium">
                Total: {formatUsd(estimate.monthlyBusinessCostTotal)}/month (
                {formatUsd(estimate.annualBusinessCostTotal)}/year)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current run-rate (no growth)</CardTitle>
            <CardDescription>
              Today&apos;s Kaiser authorized census + Health Net annualized monthly run rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Monthly Kaiser revenue (census)</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyKaiserRevenue)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>
                Monthly Health Net (this month; then −{assumptions.healthNetMonthlyDeclinePct}%/mo through
                mo {assumptions.healthNetProgramEndMonth})
              </span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyHealthNetRevenue)}</span>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <span>Monthly combined revenue</span>
              <span>{formatUsd(estimate.currentMonthlyRevenue)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Monthly MSW cost</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyMswCost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Monthly staff payroll (team)</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyFixedStaffCost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>
                Monthly staff payroll ({monicaName} & {jasonName})
              </span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyOwnerPayrollCost)}</span>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <span>Monthly staff payroll total</span>
              <span>{formatUsd(estimate.currentMonthlyStaffPayrollCost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Monthly employer payroll taxes (CA)</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyEmployerPayrollTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>
                Monthly 401(k) employer ({assumptions.k401EmployerContributionPct}% of eligible)
              </span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyK401Cost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Monthly business costs</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyBusinessCost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Monthly cash balance plan</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyCashBalanceCost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Monthly CA entity tax (S-corp style)</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyCaEntityTax)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2">
              <span>Annual Kaiser (census run-rate)</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualKaiserRevenueRunRate)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Annual Health Net (declining through program end)</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualHealthNetRevenue)}</span>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <span>Annual combined revenue</span>
              <span>{formatUsd(estimate.currentAnnualRevenueRunRate)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Annual operating profit (after payroll, ER taxes, 401k, business costs)</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualOperatingProfitRunRate)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Annual earnings after cash balance</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualEarningsAfterCashBalance)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <span>Annual earnings after CA entity tax</span>
              <span>{formatUsd(estimate.currentAnnualEarningsAfterEntityTax)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {monicaName} & {jasonName} pay (12-mo projection)
            </CardTitle>
            <CardDescription>
              Base W-2 plus residual split after cash balance and CA entity tax. Growth:{' '}
              {estimate.assumptions.newMembersPerMonth}/month from month 2. Personal tax assumes VA
              residency + CA-source income (VA credit → net state ≈ max(VA, CA)).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Each owner base W-2</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerBasePayroll)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Residual payroll pool ({assumptions.ownerPayrollSharePct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerPayrollPool)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Company draw pool ({100 - assumptions.ownerPayrollSharePct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerDrawPool)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2">
              <span>Each owner residual payroll</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerPayroll)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Each owner company draw</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerDraw)}</span>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <span>Each owner total (base + residual + draw)</span>
              <span>{formatUsd(estimate.yearPerOwnerTotal)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2">
              <span>Federal income tax ({assumptions.federalIncomeTaxPct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerFederalTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>VA tax ({assumptions.virginiaIncomeTaxPct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerVirginiaTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>CA owner tax ({assumptions.californiaOwnerIncomeTaxPct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerCaliforniaTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Net state (after VA credit for CA)</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerNetStateTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Employee FICA on W-2</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerEmployeeFica)}</span>
            </div>
            <div className="flex justify-between gap-4 text-emerald-700 font-semibold">
              <span>Each owner approx. after all personal taxes</span>
              <span>{formatUsd(estimate.yearPerOwnerAfterTaxEstimate)}</span>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Employer payroll taxes {formatUsd(estimate.yearEmployerPayrollTax)}/year; 401(k){' '}
              {formatUsd(estimate.yearK401Cost)}; business costs {formatUsd(estimate.yearBusinessCost)}; cash
              balance {formatUsd(estimate.yearCashBalanceCost)}; CA entity tax {formatUsd(estimate.yearCaEntityTax)}.
              Personal tax total per owner: {formatUsd(estimate.yearPerOwnerPersonalTaxTotal)}.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Year-end estimated federal &amp; state taxes</CardTitle>
          <CardDescription>
            Planning totals for the {estimate.assumptions.projectionMonths}-month projection from combined
            Kaiser + Health Net revenue, salaries, employer payroll taxes, CA entity tax, and owner personal
            taxes (residual after expenses and cash balance). Rates are editable in Taxes &amp; rates below.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-slate-900">Federal</div>
            <div className="flex justify-between gap-4">
              <span>Employer FICA + FUTA (on all W-2 wages)</span>
              <span className="font-medium">{formatUsd(estimate.yearEmployerFederalPayrollTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>
                Owner federal income tax ({monicaName} + {jasonName})
              </span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerFederalTaxTotal)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <span>Estimated federal taxes</span>
              <span>{formatUsd(estimate.yearTotalFederalTaxes)}</span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-slate-900">State</div>
            <div className="flex justify-between gap-4">
              <span>Employer state UI / ETT (by employee state)</span>
              <span className="font-medium">{formatUsd(estimate.yearEmployerStatePayrollTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>CA entity tax (S-corp style)</span>
              <span className="font-medium">{formatUsd(estimate.yearCaEntityTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>
                Owner net state tax ({monicaName} + {jasonName})
              </span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerStateTaxTotal)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <span>Estimated state taxes</span>
              <span>{formatUsd(estimate.yearTotalStateTaxes)}</span>
            </div>
          </div>
          <div className="space-y-2 text-sm md:col-span-2 rounded-md border bg-muted/30 p-3">
            <div className="flex justify-between gap-4">
              <span>Owner employee FICA withheld on W-2 ({monicaName} + {jasonName})</span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerEmployeeFicaTotal)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <span>Estimated total taxes for the year</span>
              <span>{formatUsd(estimate.yearTotalTaxesEstimated)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Total = federal + state + owner employee FICA. Does not include employee FICA for non-owner
              staff (withheld from their paychecks). 401(k) employer cost{' '}
              {formatUsd(estimate.yearK401Cost)} is an expense, not a tax.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taxes &amp; rates (editable)</CardTitle>
          <CardDescription>
            CA-based employer payroll taxes + CA entity tax; VA residents with federal + CA/VA personal tax
            planning rates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="fed-tax">Federal income tax planning %</Label>
            <Input
              id="fed-tax"
              type="number"
              value={assumptions.federalIncomeTaxPct}
              onChange={(e) => updateNumber('federalIncomeTaxPct', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="va-tax">Virginia income tax %</Label>
            <Input
              id="va-tax"
              type="number"
              value={assumptions.virginiaIncomeTaxPct}
              onChange={(e) => updateNumber('virginiaIncomeTaxPct', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-owner-tax">CA owner income tax %</Label>
            <Input
              id="ca-owner-tax"
              type="number"
              value={assumptions.californiaOwnerIncomeTaxPct}
              onChange={(e) => updateNumber('californiaOwnerIncomeTaxPct', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-scorp">CA S-corp tax %</Label>
            <Input
              id="ca-scorp"
              type="number"
              value={assumptions.caSCorpTaxPct}
              onChange={(e) => updateNumber('caSCorpTaxPct', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-franchise">CA franchise minimum ($)</Label>
            <Input
              id="ca-franchise"
              type="number"
              value={assumptions.caFranchiseTaxAnnual}
              onChange={(e) => updateNumber('caFranchiseTaxAnnual', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-sui">CA SUI employer % (CA employees only)</Label>
            <Input
              id="ca-sui"
              type="number"
              value={assumptions.caSuiPct}
              onChange={(e) => updateNumber('caSuiPct', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ss-base">Social Security wage base</Label>
            <Input
              id="ss-base"
              type="number"
              value={assumptions.socialSecurityWageBase}
              onChange={(e) => updateNumber('socialSecurityWageBase', e.target.value)}
            />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            Employer FICA {assumptions.employerSocialSecurityPct}% SS + {assumptions.employerMedicarePct}%
            Medicare; FUTA {assumptions.futaPct}% on first {formatUsd(assumptions.futaWageBase)}. State UI is
            per employee state (NY/TN/FL/VA/CA tables above). CA SUI/ETT overrides apply only to CA-coded
            people. Current employer payroll tax run-rate: {formatUsd(estimate.employerPayrollTaxAnnual)}
            /year ({formatUsd(estimate.currentMonthlyEmployerPayrollTax)}/mo).
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>12-month projection</CardTitle>
          <CardDescription>
            Kaiser starts from current authorized census (auth endings + new members). Health Net starts from
            YTD cash ÷ (through month − {assumptions.paymentLagMonths} mo lag), then declines{' '}
            {assumptions.healthNetMonthlyDeclinePct}% each month through month{' '}
            {assumptions.healthNetProgramEndMonth}, then $0. Combined revenue drives profit, cash balance,
            taxes, and owner pay. Endings: {estimate.yearEndingMembersTotal.toLocaleString()} · new:{' '}
            {estimate.yearNewMembersTotal.toLocaleString()}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="w-max min-w-full table-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Month</TableHead>
                <TableHead className="whitespace-nowrap text-right">Active</TableHead>
                <TableHead className="whitespace-nowrap text-right">New</TableHead>
                <TableHead className="whitespace-nowrap text-right">Ending</TableHead>
                <TableHead className="whitespace-nowrap text-right">Kaiser $</TableHead>
                <TableHead className="whitespace-nowrap text-right">HN $</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total rev</TableHead>
                <TableHead className="whitespace-nowrap text-right">MSW</TableHead>
                <TableHead className="whitespace-nowrap text-right">Staff payroll</TableHead>
                <TableHead className="whitespace-nowrap text-right">ER tax</TableHead>
                <TableHead className="whitespace-nowrap text-right">401(k)</TableHead>
                <TableHead className="whitespace-nowrap text-right">Biz cost</TableHead>
                <TableHead className="whitespace-nowrap text-right">Cash bal.</TableHead>
                <TableHead className="whitespace-nowrap text-right">CA entity</TableHead>
                <TableHead className="whitespace-nowrap text-right">Op. profit</TableHead>
                <TableHead className="whitespace-nowrap text-right">After CB</TableHead>
                <TableHead className="whitespace-nowrap text-right">Each owner total</TableHead>
                <TableHead className="whitespace-nowrap text-right">Each after tax est.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimate.projection.map((row) => (
                <TableRow key={row.monthIndex}>
                  <TableCell className="whitespace-nowrap">{row.monthLabel}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {row.activeMembers}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {row.newMembers}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {row.endingMembers}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyKaiserRevenue)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyHealthNetRevenue)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyRevenue)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyMswCost)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyStaffPayrollCost)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyEmployerPayrollTax)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyK401Cost)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyBusinessCost)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyCashBalanceCost)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyCaEntityTax)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyOperatingProfit)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyEarningsAfterCashBalance)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyPerOwnerTotal)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.monthlyPerOwnerAfterTaxEstimate)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell className="whitespace-nowrap">12-mo total</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {estimate.yearEndActiveMembers}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {estimate.yearNewMembersTotal}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {estimate.yearEndingMembersTotal}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearKaiserRevenueTotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearHealthNetRevenueTotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearRevenueTotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearMswCostTotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearStaffPayrollCost)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearEmployerPayrollTax)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearK401Cost)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearBusinessCost)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearCashBalanceCost)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearCaEntityTax)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearOperatingProfit)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearEarningsAfterCashBalance)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearPerOwnerTotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatUsd(estimate.yearPerOwnerAfterTaxEstimate)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
