'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, MessageSquare, RefreshCw, User, X } from 'lucide-react';
import { useAuth } from '@/firebase';
import type { KaiserMember } from './shared';
import { formatBirthDate, getEffectiveKaiserStatus, getMemberKey, getStatusColor } from './shared';

export interface MemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: KaiserMember[];
  title: string;
  description: string;
  onMemberClick: (member: KaiserMember) => void;
  onSyncAllMemberNotes: (members: KaiserMember[]) => void;
  isSyncingAllNotes: boolean;
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
  onSyncAllMemberNotes,
  isSyncingAllNotes,
  filters,
  onFilterChange,
  onClearFilters,
  allKaiserStatuses,
  availableCounties,
  availableCalAIMStatuses,
  staffMembers,
}: MemberListModalProps) {
  const auth = useAuth();
  const [notesMetaByClientId, setNotesMetaByClientId] = React.useState<
    Record<
      string,
      {
        lastSyncAt: string;
        notesTodayCount: number;
        newNotesCount: number;
        lastAssignedStaffActionAt: string;
      }
    >
  >({});
  const [showNoActionOnly, setShowNoActionOnly] = React.useState(false);
  const [overrideByClientId, setOverrideByClientId] = React.useState<Record<string, any>>({});

  const getAssignedStaffName = (member: KaiserMember) =>
    String(
      (member as any)?.Kaiser_Staff_Assignment ||
        member?.Staff_Assigned ||
        member?.Kaiser_User_Assignment ||
        (member as any)?.Staff_Assignment ||
        (member as any)?.Assigned_Staff ||
        ''
    ).trim();

  const formatEtDateTime = (value: string) => {
    if (!value) return 'Never';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Never';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(parsed);
  };

  const isNoActionForWeek = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return true;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return now - parsed.getTime() >= sevenDaysMs;
  };

  const formatDate = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Not set';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleDateString();
  };

  React.useEffect(() => {
    if (!isOpen || members.length === 0) return;
    const clientIds = Array.from(
      new Set(
        members
          .map((m) => String(m?.client_ID2 || '').trim())
          .filter(Boolean)
      )
    );
    if (clientIds.length === 0) return;

    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let index = 0;
    const concurrency = 6;

    const worker = async () => {
      while (!cancelled) {
        const i = index;
        index += 1;
        if (i >= clientIds.length) return;
        const clientId2 = clientIds[i];
        try {
          const member = members.find((m) => String(m?.client_ID2 || '').trim() === clientId2);
          const assignedStaff = member ? getAssignedStaffName(member) : '';
          const query = new URLSearchParams({
            clientId2,
            skipSync: 'true',
            metaOnly: 'true',
          });
          if (assignedStaff) {
            query.set('assignedStaff', assignedStaff);
          }
          const res = await fetch(`/api/member-notes?${query.toString()}`);
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          setNotesMetaByClientId((prev) => ({
            ...prev,
            [clientId2]: {
              lastSyncAt: String(data?.syncLastAt || ''),
              notesTodayCount: Number(data?.notesTodayCount || 0),
              newNotesCount: Number(data?.newNotesCount || 0),
              lastAssignedStaffActionAt: String(data?.lastAssignedStaffActionAt || ''),
            },
          }));
          await delay(40);
        } catch {
          if (cancelled) return;
          setNotesMetaByClientId((prev) => ({
            ...prev,
            [clientId2]: {
              lastSyncAt: '',
              notesTodayCount: 0,
              newNotesCount: 0,
              lastAssignedStaffActionAt: '',
            },
          }));
        }
      }
    };

    void Promise.all(Array.from({ length: concurrency }, () => worker()));

    return () => {
      cancelled = true;
    };
  }, [isOpen, members]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen || members.length === 0 || !auth?.currentUser) {
        if (!cancelled) setOverrideByClientId({});
        return;
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const clientIds = Array.from(new Set(members.map((m) => String(m?.client_ID2 || '').trim()).filter(Boolean)));
        const query = new URLSearchParams({ clientIds: clientIds.join(','), activeOnly: 'true' });
        const res = await fetch(`/api/admin/kaiser-no-action-overrides?${query.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.success) {
          setOverrideByClientId((data?.byMemberId || {}) as Record<string, any>);
        }
      } catch {
        if (!cancelled) setOverrideByClientId({});
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, members, auth]);

  React.useEffect(() => {
    if (!isOpen) {
      setShowNoActionOnly(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getMemberMeta = (member: KaiserMember) => {
    const memberClientId = String(member.client_ID2 || '').trim();
    return notesMetaByClientId[memberClientId];
  };
  const getActiveOverride = (member: KaiserMember) => {
    const memberClientId = String(member.client_ID2 || '').trim();
    return overrideByClientId[memberClientId] || null;
  };
  const memberHasActiveOverride = (member: KaiserMember) => Boolean(getActiveOverride(member));
  const memberHasNoActionForWeek = (member: KaiserMember) =>
    !memberHasActiveOverride(member) && isNoActionForWeek(getMemberMeta(member)?.lastAssignedStaffActionAt || '');
  const displayedMembers = showNoActionOnly ? members.filter(memberHasNoActionForWeek) : members;
  const noActionCount = members.filter(memberHasNoActionForWeek).length;

  const setManagerOverride = async (member: KaiserMember) => {
    try {
      if (!auth?.currentUser) return;
      const reason = window.prompt('Enter manager override reason (required):', '');
      if (!reason || !reason.trim()) return;
      const daysText = window.prompt('Override expiration in days (default 7):', '7');
      const days = Math.max(1, Number.parseInt(String(daysText || '7').trim(), 10) || 7);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-no-action-overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          memberId: String(member?.client_ID2 || '').trim(),
          reason: reason.trim(),
          expiresAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setOverrideByClientId((prev) => ({
          ...prev,
          [String(member?.client_ID2 || '').trim()]: data?.override || null,
        }));
      } else {
        window.alert(data?.error || 'Failed to save manager override.');
      }
    } catch {
      window.alert('Failed to save manager override.');
    }
  };

  const clearManagerOverride = async (member: KaiserMember) => {
    try {
      if (!auth?.currentUser) return;
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-no-action-overrides', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          memberId: String(member?.client_ID2 || '').trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setOverrideByClientId((prev) => {
          const next = { ...prev };
          delete next[String(member?.client_ID2 || '').trim()];
          return next;
        });
      } else {
        window.alert(data?.error || 'Failed to clear manager override.');
      }
    } catch {
      window.alert('Failed to clear manager override.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-1">{description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSyncAllMemberNotes(members)}
                disabled={isSyncingAllNotes || members.length === 0}
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isSyncingAllNotes ? 'animate-spin' : ''}`} />
                {isSyncingAllNotes
                  ? 'Syncing notes...'
                  : `Sync notes for all ${members.length} member${members.length === 1 ? '' : 's'}`}
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
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
            <Button
              type="button"
              variant={showNoActionOnly ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowNoActionOnly((prev) => !prev)}
            >
              {showNoActionOnly ? 'Showing: No action 7+ days' : `No action 7+ days (${noActionCount})`}
            </Button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {displayedMembers.length === 0 ? (
            <div className="text-center py-12">
              <User className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No members found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {showNoActionOnly
                  ? 'No members match the no-action (7+ days) filter.'
                  : 'Try adjusting your filters or sync data from Caspio.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedMembers.map((member, index) => {
                const assigned = String(member.Staff_Assigned || member.Kaiser_User_Assignment || '').trim();
                const effectiveKaiserStatus = getEffectiveKaiserStatus(member);
                const memberMeta = getMemberMeta(member);
                const activeOverride = getActiveOverride(member);
                const noActionForWeek = !activeOverride && isNoActionForWeek(memberMeta?.lastAssignedStaffActionAt || '');
                const assignedStaffLastActionAt = memberMeta?.lastAssignedStaffActionAt || '';

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
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Last note by assigned staff (ET):{' '}
                            {formatEtDateTime(
                              assignedStaffLastActionAt
                            )}{' '}
                            | New notes: {memberMeta?.newNotesCount ?? 0}
                          </p>
                          {noActionForWeek ? (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                              <AlertTriangle className="h-3 w-3" />
                              No action in 7+ days
                            </div>
                          ) : null}
                          {activeOverride ? (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              Manager override active until {formatDate(activeOverride?.expiresAtIso || '')}
                            </div>
                          ) : null}
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                            <MessageSquare className="h-3 w-3" />
                            Click card to open member notes
                          </div>

                          <p className="text-sm text-muted-foreground mt-1">
                            ID: {member.client_ID2} | DOB: {formatBirthDate(member)} | MRN: {member.memberMrn} | County:{' '}
                            {member.memberCounty}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            T2038 Authorization End: {formatDate((member as any)?.Authorization_End_Date_T2038)} | RCFE:{' '}
                            {String((member as any)?.RCFE_Name || '').trim() || 'Not set'}
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
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                void setManagerOverride(member);
                              }}
                            >
                              Set manager override
                            </Button>
                            {activeOverride ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-amber-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void clearManagerOverride(member);
                                }}
                              >
                                Clear override
                              </Button>
                            ) : null}
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

