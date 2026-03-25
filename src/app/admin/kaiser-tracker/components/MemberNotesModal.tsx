'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, MessageSquare, RefreshCw } from 'lucide-react';
import type { KaiserMember } from './shared';
import { formatBirthDate, getEffectiveKaiserStatus } from './shared';

export interface MemberNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: KaiserMember | null;
  notes: any[];
  isLoadingNotes: boolean;
  lastSyncAt: string;
  existingNotesCount: number;
  newNotesCount: number;
  didSync: boolean;
  onSyncNotes: () => void;
}

export function MemberNotesModal({
  isOpen,
  onClose,
  member,
  notes,
  isLoadingNotes,
  lastSyncAt,
  existingNotesCount,
  newNotesCount,
  didSync,
  onSyncNotes,
}: MemberNotesModalProps) {
  if (!isOpen || !member) return null;

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'Caspio':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'App':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Admin':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {member.memberFirstName} {member.memberLastName} - Member Notes
          </DialogTitle>
          <DialogDescription>
            DOB: {formatBirthDate(member)} | MRN: {member.memberMrn} | County: {member.memberCounty} | Kaiser Status:{' '}
            {getEffectiveKaiserStatus(member)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notes List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Notes History</h3>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onSyncNotes} disabled={isLoadingNotes}>
                  <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoadingNotes ? 'animate-spin' : ''}`} />
                  Sync latest notes
                </Button>
                <Badge variant="outline">{notes.length} notes</Badge>
              </div>
            </div>

            {isLoadingNotes ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading notes...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
                  <div>
                    Last notes sync (ET): {formatEtDateTime(lastSyncAt)}
                  </div>
                  <div className="mt-1">
                    Existing notes: {existingNotesCount} • New notes from latest sync: {newNotesCount}
                  </div>
                  {!didSync ? (
                    <div className="mt-1 text-slate-600">
                      Showing saved notes from Firestore. Use Sync latest notes to pull new Caspio notes.
                    </div>
                  ) : null}
                </div>
              <ScrollArea className="h-[45vh]">
                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                      <p className="text-muted-foreground">No notes have been created for this member yet.</p>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className={`p-4 border rounded-lg ${!note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex gap-2">
                            <Badge variant="outline" className={getPriorityColor(note.priority)}>
                              {note.priority}
                            </Badge>
                            <Badge variant="outline">{note.noteType || 'General'}</Badge>
                            <Badge variant="outline" className={getSourceColor(note.source)}>
                              {note.source}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(note.createdAt).toLocaleDateString()} {new Date(note.createdAt).toLocaleTimeString()}
                          </div>
                        </div>

                        <p className="text-sm mb-3">{note.noteText}</p>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">By:</span> {note.createdByName || note.authorName}
                            {note.assignedToName && (
                              <>
                                <span className="mx-2">•</span>
                                <span className="font-medium">Assigned to:</span> {note.assignedToName}
                              </>
                            )}
                          </div>
                          {note.followUpDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Follow-up: {new Date(note.followUpDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              </div>
            )}
          </div>

          {/* Read-only operations panel */}
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-blue-50 text-sm text-blue-900">
              Note history is read-only in the app. Use sync to pull the latest Caspio notes.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

