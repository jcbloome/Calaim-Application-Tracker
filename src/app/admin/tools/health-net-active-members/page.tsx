'use client';

import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Download, Loader2, RefreshCw, Users } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AuthorizationMember = {
  recordId?: string;
  memberHealthPlan?: string;
  memberStatus?: string;
  calaimStatus?: string;
  memberMediCalNum?: string;
  memberMrn?: string;
  clientId2?: string;
  memberFirstName?: string;
  memberLastName?: string;
  nextAuthStartDateH2022?: string;
  authStartDateH2022?: string;
  Authorization_Start_Date_H2022?: string;
  nextAuthEndDateH2022?: string;
  authEndDateH2022?: string;
  Authorization_End_Date_H2022?: string;
  Authorization_End_Date_H222?: string;
  nextAuthNumberH2022?: string;
  authorizationNumber?: string;
  Authorization_Number_H2022?: string;
  tierLevel?: string;
  rcfeName?: string;
  rcfeAddress?: string;
  rcfeCity?: string;
  rcfeCounty?: string;
  memberCounty?: string;
  snfDiversionOrTransition?: string;
  diversionMonthlyExpense?: string | number;
};

type HealthNetActiveMemberRow = {
  id: string;
  memberId: string;
  memberFirstName: string;
  memberLastName: string;
  authorizationNumber: string;
  memberTier: string;
  authStartDate: string;
  authEndDate: string;
  assistedLivingFacilityName: string;
  alfAddress: string;
  alfCity: string;
  alfCounty: string;
  snfPathway: string;
  monthlyTierExpense: number;
};

type SortKey =
  | 'memberId'
  | 'memberFirstName'
  | 'memberLastName'
  | 'authorizationNumber'
  | 'memberTier'
  | 'authStartDate'
  | 'authEndDate'
  | 'assistedLivingFacilityName'
  | 'alfAddress'
  | 'alfCity'
  | 'alfCounty'
  | 'snfPathway';

type SortDirection = 'asc' | 'desc';

const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const isHealthNetPlan = (value: unknown) => {
  const plan = normalize(value);
  return plan.includes('health net') || plan.includes('healthnet') || plan === 'hn';
};

const isAuthorizedStatus = (member: AuthorizationMember) => {
  const status = normalize(member.memberStatus || member.calaimStatus);
  return status === 'authorized';
};

const pickFirstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const normalizeMemberTier = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const withoutHealthNet = raw.replace(/health\s*net/gi, '').replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim();
  return withoutHealthNet || '—';
};

const normalizeText = (value: unknown, fallback = '—') => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const formatDateCell = (raw: string) => {
  const value = String(raw || '').trim();
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy');
};

const parseDateForSort = (raw: string) => {
  const value = String(raw || '').trim();
  if (!value || value === '—') return Number.NEGATIVE_INFINITY;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NEGATIVE_INFINITY : parsed.getTime();
};

const normalizePathway = (value: unknown) => {
  const normalized = normalize(value);
  if (normalized.includes('diversion')) return 'SNF Diversion';
  if (normalized.includes('transition')) return 'SNF Transition';
  return 'Unknown';
};

const normalizeTierLabel = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === '—') return 'Unknown';
  const match = normalized.match(/(\d+)/);
  if (match) return `Tier ${match[1]}`;
  if (/^tier\s+/i.test(normalized)) return normalized.replace(/\s+/g, ' ').trim();
  return normalized;
};

