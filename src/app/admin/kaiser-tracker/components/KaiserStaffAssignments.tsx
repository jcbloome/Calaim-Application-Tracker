'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Users } from 'lucide-react';
import type { KaiserMember } from './shared';
import { getEffectiveKaiserStatus } from './shared';

const PINNED_TOP_STATUS = 'T2038 received, Need First Contact';
const normalizeStatusText = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const FIRST_CONTACT_STATUS_TOKENS = new Set([
  normalizeStatusText('T2038 received, Need First Contact'),
  normalizeStatusText('T2038 received, Needs First Contact'),
]);
const isTargetFirstContactStatus = (value: string) => FIRST_CONTACT_STATUS_TOKENS.has(normalizeStatusText(value));
const wasAddedSinceYesterday = (value: unknown): boolean => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return false;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 1);
  return parsed.getTime() >= since.getTime();
};

export interface StaffAssignmentData {
  count: number;
  members: KaiserMember[];
  statusBreakdown: Record<string, number>;
}

export interface KaiserStaffAssignmentsProps {
  allStaff: string[];
  staffAssignments: Record<string, StaffAssignmentData>;
  openStaffMemberModal: (staffName: string, members: KaiserMember[]) => void;
  onSyncStaffNotes: (staffName: string, members: KaiserMember[]) => void;
  activeSyncStaffName?: string | null;
  notesSyncing?: boolean;
  openMemberModal: (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'staff_members',
    filterValue: string
  ) => void;
}

export function KaiserStaffAssignments({
  allStaff,
  staffAssignments,
  openStaffMemberModal,
  onSyncStaffNotes,
  activeSyncStaffName,
  notesSyncing,
  openMemberModal,
}: KaiserStaffAssignmentsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Kaiser Staff Assignments</h3>

      {/* Staff Summary Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-l-blue-500 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            All Kaiser Staff Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div
            className={`grid gap-4 ${
              allStaff.length <= 3 ? 'grid-cols-3' : allStaff.length <= 4 ? 'grid-cols-4' : 'grid-cols-5'
            }`}
          >
            {allStaff.map((staffName) => {
              const assignment = staffAssignments[staffName];
              const isUnassigned = staffName === 'Unassigned';
              const isCaseClosed = staffName === 'Case Closed';
              return (
                <div key={`summary-${staffName}`} className="text-center">
                  <button
                    onClick={() => assignment.count > 0 && openStaffMemberModal(staffName, assignment.members)}
                    className={`block w-full p-3 rounded-lg border transition-all ${
                      assignment.count > 0
                        ? isUnassigned
                          ? 'bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 cursor-pointer shadow-sm hover:shadow-md'
                          : isCaseClosed
                            ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-slate-400 cursor-pointer shadow-sm hover:shadow-md'
                          : 'bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 cursor-pointer shadow-sm hover:shadow-md'
                        : 'bg-gray-50 border-gray-200 cursor-default'
                    }`}
                    disabled={assignment.count === 0}
                  >
                    <div
                      className={`font-semibold text-sm mb-1 ${
                        isUnassigned ? 'text-gray-700' : isCaseClosed ? 'text-slate-700' : 'text-gray-900'
                      }`}
                    >
                      {staffName}
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        assignment.count > 0
                          ? isUnassigned
                            ? 'text-gray-600'
                            : isCaseClosed
                              ? 'text-slate-700'
                            : 'text-blue-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {assignment.count}
                    </div>
                    <div className="text-xs text-gray-500">{assignment.count === 1 ? 'member' : 'members'}</div>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="text-center">
              <span className="text-sm text-gray-600">Total Members: </span>
              <span className="font-semibold text-lg text-blue-600">
                {allStaff.reduce((total, staff) => total + staffAssignments[staff].count, 0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Status Breakdown Cards */}
      <div
        className={`grid grid-cols-1 gap-4 ${
          allStaff.length <= 3 ? 'md:grid-cols-3' : allStaff.length <= 4 ? 'md:grid-cols-4' : 'md:grid-cols-5'
        }`}
      >
        {allStaff.map((staffName) => {
          const assignment = staffAssignments[staffName];
          const isUnassigned = staffName === 'Unassigned';
          const isCaseClosed = staffName === 'Case Closed';
          const newFirstContactMembers = assignment.members.filter((member) => {
            if (!isTargetFirstContactStatus(getEffectiveKaiserStatus(member))) return false;
            return wasAddedSinceYesterday((member as any)?.created_at || (member as any)?.last_updated);
          });
          const newFirstContactCount = newFirstContactMembers.length;
          return (
            <Card
              key={`staff-status-${staffName}`}
              className={`bg-white border-l-4 shadow ${
                isUnassigned ? 'border-l-gray-400' : isCaseClosed ? 'border-l-slate-500' : 'border-l-orange-500'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle className={`h-4 w-4 ${isUnassigned ? 'text-gray-500' : isCaseClosed ? 'text-slate-600' : 'text-orange-600'}`} />
                    {staffName} - Status
                  </CardTitle>
                  {newFirstContactCount > 0 ? (
                    <button
                      type="button"
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                      onClick={() =>
                        openMemberModal(
                          newFirstContactMembers,
                          `${staffName} - New First Contact (since yesterday)`,
                          `${newFirstContactCount} new member${newFirstContactCount === 1 ? '' : 's'} in T2038 received, Need(s) First Contact since yesterday`,
                          'kaiser_status',
                          't2038_need_first_contact_new_since_yesterday'
                        )
                      }
                    >
                      New since yesterday: {newFirstContactCount}
                    </button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={assignment.count === 0 || Boolean(notesSyncing)}
                    onClick={() => onSyncStaffNotes(staffName, assignment.members)}
                    className="h-7 px-2 text-xs"
                  >
                    {notesSyncing && activeSyncStaffName === staffName ? 'Syncing…' : 'Sync Notes'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {assignment.count === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <div className="text-sm">No members assigned</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Status Breakdown */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-700 mb-2">Current Status</h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {Object.entries(assignment.statusBreakdown)
                          .sort(([statusA, countA], [statusB, countB]) => {
                            const pinned = normalizeStatusText(PINNED_TOP_STATUS);
                            const aPinned = normalizeStatusText(statusA) === pinned;
                            const bPinned = normalizeStatusText(statusB) === pinned;
                            if (aPinned && !bPinned) return -1;
                            if (!aPinned && bPinned) return 1;
                            return countB - countA;
                          })
                          .map(([status, count]) => (
                            <div key={`${staffName}-status-${status}`} className="flex justify-between items-center text-xs">
                              <span className="truncate pr-2" title={status}>
                                {status}
                              </span>
                              <button
                                onClick={() => {
                                  // Filter members by this staff and status
                                  const statusMembers = assignment.members.filter(
                                    (member) => getEffectiveKaiserStatus(member) === status
                                  );
                                  openMemberModal(
                                    statusMembers,
                                    `${staffName} - ${status}`,
                                    `${count} members with status: ${status}`,
                                    'kaiser_status',
                                    status
                                  );
                                }}
                                className="font-semibold text-orange-600 hover:text-orange-800 cursor-pointer hover:underline"
                              >
                                {count}
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

