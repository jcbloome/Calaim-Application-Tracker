'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Database, MapPin, CalendarClock } from 'lucide-react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import type { KaiserMember } from './shared';
import { getEffectiveKaiserStatus } from './shared';

export interface KaiserSummaryCardsProps {
  members: KaiserMember[];
  allKaiserStatuses: string[];
  counties: string[];
  calaimStatusOptions: string[];
  calaimStatusMap: Record<string, string>;
  normalizeCalaimStatus: (value: string) => string;
  openMemberModal: (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'staff_members',
    filterValue: string
  ) => void;
}

export function KaiserSummaryCards({
  members,
  allKaiserStatuses,
  counties,
  calaimStatusOptions,
  calaimStatusMap,
  normalizeCalaimStatus,
  openMemberModal,
}: KaiserSummaryCardsProps) {
  const auth = useAuth();
  const { isSuperAdmin, isKaiserManager } = useAdmin();
  const [assignedStaffMetaByClientId, setAssignedStaffMetaByClientId] = React.useState<
    Record<string, { lastAssignedStaffActionAt: string }>
  >({});
  const [isLoadingAssignedStaffMeta, setIsLoadingAssignedStaffMeta] = React.useState(false);
  const [assignedStaffMetaRefreshedAt, setAssignedStaffMetaRefreshedAt] = React.useState('');
  const [activeOverrideByMemberId, setActiveOverrideByMemberId] = React.useState<Record<string, any>>({});
  const [weeklyDigestStatus, setWeeklyDigestStatus] = React.useState<string>('');
  const [dailyNoActionSnapshot, setDailyNoActionSnapshot] = React.useState<{
    dayKey: string;
    start?: {
      critical: number;
      priority: number;
      capturedAt: string;
      byStaff: Record<string, { critical: number; priority: number }>;
    };
    end?: {
      critical: number;
      priority: number;
      capturedAt: string;
      byStaff: Record<string, { critical: number; priority: number }>;
    };
  } | null>(null);

  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  // Consolidated ILS request statuses:
  // - T2038 Auth Only Email
  // - T2038 Requested
  // - H2022 Requested
  // - Tier Level Requested
  // - Tier Level Appeals
  const ilsRequestStatusMatchers = [
    { key: 't2038', label: 'T2038 Auth Only Email', accepts: ['t2038 auth only email', 't2308 auth only'] },
    { key: 't2038_requested', label: 'T2038 Requested', accepts: ['t2038 requested'] },
    { key: 'h2022', label: 'H2022 Requested', accepts: ['h2022 requested'] },
    { key: 'tier', label: 'Tier Level Requested', accepts: ['tier level requested'] },
    { key: 'tier_appeals', label: 'Tier Level Appeals', accepts: ['tier level appeals', 'tier level appeal'] },
  ] as const;

  const getIlsStatusRequestBucketKey = (status: string): string | null => {
    const normalized = normalize(status);
    for (const m of ilsRequestStatusMatchers) {
      if (m.accepts.includes(normalized)) return m.key;
    }
    return null;
  };

  const hasDate = (value: unknown) => {
    const s = String(value || '').trim().toLowerCase();
    return Boolean(s) && s !== 'null' && s !== 'undefined' && s !== 'n/a';
  };

  const getAssignedStaffName = (member: KaiserMember) =>
    String(
      (member as any)?.Kaiser_Staff_Assignment ||
        member?.Staff_Assigned ||
        member?.Kaiser_User_Assignment ||
        (member as any)?.Staff_Assignment ||
        (member as any)?.Assigned_Staff ||
        ''
    ).trim();

  const isNoActionForWeek = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return true;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - parsed.getTime() >= sevenDaysMs;
  };
  const getNoActionAgeDays = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return 999;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return 999;
    return Math.floor((Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000));
  };

  const getPriorityBucket = (status: string): 'priority' | 'lesser' | 'other' => {
    const normalized = normalize(status);
    const isPriority =
      normalized === 't2038 received' ||
      normalized === 'received t2038' ||
      normalized === 't2038 received need first contact' ||
      normalized === 't2038 received needs first contact' ||
      normalized.includes('need first contact');
    if (isPriority) return 'priority';

    const isLesser =
      normalized === 't2038 received doc collection' ||
      normalized.includes('doc collection') ||
      normalized === 'rcfe needed' ||
      normalized === 'r b needed' ||
      normalized === 'r&b needed';
    if (isLesser) return 'lesser';
    return 'other';
  };

  const noActionScopedStatuses = React.useMemo(
    () => [
      'T2038 received, Need First Contact',
      'T2038 received, doc collection',
      'RCFE Needed',
      'R&B Needed',
    ],
    []
  );

  const noActionScopedStatusNormalized = React.useMemo(
    () =>
      new Set([
        ...noActionScopedStatuses.map((status) => normalize(status)),
        normalize('T2038 received, Needs First Contact'),
        normalize('R B Needed'),
      ]),
    [noActionScopedStatuses]
  );

  const isNoActionStatusInScope = (status: string): boolean => {
    return noActionScopedStatusNormalized.has(normalize(status));
  };

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const clientIds = Array.from(
        new Set(
          members
            .map((m) => String(m?.client_ID2 || '').trim())
            .filter(Boolean)
        )
      );
      if (clientIds.length === 0) {
        if (!cancelled) {
          setAssignedStaffMetaByClientId({});
          setIsLoadingAssignedStaffMeta(false);
        }
        return;
      }

      setIsLoadingAssignedStaffMeta(true);
      const nextMeta: Record<string, { lastAssignedStaffActionAt: string }> = {};
      let index = 0;
      const concurrency = 8;

      const worker = async () => {
        while (!cancelled) {
          const currentIndex = index;
          index += 1;
          if (currentIndex >= clientIds.length) return;
          const clientId2 = clientIds[currentIndex];
          const member = members.find((m) => String(m?.client_ID2 || '').trim() === clientId2);
          const assignedStaff = member ? getAssignedStaffName(member) : '';
          const query = new URLSearchParams({
            clientId2,
            skipSync: 'true',
            metaOnly: 'true',
          });
          if (assignedStaff) query.set('assignedStaff', assignedStaff);

          try {
            const res = await fetch(`/api/member-notes?${query.toString()}`);
            const data = await res.json().catch(() => ({}));
            nextMeta[clientId2] = {
              lastAssignedStaffActionAt: String(data?.lastAssignedStaffActionAt || ''),
            };
          } catch {
            nextMeta[clientId2] = { lastAssignedStaffActionAt: '' };
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      if (!cancelled) {
        setAssignedStaffMetaByClientId(nextMeta);
        setIsLoadingAssignedStaffMeta(false);
        setAssignedStaffMetaRefreshedAt(new Date().toISOString());
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [members]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!auth?.currentUser) {
        if (!cancelled) setActiveOverrideByMemberId({});
        return;
      }
      const clientIds = Array.from(new Set(members.map((m) => String(m?.client_ID2 || '').trim()).filter(Boolean)));
      if (!clientIds.length) {
        if (!cancelled) setActiveOverrideByMemberId({});
        return;
      }

      try {
        const token = await auth.currentUser.getIdToken();
        const query = new URLSearchParams({ clientIds: clientIds.join(','), activeOnly: 'true' });
        const res = await fetch(`/api/admin/kaiser-no-action-overrides?${query.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.success) {
          setActiveOverrideByMemberId((data?.byMemberId || {}) as Record<string, any>);
        }
      } catch {
        if (!cancelled) setActiveOverrideByMemberId({});
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [auth, members]);

  const noActionMembers = React.useMemo(() => {
    return members.filter((member) => {
      const clientId2 = String(member?.client_ID2 || '').trim();
      const meta = assignedStaffMetaByClientId[clientId2];
      if (!meta) return false;
      if (activeOverrideByMemberId[clientId2]) return false;
      return isNoActionForWeek(meta.lastAssignedStaffActionAt);
    });
  }, [members, assignedStaffMetaByClientId, activeOverrideByMemberId]);

  const scopedNoActionMembers = React.useMemo(
    () => noActionMembers.filter((m) => isNoActionStatusInScope(getEffectiveKaiserStatus(m))),
    [noActionMembers]
  );

  const noActionPriorityMembers = React.useMemo(
    () => scopedNoActionMembers.filter((m) => getPriorityBucket(getEffectiveKaiserStatus(m)) === 'priority'),
    [scopedNoActionMembers, getPriorityBucket]
  );
  const noActionLesserPriorityMembers = React.useMemo(
    () => scopedNoActionMembers.filter((m) => getPriorityBucket(getEffectiveKaiserStatus(m)) === 'lesser'),
    [scopedNoActionMembers, getPriorityBucket]
  );
  const currentNoActionCriticalCount = noActionPriorityMembers.length;
  const currentNoActionPriorityCount = noActionLesserPriorityMembers.length;

  const noActionByStaffRows = React.useMemo(() => {
    const grouped = scopedNoActionMembers.reduce((acc, member) => {
      const staffName = getAssignedStaffName(member) || 'Unassigned';
      if (!acc[staffName]) acc[staffName] = [];
      acc[staffName].push(member);
      return acc;
    }, {} as Record<string, KaiserMember[]>);

    return Object.entries(grouped)
      .map(([staffName, staffMembers]) => ({ staffName, staffMembers }))
      .sort((a, b) => {
        if (a.staffName === 'Unassigned') return 1;
        if (b.staffName === 'Unassigned') return -1;
        return b.staffMembers.length - a.staffMembers.length || a.staffName.localeCompare(b.staffName);
      });
  }, [scopedNoActionMembers]);

  const noActionOverviewByStaffRows = React.useMemo(() => {
    return noActionByStaffRows.map((row) => {
      const priorityMembers = row.staffMembers.filter(
        (member) => getPriorityBucket(getEffectiveKaiserStatus(member)) === 'priority'
      );
      const lesserMembers = row.staffMembers.filter(
        (member) => getPriorityBucket(getEffectiveKaiserStatus(member)) === 'lesser'
      );
      return {
        ...row,
        priorityMembers,
        lesserMembers,
      };
    });
  }, [noActionByStaffRows, getPriorityBucket]);
  const noActionByStaffCounts = React.useMemo(() => {
    return noActionOverviewByStaffRows.reduce((acc, row) => {
      acc[row.staffName] = {
        critical: row.priorityMembers.length,
        priority: row.lesserMembers.length,
      };
      return acc;
    }, {} as Record<string, { critical: number; priority: number }>);
  }, [noActionOverviewByStaffRows]);

  const noActionAgingBuckets = React.useMemo(() => {
    const members7to13 = scopedNoActionMembers.filter((member) => {
      const ageDays = getNoActionAgeDays(assignedStaffMetaByClientId[String(member?.client_ID2 || '').trim()]?.lastAssignedStaffActionAt || '');
      return ageDays >= 7 && ageDays < 14;
    });
    const members14to20 = scopedNoActionMembers.filter((member) => {
      const ageDays = getNoActionAgeDays(assignedStaffMetaByClientId[String(member?.client_ID2 || '').trim()]?.lastAssignedStaffActionAt || '');
      return ageDays >= 14 && ageDays < 21;
    });
    const members21plus = scopedNoActionMembers.filter((member) => {
      const ageDays = getNoActionAgeDays(assignedStaffMetaByClientId[String(member?.client_ID2 || '').trim()]?.lastAssignedStaffActionAt || '');
      return ageDays >= 21;
    });
    return { members7to13, members14to20, members21plus };
  }, [scopedNoActionMembers, assignedStaffMetaByClientId]);

  const getEtDayKey = React.useCallback(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  const persistDailySnapshot = React.useCallback(
    (snapshot: {
      dayKey: string;
      start?: { critical: number; priority: number; capturedAt: string };
      end?: { critical: number; priority: number; capturedAt: string };
    } | null) => {
      try {
        if (typeof window === 'undefined') return;
        const storageKey = 'kaiser-no-action-daily-snapshot-v1';
        if (!snapshot) {
          window.localStorage.removeItem(storageKey);
          return;
        }
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch {}
    },
    []
  );

  React.useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const storageKey = 'kaiser-no-action-daily-snapshot-v1';
      const raw = window.localStorage.getItem(storageKey);
      const todayKey = getEtDayKey();
      if (!raw) {
        setDailyNoActionSnapshot({ dayKey: todayKey });
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        setDailyNoActionSnapshot({ dayKey: todayKey });
        return;
      }
      const parsedDayKey = String(parsed?.dayKey || '').trim();
      if (!parsedDayKey || parsedDayKey !== todayKey) {
        const resetForToday = { dayKey: todayKey };
        setDailyNoActionSnapshot(resetForToday);
        persistDailySnapshot(resetForToday);
        return;
      }
      setDailyNoActionSnapshot({
        dayKey: parsedDayKey,
        start: parsed?.start || undefined,
        end: parsed?.end || undefined,
      });
    } catch {
      setDailyNoActionSnapshot({ dayKey: getEtDayKey() });
    }
  }, [getEtDayKey, persistDailySnapshot]);

  const captureNoActionSnapshot = React.useCallback(
    (captureType: 'start' | 'end') => {
      const nowIso = new Date().toISOString();
      const todayKey = getEtDayKey();
      setDailyNoActionSnapshot((prev) => {
        const base = prev?.dayKey === todayKey ? prev : { dayKey: todayKey };
        const next = {
          ...base,
          [captureType]: {
            critical: currentNoActionCriticalCount,
            priority: currentNoActionPriorityCount,
            capturedAt: nowIso,
            byStaff: noActionByStaffCounts,
          },
        };
        persistDailySnapshot(next);
        return next;
      });
    },
    [currentNoActionCriticalCount, currentNoActionPriorityCount, getEtDayKey, noActionByStaffCounts, persistDailySnapshot]
  );

  const startSnapshot = dailyNoActionSnapshot?.start;
  const endSnapshot = dailyNoActionSnapshot?.end;
  const criticalDelta = startSnapshot && endSnapshot ? startSnapshot.critical - endSnapshot.critical : null;
  const priorityDelta = startSnapshot && endSnapshot ? startSnapshot.priority - endSnapshot.priority : null;
  const canViewDailyProductivityTracker = isSuperAdmin || isKaiserManager;

  const staffDataQualityIssues = React.useMemo(() => {
    const issues = new Set<string>();
    members.forEach((member) => {
      const staffName = getAssignedStaffName(member);
      if (!staffName) return;
      if (/^\d+$/.test(staffName)) issues.add(`Numeric-only assignment: ${staffName}`);
      if (normalize(staffName) === 'unassigned') issues.add('Explicit "Unassigned" assignment found');
      if (staffName.length < 3) issues.add(`Very short assignment label: ${staffName}`);
    });
    return Array.from(issues);
  }, [members]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!auth?.currentUser) return;
      if (!scopedNoActionMembers.length) return;
      const today = new Date();
      const isMonday = today.getDay() === 1;
      if (!isMonday) return;

      const year = today.getUTCFullYear();
      const jan1 = new Date(Date.UTC(year, 0, 1));
      const dayOfYear = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - jan1.getTime()) / 86400000) + 1;
      const weekNumber = Math.ceil(dayOfYear / 7);
      const weekKey = `${year}-W${String(weekNumber).padStart(2, '0')}`;
      const storageKey = `kaiser-no-action-digest-sent-${weekKey}`;
      try {
        if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === '1') return;
      } catch {}

      try {
        const token = await auth.currentUser.getIdToken();
        const rows = noActionOverviewByStaffRows.map((row) => ({
          staffName: row.staffName,
          total: row.staffMembers.length,
          critical: row.priorityMembers.length,
          priority: row.lesserMembers.length,
          aged14Plus: row.staffMembers.filter((member) => {
            const ageDays = getNoActionAgeDays(
              assignedStaffMetaByClientId[String(member?.client_ID2 || '').trim()]?.lastAssignedStaffActionAt || ''
            );
            return ageDays >= 14;
          }).length,
          aged21Plus: row.staffMembers.filter((member) => {
            const ageDays = getNoActionAgeDays(
              assignedStaffMetaByClientId[String(member?.client_ID2 || '').trim()]?.lastAssignedStaffActionAt || ''
            );
            return ageDays >= 21;
          }).length,
        }));

        const res = await fetch('/api/admin/kaiser-no-action-weekly-digest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            weekKey,
            totalMembers: scopedNoActionMembers.length,
            rows,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.success) {
          try {
            if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, '1');
          } catch {}
          setWeeklyDigestStatus(`Weekly digest sent for ${weekKey}`);
        } else {
          setWeeklyDigestStatus(`Weekly digest failed for ${weekKey}`);
        }
      } catch {
        if (!cancelled) setWeeklyDigestStatus('Weekly digest failed');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [auth, scopedNoActionMembers, noActionOverviewByStaffRows, assignedStaffMetaByClientId]);

  const toValidDate = (value: unknown): Date | null => {
    if (!hasDate(value)) return null;
    try {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const isTruthyLike = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on', 'checked'].includes(normalized);
  };

  const hasH2022DateValue = (value: unknown) => hasDate(value);

  const isFinalMemberAtRcfe = (value: unknown) => {
    const normalized = normalize(String(value || ''));
    return normalized === 'final member at rcfe' || normalized === 'final at rcfe';
  };

  const isRbPendingOrFinalAtRcfeStatus = (value: unknown) => {
    const normalized = normalize(String(value || ''));
    return (
      normalized === 'r b sent pending ils contract' ||
      normalized === 'r b pending ils contract' ||
      normalized === 'final member at rcfe' ||
      normalized === 'final at rcfe'
    );
  };
  const isBiweeklyRcfeFollowupStatus = (value: unknown) => {
    const normalized = normalize(String(value || ''));
    return (
      normalized === 'r b sent pending ils contract' ||
      normalized === 'final member at rcfe'
    );
  };
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hasUnexpiredT2038Authorization = (value: unknown) => {
    const date = toValidDate(value);
    if (!date) return false;
    return startOfDay(date) >= startOfDay(new Date());
  };
  const isCalaimH2022 = (value: unknown) => normalize(String(value || '')) === 'h2022';
  const isFinalAtRcfeSummaryStatus = (status: string) => {
    const normalized = normalize(status);
    return normalized === 'final member at rcfe' || normalized === 'final at rcfe';
  };
  const matchesKaiserSummaryStatus = (member: KaiserMember, status: string) => {
    const effectiveStatus = getEffectiveKaiserStatus(member);
    if (effectiveStatus === status) return true;
    // Treat CalAIM H2022 as Final at RCFE in Kaiser summary counts.
    if (isFinalAtRcfeSummaryStatus(status) && isCalaimH2022((member as any)?.CalAIM_Status)) return true;
    return false;
  };

  const needsMoreContactInfoMembers = members.filter((m) => isTruthyLike((m as any)?.Need_More_Contact_Info_ILS));
  const missingH2022DateMembers = members.filter((m) => {
    if (!isFinalMemberAtRcfe((m as any)?.CalAIM_Status)) return false;
    const hasStart = hasH2022DateValue((m as any)?.Authorization_Start_Date_H2022);
    const hasEnd = hasH2022DateValue((m as any)?.Authorization_End_Date_H2022);
    return !hasStart || !hasEnd;
  });
  const rbAndFinalIlsConnectedMembers = members.filter((m) =>
    isRbPendingOrFinalAtRcfeStatus(getEffectiveKaiserStatus(m))
  );
  const biweeklyRcfeFollowUpMembers = members.filter((m) => {
    if (!isBiweeklyRcfeFollowupStatus(getEffectiveKaiserStatus(m))) return false;
    if (!hasUnexpiredT2038Authorization((m as any)?.Authorization_End_Date_T2038)) return false;
    const rcfeEmail = String((m as any)?.RCFE_Admin_Email || '').trim();
    return Boolean(rcfeEmail);
  });

  const ilsStatusRequestMembers = members.filter((m) => Boolean(getIlsStatusRequestBucketKey(getEffectiveKaiserStatus(m))));
  const ilsMemberRequestsMembers = members.filter((m) => {
    return (
      Boolean(getIlsStatusRequestBucketKey(getEffectiveKaiserStatus(m))) ||
      rbAndFinalIlsConnectedMembers.some((x) => x.client_ID2 === m.client_ID2) ||
      isTruthyLike((m as any)?.Need_More_Contact_Info_ILS) ||
      missingH2022DateMembers.some((x) => x.client_ID2 === m.client_ID2)
    );
  });
  const ilsMemberRequestsCount = ilsMemberRequestsMembers.length;
  const ilsMemberRequestsPct = members.length > 0 ? ((ilsMemberRequestsCount / members.length) * 100).toFixed(1) : '0';

  const ilsBreakdown = ilsRequestStatusMatchers.map((m) => ({
    ...m,
    count: ilsStatusRequestMembers.filter((x) => getIlsStatusRequestBucketKey(getEffectiveKaiserStatus(x)) === m.key).length,
  }));
  const getIlsStatusBucketMembers = (bucketKey: string) =>
    ilsStatusRequestMembers.filter((x) => getIlsStatusRequestBucketKey(getEffectiveKaiserStatus(x)) === bucketKey);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneMonthOut = new Date(startOfToday);
  oneMonthOut.setDate(oneMonthOut.getDate() + 30);
  const h2022ExpiringMembers = members.filter((m) => {
    const endDate = toValidDate((m as any)?.Authorization_End_Date_H2022);
    if (!endDate) return false;
    const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return endDay >= startOfToday && endDay <= oneMonthOut;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* ILS Member Requests Consolidated Card */}
      <Card id="ils-member-updates" className="bg-white border-l-4 border-l-cyan-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            ILS Member Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <div className="flex justify-end">
            <Link
              href="/admin/ils-report-editor"
              className="text-[11px] text-cyan-700 hover:underline"
            >
              Open ILS Member Requests page
            </Link>
          </div>
          <button
            type="button"
            className="w-full rounded-md border border-cyan-200 bg-cyan-50 p-3 text-left hover:bg-cyan-100"
            onClick={() =>
              openMemberModal(
                ilsMemberRequestsMembers,
                'ILS Member Requests',
                `${ilsMemberRequestsCount} members need weekly ILS follow-up requests`,
                'kaiser_status',
                'ils_member_requests'
              )
            }
          >
            <div className="text-xl font-bold text-cyan-700">{ilsMemberRequestsCount}</div>
            <div className="text-xs text-cyan-900/80">{ilsMemberRequestsPct}% of all Kaiser members</div>
          </button>
          <div className="space-y-1">
            {ilsBreakdown.map((row) => (
              <button
                key={row.key}
                type="button"
                className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-cyan-50"
                onClick={() =>
                  openMemberModal(
                    getIlsStatusBucketMembers(row.key),
                    `ILS Member Requests — ${row.label}`,
                    `${row.count} Kaiser members in ${row.label}`,
                    'kaiser_status',
                    `ils_member_requests_${row.key}`
                  )
                }
              >
                <span className="truncate pr-2 text-left">{row.label}</span>
                <span className="font-semibold text-cyan-800 hover:underline">{row.count}</span>
              </button>
            ))}
          </div>
          <div className="border-t pt-2 space-y-1">
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-cyan-800 hover:bg-cyan-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  rbAndFinalIlsConnectedMembers,
                  'ILS Member Requests — R & B Pending / Final at RCFE',
                  `${rbAndFinalIlsConnectedMembers.length} Kaiser members in R & B Sent Pending ILS Contract or Final at RCFE`,
                  'kaiser_status',
                  'ils_member_requests_rb_pending_or_final_rcfe'
                )
              }
            >
              <span className="truncate pr-2">R &amp; B pending + Final at RCFE (ILS Connected)</span>
              <span className="font-semibold text-cyan-800">{rbAndFinalIlsConnectedMembers.length}</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-cyan-800 hover:bg-cyan-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  needsMoreContactInfoMembers,
                  'ILS Member Requests — Need More Contact Info',
                  `${needsMoreContactInfoMembers.length} Kaiser members flagged as Need_More_Contact_Info_ILS`,
                  'kaiser_status',
                  'ils_member_requests_need_more_contact_info'
                )
              }
            >
              <span className="truncate pr-2">Need more contact info (ILS)</span>
              <span className="font-semibold text-cyan-800">{needsMoreContactInfoMembers.length}</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-cyan-800 hover:bg-cyan-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  missingH2022DateMembers,
                  'ILS Member Requests — Final at RCFE Missing H2022 Dates',
                  `${missingH2022DateMembers.length} Final- Member at RCFE members missing H2022 start or end dates`,
                  'kaiser_status',
                  'ils_member_requests_missing_h2022_dates'
                )
              }
            >
              <span className="truncate pr-2">Final at RCFE missing H2022 start/end</span>
              <span className="font-semibold text-cyan-800">{missingH2022DateMembers.length}</span>
            </button>
          </div>
          <div className="border-t pt-2 space-y-1">
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-fuchsia-700 hover:bg-fuchsia-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  biweeklyRcfeFollowUpMembers,
                  'Biweekly RCFE Follow-Up (Active T2038)',
                  `${biweeklyRcfeFollowUpMembers.length} members in R&B Sent Pending ILS Contract / Final-Member at RCFE with active T2038 authorization and RCFE admin email`,
                  'kaiser_status',
                  'biweekly_rcfe_follow_up_active_t2038'
                )
              }
            >
              <span className="truncate pr-2">Biweekly RCFE follow-up (active T2038)</span>
              <span className="font-semibold text-fuchsia-700">{biweeklyRcfeFollowUpMembers.length}</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  h2022ExpiringMembers,
                  'H2022 Ending Within 1 Month',
                  `${h2022ExpiringMembers.length} Kaiser members with Authorization_End_Date_H2022 in the next 30 days`,
                  'kaiser_status',
                  'h2022_expiring_30_days'
                )
              }
            >
              <span className="truncate pr-2">H2022 ending within 1 month</span>
              <span className="font-semibold text-blue-700">{h2022ExpiringMembers.length}</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-l-4 border-l-red-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-red-500" />
            Kaiser No Action 7+ Days
          </CardTitle>
          <div className="text-[11px] text-muted-foreground">
            Last refreshed (ET):{' '}
            {assignedStaffMetaRefreshedAt
              ? new Intl.DateTimeFormat('en-US', {
                  timeZone: 'America/New_York',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                  timeZoneName: 'short',
                }).format(new Date(assignedStaffMetaRefreshedAt))
              : 'Never'}
          </div>
          {weeklyDigestStatus ? <div className="text-[11px] text-muted-foreground">{weeklyDigestStatus}</div> : null}
          {canViewDailyProductivityTracker ? (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              <span className="font-semibold">Daily progress (ET):</span>{' '}
              {criticalDelta === null || priorityDelta === null
                ? 'Capture beginning and end of day to see down/up movement.'
                : `Critical ${criticalDelta > 0 ? 'down' : criticalDelta < 0 ? 'up' : 'no change'} ${Math.abs(
                    criticalDelta
                  )}, Priority ${priorityDelta > 0 ? 'down' : priorityDelta < 0 ? 'up' : 'no change'} ${Math.abs(
                    priorityDelta
                  )}`}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <button
            type="button"
            className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100"
            onClick={() =>
              openMemberModal(
                scopedNoActionMembers,
                'Kaiser No Action 7+ Days',
                `${scopedNoActionMembers.length} members with no notes from their assigned Kaiser staff in 7+ days`,
                'staff_assignment',
                'kaiser_no_action_7_days'
              )
            }
          >
            <div className="text-xl font-bold text-red-700">
              {isLoadingAssignedStaffMeta ? '...' : scopedNoActionMembers.length}
            </div>
            <div className="text-xs text-red-900/80">
              No assigned-staff action in 7+ days (non-Kaiser Staff Assigned notes do not clear notes)
            </div>
          </button>

          <div className="space-y-1 border-t pt-2">
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  noActionAgingBuckets.members7to13,
                  'No Action Aging — 7 to 13 days',
                  `${noActionAgingBuckets.members7to13.length} members with no assigned-staff note for 7-13 days`,
                  'staff_assignment',
                  'kaiser_no_action_aging_7_13'
                )
              }
            >
              <span className="truncate pr-2">Aging: 7-13 days</span>
              <span className="font-semibold">{noActionAgingBuckets.members7to13.length}</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  noActionAgingBuckets.members14to20,
                  'No Action Aging — 14 to 20 days',
                  `${noActionAgingBuckets.members14to20.length} members with no assigned-staff note for 14-20 days`,
                  'staff_assignment',
                  'kaiser_no_action_aging_14_20'
                )
              }
            >
              <span className="truncate pr-2">Aging: 14-20 days</span>
              <span className="font-semibold">{noActionAgingBuckets.members14to20.length}</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-red-800 hover:bg-red-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  noActionAgingBuckets.members21plus,
                  'No Action Aging — 21+ days',
                  `${noActionAgingBuckets.members21plus.length} members with no assigned-staff note for 21+ days`,
                  'staff_assignment',
                  'kaiser_no_action_aging_21_plus'
                )
              }
            >
              <span className="truncate pr-2">Aging: 21+ days</span>
              <span className="font-semibold">{noActionAgingBuckets.members21plus.length}</span>
            </button>
          </div>

          <div className="space-y-1 border-t pt-2">
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-red-800 hover:bg-red-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  noActionPriorityMembers,
                  'Critical No Action — Received T2038 / Needs First Contact',
                  `${noActionPriorityMembers.length} critical members with no assigned-staff action in 7+ days`,
                  'kaiser_status',
                  'kaiser_no_action_priority'
                )
              }
            >
              <span className="truncate pr-2">Critical: Received T2038 / Needs First Contact</span>
              <span className="font-semibold">{noActionPriorityMembers.length}</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50 hover:underline"
              onClick={() =>
                openMemberModal(
                  noActionLesserPriorityMembers,
                  'Priority No Action — Doc Collection / RCFE Needed / R&B Needed',
                  `${noActionLesserPriorityMembers.length} priority members with no assigned-staff action in 7+ days`,
                  'kaiser_status',
                  'kaiser_no_action_lesser_priority'
                )
              }
            >
              <span className="truncate pr-2">Priority: Doc Collection / RCFE Needed / R&amp;B Needed</span>
              <span className="font-semibold">{noActionLesserPriorityMembers.length}</span>
            </button>
          </div>

          {canViewDailyProductivityTracker ? (
            <div className="space-y-2 border-t pt-2 rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-700">
                  Daily Critical/Priority Tracking (ET)
                </div>
                <div className="text-[10px] text-slate-600">{dailyNoActionSnapshot?.dayKey || getEtDayKey()}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800 hover:bg-slate-100"
                  onClick={() => captureNoActionSnapshot('start')}
                >
                  Capture Beginning of Day
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800 hover:bg-slate-100"
                  onClick={() => captureNoActionSnapshot('end')}
                >
                  Capture End of Day
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-700">
                <div className="rounded border border-slate-200 bg-white px-2 py-1">
                  <span className="font-semibold">Beginning of day:</span>{' '}
                  {startSnapshot
                    ? `Critical ${startSnapshot.critical}, Priority ${startSnapshot.priority} (saved ${formatEtDateTime(
                        startSnapshot.capturedAt
                      )})`
                    : 'Not captured'}
                </div>
                <div className="rounded border border-slate-200 bg-white px-2 py-1">
                  <span className="font-semibold">End of day:</span>{' '}
                  {endSnapshot
                    ? `Critical ${endSnapshot.critical}, Priority ${endSnapshot.priority} (saved ${formatEtDateTime(
                        endSnapshot.capturedAt
                      )})`
                    : 'Not captured'}
                </div>
                <div className="rounded border border-slate-200 bg-white px-2 py-1">
                  <span className="font-semibold">Change (BOD → EOD):</span>{' '}
                  {criticalDelta === null || priorityDelta === null
                    ? 'Capture both beginning and end of day to calculate'
                    : `Critical ${criticalDelta > 0 ? 'down' : criticalDelta < 0 ? 'up' : 'no change'} ${Math.abs(
                        criticalDelta
                      )}, Priority ${priorityDelta > 0 ? 'down' : priorityDelta < 0 ? 'up' : 'no change'} ${Math.abs(
                        priorityDelta
                      )}`}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-1 border-t pt-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Global overview by assigned Kaiser staff</div>
            {noActionOverviewByStaffRows.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {isLoadingAssignedStaffMeta ? 'Loading staff breakdown...' : 'No members currently flagged.'}
              </div>
            ) : (
              noActionOverviewByStaffRows.map((row) => (
                <div key={`no-action-staff-${row.staffName}`} className="rounded border border-red-100 bg-red-50/30 p-1.5">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-red-50"
                    onClick={() =>
                      openMemberModal(
                        row.staffMembers,
                        `No Action 7+ Days — ${row.staffName}`,
                        `${row.staffMembers.length} members assigned to ${row.staffName} with no assigned-staff action in 7+ days`,
                        'staff_assignment',
                        row.staffName
                      )
                    }
                  >
                    <span className="truncate pr-2 text-left font-medium">{row.staffName}</span>
                    <span className="font-semibold text-red-700 hover:underline">{row.staffMembers.length}</span>
                  </button>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                    {(() => {
                      const startByStaff = startSnapshot?.byStaff?.[row.staffName];
                      const startCritical = Number(startByStaff?.critical || 0);
                      const startPriority = Number(startByStaff?.priority || 0);
                      return (
                        <>
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-white px-1 py-0.5 text-red-800 hover:bg-red-100"
                      onClick={() =>
                        openMemberModal(
                          row.priorityMembers,
                          `No Action Critical — ${row.staffName}`,
                          `${row.priorityMembers.length} critical no-action members for ${row.staffName}`,
                          'staff_assignment',
                          `${row.staffName}_priority`
                        )
                      }
                    >
                      Critical: {row.priorityMembers.length}
                      {canViewDailyProductivityTracker ? ` (start ${startCritical})` : ''}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-amber-200 bg-white px-1 py-0.5 text-amber-800 hover:bg-amber-100"
                      onClick={() =>
                        openMemberModal(
                          row.lesserMembers,
                          `No Action Priority — ${row.staffName}`,
                          `${row.lesserMembers.length} priority no-action members for ${row.staffName}`,
                          'staff_assignment',
                          `${row.staffName}_lesser`
                        )
                      }
                    >
                      Priority: {row.lesserMembers.length}
                      {canViewDailyProductivityTracker ? ` (start ${startPriority})` : ''}
                    </button>
                    <div className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-center text-slate-500">
                      Scoped statuses only
                    </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1 border-t pt-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Data quality checks (assignment matching)</div>
            <div className="text-[11px] text-muted-foreground">
              Alias table matching is enabled for assigned-staff note detection.
            </div>
            <div className="text-[11px] text-muted-foreground">
              Active manager overrides: {Object.keys(activeOverrideByMemberId).length}
            </div>
            {staffDataQualityIssues.length > 0 ? (
              <div className="text-[11px] text-amber-700">
                Potential assignment-name issues: {staffDataQualityIssues.length}
              </div>
            ) : (
              <div className="text-[11px] text-emerald-700">No assignment-name issues detected.</div>
            )}
          </div>

          <div className="space-y-1 border-t pt-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Scoped Kaiser_Status values (No Action 7+ Days)</div>
            <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground">
              {noActionScopedStatuses.map((status) => (
                <div key={`no-action-scope-${status}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                  {status}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kaiser Status Summary Card */}
      <Card className="bg-white border-l-4 border-l-blue-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-gray-400" />
            Kaiser Status Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {allKaiserStatuses.map((status, index) => {
              const count = members.filter((m) => matchesKaiserSummaryStatus(m, status)).length;
              const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
              return (
                <div
                  key={`kaiser-${index}-${status}`}
                  className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                  onClick={() => {
                    if (members.length > 0) {
                      const filteredMembers = members.filter((m) => matchesKaiserSummaryStatus(m, status));
                      openMemberModal(
                        filteredMembers,
                        `${status} Members`,
                        `${count} members with status: ${status}`,
                        'kaiser_status',
                        status
                      );
                    }
                  }}
                >
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                    <span className="font-medium truncate" title={status}>
                      {status}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-blue-600">{count}</span>
                    {members.length > 0 && count > 0 && <span className="text-gray-500 ml-1">({percentage}%)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* CalAIM Status Summary Card */}
      <Card className="bg-white border-l-4 border-l-green-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-4 w-4 text-gray-400" />
            CalAIM Status Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1">
            {calaimStatusOptions.map((status, index) => {
              const count = members.filter((m) => {
                const normalized = normalizeCalaimStatus(m.CalAIM_Status || '');
                return calaimStatusMap[normalized] === status;
              }).length;
              const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
              return (
                <div
                  key={`calaim-${index}-${status}`}
                  className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                  onClick={() => {
                    if (members.length > 0) {
                      const filteredMembers = members.filter((m) => {
                        const normalized = normalizeCalaimStatus(m.CalAIM_Status || '');
                        return calaimStatusMap[normalized] === status;
                      });
                      openMemberModal(
                        filteredMembers,
                        `${status} Members`,
                        `${count} members with CalAIM status: ${status}`,
                        'calaim_status',
                        status
                      );
                    }
                  }}
                >
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                    <span className="font-medium">{status}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-green-600">{count}</span>
                    {members.length > 0 && count > 0 && <span className="text-gray-500 ml-1">({percentage}%)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* County Summary Card */}
      <Card className="bg-white border-l-4 border-l-purple-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-gray-400" />
            County Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {counties.map((county, index) => {
              const count = members.filter((m) => m.memberCounty === county).length;
              const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
              return (
                <div
                  key={`county-${index}-${county}`}
                  className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                  onClick={() => {
                    if (members.length > 0) {
                      const filteredMembers = members.filter((m) => m.memberCounty === county);
                      openMemberModal(
                        filteredMembers,
                        `${county} County Members`,
                        `${count} members in ${county} County`,
                        'county',
                        county
                      );
                    }
                  }}
                >
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                    <span className="font-medium">{county} County</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-purple-600">{count}</span>
                    {members.length > 0 && count > 0 && <span className="text-gray-500 ml-1">({percentage}%)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

