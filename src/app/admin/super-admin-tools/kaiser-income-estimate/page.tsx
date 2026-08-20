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
  const [assumptions, setAssumptions] = useState<KaiserIncomeAssumptions>(() => ({
    ...DEFAULT_KAISER_INCOME_ASSUMPTIONS,
    averageAuthMonthsOverride: 0,
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
              taxes, {assumptions.k401EmployerContributionPct}% 401(k), cash balance, and CA entity tax,
              residual owner pool uses {assumptions.ownerPayrollSharePct}% payroll /{' '}
              {100 - assumptions.ownerPayrollSharePct}% company draw, split evenly between {monicaName} and{' '}
              {jasonName} (on top of base W-2). Owners live in VA; business taxed in CA.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fixed staff payroll</CardTitle>
            <CardDescription>
              Annual salaries and residence/work state (drives employer SUI). Business entity remains CA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[1fr_88px_140px] items-center gap-3 text-xs text-muted-foreground">
              <span />
              <span>State</span>
              <span>Annual pay</span>
            </div>
            {assumptions.fixedStaffAnnual.map((row, idx) => (
              <div key={row.name} className="grid grid-cols-[1fr_88px_140px] items-center gap-3">
                <div className="text-sm font-medium">{row.name}</div>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  aria-label={`${row.name} state`}
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
            <div className="border-t pt-3 text-xs font-medium text-muted-foreground">Owner base W-2</div>
            <div className="grid grid-cols-[1fr_72px_72px_140px] items-center gap-3 text-xs text-muted-foreground">
              <span />
              <span>Age</span>
              <span>State</span>
              <span>Annual W-2</span>
            </div>
            {assumptions.ownerAnnualPayroll.map((row, idx) => (
              <div key={row.name} className="grid grid-cols-[1fr_72px_72px_140px] items-center gap-3">
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
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              States drive employer unemployment tax. Nick NY · Deydry TN · Leidy & Lilo FL · Monica, James &
              Jason VA · John CA · Valentina Colombia (CO — no US payroll taxes in this model). FL/TN have no
              state income tax (owner personal tax still uses VA+CA for Monica/Jason).
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
              <Label htmlFor="k401-pct">Employer 401(k) (% of all salaries)</Label>
              <Input
                id="k401-pct"
                type="number"
                value={assumptions.k401EmployerContributionPct}
                onChange={(e) => updateNumber('k401EmployerContributionPct', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {assumptions.k401EmployerContributionPct}% of {formatUsd(estimate.totalStaffPayrollAnnual)} ={' '}
                {formatUsd(estimate.k401EmployerAnnual)}/year (
                {formatUsd(estimate.currentMonthlyK401Cost)}/month).
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAssumptions((prev) => ({
                    ...prev,
                    cashBalancePlanAnnual: estimate.estimatedCashBalanceMaxAnnual,
                  }))
                }
              >
                Use illustrative max ({formatUsd(estimate.estimatedCashBalanceMaxAnnual)})
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
            <CardDescription>Based on today’s authorized census only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Monthly revenue</span>
              <span className="font-medium">{formatUsd(estimate.currentMonthlyRevenue)}</span>
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
              <span>Monthly 401(k) employer ({assumptions.k401EmployerContributionPct}%)</span>
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
              <span>Annual revenue</span>
              <span className="font-medium">{formatUsd(estimate.currentAnnualRevenueRunRate)}</span>
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
                <TableHead className="text-right">Staff payroll</TableHead>
                <TableHead className="text-right">ER tax</TableHead>
                <TableHead className="text-right">401(k)</TableHead>
                <TableHead className="text-right">Biz cost</TableHead>
                <TableHead className="text-right">Cash bal.</TableHead>
                <TableHead className="text-right">CA entity</TableHead>
                <TableHead className="text-right">Op. profit</TableHead>
                <TableHead className="text-right">After CB</TableHead>
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
                  <TableCell className="text-right">{formatUsd(row.monthlyStaffPayrollCost)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyEmployerPayrollTax)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyK401Cost)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyBusinessCost)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyCashBalanceCost)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyCaEntityTax)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.monthlyOperatingProfit)}</TableCell>
                  <TableCell className="text-right">
                    {formatUsd(row.monthlyEarningsAfterCashBalance)}
                  </TableCell>
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
                <TableCell className="text-right">{formatUsd(estimate.yearStaffPayrollCost)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearEmployerPayrollTax)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearK401Cost)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearBusinessCost)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearCashBalanceCost)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearCaEntityTax)}</TableCell>
                <TableCell className="text-right">{formatUsd(estimate.yearOperatingProfit)}</TableCell>
                <TableCell className="text-right">
                  {formatUsd(estimate.yearEarningsAfterCashBalance)}
                </TableCell>
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
