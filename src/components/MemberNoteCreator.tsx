'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MessageSquare, 
  Plus, 
  Bell, 
  Calendar,
  User,
  AlertCircle,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { format } from 'date-fns';

interface MemberNoteCreatorProps {
  clientId2: string;
  memberName: string;
  memberHealthPlan?: string;
  context?: 'application' | 'general';
  onNoteCreated?: (note: any) => void;
  className?: string;
}

interface NoteFormData {
  noteText: string;
  noteType: 'General' | 'Medical' | 'Social' | 'Administrative' | 'Follow-up' | 'Emergency';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  assignedTo: string;
  assignedToName: string;
  followUpDate: string;
  tags: string[];
}

export function MemberNoteCreator({
  clientId2,
  memberName,
  memberHealthPlan,
  context = 'general',
  onNoteCreated,
  className = ''
}: MemberNoteCreatorProps) {
  const { toast } = useToast();
  const { user } = useAdmin();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteForm, setNoteForm] = useState<NoteFormData>({
    noteText: '',
    noteType: context === 'application' ? 'Administrative' : 'General',
    priority: 'Medium',
    assignedTo: '',
    assignedToName: '',
    followUpDate: '',
    tags: []
  });

  // Sample staff list - in production this would come from API
  const staffMembers = [
    { id: 'sarah_johnson', name: 'Sarah Johnson, MSW', role: 'Social Worker' },
    { id: 'mike_wilson', name: 'Dr. Mike Wilson, RN', role: 'Registered Nurse' },
    { id: 'emily_davis', name: 'Emily Davis, MSW', role: 'Case Manager' },
    { id: 'david_chen', name: 'David Chen, RN', role: 'Nurse Coordinator' },
    { id: 'lisa_martinez', name: 'Lisa Martinez, MSW', role: 'Social Worker' }
  ];

  const handleSubmit = async () => {
    if (!noteForm.noteText.trim()) {
      toast({
        title: "Error",
        description: "Please enter note content",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const noteData = {
        clientId2,
        memberName,
        noteText: noteForm.noteText,
        noteType: noteForm.noteType,
        priority: noteForm.priority,
        assignedTo: noteForm.assignedTo || undefined,
        assignedToName: noteForm.assignedToName || undefined,
        followUpDate: noteForm.followUpDate || undefined,
        createdBy: user?.uid || 'current-user',
        createdByName: user?.displayName || user?.email || 'Current User',
        tags: noteForm.tags,
        source: context === 'application' ? 'Admin' : 'App'
      };

      const response = await fetch('/api/member-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Note Created",
          description: `Note added for ${memberName}${noteForm.assignedToName ? ` and assigned to ${noteForm.assignedToName}` : ''}`,
        });

        // Reset form
        setNoteForm({
          noteText: '',
          noteType: context === 'application' ? 'Administrative' : 'General',
          priority: 'Medium',
          assignedTo: '',
          assignedToName: '',
          followUpDate: '',
          tags: []
        });

        setIsDialogOpen(false);

        // Call callback if provided
        if (onNoteCreated) {
          onNoteCreated(data.note);
        }

        // Show notification if assigned
        if (noteForm.assignedTo) {
          toast({
            title: "Notification Sent",
            description: `${noteForm.assignedToName} has been notified`,
          });
        }

      } else {
        throw new Error(data.error || 'Failed to create note');
      }

    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStaffSelect = (staffId: string) => {
    const staff = staffMembers.find(s => s.id === staffId);
    if (staff) {
      setNoteForm(prev => ({
        ...prev,
        assignedTo: staff.id,
        assignedToName: staff.name
      }));
    } else {
      setNoteForm(prev => ({
        ...prev,
        assignedTo: '',
        assignedToName: ''
      }));
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className={className}>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Add Note
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Add Note for {memberName}
            </DialogTitle>
            <DialogDescription>
              Create a new note for {memberName} ({clientId2})
              {memberHealthPlan && ` - ${memberHealthPlan}`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Member Info Card */}
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{memberName}</p>
                    <p className="text-sm text-muted-foreground">{clientId2}</p>
                  </div>
                  {memberHealthPlan && (
                    <Badge variant="outline" className={
                      memberHealthPlan === 'Kaiser' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-orange-50 text-orange-700 border-orange-200'
                    }>
                      {memberHealthPlan}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Note Form */}
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="noteType">Note Type</Label>
                  <Select 
                    value={noteForm.noteType} 
                    onValueChange={(value: NoteFormData['noteType']) => 
                      setNoteForm(prev => ({ ...prev, noteType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Medical">Medical</SelectItem>
                      <SelectItem value="Social">Social</SelectItem>
                      <SelectItem value="Administrative">Administrative</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                      <SelectItem value="Emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select 
                    value={noteForm.priority} 
                    onValueChange={(value: NoteFormData['priority']) => 
                      setNoteForm(prev => ({ ...prev, priority: value }))
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="noteText">Note Content *</Label>
                <Textarea
                  id="noteText"
                  value={noteForm.noteText}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, noteText: e.target.value }))}
                  placeholder="Enter note content..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="assignedTo">Assign to Staff (Optional)</Label>
                  <Select 
                    value={noteForm.assignedTo} 
                    onValueChange={handleStaffSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No assignment</SelectItem>
                      {staffMembers.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.name} ({staff.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="followUpDate">Follow-up Date (Optional)</Label>
                  <Input
                    id="followUpDate"
                    type="date"
                    value={noteForm.followUpDate}
                    onChange={(e) => setNoteForm(prev => ({ ...prev, followUpDate: e.target.value }))}
                    min={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
              </div>

              {/* Preview */}
              {noteForm.noteText && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Note Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Badge variant="outline" className={getPriorityColor(noteForm.priority)}>
                          {noteForm.priority}
                        </Badge>
                        <Badge variant="outline">
                          {noteForm.noteType}
                        </Badge>
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                          {context === 'application' ? 'Admin' : 'App'}
                        </Badge>
                        {noteForm.assignedTo && (
                          <Badge className="bg-blue-600">
                            <Bell className="h-3 w-3 mr-1" />
                            Assigned
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{noteForm.noteText}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">From:</span> {user?.displayName || user?.email || 'Current User'}
                          {noteForm.assignedToName && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="font-medium">Assigned to:</span> {noteForm.assignedToName}
                            </>
                          )}
                        </div>
                        {noteForm.followUpDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Follow-up: {format(new Date(noteForm.followUpDate), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !noteForm.noteText.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Note
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}