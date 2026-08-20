'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Bell,
  CalendarDays,
  Loader2,
  MapPin,
  RefreshCw,
  UserCheck,
  Users,
} from 'lucide-react';
import { collection, collectionGroup, getDoc, getDocs, limit, query, doc, setDoc, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatIlsMifMonthLabel,
  ilsMifMonthKeyFromIso,
  ILS_MIF_MASTER_COLLECTION,
  parseIlsMifMonthlyCounts,
  sortIlsMifMonthKeysDesc,
} from '@/lib/ils-mif-parse';
import { cn } from '@/lib/utils';

type DetailMode =
  | 'county'
  | 'month'
  | 'staff'
  | 'assigned'
  | 'acknowledged'
  | 'reminders'
  | 'all';

type StatMember = {
  id: string;
  source: 'mif' | 'application' | 'both';
  applicationId: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  firstSeenMonthKey: string;
  firstSeenAtIso: string;
  assignedStaffName: string;
  assignedDateIso: string;
  firstContactAcknowledged: boolean;
  firstContactAcknowledgedAt: string;
  emailRemindersEnabled: boolean;
  emailRemindersEnabledAt: string;
  authStartIso: string;
  authEndIso: string;
  authLengthDays: number | null;
  kaiserStatus: string;
};

const normalize = (value: unknown) => String(value || '').trim();

const isKaiserPlan = (value: unknown) =>
  normalize(value).toLowerCase().includes('kaiser');

