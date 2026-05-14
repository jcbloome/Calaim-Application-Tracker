'use client';

import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AuthorizationMember = {
  memberHealthPlan?: string;
  memberStatus?: string;
  calaimStatus?: string;
  authStartDateT2038?: string;
  authEndDateT2038?: string;
  authStartDateH2022?: string;
};

type MonthlyGrowthRow = {
  monthIndex: number;
  monthLabel: string;
  kaiserNewAuthorized: number;
  healthNetNewAuthorized: number;
  totalNewAuthorized: number;
  kaiserAuthEnding: number;
  kaiserNetGrowth: number;
  monthOverMonthGrowthPct: number | null;
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const isKaiserPlan = (value: unknown) => normalize(value).includes('kaiser');

const isHealthNetPlan = (value: unknown) => {
  const plan = normalize(value);
  return plan.includes('health net') || plan.includes('healthnet') || plan === 'hn';
};

const isAuthorizedStatus = (member: AuthorizationMember) => {
  const status = normalize(member.memberStatus || member.calaimStatus);
  return status === 'authorized' || status.startsWith('authorized ');
};

const parseDateMaybe = (raw: unknown): Date | null => {
  const value = String(raw || '').trim();
  if (!value) return null;

  const isoLike = /^\d{4}-\d{2}-\d{2}/.test(value);
  if (isoLike) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const parsed = new Date(year, month - 1, day);
    const isValid =
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day;
    return isValid ? parsed : null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toYearMonthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}`;

export default function ProgramGrowthPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [members, setMembers] = useState<AuthorizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const fetchGrowthData = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/authorization/all-members?refresh=true', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to load growth data (HTTP ${response.status})`));
      }
      setMembers(Array.isArray(payload?.members) ? payload.members : []);
      setHasLoaded(true);
    } catch (err: any) {
      setError(String(err?.message || 'Could not load growth metrics.'));
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    members.forEach((member) => {
      [member.authStartDateT2038, member.authStartDateH2022, member.authEndDateT2038].forEach((rawDate) => {
        const parsed = parseDateMaybe(rawDate);
        if (parsed) years.add(parsed.getFullYear());
      });
    });

    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [members]);

  const monthlyRows = useMemo<MonthlyGrowthRow[]>(() => {
    const year = Number(selectedYear);
    const monthlyKaiserGains = new Map<string, number>();
    const monthlyHealthNetGains = new Map<string, number>();
    const monthlyKaiserEndings = new Map<string, number>();

    members.forEach((member) => {
      if (!isAuthorizedStatus(member)) return;

      if (isKaiserPlan(member.memberHealthPlan)) {
        const start = parseDateMaybe(member.authStartDateT2038);
        if (start && start.getFullYear() === year) {
          const key = toYearMonthKey(start);
          monthlyKaiserGains.set(key, (monthlyKaiserGains.get(key) || 0) + 1);
        }

        const end = parseDateMaybe(member.authEndDateT2038);
        if (end && end.getFullYear() === year) {
          const key = toYearMonthKey(end);
          monthlyKaiserEndings.set(key, (monthlyKaiserEndings.get(key) || 0) + 1);
        }
      }

      if (isHealthNetPlan(member.memberHealthPlan)) {
        const start = parseDateMaybe(member.authStartDateH2022);
        if (start && start.getFullYear() === year) {
          const key = toYearMonthKey(start);
          monthlyHealthNetGains.set(key, (monthlyHealthNetGains.get(key) || 0) + 1);
        }
      }
    });

    return Array.from({ length: 12 }, (_, monthIndex) => {
      const date = new Date(year, monthIndex, 1);
      const key = toYearMonthKey(date);
      const kaiserNewAuthorized = monthlyKaiserGains.get(key) || 0;
      const healthNetNewAuthorized = monthlyHealthNetGains.get(key) || 0;
      const kaiserAuthEnding = monthlyKaiserEndings.get(key) || 0;
      const totalNewAuthorized = kaiserNewAuthorized + healthNetNewAuthorized;

      const prevMonthDate = new Date(year, monthIndex - 1, 1);
      const prevMonthKey = toYearMonthKey(prevMonthDate);
      const prevTotalNewAuthorized =
        (monthlyKaiserGains.get(prevMonthKey) || 0) + (monthlyHealthNetGains.get(prevMonthKey) || 0);

      let monthOverMonthGrowthPct: number | null = null;
      if (monthIndex > 0) {
        if (prevTotalNewAuthorized > 0) {
          monthOverMonthGrowthPct =
            ((totalNewAuthorized - prevTotalNewAuthorized) / prevTotalNewAuthorized) * 100;
        } else if (totalNewAuthorized > 0) {
          monthOverMonthGrowthPct = 100;
        } else {
          monthOverMonthGrowthPct = 0;
        }
      }

      return {
        monthIndex,
        monthLabel: format(date, 'MMM'),
        kaiserNewAuthorized,
        healthNetNewAuthorized,
        totalNewAuthorized,
        kaiserAuthEnding,
        kaiserNetGrowth: kaiserNewAuthorized - kaiserAuthEnding,
        monthOverMonthGrowthPct,
      };
    });
  }, [members, selectedYear]);

  const authorizedPlanTotals = useMemo(() => {
    let healthNetAuthorized = 0;
    let kaiserAuthorized = 0;

    members.forEach((member) => {
      if (!isAuthorizedStatus(member)) return;
      if (isHealthNetPlan(member.memberHealthPlan)) healthNetAuthorized++;
      if (isKaiserPlan(member.memberHealthPlan)) kaiserAuthorized++;
    });

    return {
      healthNetAuthorized,
      kaiserAuthorized,
      totalAuthorized: healthNetAuthorized + kaiserAuthorized,
    };
  }, [members]);

  const totals = useMemo(() => {
    return monthlyRows.reduce(
      (acc, row) => {
        acc.kaiserNewAuthorized += row.kaiserNewAuthorized;
        acc.healthNetNewAuthorized += row.healthNetNewAuthorized;
        acc.totalNewAuthorized += row.totalNewAuthorized;
        acc.kaiserAuthEnding += row.kaiserAuthEnding;
        acc.kaiserNetGrowth += row.kaiserNetGrowth;
        return acc;
      },
      {
        kaiserNewAuthorized: 0,
        healthNetNewAuthorized: 0,
        totalNewAuthorized: 0,
        kaiserAuthEnding: 0,
        kaiserNetGrowth: 0,
      }
    );
  }, [monthlyRows]);

  if (isAdminLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading permissions...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <p className="p-6 text-sm text-destructive">Admin access required.</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Program Growth Statistics</h1>
          <p className="text-sm text-muted-foreground">
            Monthly authorized growth for Kaiser and Health Net, plus Kaiser authorization-end attrition tracking.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={fetchGrowthData} variant="outline" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Data
              </>
            )}
          </Button>
        </div>
      </div>

      {!hasLoaded ? (
        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Click Refresh Data to load monthly growth metrics from authorized-member records.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-4 border-t-emerald-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Authorized Health Net Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{authorizedPlanTotals.healthNetAuthorized}</div>
            <CardDescription>CalAIM_Status = Authorized</CardDescription>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Authorized Kaiser Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{authorizedPlanTotals.kaiserAuthorized}</div>
            <CardDescription>CalAIM_Status = Authorized</CardDescription>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-slate-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Authorized Total (HN + Kaiser)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">{authorizedPlanTotals.totalAuthorized}</div>
            <CardDescription>Current authorized census</CardDescription>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Kaiser New Authorized</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold text-blue-700">
              <TrendingUp className="h-5 w-5" />
              {totals.kaiserNewAuthorized}
            </div>
            <CardDescription>{selectedYear} total starts (T2038)</CardDescription>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Health Net New Authorized</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold text-emerald-700">
              <TrendingUp className="h-5 w-5" />
              {totals.healthNetNewAuthorized}
            </div>
            <CardDescription>{selectedYear} total starts (H2022)</CardDescription>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Kaiser Auth Ending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold text-amber-700">
              <TrendingDown className="h-5 w-5" />
              {totals.kaiserAuthEnding}
            </div>
            <CardDescription>{selectedYear} end dates (loss risk)</CardDescription>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Kaiser Net Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold text-purple-700">
              <BarChart3 className="h-5 w-5" />
              {totals.kaiserNetGrowth}
            </div>
            <CardDescription>Starts minus ending auths</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Growth vs. Attrition ({selectedYear})</CardTitle>
          <CardDescription>
            Kaiser and Health Net monthly new authorizations, plus Kaiser authorization-end counts for gain/loss tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Kaiser New</TableHead>
                  <TableHead className="text-right">Health Net New</TableHead>
                  <TableHead className="text-right">Total New</TableHead>
                  <TableHead className="text-right">MoM Growth %</TableHead>
                  <TableHead className="text-right">Kaiser Auth Ending</TableHead>
                  <TableHead className="text-right">Kaiser Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.map((row) => (
                  <TableRow key={row.monthIndex}>
                    <TableCell className="font-medium">{row.monthLabel}</TableCell>
                    <TableCell className="text-right">{row.kaiserNewAuthorized}</TableCell>
                    <TableCell className="text-right">{row.healthNetNewAuthorized}</TableCell>
                    <TableCell className="text-right">{row.totalNewAuthorized}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        row.monthOverMonthGrowthPct === null
                          ? 'text-muted-foreground'
                          : row.monthOverMonthGrowthPct < 0
                            ? 'text-red-600'
                            : row.monthOverMonthGrowthPct > 0
                              ? 'text-green-700'
                              : ''
                      }`}
                    >
                      {row.monthOverMonthGrowthPct === null
                        ? '—'
                        : `${row.monthOverMonthGrowthPct > 0 ? '+' : ''}${row.monthOverMonthGrowthPct.toFixed(1)}%`}
                    </TableCell>
                    <TableCell className="text-right">{row.kaiserAuthEnding}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        row.kaiserNetGrowth < 0 ? 'text-red-600' : row.kaiserNetGrowth > 0 ? 'text-green-700' : ''
                      }`}
                    >
                      {row.kaiserNetGrowth}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totals.kaiserNewAuthorized}</TableCell>
                  <TableCell className="text-right">{totals.healthNetNewAuthorized}</TableCell>
                  <TableCell className="text-right">{totals.totalNewAuthorized}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right">{totals.kaiserAuthEnding}</TableCell>
                  <TableCell
                    className={`text-right ${
                      totals.kaiserNetGrowth < 0 ? 'text-red-600' : totals.kaiserNetGrowth > 0 ? 'text-green-700' : ''
                    }`}
                  >
                    {totals.kaiserNetGrowth}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Counts are based on authorized-member records and authorization date fields returned by the authorization API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
