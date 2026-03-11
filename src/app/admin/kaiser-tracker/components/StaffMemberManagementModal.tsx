'use client';

import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus, Save, User } from 'lucide-react';
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
  const [newNote, setNewNote] = useState('');
  const [addingNoteFor, setAddingNoteFor] = useState<string | null>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleAddNote = async (memberId: string) => {
    if (!newNote.trim()) return;

    try {
      const response = await fetch('/api/member-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          noteText: newNote,
          assignedTo: staffName,
          authorName: staffName,
          authorId: 'current-user-id',
        }),
      });

      if (response.ok) {
        toast({
          title: 'Note Added',
          description: 'Note has been added successfully.',
        });
        setNewNote('');
        setAddingNoteFor(null);
        onMemberUpdate();
      } else {
        throw new Error('Failed to add note');
      }
    } catch (error) {
      toast({
        title: 'Note Failed',
        description: 'Failed to add note. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {staffName} - Member Management
          </DialogTitle>
          <DialogDescription>
            View {members.length} members assigned to {staffName}. Tracker fields are read-only (Caspio-backed). You can
            add internal notes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-4">
          <div className="space-y-4">
            {members.map((member, index) => {
              const isAddingNote = addingNoteFor === member.id;

              return (
                <Card key={getMemberKey(member, index)} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
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
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingNoteFor(isAddingNote ? null : member.id)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Note
                        </Button>
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

                    {isAddingNote && (
                      <>
                        <Separator />
                        <div className="space-y-3 bg-blue-50 p-3 rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="font-medium">Add New Note</span>
                          </div>
                          <Textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Enter your note..."
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAddNote(member.id)} disabled={!newNote.trim()}>
                              <Save className="h-4 w-4 mr-1" />
                              Add Note
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAddingNoteFor(null);
                                setNewNote('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
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