const parseDateMs = (raw: unknown): number => {
  const value = normalize(raw);
  if (!value) return 0;
  if (typeof (raw as any)?.toMillis === 'function') {
    try {
      return (raw as any).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof (raw as any)?.toDate === 'function') {
    try {
      return (raw as any).toDate().getTime();
    } catch {
      return 0;
    }
  }
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const ms = new Date(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2])).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const toIsoLabel = (raw: unknown) => {
  const ms = parseDateMs(raw);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

const authLengthDays = (startRaw: unknown, endRaw: unknown): number | null => {
  const start = parseDateMs(startRaw);
  const end = parseDateMs(endRaw);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
};

const memberLabel = (row: Pick<StatMember, 'memberLastName' | 'memberFirstName' | 'memberMrn'>) => {
  const name = `${row.memberLastName || '—'}, ${row.memberFirstName || '—'}`.trim();
  return row.memberMrn ? `${name} · ${row.memberMrn}` : name;
};

const StatTile = ({
  title,
  value,
  hint,
  active,
  onClick,
  className,
}: {
  title: string;
  value: string | number;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cn(
      'rounded-lg border bg-white px-3 py-3 text-left transition',
      onClick ? 'hover:border-slate-400 hover:shadow-sm' : '',
      active ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200',
      className
    )}
  >
    <div className="text-xs font-medium text-muted-foreground">{title}</div>
    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
    {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
  </button>
);

export default function KaiserStatisticsPage() {
  const firestore = useFirestore();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [members, setMembers] = useState<StatMember[]>([]);
  const [masterTotalFromMeta, setMasterTotalFromMeta] = useState(0);
  const [monthlyNewFromMeta, setMonthlyNewFromMeta] = useState<Record<string, number>>({});
  const [queryText, setQueryText] = useState('');
  const [detailMode, setDetailMode] = useState<DetailMode>('all');
  const [detailKey, setDetailKey] = useState('');
  const [isRebuildingMonthly, setIsRebuildingMonthly] = useState(false);

  const loadStats = useCallback(async () => {
    if (!firestore || !isAdmin) return;
    setIsLoading(true);
    try {
      const [metaSnap, masterSnap, appsSnap] = await Promise.all([
        getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta')),
        getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION)),
        getDocs(query(collectionGroup(firestore, 'applications'), limit(5000))),
      ]);

      const meta = metaSnap.exists() ? metaSnap.data() || {} : {};
      setMasterTotalFromMeta(Number(meta.memberCount || meta.totals?.total || 0) || 0);
      setMonthlyNewFromMeta(parseIlsMifMonthlyCounts(meta.monthlyNewMembers));

      const byKey = new Map<string, StatMember>();

      const remember = (key: string, patch: Partial<StatMember> & { source: StatMember['source'] }) => {
        const existing = byKey.get(key);
        let source: StatMember['source'] = patch.source;
        if (existing) {
          if (existing.source === 'both' || patch.source === 'both') source = 'both';
          else if (existing.source !== patch.source) source = 'both';
          else source = existing.source;
        }
        const next: StatMember = {
          id: patch.id || existing?.id || key,
          source,
          applicationId: patch.applicationId || existing?.applicationId || '',
          memberFirstName: patch.memberFirstName || existing?.memberFirstName || '',
          memberLastName: patch.memberLastName || existing?.memberLastName || '',
          memberMrn: patch.memberMrn || existing?.memberMrn || '',
          memberCounty: patch.memberCounty || existing?.memberCounty || '',
          firstSeenMonthKey: patch.firstSeenMonthKey || existing?.firstSeenMonthKey || '',
          firstSeenAtIso: patch.firstSeenAtIso || existing?.firstSeenAtIso || '',
          assignedStaffName: patch.assignedStaffName || existing?.assignedStaffName || '',
          assignedDateIso: patch.assignedDateIso || existing?.assignedDateIso || '',
          firstContactAcknowledged:
            typeof patch.firstContactAcknowledged === 'boolean'
              ? patch.firstContactAcknowledged
              : Boolean(existing?.firstContactAcknowledged),
          firstContactAcknowledgedAt:
            patch.firstContactAcknowledgedAt || existing?.firstContactAcknowledgedAt || '',
          emailRemindersEnabled:
            typeof patch.emailRemindersEnabled === 'boolean'
              ? patch.emailRemindersEnabled
              : Boolean(existing?.emailRemindersEnabled),
          emailRemindersEnabledAt:
            patch.emailRemindersEnabledAt || existing?.emailRemindersEnabledAt || '',
          authStartIso: patch.authStartIso || existing?.authStartIso || '',
          authEndIso: patch.authEndIso || existing?.authEndIso || '',
          authLengthDays:
            patch.authLengthDays !== undefined && patch.authLengthDays !== null
              ? patch.authLengthDays
              : existing?.authLengthDays ?? null,
          kaiserStatus: patch.kaiserStatus || existing?.kaiserStatus || '',
        };
        byKey.set(key, next);
      };

      masterSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() || {};
        if (String(data.mergeStatus || '') === 'duplicate_in_batch') return;
        const firstName = normalize(data.memberFirstName);
        const lastName = normalize(data.memberLastName);
        if (!firstName && !lastName) return;
        const mrn = normalize(data.memberMrn);
        const key = mrn
          ? `mrn:${mrn.replace(/^0+/, '') || mrn}`.toLowerCase()
          : `name:${lastName}|${firstName}`.toLowerCase();
        const start =
          data.authorizationStartT2038 ||
          data.Authorization_Start_T2038 ||
          data.Authorization_Start_Date_T2038 ||
          '';
        const end =
          data.authorizationEndT2038 ||
          data.Authorization_End_T2038 ||
          data.Authorization_End_Date_T2038 ||
          '';
        const firstSeenAtIso = normalize(data.firstSeenAtIso || data.runAtIso || data.updatedAt);
        remember(key, {
          id: docSnap.id,
          source: 'mif',
          applicationId: normalize(data.skeletonApplicationId),
          memberFirstName: firstName,
          memberLastName: lastName,
          memberMrn: mrn,
          memberCounty: normalize(data.memberCounty) || 'Unknown county',
          firstSeenMonthKey:
            normalize(data.firstSeenMonthKey) ||
            (firstSeenAtIso ? ilsMifMonthKeyFromIso(firstSeenAtIso) : ''),
          firstSeenAtIso,
          assignedStaffName: normalize(
            data.skeletonAssignedStaffName || data.assignedStaffName
          ),
          assignedDateIso: normalize(data.skeletonCreatedAtIso || data.assignedDate),
          authStartIso: normalize(start),
          authEndIso: normalize(end),
          authLengthDays: authLengthDays(start, end),
        });
      });

      appsSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const healthPlan = data.healthPlan || data.Health_Plan || data.CalAIM_MCO || '';
        const intake = normalize(data.intakeSource || data.intakeType || '').toLowerCase();
        const isKaiser =
          isKaiserPlan(healthPlan) ||
          intake.includes('kaiser') ||
          intake.includes('ils') ||
          Boolean(data.authReceivedViaIls) ||
          isKaiserPlan(data.kaiserStatus);
        if (!isKaiser) return;

        const firstName = normalize(data.memberFirstName || data.Member_First_Name);
        const lastName = normalize(data.memberLastName || data.Member_Last_Name);
        const mrn = normalize(data.memberMrn || data.Member_MRN || data.MRN);
        const key = mrn
          ? `mrn:${mrn.replace(/^0+/, '') || mrn}`.toLowerCase()
          : `app:${docSnap.id}`;

        const start =
          data.Authorization_Start_T2038 ||
          data.Authorization_Start_Date_T2038 ||
          data.authorizationStartT2038 ||
          '';
        const end =
          data.Authorization_End_T2038 ||
          data.Authorization_End_Date_T2038 ||
          data.authorizationEndT2038 ||
          '';
        const assignedDateIso = normalize(data.assignedDate);
        const createdIso = normalize(
          data.createdAtIso ||
            (typeof data.createdAt?.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : data.createdAt) ||
            ''
        );

        remember(key, {
          id: docSnap.id,
          source: 'application',
          applicationId: docSnap.id,
          memberFirstName: firstName,
          memberLastName: lastName,
          memberMrn: mrn,
          memberCounty: normalize(data.memberCounty || data.Member_County || data.county) || '',
          firstSeenMonthKey: createdIso ? ilsMifMonthKeyFromIso(createdIso) : '',
          firstSeenAtIso: createdIso,
          assignedStaffName: normalize(data.assignedStaffName || data.assignedStaff),
          assignedDateIso,
          firstContactAcknowledged: Boolean(data.firstContactAcknowledged),
          firstContactAcknowledgedAt: normalize(data.firstContactAcknowledgedAt),
          emailRemindersEnabled: Boolean(data.emailRemindersEnabled),
          emailRemindersEnabledAt: normalize(data.emailRemindersEnabledAt),
          authStartIso: normalize(start),
          authEndIso: normalize(end),
          authLengthDays: authLengthDays(start, end),
          kaiserStatus: normalize(data.kaiserStatus || data.Kaiser_Status),
        });
      });

      setMembers(Array.from(byKey.values()));
      setHasLoaded(true);
      toast({
        title: 'Kaiser statistics loaded',
        description: `${byKey.size} Kaiser / MIF member record(s) ready.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to load Kaiser statistics',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, isAdmin, toast]);

  const masterMifCount = useMemo(() => {
    const fromRows = members.filter((m) => m.source === 'mif' || m.source === 'both').length;
    return Math.max(fromRows, masterTotalFromMeta);
  }, [members, masterTotalFromMeta]);

  const countyRows = useMemo(() => {
    const counts = new Map<string, number>();
    members
      .filter((m) => m.source === 'mif' || m.source === 'both')
      .forEach((m) => {
        const county = m.memberCounty || 'Unknown county';
        counts.set(county, (counts.get(county) || 0) + 1);
      });
    return Array.from(counts.entries())
      .map(([county, count]) => ({ county, count }))
      .sort((a, b) => b.count - a.count || a.county.localeCompare(b.county));
  }, [members]);

  const monthlyNewRows = useMemo(() => {
    const merged: Record<string, number> = { ...monthlyNewFromMeta };
    members
      .filter((m) => (m.source === 'mif' || m.source === 'both') && m.firstSeenMonthKey)
      .forEach((m) => {
        if (!monthlyNewFromMeta[m.firstSeenMonthKey]) {
          merged[m.firstSeenMonthKey] = (merged[m.firstSeenMonthKey] || 0) + 1;
        }
      });
    // Prefer meta when present; otherwise count from member first-seen.
    if (Object.keys(monthlyNewFromMeta).length) {
      return sortIlsMifMonthKeysDesc(Object.keys(monthlyNewFromMeta)).map((monthKey) => ({
        monthKey,
        label: formatIlsMifMonthLabel(monthKey),
        count: monthlyNewFromMeta[monthKey] || 0,
      }));
    }
    return sortIlsMifMonthKeysDesc(Object.keys(merged)).map((monthKey) => ({
      monthKey,
      label: formatIlsMifMonthLabel(monthKey),
      count: merged[monthKey] || 0,
    }));
  }, [members, monthlyNewFromMeta]);

  const staffRows = useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach((m) => {
      const staff = m.assignedStaffName || '';
      if (!staff) return;
      counts.set(staff, (counts.get(staff) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([staff, count]) => ({ staff, count }))
      .sort((a, b) => b.count - a.count || a.staff.localeCompare(b.staff));
  }, [members]);

  const assignedMembers = useMemo(
    () => members.filter((m) => Boolean(m.assignedStaffName)),
    [members]
  );
  const acknowledgedMembers = useMemo(
    () => members.filter((m) => m.firstContactAcknowledged),
    [members]
  );
  const reminderMembers = useMemo(
    () => members.filter((m) => m.emailRemindersEnabled),
    [members]
  );

  const avgAuthDays = useMemo(() => {
    const lengths = members
      .map((m) => m.authLengthDays)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    if (!lengths.length) return null;
    return Math.round(lengths.reduce((sum, n) => sum + n, 0) / lengths.length);
  }, [members]);

  const thisMonthKey = ilsMifMonthKeyFromIso();
  const thisMonthNew =
    monthlyNewFromMeta[thisMonthKey] ||
    monthlyNewRows.find((r) => r.monthKey === thisMonthKey)?.count ||
    0;
  const allTimeTrackedNew = monthlyNewRows.reduce((sum, row) => sum + row.count, 0);

  const rebuildMonthlyNewMembersFromMaster = async () => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    setIsRebuildingMonthly(true);
    try {
      const snap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      const rebuilt: Record<string, number> = {};
      const CHUNK = 200;
      const updates: Array<{ id: string; firstSeenAtIso: string; firstSeenMonthKey: string }> = [];
      snap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() || {};
        if (data.mergeStatus === 'duplicate_in_batch') return;
        const firstSeenAtIso = String(
          data.firstSeenAtIso || data.runAtIso || data.updatedAt || data.createdAtIso || ''
        ).trim();
        if (!firstSeenAtIso) return;
        const firstSeenMonthKey =
          String(data.firstSeenMonthKey || '').trim() || ilsMifMonthKeyFromIso(firstSeenAtIso);
        rebuilt[firstSeenMonthKey] = (rebuilt[firstSeenMonthKey] || 0) + 1;
        if (!data.firstSeenAtIso || !data.firstSeenMonthKey) {
          updates.push({ id: docSnap.id, firstSeenAtIso, firstSeenMonthKey });
        }
      });
      for (let i = 0; i < updates.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        updates.slice(i, i + CHUNK).forEach((item) => {
          batch.set(
            doc(firestore, ILS_MIF_MASTER_COLLECTION, item.id),
            {
              firstSeenAtIso: item.firstSeenAtIso,
              firstSeenMonthKey: item.firstSeenMonthKey,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'),
        {
          monthlyNewMembers: rebuilt,
          monthlyNewMembersUpdatedAtIso: nowIso,
          monthlyNewMembersRebuiltAtIso: nowIso,
        },
        { merge: true }
      );
      setMonthlyNewFromMeta(rebuilt);
      toast({
        title: 'Monthly new-member totals rebuilt',
        description: `${Object.values(rebuilt).reduce((s, n) => s + n, 0)} members across ${Object.keys(rebuilt).length} month(s).`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to rebuild monthly totals',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsRebuildingMonthly(false);
    }
  };

  const detailMembers = useMemo(() => {
    let list = members;
    if (detailMode === 'county' && detailKey) {
      list = members.filter(
        (m) =>
          (m.source === 'mif' || m.source === 'both') &&
          (m.memberCounty || 'Unknown county') === detailKey
      );
    } else if (detailMode === 'month' && detailKey) {
      list = members.filter(
        (m) => (m.source === 'mif' || m.source === 'both') && m.firstSeenMonthKey === detailKey
      );
    } else if (detailMode === 'staff' && detailKey) {
      list = members.filter((m) => m.assignedStaffName === detailKey);
    } else if (detailMode === 'assigned') {
      list = assignedMembers;
    } else if (detailMode === 'acknowledged') {
      list = acknowledgedMembers;
    } else if (detailMode === 'reminders') {
      list = reminderMembers;
    }

    const needle = queryText.trim().toLowerCase();
    if (needle) {
      list = list.filter((m) => {
        const hay = [
          m.memberFirstName,
          m.memberLastName,
          m.memberMrn,
          m.memberCounty,
          m.assignedStaffName,
          m.kaiserStatus,
          m.applicationId,
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      });
    }

    return [...list].sort((a, b) => {
      const aName = `${a.memberLastName} ${a.memberFirstName}`.toLowerCase();
      const bName = `${b.memberLastName} ${b.memberFirstName}`.toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [
    members,
    detailMode,
    detailKey,
    queryText,
    assignedMembers,
    acknowledgedMembers,
    reminderMembers,
  ]);

  const detailTitle = useMemo(() => {
    if (detailMode === 'county' && detailKey) return `Members in ${detailKey}`;
    if (detailMode === 'month' && detailKey) {
      return `New MIF members · ${formatIlsMifMonthLabel(detailKey)}`;
    }
    if (detailMode === 'staff' && detailKey) return `Assigned to ${detailKey}`;
    if (detailMode === 'assigned') return 'Members assigned to staff';
    if (detailMode === 'acknowledged') return 'Staff acknowledged assignment';
    if (detailMode === 'reminders') return 'Auto email reminders on';
    return 'All Kaiser / MIF members';
  }, [detailMode, detailKey]);

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking admin access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>Kaiser Statistics is available to admin users.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BarChart3 className="h-6 w-6" />
            Kaiser Statistics
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            MIF master list by county and month, T2038 auth length, staff assignment / acknowledgement,
            and auto email reminders — with clickable member links.
          </p>
        </div>
        <Button onClick={() => void loadStats()} disabled={isLoading || !firestore}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {hasLoaded ? 'Refresh' : 'Load statistics'}
        </Button>
      </div>

      {!hasLoaded ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Click <span className="font-medium text-slate-800">Load statistics</span> to pull the MIF
            master list and Kaiser applications.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              title="Master MIF list"
              value={masterMifCount}
              hint="Total consolidator master members"
              active={detailMode === 'all'}
              onClick={() => {
                setDetailMode('all');
                setDetailKey('');
              }}
            />
            <StatTile
              title="New this month"
              value={thisMonthNew}
              hint={formatIlsMifMonthLabel(thisMonthKey)}
              active={detailMode === 'month' && detailKey === thisMonthKey}
              onClick={() => {
                setDetailMode('month');
                setDetailKey(thisMonthKey);
              }}
            />
            <StatTile
              title="Avg T2038 auth length"
              value={avgAuthDays != null ? `${avgAuthDays}d` : '—'}
              hint="Start → end authorization days"
            />
            <StatTile
              title="Assigned to staff"
              value={assignedMembers.length}
              hint="Click for member list"
              active={detailMode === 'assigned'}
              onClick={() => {
                setDetailMode('assigned');
                setDetailKey('');
              }}
              className="border-amber-200"
            />
            <StatTile
              title="Staff acknowledged"
              value={acknowledgedMembers.length}
              hint="firstContactAcknowledged"
              active={detailMode === 'acknowledged'}
              onClick={() => {
                setDetailMode('acknowledged');
                setDetailKey('');
              }}
              className="border-emerald-200"
            />
            <StatTile
              title="Auto email reminders"
              value={reminderMembers.length}
              hint="emailRemindersEnabled"
              active={detailMode === 'reminders'}
              onClick={() => {
                setDetailMode('reminders');
                setDetailKey('');
              }}
              className="border-violet-200"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" />
                  MIF members by county
                </CardTitle>
                <CardDescription>From consolidator master list. Click a county.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-72 overflow-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>County</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countyRows.map((row) => (
                      <TableRow
                        key={row.county}
                        className={cn(
                          'cursor-pointer',
                          detailMode === 'county' && detailKey === row.county ? 'bg-blue-50' : ''
                        )}
                        onClick={() => {
                          setDetailMode('county');
                          setDetailKey(row.county);
                        }}
                      >
                        <TableCell>{row.county}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {row.count}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!countyRows.length ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No county data on master list.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarDays className="h-4 w-4" />
                      New members added by month
                    </CardTitle>
                    <CardDescription>
                      First-time MIF master adds when a Dated Consolidation Run is saved. This month:{' '}
                      <span className="font-semibold tabular-nums text-slate-800">{thisMonthNew}</span>
                      {' · '}All tracked:{' '}
                      <span className="font-semibold tabular-nums text-slate-800">{allTimeTrackedNew}</span>
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isRebuildingMonthly || !firestore || isLoading}
                    onClick={() => void rebuildMonthlyNewMembersFromMaster()}
                    title="Rebuild monthly totals from master first-seen dates"
                  >
                    {isRebuildingMonthly ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Rebuild
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-72 overflow-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">New members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyNewRows.map((row) => (
                      <TableRow
                        key={row.monthKey}
                        className={cn(
                          'cursor-pointer',
                          detailMode === 'month' && detailKey === row.monthKey ? 'bg-blue-50' : ''
                        )}
                        onClick={() => {
                          setDetailMode('month');
                          setDetailKey(row.monthKey);
                        }}
                      >
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {row.count}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!monthlyNewRows.length ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No monthly totals yet. Upload MIFs on the consolidator (auto-saves the master), or
                          click Rebuild.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Assigned staff
                </CardTitle>
                <CardDescription>Who members are assigned to. Click a name.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-72 overflow-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffRows.map((row) => (
                      <TableRow
                        key={row.staff}
                        className={cn(
                          'cursor-pointer',
                          detailMode === 'staff' && detailKey === row.staff ? 'bg-blue-50' : ''
                        )}
                        onClick={() => {
                          setDetailMode('staff');
                          setDetailKey(row.staff);
                        }}
                      >
                        <TableCell>{row.staff}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {row.count}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!staffRows.length ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No staff assignments found yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{detailTitle}</CardTitle>
                  <CardDescription>
                    {detailMembers.length} member{detailMembers.length === 1 ? '' : 's'} · click Open to
                    open the application pathway
                  </CardDescription>
                </div>
                <Input
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  placeholder="Filter name, MRN, county, staff…"
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="overflow-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead>Assigned when</TableHead>
                    <TableHead>Acknowledged</TableHead>
                    <TableHead>Reminders</TableHead>
                    <TableHead>T2038 days</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailMembers.slice(0, 400).map((row) => (
                    <TableRow key={`${row.id}-${row.applicationId || row.memberMrn}`}>
                      <TableCell className="font-medium">
                        {memberLabel(row)}
                        {row.kaiserStatus ? (
                          <div className="text-[11px] text-muted-foreground">{row.kaiserStatus}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.memberCounty || '—'}</TableCell>
                      <TableCell>{row.assignedStaffName || 'Unassigned'}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {toIsoLabel(row.assignedDateIso) || '—'}
                      </TableCell>
                      <TableCell>
                        {row.firstContactAcknowledged ? (
                          <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                            <UserCheck className="mr-1 h-3 w-3" />
                            {toIsoLabel(row.firstContactAcknowledgedAt) || 'Yes'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.emailRemindersEnabled ? (
                          <Badge className="bg-violet-100 text-violet-900 hover:bg-violet-100">
                            <Bell className="mr-1 h-3 w-3" />
                            On
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Off</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.authLengthDays != null ? `${row.authLengthDays}d` : '—'}
                      </TableCell>
                      <TableCell>
                        {row.applicationId ? (
                          <Link
                            href={`/admin/applications/${encodeURIComponent(row.applicationId)}`}
                            className="text-blue-700 underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open
                          </Link>
                        ) : (
                          <Link
                            href="/admin/tools/ils-mif-consolidator"
                            className="text-slate-600 underline-offset-2 hover:underline"
                          >
                            MIF only
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!detailMembers.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No members in this view.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              {detailMembers.length > 400 ? (
                <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                  Showing first 400 of {detailMembers.length}. Use the filter to narrow results.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
