'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Users } from 'lucide-react';
import type { KaiserMember } from './shared';

export interface StaffAssignmentData {
  count: number;
  members: KaiserMember[];
  statusBreakdown: Record<string, number>;
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
}

export function KaiserStaffAssignments({
  allStaff,
  staffAssignments,
  openStaffMemberModal,
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
              return (
                <div key={`summary-${staffName}`} className="text-center">
                  <button
                    onClick={() => assignment.count > 0 && openStaffMemberModal(staffName, assignment.members)}
                    className={`block w-full p-3 rounded-lg border transition-all ${
                      assignment.count > 0
                        ? staffName === 'Unassigned'
                          ? 'bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 cursor-pointer shadow-sm hover:shadow-md'
                          : 'bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 cursor-pointer shadow-sm hover:shadow-md'
                        : 'bg-gray-50 border-gray-200 cursor-default'
                    }`}
                    disabled={assignment.count === 0}
                  >
                    <div
                      className={`font-semibold text-sm mb-1 ${
                        staffName === 'Unassigned' ? 'text-gray-700' : 'text-gray-900'
                      }`}
                    >
                      {staffName}
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        assignment.count > 0
                          ? staffName === 'Unassigned'
                            ? 'text-gray-600'
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
          return (
            <Card
              key={`staff-status-${staffName}`}
              className={`bg-white border-l-4 shadow ${staffName === 'Unassigned' ? 'border-l-gray-400' : 'border-l-orange-500'}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle className={`h-4 w-4 ${staffName === 'Unassigned' ? 'text-gray-500' : 'text-orange-600'}`} />
                  {staffName} - Status
                </CardTitle>
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
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 5)
                          .map(([status, count]) => (
                            <div key={`${staffName}-status-${status}`} className="flex justify-between items-center text-xs">
                              <span className="truncate pr-2" title={status}>
                                {status}
                              </span>
                              <button
                                onClick={() => {
                                  // Filter members by this staff and status
                                  const statusMembers = assignment.members.filter(
                                    (member) => (member.Kaiser_Status || 'No Status') === status
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

