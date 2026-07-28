'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, RefreshCw, Users } from 'lucide-react';
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
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const isHealthNetPlan = (value: unknown) => {
  const plan = normalize(value);
  return plan.includes('health net') || plan.includes('healthnet') || plan === 'hn';
};

const isAuthorizedStatus = (member: AuthorizationMember) => {
  const status = normalize(member.memberStatus || member.calaimStatus);
  return status === 'authorized' || status.startsWith('authorized ');
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

export default function HealthNetActiveMembersPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<HealthNetActiveMemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

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
          };
        })
        .sort((a, b) => {
          const byLastName = a.memberLastName.localeCompare(b.memberLastName);
          if (byLastName !== 0) return byLastName;
          const byFirstName = a.memberFirstName.localeCompare(b.memberFirstName);
          if (byFirstName !== 0) return byFirstName;
          return a.memberId.localeCompare(b.memberId);
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

  const canExport = useMemo(() => rows.length > 0 && !isLoading && !isExporting, [rows.length, isLoading, isExporting]);

  useEffect(() => {
    if (!isAdmin || hasLoaded || isLoading) return;
    void fetchMembers();
  }, [fetchMembers, hasLoaded, isAdmin, isLoading]);

  const handleExportExcel = useCallback(async () => {
    if (!canExport) return;
    setIsExporting(true);
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
      setIsExporting(false);
    }
  }, [canExport, rows]);

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
          <Button onClick={() => void handleExportExcel()} disabled={!canExport} variant="outline">
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Excel
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!hasLoaded ? (
            <p className="text-sm text-muted-foreground">Click Refresh Data to load the report.</p>
          ) : null}
          {hasLoaded && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              {rows.length} authorized Health Net member{rows.length === 1 ? '' : 's'} in this view.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Member First Name</TableHead>
                  <TableHead>Member Last Name</TableHead>
                  <TableHead>Authorization #</TableHead>
                  <TableHead>Member Tier</TableHead>
                  <TableHead>Auth Start Date</TableHead>
                  <TableHead>Auth End Date</TableHead>
                  <TableHead>Assisted Living Facility Name</TableHead>
                  <TableHead>ALF Address</TableHead>
                  <TableHead>ALF City</TableHead>
                  <TableHead>ALF County</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading members...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
                      No authorized Health Net members found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.memberId}</TableCell>
                      <TableCell>{row.memberFirstName}</TableCell>
                      <TableCell>{row.memberLastName}</TableCell>
                      <TableCell>{row.authorizationNumber}</TableCell>
                      <TableCell>{row.memberTier}</TableCell>
                      <TableCell>{formatDateCell(row.authStartDate)}</TableCell>
                      <TableCell>{formatDateCell(row.authEndDate)}</TableCell>
                      <TableCell>{row.assistedLivingFacilityName}</TableCell>
                      <TableCell>{row.alfAddress}</TableCell>
                      <TableCell>{row.alfCity}</TableCell>
                      <TableCell>{row.alfCounty}</TableCell>
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
