'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, MessageSquare, RefreshCw } from 'lucide-react';
import type { KaiserMember } from './shared';
import { formatBirthDate, getEffectiveKaiserStatus } from './shared';

export interface MemberNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: KaiserMember | null;
  notes: any[];
  isLoadingNotes: boolean;
  newNote: {
    noteText: string;
    priority: 'Low' | 'Medium' | 'High' | 'Urgent';
    assignedTo: string;
    assignedToName: string;
    followUpDate: string;
  };
  onNewNoteChange: (patch: Partial<MemberNotesModalProps['newNote']>) => void;
  onCreateNote: () => void;
  ilsDateDraft: {
    tierLevelReceivedDate: string;
    ilsContractSentDate: string;
  };
  isSavingIlsDates: boolean;
  onIlsDateDraftChange: (draft: { tierLevelReceivedDate: string; ilsContractSentDate: string }) => void;
  onSaveIlsDates: () => void;
  onSyncNotes: () => void;
}

export function MemberNotesModal({
  isOpen,
  onClose,
  member,
  notes,
  isLoadingNotes,
  newNote,
  onNewNoteChange,
  onCreateNote,
  ilsDateDraft,
  isSavingIlsDates,
  onIlsDateDraftChange,
  onSaveIlsDates,
  onSyncNotes,
}: MemberNotesModalProps) {
  if (!isOpen || !member) return null;

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
            )}
          </div>

          {/* Add New Note */}
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-3 bg-slate-50">
              <h3 className="text-sm font-semibold">ILS Date Updates</h3>
              <p className="text-xs text-muted-foreground">
                Save these when ILS completes updates. This triggers staff desktop notifications and Tier/ILS Contract action
                items while the member stays in current status.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Tier Level Received Date</label>
                  <Input
                    type="date"
                    value={ilsDateDraft.tierLevelReceivedDate}
                    onChange={(e) =>
                      onIlsDateDraftChange({
                        ...ilsDateDraft,
                        tierLevelReceivedDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">ILS Contract Sent Date</label>
                  <Input
                    type="date"
                    value={ilsDateDraft.ilsContractSentDate}
                    onChange={(e) =>
                      onIlsDateDraftChange({
                        ...ilsDateDraft,
                        ilsContractSentDate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <Button onClick={onSaveIlsDates} disabled={isSavingIlsDates} className="w-full" variant="secondary">
                {isSavingIlsDates ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save ILS Dates
              </Button>
            </div>

            <h3 className="text-lg font-medium">Add New Note</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Priority</label>
                <Select
                  value={newNote.priority}
                  onValueChange={(value: 'Low' | 'Medium' | 'High' | 'Urgent') =>
                    onNewNoteChange({ priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Note Content</label>
                <Textarea
                  value={newNote.noteText}
                  onChange={(e) => onNewNoteChange({ noteText: e.target.value })}
                  placeholder="Enter note content..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Assign to Staff (Optional)</label>
                  <Select
                    value={newNote.assignedToName || 'none'}
                    onValueChange={(value) => {
                      const normalized = value === 'none' ? '' : value;
                      // Map staff names to IDs (in production, this would come from a staff API)
                      const staffMap: Record<string, string> = {
                        John: 'john-user-id',
                        Nick: 'nick-user-id',
                        Jesse: 'jesse-user-id',
                      };
                      onNewNoteChange({
                        assignedToName: normalized,
                        assignedTo: normalized ? staffMap[normalized] || '' : '',
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="John">John</SelectItem>
                      <SelectItem value="Nick">Nick</SelectItem>
                      <SelectItem value="Jesse">Jesse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Follow-up Date (Optional)</label>
                  <Input
                    type="date"
                    value={newNote.followUpDate}
                    onChange={(e) => onNewNoteChange({ followUpDate: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <Button
                onClick={onCreateNote}
                disabled={!newNote.noteText.trim()}
                className="w-full bg-blue-600 text-white hover:bg-blue-700"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Add Note
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

