'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, User, X } from 'lucide-react';
import type { KaiserMember } from './shared';
import { formatBirthDate, getEffectiveKaiserStatus, getMemberKey, getStatusColor } from './shared';

export interface MemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: KaiserMember[];
  title: string;
  description: string;
  onMemberClick: (member: KaiserMember) => void;
  filters: any;
  onFilterChange: (filterType: string, value: string) => void;
  onClearFilters: () => void;
  allKaiserStatuses: string[];
  availableCounties: string[];
  availableCalAIMStatuses: string[];
  staffMembers: string[];
}

export function MemberListModal({
  isOpen,
  onClose,
  members,
  title,
  description,
  onMemberClick,
  filters,
  onFilterChange,
  onClearFilters,
  allKaiserStatuses,
  availableCounties,
  availableCalAIMStatuses,
  staffMembers,
}: MemberListModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-1">{description}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Compact Filters */}
        <div className="px-6 py-2 bg-gray-50 border-b">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-600 font-medium text-xs">Filters:</span>

            <Select value={filters.kaiserStatus} onValueChange={(value) => onFilterChange('kaiserStatus', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="Kaiser Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Kaiser Statuses</SelectItem>
                {allKaiserStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.county} onValueChange={(value) => onFilterChange('county', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="County" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Counties</SelectItem>
                {availableCounties.map((county) => (
                  <SelectItem key={county} value={county}>
                    {county}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.calaimStatus} onValueChange={(value) => onFilterChange('calaimStatus', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="CalAIM Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CalAIM Statuses</SelectItem>
                {availableCalAIMStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.staffAssigned} onValueChange={(value) => onFilterChange('staffAssigned', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="Kaiser user assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffMembers.map((staff) => (
                  <SelectItem key={String(staff)} value={String(staff)}>
                    {String(staff)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-7 px-2 text-xs">
              Clear
            </Button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {members.length === 0 ? (
            <div className="text-center py-12">
              <User className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No members found</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or sync data from Caspio.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member, index) => {
                const assigned = String(member.Staff_Assigned || member.Kaiser_User_Assignment || '').trim();
                const effectiveKaiserStatus = getEffectiveKaiserStatus(member);

                return (
                  <Card
                    key={getMemberKey(member, index)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors border-l-4 border-l-blue-500"
                    onClick={() => onMemberClick(member)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">
                              {member.memberFirstName} {member.memberLastName}
                            </h3>
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                            <MessageSquare className="h-3 w-3" />
                            Click card to open member notes
                          </div>

                          <p className="text-sm text-muted-foreground mt-1">
                            ID: {member.client_ID2} | DOB: {formatBirthDate(member)} | MRN: {member.memberMrn} | County:{' '}
                            {member.memberCounty}
                          </p>

                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline" className={`text-xs ${getStatusColor(effectiveKaiserStatus)}`}>
                              Kaiser: {effectiveKaiserStatus}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              CalAIM: {member.CalAIM_Status || 'No Status'}
                            </Badge>
                          </div>

                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-blue-500" />
                            <div>
                              <span className="text-gray-600">Assigned:</span>
                              <span className="ml-1 font-medium">{assigned || 'Unassigned'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

