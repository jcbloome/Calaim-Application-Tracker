'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Database, MapPin } from 'lucide-react';
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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