const normalizeDiversionTierLabel = (value: string) => {
  const normalized = normalizeTierLabel(value);
  if (!normalized || normalized === '—') return 'Unknown Tier';
  return normalized;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const COST_DELTA_SNF_TO_RCFE = 2800;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const parseCurrencyToNumber = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function HealthNetActiveMembersPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<HealthNetActiveMemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExportingMembers, setIsExportingMembers] = useState(false);
  const [isExportingSummary, setIsExportingSummary] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('memberLastName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchMembers = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/authorization/all-members?refresh=true', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to load Health Net members (HTTP ${response.status})`));
      }

      const members: AuthorizationMember[] = Array.isArray(payload?.members) ? payload.members : [];
      const nextRows = members
        .filter((member) => isHealthNetPlan(member.memberHealthPlan) && isAuthorizedStatus(member))
        .map((member, idx) => {
          const memberFirstName = normalizeText(member.memberFirstName);
          const memberLastName = normalizeText(member.memberLastName);
          const authStartDate = pickFirstNonEmpty(
            member.nextAuthStartDateH2022,
            member.authStartDateH2022,
            member.Authorization_Start_Date_H2022
          );
          const authEndDate = pickFirstNonEmpty(
            member.nextAuthEndDateH2022,
            member.authEndDateH2022,
            member.Authorization_End_Date_H2022,
            member.Authorization_End_Date_H222
          );
          const authorizationNumber = pickFirstNonEmpty(
            member.nextAuthNumberH2022,
            member.authorizationNumber,
            member.Authorization_Number_H2022
          );
          const memberId = pickFirstNonEmpty(member.memberMediCalNum, member.memberMrn, member.clientId2);
          const rowId = String(member.recordId || `${memberFirstName}-${memberLastName}-${idx}`);

          return {
            id: rowId,
            memberId: normalizeText(memberId),
            memberFirstName,
            memberLastName,
            authorizationNumber: normalizeText(authorizationNumber),
            memberTier: normalizeMemberTier(member.tierLevel),
            authStartDate: normalizeText(authStartDate),
            authEndDate: normalizeText(authEndDate),
            assistedLivingFacilityName: normalizeText(member.rcfeName),
            alfAddress: normalizeText(member.rcfeAddress),
            alfCity: normalizeText(member.rcfeCity),
            alfCounty: normalizeText(member.rcfeCounty || member.memberCounty),
            snfPathway: normalizePathway(member.snfDiversionOrTransition),
            monthlyTierExpense: parseCurrencyToNumber(member.diversionMonthlyExpense),
          };
        });

      setRows(nextRows);
      setHasLoaded(true);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setRows([]);
      setHasLoaded(true);
      setError(String(err?.message || 'Could not load Health Net active members.'));
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  const canExportMembers = useMemo(
    () => rows.length > 0 && !isLoading && !isExportingMembers,
    [rows.length, isLoading, isExportingMembers]
  );
  const canExportSummary = useMemo(
    () => rows.length > 0 && !isLoading && !isExportingSummary,
    [rows.length, isLoading, isExportingSummary]
  );

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'authStartDate' || sortKey === 'authEndDate') {
        const aDate = parseDateForSort(a[sortKey]);
        const bDate = parseDateForSort(b[sortKey]);
        cmp = aDate - bDate;
      } else {
        cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      if (cmp === 0) {
        cmp =
          a.memberLastName.localeCompare(b.memberLastName, undefined, { sensitivity: 'base' }) ||
          a.memberFirstName.localeCompare(b.memberFirstName, undefined, { sensitivity: 'base' }) ||
          a.memberId.localeCompare(b.memberId, undefined, { sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortDirection, sortKey]);

  const tierSummary = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const key = normalizeTierLabel(row.memberTier);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => {
        const aNum = Number((a[0].match(/\d+/) || [])[0] || 9999);
        const bNum = Number((b[0].match(/\d+/) || [])[0] || 9999);
        if (aNum !== bNum) return aNum - bNum;
        return a[0].localeCompare(b[0]);
      });
  }, [rows]);

  const pathwaySummary = useMemo(() => {
    const diversion = rows.filter((row) => row.snfPathway === 'SNF Diversion').length;
    const transition = rows.filter((row) => row.snfPathway === 'SNF Transition').length;
    const unknown = rows.length - diversion - transition;
    const knownTotal = diversion + transition;
    const diversionPct = knownTotal > 0 ? (diversion / knownTotal) * 100 : 0;
    const transitionPct = knownTotal > 0 ? (transition / knownTotal) * 100 : 0;
    return { diversion, transition, unknown, knownTotal, diversionPct, transitionPct };
  }, [rows]);

  const costSummary = useMemo(() => {
    const transitionSavings = pathwaySummary.transition * COST_DELTA_SNF_TO_RCFE;
    const diversionRows = rows.filter((row) => row.snfPathway === 'SNF Diversion');
    const diversionNewExpenses = diversionRows.reduce((sum, row) => sum + (Number.isFinite(row.monthlyTierExpense) ? Math.max(0, row.monthlyTierExpense) : 0), 0);
    const diversionMembersWithRate = diversionRows.filter((row) => row.monthlyTierExpense > 0).length;
    const diversionMembersMissingRate = Math.max(0, diversionRows.length - diversionMembersWithRate);
    const totalMonthlyNetSavings = transitionSavings - diversionNewExpenses;
    const annualTransitionSavings = transitionSavings * 12;
    const annualDiversionNewExpenses = diversionNewExpenses * 12;
    const annualNetSavings = totalMonthlyNetSavings * 12;
    return {
      assumedPerMemberDelta: COST_DELTA_SNF_TO_RCFE,
      transitionSavings,
      diversionNewExpenses,
      totalMonthlyNetSavings,
      annualTransitionSavings,
      annualDiversionNewExpenses,
      annualNetSavings,
      diversionMembersWithRate,
      diversionMembersMissingRate,
    };
  }, [pathwaySummary.transition, rows]);

  const diversionTierCostSummary = useMemo(() => {
    const tierMap = new Map<string, { members: number; monthlyExpense: number }>();
    rows
      .filter((row) => row.snfPathway === 'SNF Diversion')
      .forEach((row) => {
        const tierLabel = normalizeDiversionTierLabel(row.memberTier);
        const current = tierMap.get(tierLabel) || { members: 0, monthlyExpense: 0 };
        current.members += 1;
        current.monthlyExpense += Number.isFinite(row.monthlyTierExpense) ? Math.max(0, row.monthlyTierExpense) : 0;
        tierMap.set(tierLabel, current);
      });

    return Array.from(tierMap.entries()).sort((a, b) => {
      const aNum = Number((a[0].match(/\d+/) || [])[0] || 9999);
      const bNum = Number((b[0].match(/\d+/) || [])[0] || 9999);
      if (aNum !== bNum) return aNum - bNum;
      return a[0].localeCompare(b[0]);
    });
  }, [rows]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        return current;
      }
      setSortDirection('asc');
      return key;
    });
  }, []);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-muted-foreground/60">-</span>;
    return sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  const buildSummaryRows = useCallback((): Array<Record<string, string | number>> => {
    return [
      { Section: 'Export Info', Metric: 'Summary Export Version', Value: 'HN-SUMMARY-V2' },
      { Section: 'Export Info', Metric: 'Generated At', Value: format(new Date(), 'yyyy-MM-dd h:mm a') },
      {},
      { Section: 'Cost Savings', Metric: 'Assumed SNF vs RCFE delta (per member)', Value: formatCurrency(costSummary.assumedPerMemberDelta) },
      { Section: 'Cost Savings', Metric: 'SNF Transition members', Value: pathwaySummary.transition },
      { Section: 'Cost Savings', Metric: 'Monthly savings generated (Transition x $2,800)', Value: formatCurrency(costSummary.transitionSavings) },
      { Section: 'Cost Savings', Metric: 'SNF Diversion members', Value: pathwaySummary.diversion },
      { Section: 'Cost Savings', Metric: 'Monthly new expenses for SNF Diversion members (summed from member tiered rates)', Value: formatCurrency(costSummary.diversionNewExpenses) },
      { Section: 'Cost Savings', Metric: 'SNF Diversion members with tiered rate found', Value: costSummary.diversionMembersWithRate },
      { Section: 'Cost Savings', Metric: 'SNF Diversion members missing tiered rate', Value: costSummary.diversionMembersMissingRate },
      { Section: 'Cost Savings', Metric: 'Total monthly net savings (Transition savings - Diversion new expenses)', Value: formatCurrency(costSummary.totalMonthlyNetSavings) },
      { Section: 'Cost Savings', Metric: 'Annual savings generated (Monthly transition savings x 12)', Value: formatCurrency(costSummary.annualTransitionSavings) },
      { Section: 'Cost Savings', Metric: 'Annual new expenses for SNF Diversion members', Value: formatCurrency(costSummary.annualDiversionNewExpenses) },
      { Section: 'Cost Savings', Metric: 'Total annual net savings', Value: formatCurrency(costSummary.annualNetSavings) },
      {},
      { Section: 'SNF Diversion Tier Cost Summary', Metric: 'Tier', Value: 'Members / Monthly expense' },
      ...diversionTierCostSummary.map(([tierLabel, bucket]) => ({
        Section: 'SNF Diversion Tier Cost Summary',
        Metric: `${tierLabel} (${bucket.members})`,
        Value: formatCurrency(bucket.monthlyExpense),
      })),
      {},
      { Section: 'Member Tier Summary', Metric: 'Tier', Value: 'Count' },
      ...tierSummary.map(([label, count]) => ({ Section: 'Member Tier Summary', Metric: label, Value: count })),
      {},
      { Section: 'SNF Pathway Summary', Metric: 'Pathway', Value: 'Count' },
      { Section: 'SNF Pathway Summary', Metric: 'SNF Diversion', Value: pathwaySummary.diversion },
      { Section: 'SNF Pathway Summary', Metric: 'SNF Transition', Value: pathwaySummary.transition },
      { Section: 'SNF Pathway Summary', Metric: 'SNF Diversion % (of known pathways)', Value: formatPercent(pathwaySummary.diversionPct) },
      { Section: 'SNF Pathway Summary', Metric: 'SNF Transition % (of known pathways)', Value: formatPercent(pathwaySummary.transitionPct) },
      { Section: 'SNF Pathway Summary', Metric: 'Unknown', Value: pathwaySummary.unknown },
    ];
  }, [
    costSummary.annualTransitionSavings,
    costSummary.annualDiversionNewExpenses,
    costSummary.annualNetSavings,
    costSummary.assumedPerMemberDelta,
    costSummary.diversionMembersMissingRate,
    costSummary.diversionMembersWithRate,
    costSummary.diversionNewExpenses,
    costSummary.totalMonthlyNetSavings,
    costSummary.transitionSavings,
    diversionTierCostSummary,
    pathwaySummary.diversion,
    pathwaySummary.diversionPct,
    pathwaySummary.knownTotal,
    pathwaySummary.transition,
    pathwaySummary.transitionPct,
    pathwaySummary.unknown,
    tierSummary,
  ]);

  const handleExportMembersExcel = useCallback(async () => {
    if (!canExportMembers) return;
    setIsExportingMembers(true);
    try {
      const xlsxMod: any = await import('xlsx');
      const XLSX = xlsxMod?.default ?? xlsxMod;
      const rowsForExcel = rows.map((row) => ({
        'Member ID': row.memberId,
        'Member First Name': row.memberFirstName,
        'Member Last Name': row.memberLastName,
        'Authorization #': row.authorizationNumber,
        'Member Tier': row.memberTier,
        'Auth Start Date': formatDateCell(row.authStartDate),
        'Auth End Date': formatDateCell(row.authEndDate),
        'Assisted Living Facility Name': row.assistedLivingFacilityName,
        'ALF Address': row.alfAddress,
        'ALF City': row.alfCity,
        'ALF County': row.alfCounty,
      }));
      const worksheet = XLSX.utils.json_to_sheet(rowsForExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Health Net Active');
      const stamp = format(new Date(), 'yyyy-MM-dd');
      XLSX.writeFile(workbook, `Health_Net_Active_Members_${stamp}.xlsx`);
    } catch (err) {
      console.error('Failed to export Health Net active members:', err);
      setError('Could not generate Excel file. Please try again.');
    } finally {
      setIsExportingMembers(false);
    }
  }, [canExportMembers, rows]);

  const handleExportSummaryExcel = useCallback(async () => {
    if (!canExportSummary) return;
    setIsExportingSummary(true);
    try {
      const xlsxMod: any = await import('xlsx');
      const XLSX = xlsxMod?.default ?? xlsxMod;
      const summaryWorksheet = XLSX.utils.json_to_sheet(buildSummaryRows());
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
      const stamp = format(new Date(), 'yyyy-MM-dd');
      XLSX.writeFile(workbook, `Health_Net_Active_Members_Summary_${stamp}.xlsx`);
    } catch (err) {
      console.error('Failed to export Health Net summary:', err);
      setError('Could not generate Summary Excel file. Please try again.');
    } finally {
      setIsExportingSummary(false);
    }
  }, [buildSummaryRows, canExportSummary]);

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
          <h1 className="text-2xl font-bold md:text-3xl">Health Net Active Members</h1>
          <p className="text-sm text-muted-foreground">
            View and export all authorized Health Net members in the ALF data request format.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void fetchMembers()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Data
          </Button>
          <Button onClick={() => void handleExportMembersExcel()} disabled={!canExportMembers} variant="outline">
            {isExportingMembers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Members
          </Button>
          <Button onClick={() => void handleExportSummaryExcel()} disabled={!canExportSummary} variant="outline">
            {isExportingSummary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Summary
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Authorized Health Net Members
              </CardTitle>
              <CardDescription>
                Columns match your required Excel template: member details, authorization, and ALF location fields.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              {lastRefreshedAt ? `Last refreshed ${format(lastRefreshedAt, 'MMM d, yyyy h:mm a')}` : 'No data loaded yet'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">Medi-Cal Cost Savings Summary (SNF vs RCFE): Assumption per member: $2,800</div>
                <div className="space-y-1 text-xs">
                  <div>Monthly savings from SNF Transition members: <span className="font-medium">{formatCurrency(costSummary.transitionSavings)}</span></div>
                  <div>SNF Diversion members: <span className="font-medium">{pathwaySummary.diversion}</span></div>
                  <div>Monthly new expenses from SNF Diversion members: <span className="font-medium">{formatCurrency(costSummary.diversionNewExpenses)}</span></div>
                  <div className="text-muted-foreground">
                    Diversion members with tiered rate found: <span className="font-medium text-foreground">{costSummary.diversionMembersWithRate}</span>
                    {costSummary.diversionMembersMissingRate > 0 ? (
                      <span> (missing rate: {costSummary.diversionMembersMissingRate})</span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground">Total monthly net savings (Transition - Diversion expenses): <span className="font-medium text-foreground">{formatCurrency(costSummary.totalMonthlyNetSavings)}</span></div>
                  <div>Annual savings from SNF Transition members: <span className="font-medium">{formatCurrency(costSummary.annualTransitionSavings)}</span></div>
                  <div>Annual new expenses from SNF Diversion members: <span className="font-medium">{formatCurrency(costSummary.annualDiversionNewExpenses)}</span></div>
                  <div className="text-muted-foreground">Total annual net savings: <span className="font-medium text-foreground">{formatCurrency(costSummary.annualNetSavings)}</span></div>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">Member Tier Summary</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {tierSummary.map(([label, count]) => (
                    <span key={label} className="rounded-full border bg-muted/40 px-2.5 py-1">
                      {label}: {count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">SNF Pathway Summary</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border bg-muted/40 px-2.5 py-1">
                    SNF Diversion: {pathwaySummary.diversion} ({formatPercent(pathwaySummary.diversionPct)})
                  </span>
                  <span className="rounded-full border bg-muted/40 px-2.5 py-1">
                    SNF Transition: {pathwaySummary.transition} ({formatPercent(pathwaySummary.transitionPct)})
                  </span>
                  {pathwaySummary.unknown > 0 ? (
                    <span className="rounded-full border bg-muted/40 px-2.5 py-1">Unknown: {pathwaySummary.unknown}</span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-md border p-3 lg:col-span-3">
                <div className="mb-2 text-sm font-semibold">SNF Diversion Tier Cost Summary (Monthly)</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {diversionTierCostSummary.length === 0 ? (
                    <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-muted-foreground">
                      No SNF Diversion tier costs resolved yet.
                    </span>
                  ) : (
                    diversionTierCostSummary.map(([tierLabel, bucket]) => (
                      <span key={tierLabel} className="rounded-full border bg-muted/40 px-2.5 py-1">
                        {tierLabel}: {bucket.members} member{bucket.members === 1 ? '' : 's'} ({formatCurrency(bucket.monthlyExpense)})
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!hasLoaded ? (
            <p className="text-sm text-muted-foreground">Click Refresh Data to load the report.</p>
          ) : null}
          {hasLoaded && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              {rows.length} authorized Health Net member{rows.length === 1 ? '' : 's'} in this view.
            </p>
          ) : null}
          <div className="rounded-md border">
            <div className="px-3 py-2 text-xs text-muted-foreground md:hidden">
              Mobile view is shown below. Rotate or widen screen for full table.
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {isLoading ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading members...
                  </span>
                </div>
              ) : rows.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No authorized Health Net members found.
                </div>
              ) : (
                sortedRows.map((row) => (
                  <div key={row.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {row.memberLastName}, {row.memberFirstName}
                        </div>
                        <div className="text-xs text-muted-foreground">Member ID: {row.memberId}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">Tier: {row.memberTier}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Authorization #</span>
                      <span className="break-words">{row.authorizationNumber}</span>
                      <span className="text-muted-foreground">Auth Start</span>
                      <span>{formatDateCell(row.authStartDate)}</span>
                      <span className="text-muted-foreground">Auth End</span>
                      <span>{formatDateCell(row.authEndDate)}</span>
                      <span className="text-muted-foreground">ALF Name</span>
                      <span className="break-words">{row.assistedLivingFacilityName}</span>
                      <span className="text-muted-foreground">ALF Address</span>
                      <span className="break-words">{row.alfAddress}</span>
                      <span className="text-muted-foreground">ALF City</span>
                      <span>{row.alfCity}</span>
                      <span className="text-muted-foreground">ALF County</span>
                      <span>{row.alfCounty}</span>
                      <span className="text-muted-foreground">SNF Pathway</span>
                      <span>{row.snfPathway}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block">
              <div className="max-h-[70vh] overflow-auto">
              <Table className="min-w-[1400px]">
              <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                <TableRow>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('memberId')}>
                      Member ID {renderSortIcon('memberId')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('memberFirstName')}>
                      Member First Name {renderSortIcon('memberFirstName')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('memberLastName')}>
                      Member Last Name {renderSortIcon('memberLastName')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('authorizationNumber')}>
                      Authorization # {renderSortIcon('authorizationNumber')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('memberTier')}>
                      Member Tier {renderSortIcon('memberTier')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('authStartDate')}>
                      Auth Start Date {renderSortIcon('authStartDate')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('authEndDate')}>
                      Auth End Date {renderSortIcon('authEndDate')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('assistedLivingFacilityName')}>
                      Assisted Living Facility Name {renderSortIcon('assistedLivingFacilityName')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('alfAddress')}>
                      ALF Address {renderSortIcon('alfAddress')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('alfCity')}>
                      ALF City {renderSortIcon('alfCity')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('alfCounty')}>
                      ALF County {renderSortIcon('alfCounty')}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => handleSort('snfPathway')}>
                      SNF Pathway {renderSortIcon('snfPathway')}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading members...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                      No authorized Health Net members found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{row.memberId}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.memberFirstName}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.memberLastName}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.authorizationNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.memberTier}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateCell(row.authStartDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateCell(row.authEndDate)}</TableCell>
                      <TableCell className="min-w-[240px]">{row.assistedLivingFacilityName}</TableCell>
                      <TableCell className="min-w-[280px]">{row.alfAddress}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.alfCity}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.alfCounty}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.snfPathway}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
