'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Download, Loader2, RefreshCw, Users } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { Badge } from '@/components/ui/badge';
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

type KaiserApiMember = {
  id?: string | number;
  Client_ID2?: string;
  client_ID2?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  CalAIM_MCO?: string;
  CalAIM_Status?: string;
  Kaiser_Status?: string;
  Kaiser_User_Assignment?: string;
  Staff_Assigned?: string;
  Authorization_End_Date_H2022?: string;
  Auth_Ext_Request_Date_H2022?: string;
  Kaiser_H2022_Requested?: string;
  Kaiser_Next_Step_Date?: string;
  last_updated?: string;
  Date_Modified?: string;
};

type ActionType =
  | 'Add H2022 End Date'
  | 'Send Auth Extension Request'
  | 'Await Updated H2022 End Date'
  | 'Vetting Appeal Follow-up'
  | 'Assign Kaiser Staff'
  | 'Monitor';

type Row = {
  id: string;
  memberName: string;
  memberMrn: string;
  clientId2: string;
  calaimStatus: string;
  kaiserStatus: string;
  assignedStaff: string;
  authEndDate: string;
  authExtRequestDate: string;
  kaiserH2022RequestedDate: string;
  nextStepDate: string;
  lastUpdatedDate: string;
  daysToEnd: number | null;
  nextRequiredAction: ActionType;
  agingDate: string;
  agingDays: number | null;
  agingBucket: string;
};

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const toYmd = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const formatYmd = (value: string) => {
  if (!value) return 'Needs date';
  try {
    return format(new Date(`${value}T00:00:00`), 'MM/dd/yyyy');
  } catch {
    return value;
  }
};

const isFinalOrRbPending = (status: string) => {
  const compact = normalize(status).replace(/[^a-z0-9]+/g, ' ').trim();
  return (
    compact === 'r b sent pending ils contract' ||
    compact === 'r b pending ils contract' ||
    compact === 'final member at rcfe' ||
    compact === 'final at rcfe'
  );
};

const isVettingAppeal = (status: string) => {
  const compact = normalize(status).replace(/[^a-z0-9]+/g, ' ').trim();
  return compact === 'vetting appeal' || compact === 'vetting appeals';
};

