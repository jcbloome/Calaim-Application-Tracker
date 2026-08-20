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
  type KaiserAuthMemberLite,
  type KaiserIncomeAssumptions,
} from '@/lib/kaiser-income-estimate';

export default function KaiserIncomeEstimatePage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const [members, setMembers] = useState<KaiserAuthMemberLite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [rawMemberCount, setRawMemberCount] = useState(0);
  const [dataSource, setDataSource] = useState('');
  const [liveError, setLiveError] = useState('');
  const [censusSource, setCensusSource] = useState<'live' | 'cache'>('live');
  const [assumptions, setAssumptions] = useState<KaiserIncomeAssumptions>({
    ...DEFAULT_KAISER_INCOME_ASSUMPTIONS,
    averageAuthMonthsOverride: 0,
  });
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

  const estimate = useMemo(
    () =>
      buildKaiserIncomeEstimate({
        members,
        assumptions,
      }),
    [members, assumptions]
  );

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Kaiser Income Estimate</h1>
          <p className="text-muted-foreground">
            Live Caspio authorized Kaiser members × ${estimate.assumptions.monthlyRatePerMember}
            /member/month, with staff costs, MSW reassessments, auth endings, and owner payroll vs company
            draw.
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
            After staff + MSW, with auth endings removed from paid census. Year-end members:{' '}
            {estimate.yearEndActiveMembers.toLocaleString()}.
          </CardContent>
        </Card>
      </div>

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
            <div className="text-xs text-muted-foreground">Current monthly revenue</div>
            <div className="text-lg font-semibold">{formatUsd(estimate.currentMonthlyRevenue)}</div>
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
            <div className="space-y-2">
              <Label htmlFor="tax-rate">Effective tax on payroll (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                value={assumptions.effectiveTaxRatePct}
                onChange={(e) => updateNumber('effectiveTaxRatePct', e.target.value)}
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
              MSW modeled at {formatUsd(estimate.mswAnnualPerMember)}/member/year. Owner pool uses{' '}
              {assumptions.ownerPayrollSharePct}% payroll / {100 - assumptions.ownerPayrollSharePct}% company
              draw, split evenly between {monicaName} and {jasonName}.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fixed staff payroll</CardTitle>
            <CardDescription>Annual salaries used in the model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assumptions.fixedStaffAnnual.map((row, idx) => (
              <div key={row.name} className="grid grid-cols-[1fr_140px] items-center gap-3">
                <div className="text-sm font-medium">{row.name}</div>
                <Input
                  type="number"
                  value={row.annualSalary}
                  onChange={(e) => {
                    const nextSalary = Number(e.target.value);
                    if (!Number.isFinite(nextSalary)) return;
                    setAssumptions((prev) => {
                      const next = [...prev.fixedStaffAnnual];
                      next[idx] = { ...next[idx], annualSalary: nextSalary };
                      return { ...prev, fixedStaffAnnual: next };
                    });
                  }}
                />
              </div>
            ))}
            <div className="border-t pt-3 text-sm font-medium">
              Total fixed staff: {formatUsd(estimate.fixedStaffAnnualTotal)}/year (
              {formatUsd(estimate.currentMonthlyFixedStaffCost)}/month)
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current run-rate (no growth)</CardTitle>
            <CardDescription>Based on today’s Caspio authorized census only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Annual revenue</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualRevenueRunRate)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Annual MSW cost</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualMswCost)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Fixed staff payroll</span>
              <span className="font-medium">{formatUsd(estimate.fixedStaffAnnualTotal)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <span>Operating profit run-rate</span>
              <span>{formatUsd(estimate.currentAnnualOperatingProfitRunRate)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {monicaName} & {jasonName} pay (12-mo projection)
            </CardTitle>
            <CardDescription>
              With {estimate.assumptions.newMembersPerMonth} new members/month from month 2 onward.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Owner payroll pool ({assumptions.ownerPayrollSharePct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerPayrollPool)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Company draw pool ({100 - assumptions.ownerPayrollSharePct}%)</span>
              <span className="font-medium">{formatUsd(estimate.yearOwnerDrawPool)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2">
              <span>Each owner payroll</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerPayroll)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Each owner company draw</span>
              <span className="font-medium">{formatUsd(estimate.yearPerOwnerDraw)}</span>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <span>Each owner total (pre personal tax on draw)</span>
              <span>{formatUsd(estimate.yearPerOwnerTotal)}</span>
            </div>
            <div className="flex justify-between gap-4 text-emerald-700 font-semibold">
              <span>
                Each owner approx. after {assumptions.effectiveTaxRatePct}% payroll tax
              </span>
              <span>{formatUsd(estimate.yearPerOwnerAfterTaxEstimate)}</span>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Suggested annual W-2/payroll for each of {monicaName} and {jasonName}:{' '}
              <strong>{formatUsd(estimate.yearPerOwnerPayroll)}</strong> (
              {formatUsd(estimate.yearPerOwnerPayroll / 12)}/month), plus{' '}
              <strong>{formatUsd(estimate.yearPerOwnerDraw)}</strong> company draw each.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>12-month projection</CardTitle>
          <CardDescription>
            Starts from current authorized census. Known auth end dates remove members that month (no longer
            paid). New members (+{estimate.assumptions.newMembersPerMonth}/mo from month 2) stay for{' '}
            {estimate.effectiveAverageAuthMonths} months on average, then churn. Projected endings this year:{' '}
            {estimate.yearEndingMembersTotal.toLocaleString()} · new:{' '}
            {estimate.yearNewMembersTotal.toLocaleString()}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Ending</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">MSW</TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead className="text-right">Op. profit</TableHead>
                <TableHead className="text-right">Each owner total</TableHead>
                <TableHead className="text-right">Each after tax est.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimate.projection.map((row) => (
                <TableRow key={row.monthIndex}>
                  <TableCell>{row.monthLabel}</TableCell>
                  <TableCell className="text-right">{row.activeMembers}</TableCell>
                  <TableCell className="text-right">{row.newMembers}</TableCell>
                  <TableCell className="text-right">{row.endingMembers}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyRevenue)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyMswCost)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyFixedStaffCost)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyOperatingProfit)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyPerOwnerTotal)}</TableCell>
                  <TableCell className="text-right">
                    {formatUsd(row.monthlyPerOwnerAfterTaxEstimate)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>12-mo total</TableCell>
                <TableCell className="text-right">{estimate.yearEndActiveMembers}</TableCell>
                <TableCell className="text-right">{estimate.yearNewMembersTotal}</TableCell>
                <TableCell className="text-right">{estimate.yearEndingMembersTotal}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearRevenueTotal)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearMswCostTotal)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearFixedStaffCost)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearOperatingProfit)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearPerOwnerTotal)}</TableCell>
                <TableCell className="text-right">
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
