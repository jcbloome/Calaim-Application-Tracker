'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import {
  clientIdOf,
  clean,
  resolveKaiserStatusValue,
  isRnVisitNeededStatus,
  toName,
  type KaiserMember,
} from './isp-workflow-helpers';
import { Badge } from '@/components/ui/badge';
import { type Dispatch, type SetStateAction } from 'react';

export interface MemberListCardProps {
  filteredMembers: KaiserMember[];
  statusFilter: "all" | "rn_visit_needed";
  setMemberSortDir: Dispatch<SetStateAction<"asc" | "desc">>;
  memberSortDir: "asc" | "desc";
  selectedClientId: string;
  requestSelectMember: (member: KaiserMember) => Promise<void>;
  checkingPriorInvite: boolean;
  members: KaiserMember[];
}

export function MemberListCard({
  filteredMembers,
  statusFilter,
  setMemberSortDir,
  memberSortDir,
  selectedClientId,
  requestSelectMember,
  checkingPriorInvite,
  members,
}: MemberListCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Members</CardTitle>
            <CardDescription>
              {filteredMembers.length} results
              {statusFilter === 'rn_visit_needed' ? ' · Kaiser Status: RN Visit Needed' : ''}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setMemberSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            title={
              memberSortDir === 'asc'
                ? 'Sorted by last name A–Z — click for Z–A'
                : 'Sorted by last name Z–A — click for A–Z'
            }
          >
            {memberSortDir === 'asc' ? (
              <ArrowDownAZ className="mr-1.5 h-4 w-4" />
            ) : (
              <ArrowUpAZ className="mr-1.5 h-4 w-4" />
            )}
            Last name {memberSortDir === 'asc' ? 'A–Z' : 'Z–A'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {filteredMembers.map((member, index) => {
            const clientId2 = clientIdOf(member);
            const isSelected = clientId2 === clean(selectedClientId);
            const kaiserStatus = resolveKaiserStatusValue(member);
            const rnVisitNeeded = isRnVisitNeededStatus(kaiserStatus);
            return (
              <button
                type="button"
                key={`${clientId2}-${index}`}
                onClick={() => void requestSelectMember(member)}
                disabled={checkingPriorInvite}
                className={`w-full rounded-md border p-3 text-left transition ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/40'
                }`}
              >
                <div className="font-medium">{toName(member)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {clientId2 || 'No Client_ID2'} · MRN {clean(member.memberMrn) || 'N/A'}
                </div>
                {kaiserStatus ? (
                  <div className="mt-1.5">
                    <Badge
                      variant="outline"
                      className={
                        rnVisitNeeded
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'text-muted-foreground'
                      }
                    >
                      {kaiserStatus}
                    </Badge>
                  </div>
                ) : null}
              </button>
            );
          })}
          {filteredMembers.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {members.length === 0
                ? 'Click Load to resume saved work, or Sync from Caspio for a fresh list.'
                : statusFilter === 'rn_visit_needed'
                  ? 'No members with Kaiser Status “RN Visit Needed”. Try Sync from Caspio.'
                  : 'No members match this search.'}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