const parseYmdToDate = (ymd: string): Date | null => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysUntil = (ymd: string): number | null => {
  const target = parseYmdToDate(ymd);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const pickFirstDate = (...values: string[]) => values.find((value) => Boolean(value)) || '';

const computeNextAction = (row: Omit<Row, 'nextRequiredAction' | 'agingDate' | 'agingDays' | 'agingBucket'>): ActionType => {
  if (isFinalOrRbPending(row.kaiserStatus) && !row.authEndDate) return 'Add H2022 End Date';
  if (isVettingAppeal(row.kaiserStatus)) return 'Vetting Appeal Follow-up';
  if (row.daysToEnd !== null && row.daysToEnd <= 30) {
    if (!row.authExtRequestDate) return 'Send Auth Extension Request';
    return 'Await Updated H2022 End Date';
  }
  if (!row.assignedStaff || row.assignedStaff === 'Unassigned') return 'Assign Kaiser Staff';
  return 'Monitor';
};

const actionPriority = (action: ActionType) => {
  switch (action) {
    case 'Add H2022 End Date':
      return 0;
    case 'Send Auth Extension Request':
      return 1;
    case 'Vetting Appeal Follow-up':
      return 2;
    case 'Await Updated H2022 End Date':
      return 3;
    case 'Assign Kaiser Staff':
      return 4;
    default:
      return 9;
  }
};

const toAgingBucket = (days: number | null) => {
  if (days == null) return 'Unknown';
  if (days <= 7) return '0-7 days';
  if (days <= 14) return '8-14 days';
  if (days <= 30) return '15-30 days';
  return '31+ days';
};

const actionDateForRow = (row: Omit<Row, 'nextRequiredAction' | 'agingDate' | 'agingDays' | 'agingBucket'>, action: ActionType) => {
  if (action === 'Await Updated H2022 End Date') {
    return pickFirstDate(row.authExtRequestDate, row.kaiserH2022RequestedDate, row.nextStepDate, row.lastUpdatedDate);
  }
  if (action === 'Send Auth Extension Request') {
    return pickFirstDate(row.authEndDate, row.kaiserH2022RequestedDate, row.nextStepDate, row.lastUpdatedDate);
  }
  if (action === 'Add H2022 End Date') {
    return pickFirstDate(row.kaiserH2022RequestedDate, row.nextStepDate, row.lastUpdatedDate);
  }
  if (action === 'Vetting Appeal Follow-up') {
    return pickFirstDate(row.nextStepDate, row.lastUpdatedDate);
  }
  return pickFirstDate(row.nextStepDate, row.lastUpdatedDate);
};

export default function KaiserOperationsMonitorPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showActionableOnly, setShowActionableOnly] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchRows = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const payload = (await response.json()) as { success?: boolean; members?: KaiserApiMember[]; error?: string };
      if (!response.ok || !payload?.success || !Array.isArray(payload?.members)) {
        throw new Error(payload?.error || `Failed to load Kaiser members (HTTP ${response.status})`);
      }

      const nextRows = payload.members
        .filter((member) => {
          const plan = normalize(member.CalAIM_MCO);
          return plan.includes('kaiser') || !plan;
        })
        .map((member, idx) => {
          const first = String(member.memberFirstName || '').trim();
          const last = String(member.memberLastName || '').trim();
          const authEndDate = toYmd(member.Authorization_End_Date_H2022);
          const authExtRequestDate = toYmd(member.Auth_Ext_Request_Date_H2022);
          const kaiserH2022RequestedDate = toYmd(member.Kaiser_H2022_Requested);
          const nextStepDate = toYmd(member.Kaiser_Next_Step_Date);
          const lastUpdatedDate = toYmd(member.last_updated || member.Date_Modified);
          const baseRow = {
            id: String(member.id || member.Client_ID2 || member.client_ID2 || `k-${idx}`),
            memberName: `${first} ${last}`.trim() || 'Unknown Member',
            memberMrn: String(member.memberMrn || '').trim() || '—',
            clientId2: String(member.Client_ID2 || member.client_ID2 || '').trim() || '—',
            calaimStatus: String(member.CalAIM_Status || '').trim() || '—',
            kaiserStatus: String(member.Kaiser_Status || '').trim() || '—',
            assignedStaff: String(member.Kaiser_User_Assignment || member.Staff_Assigned || '').trim() || 'Unassigned',
            authEndDate,
            authExtRequestDate,
            kaiserH2022RequestedDate,
            nextStepDate,
            lastUpdatedDate,
            daysToEnd: daysUntil(authEndDate),
          };
          const nextRequiredAction = computeNextAction(baseRow);
          const agingDate = actionDateForRow(baseRow, nextRequiredAction);
          const agingDays = agingDate ? Math.max(0, Math.abs(daysUntil(agingDate) ?? 0)) : null;
          return {
            ...baseRow,
            nextRequiredAction,
            agingDate,
            agingDays,
            agingBucket: toAgingBucket(agingDays),
          } as Row;
        });

      nextRows.sort((a, b) => {
        const ap = actionPriority(a.nextRequiredAction);
        const bp = actionPriority(b.nextRequiredAction);
        if (ap !== bp) return ap - bp;
        const ad = a.daysToEnd ?? Number.POSITIVE_INFINITY;
        const bd = b.daysToEnd ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return a.memberName.localeCompare(b.memberName);
      });

      setRows(nextRows);
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Could not load Kaiser operations monitor data.');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdminLoading && isAdmin) {
      void fetchRows();
    }
  }, [fetchRows, isAdmin, isAdminLoading]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (showActionableOnly && row.nextRequiredAction === 'Monitor') return false;
      if (!query) return true;
      return (
        row.memberName.toLowerCase().includes(query) ||
        row.memberMrn.toLowerCase().includes(query) ||
        row.clientId2.toLowerCase().includes(query) ||
        row.kaiserStatus.toLowerCase().includes(query) ||
        row.assignedStaff.toLowerCase().includes(query) ||
        row.nextRequiredAction.toLowerCase().includes(query)
      );
    });
  }, [rows, search, showActionableOnly]);

  const summary = useMemo(() => {
    const actionable = rows.filter((row) => row.nextRequiredAction !== 'Monitor');
    return {
      total: rows.length,
      actionable: actionable.length,
      missingEndDate: rows.filter((row) => row.nextRequiredAction === 'Add H2022 End Date').length,
      reauthDue: rows.filter((row) => row.daysToEnd !== null && row.daysToEnd <= 30).length,
      missingAuthExtReq: rows.filter((row) => row.nextRequiredAction === 'Send Auth Extension Request').length,
      vettingAppeal: rows.filter((row) => row.nextRequiredAction === 'Vetting Appeal Follow-up').length,
    };
  }, [rows]);

  const handleExportCsv = () => {
    const headers = [
      'Member Name',
      'MRN',
      'Client_ID2',
      'CalAIM Status',
      'Kaiser Status',
      'Assigned Staff',
      'H2022 Authorization End Date',
      'Days To End Date',
      'Auth_Ext_Request_Date_H2022',
      'Next Required Action',
      'Aging Bucket',
      'Aging Date',
    ];
    const lines = filteredRows.map((row) =>
      [
        row.memberName,
        row.memberMrn,
        row.clientId2,
        row.calaimStatus,
        row.kaiserStatus,
        row.assignedStaff,
        row.authEndDate || 'Needs date',
        row.daysToEnd == null ? 'Needs date' : String(row.daysToEnd),
        row.authExtRequestDate || 'Not marked',
        row.nextRequiredAction,
        row.agingBucket,
        row.agingDate || '—',
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaiser-operations-monitor-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kaiser Operations Monitor</h1>
          <p className="text-muted-foreground">
            Broader Kaiser workflow view (beyond ILS-only waiting actions)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void fetchRows()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={filteredRows.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Kaiser</p><p className="text-2xl font-semibold">{summary.total}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Actionable</p><p className="text-2xl font-semibold text-blue-700">{summary.actionable}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Missing H2022 End Date</p><p className="text-2xl font-semibold text-red-700">{summary.missingEndDate}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Reauth Due ({'<='}30d / past)</p><p className="text-2xl font-semibold text-amber-700">{summary.reauthDue}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Missing Auth Ext Request</p><p className="text-2xl font-semibold text-rose-700">{summary.missingAuthExtReq}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Vetting Appeals</p><p className="text-2xl font-semibold text-violet-700">{summary.vettingAppeal}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Member Worklist</CardTitle>
          <CardDescription>
            Next actions, aging, and reauthorization indicators for Kaiser members.
            {lastRefreshedAt ? ` Last refreshed ${format(lastRefreshedAt, 'MM/dd/yyyy h:mm a')}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member, MRN, status, staff, action..."
              className="sm:max-w-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showActionableOnly}
                onChange={(e) => setShowActionableOnly(e.target.checked)}
              />
              Show actionable only
            </label>
          </div>

          {error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="rounded border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Kaiser Status</TableHead>
                  <TableHead>Assigned Staff</TableHead>
                  <TableHead>H2022 End Date</TableHead>
                  <TableHead>Days To End</TableHead>
                  <TableHead>Auth Ext Request Date</TableHead>
                  <TableHead>Next Required Action</TableHead>
                  <TableHead>Aging Bucket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {isLoading ? 'Loading members...' : 'No members match current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.memberName}</div>
                        <div className="text-xs text-muted-foreground">MRN: {row.memberMrn} • Client_ID2: {row.clientId2}</div>
                      </TableCell>
                      <TableCell>{row.kaiserStatus}</TableCell>
                      <TableCell>{row.assignedStaff}</TableCell>
                      <TableCell>
                        {row.authEndDate ? (
                          <span>{formatYmd(row.authEndDate)}</span>
                        ) : (
                          <Badge variant="destructive">Needs date</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.daysToEnd == null ? (
                          <span className="text-muted-foreground">Needs date</span>
                        ) : row.daysToEnd < 0 ? (
                          <span className="text-red-700 font-medium">Overdue {Math.abs(row.daysToEnd)}d</span>
                        ) : (
                          <span>{row.daysToEnd}d</span>
                        )}
                      </TableCell>
                      <TableCell>{row.authExtRequestDate ? formatYmd(row.authExtRequestDate) : 'Not marked'}</TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-1">
                          {row.nextRequiredAction !== 'Monitor' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : null}
                          <span>{row.nextRequiredAction}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.agingBucket}</TableCell>
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

