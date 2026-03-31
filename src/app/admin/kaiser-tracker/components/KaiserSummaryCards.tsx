'use client';

import React from 'react';
import Link from 'next/link';
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

  // Consolidated ILS request statuses:
  // - T2038 Auth Only Email
  // - T2038 Requested
  // - H2022 Requested
  // - Tier Level Requested
  const ilsRequestStatusMatchers = [
    { key: 't2038', label: 'T2038 Auth Only Email', accepts: ['t2038 auth only email', 't2308 auth only'] },
    { key: 't2038_requested', label: 'T2038 Requested', accepts: ['t2038 requested'] },
    { key: 'h2022', label: 'H2022 Requested', accepts: ['h2022 requested'] },
    { key: 'tier', label: 'Tier Level Requested', accepts: ['tier level requested'] },
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
    return normalized === 'final member at rcfe';
  };

  const needsMoreContactInfoMembers = members.filter((m) => isTruthyLike((m as any)?.Need_More_Contact_Info_ILS));
  const missingH2022DateMembers = members.filter((m) => {
    if (!isFinalMemberAtRcfe((m as any)?.CalAIM_Status)) return false;
    const hasStart = hasH2022DateValue((m as any)?.Authorization_Start_Date_H2022);
    const hasEnd = hasH2022DateValue((m as any)?.Authorization_End_Date_H2022);
    return !hasStart || !hasEnd;
  });

  const ilsStatusRequestMembers = members.filter((m) => Boolean(getIlsStatusRequestBucketKey(getEffectiveKaiserStatus(m))));
  const ilsMemberRequestsMembers = members.filter((m) => {
    return (
      Boolean(getIlsStatusRequestBucketKey(getEffectiveKaiserStatus(m))) ||
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
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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

