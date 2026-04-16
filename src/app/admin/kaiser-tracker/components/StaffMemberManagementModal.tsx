'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User } from 'lucide-react';
import type { KaiserMember } from './shared';
import { formatBirthDate, getEffectiveKaiserStatus, getMemberKey } from './shared';

export interface StaffMemberManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  members: KaiserMember[];
  onMemberUpdate: () => void;
}

export function StaffMemberManagementModal({
  isOpen,
  onClose,
  staffName,
  members,
  onMemberUpdate,
}: StaffMemberManagementModalProps) {
  type VisibleNote = {
    createdAt: string;
    createdByName: string;
    noteText: string;
    source: string;
  };

  type MemberNotesDailyMeta = {
    todayCount: number;
    totalNotes: number;
    lastSyncAt: string;
    todayNotes: VisibleNote[];
    allNotes: VisibleNote[];
    error?: string;
  };

  const [isSyncingNotes, setIsSyncingNotes] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState({ complete: 0, total: 0, failed: 0 });
  const [dailyMetaByClientId, setDailyMetaByClientId] = React.useState<Record<string, MemberNotesDailyMeta>>({});
  const syncInFlightRef = React.useRef(false);

  const toEtDayKey = React.useCallback((value: string | Date) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }, []);

  const formatEtDateTime = React.useCallback((value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Never';
    const parsed = new Date(raw);
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
  }, []);

  const syncAllMemberNotes = React.useCallback(async () => {
    if (!isOpen || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    const clientIds = Array.from(new Set(members.map((m) => String(m?.client_ID2 || '').trim()).filter(Boolean)));
    if (clientIds.length === 0) {
      setDailyMetaByClientId({});
      setSyncProgress({ complete: 0, total: 0, failed: 0 });
      syncInFlightRef.current = false;
      return;
    }

    setIsSyncingNotes(true);
    setSyncProgress({ complete: 0, total: clientIds.length, failed: 0 });
    const nextMeta: Record<string, MemberNotesDailyMeta> = {};
    const todayEt = toEtDayKey(new Date());
    const concurrency = 4;
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= clientIds.length) return;
        const clientId2 = clientIds[idx];
        try {
          const query = new URLSearchParams({
            clientId2,
            forceSync: 'false',
            skipSync: 'false',
            repairIfEmpty: 'true',
          });
          const response = await fetch(`/api/member-notes?${query.toString()}`);
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data?.success === false) {
            throw new Error(String(data?.error || `HTTP ${response.status}`));
          }

          const notesRaw = Array.isArray(data?.notes) ? data.notes : [];
          const normalizedNotes: VisibleNote[] = notesRaw
            .map((note: any) => ({
              createdAt: String(note?.createdAt || '').trim(),
              createdByName: String(note?.createdByName || note?.createdBy || 'Unknown').trim() || 'Unknown',
              noteText: String(note?.noteText || '').replace(/\s+/g, ' ').trim() || '(empty note)',
              source: String(note?.source || '').trim(),
            }))
            .filter((note) => Boolean(note.createdAt))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const todayNotes = normalizedNotes.filter((note) => toEtDayKey(note.createdAt) === todayEt);
          const todayCount = notesRaw.reduce((acc: number, note: any) => {
            const createdAt = String(note?.createdAt || '').trim();
            if (!createdAt) return acc;
            const dayKey = toEtDayKey(createdAt);
            return dayKey && dayKey === todayEt ? acc + 1 : acc;
          }, 0);

          nextMeta[clientId2] = {
            todayCount,
            totalNotes: Number(data?.count || normalizedNotes.length || 0),
            lastSyncAt: String(data?.syncLastAt || ''),
            todayNotes: todayNotes.slice(0, 8),
            allNotes: normalizedNotes,
          };
        } catch (error: any) {
          nextMeta[clientId2] = {
            todayCount: 0,
            totalNotes: 0,
            lastSyncAt: '',
            todayNotes: [],
            allNotes: [],
            error: String(error?.message || 'Failed to sync notes'),
          };
          setSyncProgress((prev) => ({ ...prev, failed: prev.failed + 1 }));
        } finally {
          setSyncProgress((prev) => ({ ...prev, complete: prev.complete + 1 }));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, clientIds.length) }, () => worker()));
      setDailyMetaByClientId(nextMeta);
      onMemberUpdate();
    } finally {
      setIsSyncingNotes(false);
      syncInFlightRef.current = false;
    }
  }, [isOpen, members, onMemberUpdate, toEtDayKey]);

  React.useEffect(() => {
    if (isOpen) return;
    setSyncProgress({ complete: 0, total: 0, failed: 0 });
    setIsSyncingNotes(false);
    syncInFlightRef.current = false;
    setDailyMetaByClientId({});
  }, [isOpen]);

  const totalNotesToday = React.useMemo(
    () => Object.values(dailyMetaByClientId).reduce((sum, meta) => sum + Number(meta?.todayCount || 0), 0),
    [dailyMetaByClientId]
  );

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {staffName} - Member Management
          </DialogTitle>
          <DialogDescription>
            View {members.length} members assigned to {staffName}. Use "Pull Member Notes" on demand to refresh all notes and today activity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {isSyncingNotes
              ? `Syncing notes: ${syncProgress.complete}/${syncProgress.total} complete`
              : syncProgress.total > 0
                ? `Notes sync complete: ${syncProgress.complete}/${syncProgress.total} processed${
                  syncProgress.failed > 0 ? ` (${syncProgress.failed} failed)` : ''
                }`
                : 'Notes are not synced automatically. Click "Pull Member Notes".'}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void syncAllMemberNotes()} disabled={isSyncingNotes}>
            {isSyncingNotes ? 'Syncing...' : 'Pull Member Notes'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="rounded border bg-slate-50 p-2 text-xs">
            <div className="text-muted-foreground">Total notes inputted today (ET)</div>
            <div className={`text-base font-semibold ${totalNotesToday > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
              {totalNotesToday}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-4">
          <div className="space-y-4">
            {members.map((member, index) => {
              const clientId2 = String(member?.client_ID2 || '').trim();
              const meta = dailyMetaByClientId[clientId2];
              const todayCount = Number(meta?.todayCount || 0);
              const totalNotes = Number(meta?.totalNotes || 0);
              return (
                <Card key={getMemberKey(member, index)} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div>
                      <CardTitle className="text-lg">
                        {member.memberFirstName} {member.memberLastName}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        <span>DOB: {formatBirthDate(member)}</span>
                        <span>MRN: {member.memberMrn}</span>
                        <span>County: {member.memberCounty}</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Kaiser Status</label>
                        <Badge variant="outline" className="text-sm">
                          {getEffectiveKaiserStatus(member)}
                        </Badge>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">CalAIM Status</label>
                        <Badge variant="outline" className="text-sm">
                          {member.CalAIM_Status || 'Not set'}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="rounded border bg-slate-50 p-2">
                        <div className="text-muted-foreground">New notes today (ET)</div>
                        <div className={`font-semibold ${todayCount > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {todayCount}
                        </div>
                      </div>
                      <div className="rounded border bg-slate-50 p-2">
                        <div className="text-muted-foreground">Total notes</div>
                        <div className="font-semibold text-slate-700">{totalNotes}</div>
                      </div>
                      <div className="rounded border bg-slate-50 p-2">
                        <div className="text-muted-foreground">Last notes sync (ET)</div>
                        <div className="font-semibold text-slate-700">{formatEtDateTime(String(meta?.lastSyncAt || ''))}</div>
                      </div>
                    </div>

                    {meta?.error ? (
                      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        Notes sync error: {meta.error}
                      </div>
                    ) : null}

                    <div className="space-y-2 border-t pt-2">
                      <div className="text-xs font-semibold text-slate-700">All notes (newest first)</div>
                      {meta ? (
                        meta.allNotes.length > 0 ? (
                          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                            {meta.allNotes.map((note, noteIdx) => (
                              <div key={`${clientId2}-today-note-${noteIdx}`} className="rounded border bg-white p-2 text-xs">
                                <div className="text-slate-600">
                                  {note.createdByName} • {formatEtDateTime(note.createdAt)}
                                  {note.source ? ` • ${note.source}` : ''}
                                  {toEtDayKey(note.createdAt) === toEtDayKey(new Date()) ? ' • NEW TODAY' : ''}
                                </div>
                                <div className="text-slate-800">{note.noteText}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">No notes found for this member.</div>
                        )
                      ) : (
                        <div className="text-xs text-muted-foreground">Not pulled yet. Click "Pull Member Notes".</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

