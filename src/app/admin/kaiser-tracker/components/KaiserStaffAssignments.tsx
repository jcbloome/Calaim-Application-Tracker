'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import type { KaiserMember } from './shared';
import { getEffectiveKaiserStatus } from './shared';

const PINNED_TOP_STATUS = 'T2038 received, Need First Contact';
const normalizeStatusText = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const buildNoActionScopedSet = (statuses?: string[]) => {
  const base = Array.isArray(statuses) ? statuses : [];
  return new Set(
    [...base, 'T2038 received, Needs First Contact', 'R B Needed'].map((status) => normalizeStatusText(status))
  );
};

export interface StaffAssignmentData {
  count: number;
  members: KaiserMember[];
  statusBreakdown: Record<string, number>;
}

export interface NoActionStaffSummary {
  staffName: string;
  totalMembers: KaiserMember[];
  criticalMembers: KaiserMember[];
  priorityMembers: KaiserMember[];
  todayNotedMembers: KaiserMember[];
  yesterdayNotedMembers: KaiserMember[];
  total: number;
  critical: number;
  priority: number;
  notesTodayTotal: number;
  notesYesterdayTotal: number;
  membersWithNotesToday: number;
  membersWithNotesYesterday: number;
}

export interface KaiserStaffAssignmentsProps {
  allStaff: string[];
  staffAssignments: Record<string, StaffAssignmentData>;
  openStaffMemberModal: (staffName: string, members: KaiserMember[]) => void;
  openMemberModal: (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'staff_members',
    filterValue: string
  ) => void;
  noActionByStaff?: Record<string, NoActionStaffSummary>;
  noActionScopedStatuses?: string[];
  onRefreshNoAction?: () => void;
  isRefreshingNoAction?: boolean;
  notesSyncLastAtLabel?: string;
  onSubmitDailyUpdate?: (payload: {
    staffName: string;
    members: Array<{ clientId2: string; memberName: string; currentStatus: string }>;
    metrics: {
      totalAssigned: number;
      activeAssigned: number;
      passiveAssigned: number;
      noActionTotal: number;
      noActionCritical: number;
      noActionPriority: number;
      notesTodayCount: number;
    };
  }) => void;
  dailyUpdateSubmittingStaff?: string;
  dailyUpdateSubmittedAtByStaff?: Record<string, string>;
}

