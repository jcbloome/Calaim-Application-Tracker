'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Database, MapPin, CalendarClock } from 'lucide-react';
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
  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const rnVisitNeededMembers = members.filter((m) => getEffectiveKaiserStatus(m) === 'RN Visit Needed');
  const rnVisitNeededCount = rnVisitNeededMembers.length;
  const rnVisitNeededPct = members.length > 0 ? ((rnVisitNeededCount / members.length) * 100).toFixed(1) : '0';

  // Consolidated ILS updates:
  // - T2038 Auth Only Email
  // - H2022 Requested
  // - Tier Level Requested
  // - R&B Sent (mapped to R&B Signed)
  // - Pending ILS Contract (mapped to contract-email-needed statuses)
  const ilsUpdateMatchers = [
    { key: 't2038', label: 'T2038 Auth Only', accepts: ['t2038 auth only email', 't2308 auth only'] },
    { key: 'h2022', label: 'H2022 Requested', accepts: ['h2022 requested'] },
    { key: 'tier', label: 'Tier Level Requested', accepts: ['tier level requested'] },
    { key: 'rb', label: 'R&B Sent', accepts: ['r b signed', 'r b sent'] },
    {
      key: 'ilsContract',
      label: 'Pending ILS Contract',
      accepts: ['ils contract email needed', 'ils rcfe contract email needed', 'ils sent for contract'],
    },
  ] as const;

  const getIlsBucketKey = (status: string): string | null => {
    const normalized = normalize(status);
    for (const m of ilsUpdateMatchers) {
      if (m.accepts.includes(normalized)) return m.key;
    }
    return null;
  };

  const ilsMemberUpdatesMembers = members.filter((m) => Boolean(getIlsBucketKey(getEffectiveKaiserStatus(m))));
  const ilsMemberUpdatesCount = ilsMemberUpdatesMembers.length;
  const ilsMemberUpdatesPct = members.length > 0 ? ((ilsMemberUpdatesCount / members.length) * 100).toFixed(1) : '0';
  const ilsBreakdown = ilsUpdateMatchers.map((m) => ({
    ...m,
    count: ilsMemberUpdatesMembers.filter((x) => getIlsBucketKey(getEffectiveKaiserStatus(x)) === m.key).length,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* RN Visit Needed Consolidated Card */}
      <Card className="bg-white border-l-4 border-l-amber-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            RN Visit Needed
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <button
            type="button"
            className="w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100"
            onClick={() =>
              openMemberModal(
                rnVisitNeededMembers,
                'RN Visit Needed',
                `${rnVisitNeededCount} members currently in RN Visit Needed`,
                'kaiser_status',
                'RN Visit Needed'
              )
            }
          >
            <div className="text-xl font-bold text-amber-700">{rnVisitNeededCount}</div>
            <div className="text-xs text-amber-900/80">{rnVisitNeededPct}% of all Kaiser members</div>
          </button>
        </CardContent>
      </Card>

      {/* ILS Member Updates Consolidated Card */}
      <Card className="bg-white border-l-4 border-l-cyan-500 shadow">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            ILS Member Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <button
            type="button"
            className="w-full rounded-md border border-cyan-200 bg-cyan-50 p-3 text-left hover:bg-cyan-100"
            onClick={() =>
              openMemberModal(
                ilsMemberUpdatesMembers,
                'ILS Member Updates',
                `${ilsMemberUpdatesCount} members in consolidated ILS update statuses`,
                'kaiser_status',
                'ils_member_updates'
              )
            }
          >
            <div className="text-xl font-bold text-cyan-700">{ilsMemberUpdatesCount}</div>
            <div className="text-xs text-cyan-900/80">{ilsMemberUpdatesPct}% of all Kaiser members</div>
          </button>
          <div className="space-y-1">
            {ilsBreakdown.map((row) => (
              <div key={row.key} className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate pr-2">{row.label}</span>
                <span className="font-semibold text-slate-700">{row.count}</span>
              </div>
            ))}
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
              const count = members.filter((m) => getEffectiveKaiserStatus(m) === status).length;
              const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
              return (
                <div
                  key={`kaiser-${index}-${status}`}
                  className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                  onClick={() => {
                    if (members.length > 0) {
                      const filteredMembers = members.filter((m) => getEffectiveKaiserStatus(m) === status);
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
                    <span className="font-medium truncate">{status}</span>
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