export function KaiserStaffAssignments({
  allStaff,
  staffAssignments,
  openStaffMemberModal,
  openMemberModal,
  noActionByStaff,
  noActionScopedStatuses,
  onRefreshNoAction,
  isRefreshingNoAction,
  notesSyncLastAtLabel,
  onSubmitDailyUpdate,
  dailyUpdateSubmittingStaff,
  dailyUpdateSubmittedAtByStaff,
}: KaiserStaffAssignmentsProps) {
  const noActionScopedSet = React.useMemo(
    () => buildNoActionScopedSet(noActionScopedStatuses),
    [noActionScopedStatuses]
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Kaiser Staff Assignments</h3>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        {onRefreshNoAction ? (
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            onClick={onRefreshNoAction}
            disabled={Boolean(isRefreshingNoAction)}
          >
            {isRefreshingNoAction ? 'Syncing...' : 'Sync Notes Today'}
          </Button>
        ) : null}
        <div className="text-xs text-muted-foreground mt-2">
          {onRefreshNoAction
            ? 'Pulls notes from Caspio (historical + new) into Firestore and refreshes Recent Notes + No Action 7+ Days.'
            : 'Recent Notes sync is available to Super Admin and Kaiser Admin only.'}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Notes sync (ET): {notesSyncLastAtLabel || 'Never'}
        </div>
        {Array.isArray(noActionScopedStatuses) && noActionScopedStatuses.length > 0 ? (
          <div className="text-xs text-muted-foreground mt-1">
            No Action 7+ Days scoped fields: {noActionScopedStatuses.join(' | ')}
          </div>
        ) : null}
      </div>

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
          const noAction = noActionByStaff?.[staffName];
          const criticalMembers = noAction?.criticalMembers || [];
          const priorityMembers = noAction?.priorityMembers || [];
          const todayNotedMembers = noAction?.todayNotedMembers || [];
          const yesterdayNotedMembers = noAction?.yesterdayNotedMembers || [];
          const total = Number(noAction?.total || 0);
          const critical = Number(noAction?.critical || 0);
          const priority = Number(noAction?.priority || 0);
          const notesTodayTotal = Number(noAction?.notesTodayTotal || 0);
          const notesYesterdayTotal = Number(noAction?.notesYesterdayTotal || 0);
          const membersWithNotesToday = Number(noAction?.membersWithNotesToday || 0);
          const membersWithNotesYesterday = Number(noAction?.membersWithNotesYesterday || 0);
          const activeActionMembers = assignment.members.filter((member) =>
            noActionScopedSet.has(normalizeStatusText(getEffectiveKaiserStatus(member)))
          );
          const activeActionCount = activeActionMembers.length;
          const passiveMembers = assignment.members.filter((member) =>
            !noActionScopedSet.has(normalizeStatusText(getEffectiveKaiserStatus(member)))
          );
          const passiveCount = passiveMembers.length;
          const dailySubmittedAt = String(dailyUpdateSubmittedAtByStaff?.[staffName] || '').trim();
          const isSubmittingDaily = String(dailyUpdateSubmittingStaff || '').trim() === staffName;
          const cardMembersPayload = assignment.members.map((member) => ({
            clientId2: String((member as any)?.client_ID2 || '').trim(),
            memberName: `${String((member as any)?.memberFirstName || '').trim()} ${String((member as any)?.memberLastName || '').trim()}`.trim(),
            currentStatus: String(getEffectiveKaiserStatus(member) || '').trim(),
          }));
          return (
            <Card
              key={`staff-status-${staffName}`}
              className={`bg-white border-l-4 shadow ${
                isUnassigned ? 'border-l-gray-400' : isCaseClosed ? 'border-l-slate-500' : 'border-l-orange-500'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base min-w-0">
                      <CheckCircle
                        className={`h-4 w-4 shrink-0 ${isUnassigned ? 'text-gray-500' : isCaseClosed ? 'text-slate-600' : 'text-orange-600'}`}
                      />
                      <span className="truncate">{staffName} - Status</span>
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {assignment.count === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <div className="text-sm">No members assigned</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded border border-blue-100 bg-blue-50/50 p-2">
                      <h4 className="text-xs font-semibold text-blue-800 mb-1">Assigned Members</h4>
                      <div className="space-y-1 text-xs">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded px-1 py-0.5 hover:bg-blue-100"
                          onClick={() => openStaffMemberModal(staffName, assignment.members)}
                          disabled={assignment.count === 0}
                        >
                          <span className="text-blue-900">Total</span>
                          <span className={`font-semibold ${assignment.count > 0 ? 'text-blue-700 hover:underline' : 'text-slate-400'}`}>
                            {assignment.count}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded px-1 py-0.5 hover:bg-blue-100"
                          onClick={() =>
                            openMemberModal(
                              activeActionMembers,
                              `Active Action Status — ${staffName}`,
                              `${activeActionCount} members assigned to ${staffName} in active action statuses`,
                              'staff_assignment',
                              `active_action_${staffName}`
                            )
                          }
                          disabled={activeActionCount === 0}
                        >
                          <span className="text-blue-900">Active</span>
                          <span className={`font-semibold ${activeActionCount > 0 ? 'text-blue-700 hover:underline' : 'text-slate-400'}`}>
                            {activeActionCount}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded px-1 py-0.5 hover:bg-blue-100"
                          onClick={() =>
                            openMemberModal(
                              passiveMembers,
                              `Passive Status — ${staffName}`,
                              `${passiveCount} members assigned to ${staffName} in passive statuses`,
                              'staff_assignment',
                              `passive_status_${staffName}`
                            )
                          }
                          disabled={passiveCount === 0}
                        >
                          <span className="text-blue-900">Passive</span>
                          <span className={`font-semibold ${passiveCount > 0 ? 'text-blue-700 hover:underline' : 'text-slate-400'}`}>
                            {passiveCount}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="rounded border border-red-100 bg-red-50/40 p-2">
                      <h4 className="text-xs font-semibold text-red-800 mb-1">No Action 7+ Days</h4>
                      <div className="space-y-1 text-xs">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded px-1 py-0.5 hover:bg-red-100"
                          onClick={() =>
                            openMemberModal(
                              noAction?.totalMembers || [],
                              `No Action 7+ Days — ${staffName}`,
                              `${total} members assigned to ${staffName} with no assigned-staff action in 7+ days`,
                              'staff_assignment',
                              `no_action_total_${staffName}`
                            )
                          }
                          disabled={total === 0}
                        >
                          <span className="text-red-900">Total</span>
                          <span className={`font-semibold ${total > 0 ? 'text-red-700 hover:underline' : 'text-slate-400'}`}>{total}</span>
                        </button>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded px-1 py-0.5 hover:bg-red-100"
                          onClick={() =>
                            openMemberModal(
                              criticalMembers,
                              `No Action Critical — ${staffName}`,
                              `${critical} critical no-action members for ${staffName}`,
                              'staff_assignment',
                              `no_action_critical_${staffName}`
                            )
                          }
                          disabled={critical === 0}
                        >
                          <span className="text-red-900">Critical</span>
                          <span className={`font-semibold ${critical > 0 ? 'text-red-700 hover:underline' : 'text-slate-400'}`}>{critical}</span>
                        </button>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded px-1 py-0.5 hover:bg-amber-100"
                          onClick={() =>
                            openMemberModal(
                              priorityMembers,
                              `No Action Priority — ${staffName}`,
                              `${priority} priority no-action members for ${staffName}`,
                              'staff_assignment',
                              `no_action_priority_${staffName}`
                            )
                          }
                          disabled={priority === 0}
                        >
                          <span className="text-amber-900">Priority</span>
                          <span className={`font-semibold ${priority > 0 ? 'text-amber-700 hover:underline' : 'text-slate-400'}`}>{priority}</span>
                        </button>
                      </div>
                    </div>

                    <div className="rounded border border-emerald-100 bg-emerald-50/50 p-2">
                      <h4 className="text-xs font-semibold text-emerald-800 mb-1">Recent Notes</h4>
                      <div className="space-y-2 text-xs">
                        <button
                          type="button"
                          className="w-full rounded border border-emerald-200 bg-white px-2 py-1 text-left hover:bg-emerald-100"
                          onClick={() =>
                            openMemberModal(
                              todayNotedMembers,
                              `Recent Notes — Today (${staffName})`,
                              `${notesTodayTotal} note(s) entered today across ${membersWithNotesToday} members assigned to ${staffName}`,
                              'staff_assignment',
                              `notes_today_${staffName}`
                            )
                          }
                          disabled={membersWithNotesToday === 0}
                        >
                          <div className="text-emerald-900">Today count</div>
                          <div
                            className={`font-semibold text-right ${
                              membersWithNotesToday > 0 ? 'text-emerald-700 hover:underline' : 'text-slate-400'
                            }`}
                          >
                            {notesTodayTotal}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="w-full rounded border border-emerald-200 bg-white px-2 py-1 text-left hover:bg-emerald-100"
                          onClick={() =>
                            openMemberModal(
                              yesterdayNotedMembers,
                              `Recent Notes — Yesterday (${staffName})`,
                              `${notesYesterdayTotal} note(s) entered yesterday across ${membersWithNotesYesterday} members assigned to ${staffName}`,
                              'staff_assignment',
                              `notes_yesterday_${staffName}`
                            )
                          }
                          disabled={membersWithNotesYesterday === 0}
                        >
                          <div className="text-emerald-900">Yesterday count</div>
                          <div
                            className={`font-semibold text-right ${
                              membersWithNotesYesterday > 0 ? 'text-emerald-700 hover:underline' : 'text-slate-400'
                            }`}
                          >
                            {notesYesterdayTotal}
                          </div>
                        </button>
                      </div>
                    </div>

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

                    <div className="rounded border border-blue-200 bg-blue-50/60 p-2">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full h-8 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() =>
                          onSubmitDailyUpdate?.({
                            staffName,
                            members: cardMembersPayload,
                            metrics: {
                              totalAssigned: assignment.count,
                              activeAssigned: activeActionCount,
                              passiveAssigned: passiveCount,
                              noActionTotal: total,
                              noActionCritical: critical,
                              noActionPriority: priority,
                              notesTodayCount: notesTodayTotal,
                            },
                          })
                        }
                        disabled={!onSubmitDailyUpdate || isSubmittingDaily}
                      >
                        {isSubmittingDaily ? 'Submitting Daily Log...' : 'Submit Daily Log'}
                      </Button>
                      <div className="mt-1 text-[11px] text-blue-700 text-center">
                        {dailySubmittedAt ? `Today: ${dailySubmittedAt}` : 'Not submitted'}
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

