'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getNextKaiserStatus, getKaiserStatusesInOrder, KAISER_STATUS_PROGRESSION, getKaiserStatusById } from '@/lib/kaiser-status-progression';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Filter, 
  Download, 
  RefreshCw, 
  Search, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail, 
  FileText, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Pause,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Database,
  Edit,
  Save,
  Plus,
  Target,
  Users,
  MessageSquare
} from 'lucide-react';

// Types
interface KaiserMember {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  memberPhone: string;
  memberEmail: string;
  client_ID2: string;
  pathway: string;
  Kaiser_Status: string;
  CalAIM_Status: string;
  Staff_Assigned: string;
  Next_Step_Due_Date: string;
  workflow_step: string;
  workflow_notes: string;
  last_updated: string;
  created_at: string;
}

interface StatusSummaryItem {
  status: string;
  count: number;
}

// Helper functions for status styling
const getStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    'Complete': 'bg-green-50 text-green-700 border-green-200',
    'Active': 'bg-blue-50 text-blue-700 border-blue-200',
    'Pending': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'On-Hold': 'bg-orange-50 text-orange-700 border-orange-200',
    'Non-active': 'bg-gray-50 text-gray-700 border-gray-200',
    'Denied': 'bg-red-50 text-red-700 border-red-200',
    'Expired': 'bg-red-50 text-red-700 border-red-200',
    'T2038 Requested': 'bg-purple-50 text-purple-700 border-purple-200',
    'RN Visit Complete': 'bg-teal-50 text-teal-700 border-teal-200',
    'Tier Level Requested': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Tier Level Received': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'RN/MSW Scheduled': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'R&B Requested': 'bg-pink-50 text-pink-700 border-pink-200',
    'R&B Signed': 'bg-pink-50 text-pink-700 border-pink-200',
    'T2038 received, doc collection': 'bg-violet-50 text-violet-700 border-violet-200',
    'T2038 received, Need First Contact': 'bg-violet-50 text-violet-700 border-violet-200',
    'Tier Level Appeal': 'bg-amber-50 text-amber-700 border-amber-200',
    'Tier Level Request Needed': 'bg-slate-50 text-slate-700 border-slate-200',
    'T2038 Auth Only Email': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'T2038 Request Ready': 'bg-lime-50 text-lime-700 border-lime-200',
    'T2038, Not Requested, Doc Collection': 'bg-rose-50 text-rose-700 border-rose-200',
    'RCFE Needed': 'bg-sky-50 text-sky-700 border-sky-200',
    'ILS Sent for Contract': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    'R&B Needed': 'bg-orange-50 text-orange-700 border-orange-200',
    'RN Visit Needed': 'bg-red-50 text-red-700 border-red-200',
    'RCFE_Located': 'bg-green-50 text-green-700 border-green-200',
    'ILS Contract Email Needed': 'bg-blue-50 text-blue-700 border-blue-200'
  };
  
  return statusColors[status] || 'bg-gray-50 text-gray-700 border-gray-200';
};

const getStatusIcon = (status: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    'Complete': <CheckCircle className="h-3 w-3" />,
    'Active': <CheckCircle className="h-3 w-3" />,
    'Pending': <Clock className="h-3 w-3" />,
    'On-Hold': <Pause className="h-3 w-3" />,
    'Non-active': <XCircle className="h-3 w-3" />,
    'Denied': <XCircle className="h-3 w-3" />,
    'Expired': <AlertTriangle className="h-3 w-3" />,
    'T2038 Requested': <FileText className="h-3 w-3" />,
    'RN Visit Complete': <CheckCircle className="h-3 w-3" />,
    'Tier Level Requested': <FileText className="h-3 w-3" />,
    'Tier Level Received': <CheckCircle className="h-3 w-3" />,
    'RN/MSW Scheduled': <Calendar className="h-3 w-3" />,
    'R&B Requested': <FileText className="h-3 w-3" />,
    'R&B Signed': <CheckCircle className="h-3 w-3" />,
    'T2038 received, doc collection': <FileText className="h-3 w-3" />,
    'T2038 received, Need First Contact': <Phone className="h-3 w-3" />,
    'Tier Level Appeal': <AlertTriangle className="h-3 w-3" />,
    'Tier Level Request Needed': <FileText className="h-3 w-3" />,
    'T2038 Auth Only Email': <Mail className="h-3 w-3" />,
    'T2038 Request Ready': <CheckCircle className="h-3 w-3" />,
    'T2038, Not Requested, Doc Collection': <FileText className="h-3 w-3" />,
    'RCFE Needed': <MapPin className="h-3 w-3" />,
    'ILS Sent for Contract': <FileText className="h-3 w-3" />,
    'R&B Needed': <FileText className="h-3 w-3" />,
    'RN Visit Needed': <Calendar className="h-3 w-3" />,
    'RCFE_Located': <MapPin className="h-3 w-3" />,
    'ILS Contract Email Needed': <Mail className="h-3 w-3" />
  };
  
  return iconMap[status] || <Clock className="h-3 w-3" />;
};

// Helper function to format dates
const formatDate = (dateString: string): string => {
  if (!dateString) return 'Not set';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'Invalid date';
  }
};

// Helper function to check if a task is overdue
  const isOverdue = (dateString: string): boolean => {
    if (!dateString) return false;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

// Helper function to get days until due
  const getDaysUntilDue = (dateString: string): number => {
  if (!dateString) return 0;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

// Kaiser workflow configuration
const kaiserWorkflow = {
  'Pre-T2038, Compiling Docs': { next: 'T2038 Requested', recommendedDays: 7 },
  'T2038 Requested': { next: 'T2038 Received', recommendedDays: 14 },
  'T2038 Received': { next: 'T2038 received, Need First Contact', recommendedDays: 3 },
  'T2038 received, Need First Contact': { next: 'T2038 received, doc collection', recommendedDays: 7 },
  'T2038 received, doc collection': { next: 'RN Visit Needed', recommendedDays: 14 },
  'RN Visit Needed': { next: 'RN/MSW Scheduled', recommendedDays: 7 },
  'RN/MSW Scheduled': { next: 'RN Visit Complete', recommendedDays: 14 },
  'RN Visit Complete': { next: 'Tier Level Request Needed', recommendedDays: 3 },
  'Tier Level Request Needed': { next: 'Tier Level Requested', recommendedDays: 7 },
  'Tier Level Requested': { next: 'Tier Level Received', recommendedDays: 21 },
  'Tier Level Received': { next: 'RCFE Needed', recommendedDays: 3 },
  'RCFE Needed': { next: 'RCFE_Located', recommendedDays: 14 },
  'RCFE_Located': { next: 'R&B Requested', recommendedDays: 7 },
  'R&B Requested': { next: 'R&B Signed', recommendedDays: 14 },
  'R&B Signed': { next: 'ILS Sent for Contract', recommendedDays: 7 },
  'ILS Sent for Contract': { next: 'ILS Contract Email Needed', recommendedDays: 14 },
  'ILS Contract Email Needed': { next: 'Complete', recommendedDays: 7 }
};

// Predefined Kaiser statuses to show immediately
const KAISER_STATUSES = [
  'T2038 Requested',
  'T2038 Received', 
  'T2038 received, Need First Contact',
  'T2038 received, doc collection',
  'Needs RN Visit',
  'RN/MSW Scheduled',
  'RN Visit Complete',
  'Need Tier Level',
  'Tier Level Requested',
  'Tier Level Received',
  'Locating RCFEs',
  'Found RCFE',
  'R&B Requested',
  'R&B Signed',
  'RCFE/ILS for Invoicing',
  'ILS Contracted (Complete)',
  'Confirm ILS Contracted',
  'Tier Level Revision Request',
  'On-Hold',
  'Tier Level Appeal',
  'T2038 email but need auth sheet',
  'Non-active',
  'Pending',
  'Switched MCPs',
  'Pending to Switch',
  'Authorized on hold',
  'Authorized',
  'Denied',
  'Expired',
  'Not interested',
  'Not CalAIM'
];

const CALAIM_STATUSES = [
  'Authorized',
  'Non-Active',
  'Pending',
  'Denied',
  'Expired',
  'On Hold',
  'Under Review'
];

const COUNTIES = [
  'Los Angeles',
  'San Diego',
  'Orange',
  'Riverside',
  'San Bernardino',
  'Ventura',
  'Santa Barbara',
  'Kern',
  'Fresno',
  'Imperial'
];

// Member Notes Modal Component
interface MemberNotesModalProps {
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
  onNewNoteChange: (note: any) => void;
  onCreateNote: () => void;
}

function MemberNotesModal({
  isOpen,
  onClose,
  member,
  notes,
  isLoadingNotes,
  newNote,
  onNewNoteChange,
  onCreateNote
}: MemberNotesModalProps) {
  if (!isOpen || !member) return null;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'Caspio': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'App': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Admin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {member.memberFirstName} {member.memberLastName} - Member Notes
          </DialogTitle>
          <DialogDescription>
            MRN: {member.memberMrn} | County: {member.memberCounty} | Kaiser Status: {member.Kaiser_Status}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
          {/* Notes List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Notes History</h3>
              <Badge variant="outline">
                {notes.length} notes
              </Badge>
            </div>

            {isLoadingNotes ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading notes...</p>
              </div>
            ) : (
              <ScrollArea className="h-[50vh]">
                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                      <p className="text-muted-foreground">
                        No notes have been created for this member yet.
                      </p>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className={`p-4 border rounded-lg ${!note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex gap-2">
                            <Badge variant="outline" className={getPriorityColor(note.priority)}>
                              {note.priority}
                            </Badge>
                            <Badge variant="outline">
                              {note.noteType || 'General'}
                            </Badge>
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
            <h3 className="text-lg font-medium">Add New Note</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Priority</label>
                <Select 
                  value={newNote.priority} 
                  onValueChange={(value: 'Low' | 'Medium' | 'High' | 'Urgent') => 
                    onNewNoteChange({ ...newNote, priority: value })
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
                  onChange={(e) => onNewNoteChange({ ...newNote, noteText: e.target.value })}
                  placeholder="Enter note content..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Assign to Staff (Optional)</label>
                  <Select
                    value={newNote.assignedToName}
                    onValueChange={(value) => {
                      // Map staff names to IDs (in production, this would come from a staff API)
                      const staffMap: Record<string, string> = {
                        'John': 'john-user-id',
                        'Nick': 'nick-user-id',
                        'Jesse': 'jesse-user-id'
                      };
                      onNewNoteChange({ 
                        ...newNote, 
                        assignedToName: value,
                        assignedTo: staffMap[value] || ''
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
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
                    onChange={(e) => onNewNoteChange({ ...newNote, followUpDate: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <Button 
                onClick={onCreateNote} 
                disabled={!newNote.noteText.trim()}
                className="w-full"
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

// Staff Member Management Modal Component
interface StaffMemberManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  members: KaiserMember[];
  onMemberUpdate: () => void;
}

function StaffMemberManagementModal({
  isOpen,
  onClose,
  staffName,
  members,
  onMemberUpdate
}: StaffMemberManagementModalProps) {
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberUpdates, setMemberUpdates] = useState<Record<string, Partial<KaiserMember>>>({});
  const [newNote, setNewNote] = useState('');
  const [addingNoteFor, setAddingNoteFor] = useState<string | null>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleStatusUpdate = async (memberId: string, newStatus: string) => {
    try {
      const response = await fetch('/api/kaiser-members/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, status: newStatus })
      });

      if (response.ok) {
          toast({
          title: "Status Updated",
          description: "Member status has been updated successfully.",
        });
        onMemberUpdate();
        } else {
        throw new Error('Failed to update status');
      }
    } catch (error) {
          toast({
        title: "Update Failed",
        description: "Failed to update member status. Please try again.",
        variant: "destructive",
      });
    }
  };

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
          authorId: 'current-user-id'
        })
      });

      if (response.ok) {
        toast({
          title: "Note Added",
          description: "Note has been added successfully.",
        });
        setNewNote('');
        setAddingNoteFor(null);
        onMemberUpdate();
      } else {
        throw new Error('Failed to add note');
      }
    } catch (error) {
      toast({
        title: "Note Failed",
        description: "Failed to add note. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleNextStepUpdate = (memberId: string, field: string, value: string) => {
    setMemberUpdates(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [field]: value
      }
    }));
  };

  const saveNextStepUpdates = async (memberId: string) => {
    const updates = memberUpdates[memberId];
    if (!updates) return;

    try {
      const response = await fetch('/api/kaiser-members/update-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, ...updates })
      });

      if (response.ok) {
      toast({
          title: "Updates Saved",
          description: "Member workflow has been updated successfully.",
        });
        setEditingMember(null);
        setMemberUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[memberId];
          return newUpdates;
        });
        onMemberUpdate();
      } else {
        throw new Error('Failed to save updates');
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save updates. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {staffName} - Member Management
          </DialogTitle>
          <DialogDescription>
            Manage {members.length} members assigned to {staffName}. Update statuses, next steps, and add notes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {members.map((member) => {
              const isEditing = editingMember === member.id;
              const updates = memberUpdates[member.id] || {};
              const isAddingNote = addingNoteFor === member.id;

              return (
                <Card key={member.id} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {member.memberFirstName} {member.memberLastName}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingMember(isEditing ? null : member.id)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          {isEditing ? 'Cancel' : 'Edit'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          Kaiser Status
                        </label>
                        <Select
                          value={member.Kaiser_Status}
                          onValueChange={(value) => handleStatusUpdate(member.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getKaiserStatusesInOrder().map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          CalAIM Status
                        </label>
                        <Badge variant="outline" className="text-sm">
                          {member.CalAIM_Status || 'Not set'}
                        </Badge>
                      </div>
                    </div>

                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Next Steps & Workflow</span>
                      </div>

                      {isEditing ? (
                        <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Next Step
                            </label>
                            <Input
                              value={updates.workflow_step || member.workflow_step || ''}
                              onChange={(e) => handleNextStepUpdate(member.id, 'workflow_step', e.target.value)}
                              placeholder="Enter next step..."
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Due Date
                            </label>
                            <Input
                              type="date"
                              value={updates.Next_Step_Due_Date || member.Next_Step_Due_Date || ''}
                              onChange={(e) => handleNextStepUpdate(member.id, 'Next_Step_Due_Date', e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Notes
                            </label>
                            <Textarea
                              value={updates.workflow_notes || member.workflow_notes || ''}
                              onChange={(e) => handleNextStepUpdate(member.id, 'workflow_notes', e.target.value)}
                              placeholder="Add workflow notes..."
                              rows={3}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveNextStepUpdates(member.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save Changes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingMember(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-600">Next Step:</span>
                            <span className="ml-2 font-medium">
                              {member.workflow_step || 'Not set'}
                            </span>
                          </div>
                          {member.Next_Step_Due_Date && (
                            <div>
                              <span className="text-gray-600">Due Date:</span>
                              <span className="ml-2 font-medium">
                                {formatDate(member.Next_Step_Due_Date)}
                              </span>
                            </div>
                          )}
                          {member.workflow_notes && (
                            <div>
                              <span className="text-gray-600">Notes:</span>
                              <span className="ml-2 text-gray-800">
                                {member.workflow_notes}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
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
                            <Button
                              size="sm"
                              onClick={() => handleAddNote(member.id)}
                              disabled={!newNote.trim()}
                            >
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function KaiserTrackerPage() {
  const { isAdmin, user } = useAdmin();
  const { toast } = useToast();

  // State declarations
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMembers, setModalMembers] = useState<KaiserMember[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDescription, setModalDescription] = useState('');
  const [modalFilterType, setModalFilterType] = useState<'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'overdue_tasks' | 'staff_members'>('kaiser_status');
  const [modalFilterValue, setModalFilterValue] = useState('');
  const [staffMemberModal, setStaffMemberModal] = useState<{
    isOpen: boolean;
    staffName: string;
    members: KaiserMember[];
  }>({ isOpen: false, staffName: '', members: [] });

  // Member notes modal state
  const [memberNotesModal, setMemberNotesModal] = useState<{
    isOpen: boolean;
    member: KaiserMember | null;
    notes: any[];
    isLoadingNotes: boolean;
  }>({ isOpen: false, member: null, notes: [], isLoadingNotes: false });

  const [newNote, setNewNote] = useState({
    noteText: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High' | 'Urgent',
    assignedTo: '',
    assignedToName: '',
    followUpDate: ''
  });
  const [filters, setFilters] = useState({
    kaiserStatus: 'all',
    calaimStatus: 'all',
    county: 'all',
    assignment: 'all',
    staffAssigned: 'all',
    overdueOnly: false
  });

  // Calculate status summary - get all unique Kaiser statuses from the data
  const statusSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    
    // Count actual statuses from the data
    members.forEach(member => {
      const status = member.Kaiser_Status || 'No Status';
      summary[status] = (summary[status] || 0) + 1;
    });
    
    // Convert to array and sort by status name for consistent display
    return Object.entries(summary)
      .sort(([a], [b]) => a.localeCompare(b)) // Sort alphabetically by status name
      .map(([status, count]) => ({ status, count }));
  }, [members]);

  // Calculate staff assignments for Kaiser staff only
  const kaiserStaff = ['John', 'Nick', 'Jesse'];
  const staffAssignments = useMemo(() => {
    const assignments: Record<string, { 
      count: number; 
      members: any[];
      statusBreakdown: Record<string, number>;
      nextSteps: Record<string, { count: number; dates: string[] }>;
    }> = {};
    
    // Initialize staff
    kaiserStaff.forEach(staff => {
      assignments[staff] = { 
        count: 0, 
        members: [], 
        statusBreakdown: {},
        nextSteps: {}
      };
    });
    
    // Count members assigned to each staff
    members.forEach(member => {
      // Try multiple possible staff assignment field names from Caspio
      const staffName = member.Staff_Assignment || 
                       member.Staff_Assigned || 
                       member.kaiser_user_assignment || 
                       member.SW_ID || 
                       member.Assigned_Staff ||
                       'Unassigned';
      
      // Only count Kaiser staff members
      if (kaiserStaff.includes(staffName)) {
        assignments[staffName].count++;
        assignments[staffName].members.push(member);
        
        // Count status breakdown
        const status = member.Kaiser_Status || 'No Status';
        assignments[staffName].statusBreakdown[status] = (assignments[staffName].statusBreakdown[status] || 0) + 1;
        
        // Count next steps
        const nextStep = member.Next_Step || member.workflow_step || 'No Next Step';
        const nextStepDate = member.Next_Step_Due_Date || member.Next_Step_Date || '';
        
        if (!assignments[staffName].nextSteps[nextStep]) {
          assignments[staffName].nextSteps[nextStep] = { count: 0, dates: [] };
        }
        assignments[staffName].nextSteps[nextStep].count++;
        if (nextStepDate) {
          assignments[staffName].nextSteps[nextStep].dates.push(nextStepDate);
        }
      }
    });
    
    return assignments;
  }, [members]);

  // Helper function to open member list modal
  const openMemberModal = (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'overdue_tasks' | 'staff_members',
    filterValue: string
  ) => {
    setModalMembers(memberList);
    setModalTitle(title);
    setModalDescription(description);
    setModalFilterType(filterType);
    setModalFilterValue(filterValue);
    setModalOpen(true);
  };

  // Helper function to open staff member management modal
  const openStaffMemberModal = (staffName: string, members: KaiserMember[]) => {
    setStaffMemberModal({
      isOpen: true,
      staffName,
      members
    });
  };

  // Helper function to handle member click and load notes
  const handleMemberClick = async (member: KaiserMember) => {
    setMemberNotesModal({
      isOpen: true,
      member,
      notes: [],
      isLoadingNotes: true
    });

    try {
      // Fetch member notes
      const response = await fetch(`/api/member-notes?clientId2=${member.client_ID2}`);
      const data = await response.json();
      
      if (data.success) {
        setMemberNotesModal(prev => ({
          ...prev,
          notes: data.notes || [],
          isLoadingNotes: false
        }));
        
        toast({
          title: data.fromCache ? "Notes Loaded from Cache" : "Notes Synced from Caspio",
          description: `${data.notes?.length || 0} notes loaded for ${member.memberFirstName} ${member.memberLastName}`,
        });
      } else {
        throw new Error(data.error || 'Failed to load notes');
      }
      
    } catch (error: any) {
      console.error('Error loading member notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load member notes",
        variant: "destructive"
      });
      
      setMemberNotesModal(prev => ({
        ...prev,
        notes: [],
        isLoadingNotes: false
      }));
    }
  };

  // Helper function to create a new note
  const handleCreateNote = async () => {
    if (!memberNotesModal.member || !newNote.noteText.trim()) {
      toast({
        title: "Error",
        description: "Please enter note content",
        variant: "destructive"
      });
      return;
    }

    try {
      const noteData = {
        clientId2: memberNotesModal.member.client_ID2,
        memberName: `${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}`,
        noteText: newNote.noteText,
        priority: newNote.priority,
        assignedTo: newNote.assignedTo || undefined,
        assignedToName: newNote.assignedToName || undefined,
        followUpDate: newNote.followUpDate || undefined,
        authorId: user?.uid || 'current-user',
        authorName: user?.displayName || user?.email || 'Current User'
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
        // Update the member's notes
        setMemberNotesModal(prev => ({
          ...prev,
          notes: [data.note, ...prev.notes]
        }));

        // Reset form
        setNewNote({
          noteText: '',
          priority: 'Medium',
          assignedTo: '',
          assignedToName: '',
          followUpDate: ''
        });

        toast({
          title: "Note Created",
          description: `Note added for ${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}${newNote.assignedToName ? ` and assigned to ${newNote.assignedToName}` : ''}`,
        });

        // Show notification if assigned to staff
        if (newNote.assignedTo && newNote.assignedToName) {
          // Trigger staff notification
          await fetch('/api/staff/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'note_assignment',
              title: 'New Note Assigned',
              message: `You have been assigned a ${newNote.priority.toLowerCase()} priority note for ${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}`,
              noteId: data.note.id,
              clientId2: memberNotesModal.member.client_ID2,
              memberName: `${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}`,
              priority: newNote.priority,
              assignedTo: newNote.assignedTo,
              createdBy: user?.uid || 'current-user',
              createdByName: user?.displayName || user?.email || 'Current User'
            })
          });

          toast({
            title: "Notification Sent",
            description: `${newNote.assignedToName} has been notified`,
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
    }
  };

  // Helper functions
  const isOverdue = (dateString: string): boolean => {
    if (!dateString) return false;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'Not set';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  const getDaysUntilDue = (dateString: string): number => {
    if (!dateString) return 0;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Fetch Kaiser members from Caspio
  const fetchCaspioData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/kaiser-members');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      
      // Check if the response has the expected structure
      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch Kaiser members');
      }
      
      // Extract the members array from the response
      const data = responseData.members || [];
      
      // Clean and process the data
      const cleanMembers = data.map((member: any, index: number) => ({
        ...member,
        id: member?.id || `frontend-member-${index}-${member?.Client_ID2 || Math.random().toString(36).substring(7)}`,
        memberFirstName: member?.memberFirstName || 'Unknown',
        memberLastName: member?.memberLastName || 'Member',
        memberMrn: member?.memberMrn || '',
        memberCounty: member?.memberCounty || 'Unknown',
        memberPhone: member?.memberPhone || '',
        memberEmail: member?.memberEmail || '',
        client_ID2: member?.Client_ID2 || 'N/A',
        pathway: member?.pathway || 'Unknown',
        Kaiser_Status: member?.Kaiser_Status || member?.Kaiser_ID_Status || 'No Status',
        CalAIM_Status: member?.CalAIM_Status || 'No Status',
        Staff_Assigned: member?.SW_ID || '',
        Next_Step_Due_Date: member?.Next_Step_Due_Date || '',
        workflow_step: member?.workflow_step || '',
        workflow_notes: member?.workflow_notes || '',
        last_updated: member?.lastUpdated || new Date().toISOString(),
        created_at: member?.created_at || new Date().toISOString()
      }));

      setMembers(cleanMembers);
      
      toast({
        title: "Data Synced Successfully",
        description: `Loaded ${cleanMembers.length} Kaiser members from Caspio`,
      });
    } catch (error) {
      console.error('Error fetching Kaiser members:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to load Kaiser members. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update member status
  const updateMemberStatus = async (memberId: string, field: string, value: string) => {
    try {
      // Update local state immediately for better UX
      setMembers(prev => prev.map(member => 
        member.id === memberId 
          ? { ...member, [field]: value, last_updated: new Date().toISOString() }
          : member
      ));

      // Here you would typically make an API call to update the backend
      // await updateMemberInCaspio(memberId, field, value);
      
      toast({
        title: "Status Updated",
        description: `Member ${field} updated successfully`,
      });
    } catch (error) {
      console.error('Error updating member:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update member status",
        variant: "destructive",
      });
    }
  };

  // Filter and sort functions
  const filteredMembers = () => {
    return members.filter(member => {
      if (filters.kaiserStatus !== 'all' && member.Kaiser_Status !== filters.kaiserStatus) return false;
      if (filters.calaimStatus !== 'all' && member.CalAIM_Status !== filters.calaimStatus) return false;
      if (filters.county !== 'all' && member.memberCounty !== filters.county) return false;
      if (filters.staffAssigned !== 'all' && member.Staff_Assigned !== filters.staffAssigned) return false;
      if (filters.overdueOnly && !isOverdue(member.Next_Step_Due_Date)) return false;
      return true;
    });
  };

  const sortedMembers = filteredMembers().sort((a, b) => {
        if (!sortField) return 0;
        
    let aValue: any = '';
    let bValue: any = '';
        
          switch (sortField) {
            case 'name':
        aValue = `${a.memberFirstName} ${a.memberLastName}`;
        bValue = `${b.memberFirstName} ${b.memberLastName}`;
              break;
            case 'county':
        aValue = a.memberCounty;
        bValue = b.memberCounty;
              break;
            case 'kaiser_status':
        aValue = a.Kaiser_Status;
        bValue = b.Kaiser_Status;
              break;
            case 'calaim_status':
        aValue = a.CalAIM_Status;
        bValue = b.CalAIM_Status;
              break;
      case 'staff':
        aValue = a.Staff_Assigned;
        bValue = b.Staff_Assigned;
              break;
            case 'due_date':
        aValue = new Date(a.Next_Step_Due_Date || '9999-12-31');
        bValue = new Date(b.Next_Step_Due_Date || '9999-12-31');
              break;
            default:
              return 0;
          }
          
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
  });

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon
  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Handle filter changes
  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      kaiserStatus: 'all',
      calaimStatus: 'all',
      county: 'all',
      assignment: 'all',
      staffAssigned: 'all',
      overdueOnly: false
    });
  };

  // Get unique values for filter dropdowns
  const allKaiserStatuses = [...new Set(members.map(m => m.Kaiser_Status).filter(Boolean))];
  const availableCounties = [...new Set(members.map(m => m.memberCounty).filter(Boolean))];
  const availableCalAIMStatuses = [...new Set(members.map(m => m.CalAIM_Status).filter(Boolean))];
  const staffMembers = [...new Set(members.map(m => m.Staff_Assigned).filter(Boolean))];

  // Load data on component mount
  useEffect(() => {
    // Only fetch data once on mount, don't auto-fetch
    // fetchCaspioData();
  }, []);

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kaiser Tracker Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Overview of {members.length} Kaiser members | Last sync: {members.length > 0 ? new Date().toLocaleString() : 'Never'}
          </p>
        </div>
        <Button 
          onClick={fetchCaspioData} 
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Syncing...' : 'Sync from Caspio'}
          </Button>
      </div>

      {/* Interactive Filtering Message */}
      {members.length > 0 && (
        <p className="text-sm text-gray-600 mb-4 text-center">
          Click on any status or staff member to view assigned members
        </p>
      )}

      {/* Summary Cards - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kaiser Status Summary Card */}
        <Card className="bg-white border-l-4 border-l-blue-500 shadow">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-gray-400" />
              Kaiser Status Summary
          </CardTitle>
        </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {KAISER_STATUSES.map((status, index) => {
                const count = members.filter(m => m.Kaiser_Status === status).length;
                const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
                return (
                  <div key={`kaiser-${index}-${status}`} 
                       className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                       onClick={() => {
                         if (members.length > 0) {
                           const filteredMembers = members.filter(m => m.Kaiser_Status === status);
                           openMemberModal(filteredMembers, `${status} Members`, `${count} members with status: ${status}`, 'kaiser_status', status);
                         }
                       }}>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      <span className="font-medium truncate">{status}</span>
            </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-bold text-blue-600">{count}</span>
                      {members.length > 0 && count > 0 && (
                        <span className="text-gray-500 ml-1">({percentage}%)</span>
                      )}
            </div>
            </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* CalAIM Status Summary Card */}
        <Card className="bg-white border-l-4 border-l-green-500 shadow">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-4 w-4 text-gray-400" />
              CalAIM Status Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {CALAIM_STATUSES.map((status, index) => {
                const count = members.filter(m => m.CalAIM_Status === status).length;
                const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
                return (
                  <div key={`calaim-${index}-${status}`} 
                       className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                onClick={() => {
                         if (members.length > 0) {
                           const filteredMembers = members.filter(m => m.CalAIM_Status === status);
                           openMemberModal(filteredMembers, `${status} Members`, `${count} members with CalAIM status: ${status}`, 'calaim_status', status);
                         }
                       }}>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                      <span className="font-medium">{status}</span>
          </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-bold text-green-600">{count}</span>
                      {members.length > 0 && count > 0 && (
                        <span className="text-gray-500 ml-1">({percentage}%)</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

        {/* County Summary Card */}
        <Card className="bg-white border-l-4 border-l-purple-500 shadow">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-gray-400" />
              County Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {COUNTIES.map((county, index) => {
                const count = members.filter(m => m.memberCounty === county).length;
                const percentage = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0';
                return (
                  <div key={`county-${index}-${county}`} 
                       className="flex items-center justify-between py-0.5 px-1 hover:bg-gray-50 rounded cursor-pointer text-xs"
                       onClick={() => {
                         if (members.length > 0) {
                           const filteredMembers = members.filter(m => m.memberCounty === county);
                           openMemberModal(filteredMembers, `${county} County Members`, `${count} members in ${county} County`, 'county', county);
                         }
                       }}>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                      <span className="font-medium">{county} County</span>
            </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-bold text-purple-600">{count}</span>
                      {members.length > 0 && count > 0 && (
                        <span className="text-gray-500 ml-1">({percentage}%)</span>
                      )}
            </div>
            </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Assignment Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Kaiser Staff Assignments</h3>
        
        {/* Staff Member Count Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kaiserStaff.map(staffName => {
            const assignment = staffAssignments[staffName];
            return (
              <Card key={`staff-${staffName}`} className="bg-white border-l-4 border-l-indigo-500 shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-4 w-4 text-indigo-600" />
                    {staffName}
            </CardTitle>
          </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-center">
                    <button
                      onClick={() => assignment.count > 0 && openStaffMemberModal(staffName, assignment.members)}
                      className={`text-3xl font-bold mb-1 transition-colors ${
                        assignment.count > 0 
                          ? 'text-indigo-600 hover:text-indigo-800 cursor-pointer' 
                          : 'text-gray-400 cursor-default'
                      }`}
                      disabled={assignment.count === 0}
                    >
                      {assignment.count}
                    </button>
                    <div className="text-sm text-gray-600">
                      Members Assigned
            </div>
                    {assignment.count > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {((assignment.count / members.length) * 100).toFixed(1)}% of total
                        <div className="text-xs text-blue-600 mt-1">
                          Click number to manage
                        </div>
                        <Link 
                          href="/admin/tasks"
                          className="text-xs text-green-600 hover:text-green-800 underline mt-1 block"
                        >
                          View in My Tasks →
                        </Link>
                      </div>
                    )}
            </div>
          </CardContent>
        </Card>
            );
          })}
        </div>

        {/* Staff Status Breakdown Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kaiserStaff.map(staffName => {
            const assignment = staffAssignments[staffName];
            return (
              <Card key={`staff-status-${staffName}`} className="bg-white border-l-4 border-l-orange-500 shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle className="h-4 w-4 text-orange-600" />
                    {staffName} - Status & Next Steps
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
                            .sort(([,a], [,b]) => b - a)
                            .slice(0, 5)
                            .map(([status, count]) => (
                            <div key={`${staffName}-status-${status}`} className="flex justify-between items-center text-xs">
                              <span className="truncate pr-2" title={status}>{status}</span>
                              <span className="font-semibold text-orange-600">{count}</span>
                        </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Next Steps */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2">Next Steps</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {Object.entries(assignment.nextSteps)
                            .sort(([,a], [,b]) => b.count - a.count)
                            .slice(0, 3)
                            .map(([nextStep, data]) => (
                            <div key={`${staffName}-next-${nextStep}`} className="text-xs">
                              <div className="flex justify-between items-center">
                                <span className="truncate pr-2" title={nextStep}>{nextStep}</span>
                                <span className="font-semibold text-blue-600">{data.count}</span>
                  </div>
                              {data.dates.length > 0 && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Due: {data.dates.slice(0, 2).map(date => {
                                    try {
                                      return format(new Date(date), 'MM/dd');
                                    } catch {
                                      return date;
                                    }
                                  }).join(', ')}
                                  {data.dates.length > 2 && ` +${data.dates.length - 2} more`}
                </div>
                              )}
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


      {/* Member Search by Last Name */}
      <Card className="bg-white border-l-4 border-l-orange-500 shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-gray-400" />
            Member Search by Last Name
            </CardTitle>
          </CardHeader>
          <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm">Load member data to enable search</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter last name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                  Clear
                </Button>
              </div>
              
              {searchTerm && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {members
                    .filter(member => {
                      const searchLower = searchTerm.toLowerCase();
                      const lastName = (member.memberLastName || '').toLowerCase();
                      
                      return lastName.includes(searchLower);
                    })
                    .slice(0, 10)
                    .map(member => (
                      <div key={member.id} className="p-3 bg-gray-50 rounded border">
                        <div className="font-medium text-gray-900">
                          {member.memberLastName}, {member.memberFirstName}
                          </div>
                        <div className="text-sm text-gray-600 mt-1">
                          ID: {member.client_ID2} | {member.memberCounty} County
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {member.Kaiser_Status}
                          </Badge>
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            {member.CalAIM_Status}
                          </Badge>
                        </div>
                  </div>
                    ))}
                  {members.filter(member => {
                    const searchLower = searchTerm.toLowerCase();
                    const lastName = (member.memberLastName || '').toLowerCase();
                    return lastName.includes(searchLower);
                  }).length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      <p className="text-sm">No members found with last name "{searchTerm}"</p>
                </div>
              )}
            </div>
              )}

              {!searchTerm && (
                <div className="text-center py-2">
                  <div className="text-3xl font-bold text-gray-900">{members.length}</div>
                  <p className="text-sm text-gray-600">Total Kaiser Members</p>
      </div>
                      )}
                    </div>
          )}
          </CardContent>
        </Card>

      {/* Member List Modal */}
      <MemberListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        members={modalMembers}
        title={modalTitle}
        description={modalDescription}
        onMemberClick={(member) => {
          // Handle member click if needed
          console.log('Member clicked:', member);
        }}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        allKaiserStatuses={allKaiserStatuses}
        availableCounties={availableCounties}
        availableCalAIMStatuses={availableCalAIMStatuses}
        staffMembers={staffMembers}
      />
            </div>
  );
}

// Member List Modal Component
function MemberListModal({
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
  staffMembers
}: {
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
}) {
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
        
        {/* Compact Filters - Moved directly under cards */}
        <div className="px-6 py-2 bg-gray-50 border-b">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-600 font-medium text-xs">Filters:</span>
            <Select value={filters.kaiserStatus} onValueChange={(value) => onFilterChange('kaiserStatus', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="Kaiser Status" />
                          </SelectTrigger>
                          <SelectContent>
                <SelectItem value="all">All Kaiser Statuses</SelectItem>
                {allKaiserStatuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

            <Select value={filters.county} onValueChange={(value) => onFilterChange('county', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="County" />
                          </SelectTrigger>
                          <SelectContent>
                <SelectItem value="all">All Counties</SelectItem>
                {availableCounties.map(county => (
                  <SelectItem key={county} value={county}>{county}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.calaimStatus} onValueChange={(value) => onFilterChange('calaimStatus', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="CalAIM Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CalAIM Statuses</SelectItem>
                {availableCalAIMStatuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.staffAssigned} onValueChange={(value) => onFilterChange('staffAssigned', value)}>
              <SelectTrigger className="w-auto h-7 text-xs">
                <SelectValue placeholder="Staff Assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffMembers.map(staff => (
                  <SelectItem key={staff} value={staff}>{staff}</SelectItem>
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
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or sync data from Caspio.
              </p>
                              </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const isStepOverdue = isOverdue(member.Next_Step_Due_Date);
                const daysUntilDue = getDaysUntilDue(member.Next_Step_Due_Date);
                const isUrgent = daysUntilDue <= 3 && daysUntilDue > 0;
                
                return (
                  <Card 
                    key={member.id} 
                    className={`cursor-pointer hover:bg-gray-50 transition-colors border-l-4 ${
                      isStepOverdue ? 'border-l-red-500 bg-red-50' : 
                      isUrgent ? 'border-l-yellow-500 bg-yellow-50' : 
                      'border-l-blue-500'
                    }`}
                    onClick={() => handleMemberClick(member)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                              <div className="flex items-center gap-2">
                            <h3 className="font-medium">
                              {member.memberFirstName} {member.memberLastName}
                            </h3>
                            {isStepOverdue && (
                              <div className="flex items-center gap-1 text-red-600">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="text-xs font-medium">OVERDUE</span>
                              </div>
                            )}
                            {isUrgent && !isStepOverdue && (
                              <div className="flex items-center gap-1 text-yellow-600">
                                <Clock className="h-4 w-4" />
                                <span className="text-xs font-medium">URGENT</span>
                              </div>
                            )}
                              </div>
                          
                          <p className="text-sm text-muted-foreground mt-1">
                            ID: {member.client_ID2} | County: {member.memberCounty}
                          </p>
                          
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline" className={`text-xs ${getStatusColor(member.Kaiser_Status)}`}>
                              Kaiser: {member.Kaiser_Status || 'No Status'}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              CalAIM: {member.CalAIM_Status || 'No Status'}
                            </Badge>
                              </div>

                          {/* Staff Assignment and Next Step Info */}
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-blue-500" />
                              <div>
                                <span className="text-gray-600">Staff:</span>
                                <span className="ml-1 font-medium">
                                  {member.Staff_Assigned || 'Unassigned'}
                                </span>
                              </div>
                                </div>
                            
                        <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-purple-500" />
                              <div>
                                <span className="text-gray-600">Next Step:</span>
                                <span className="ml-1 font-medium">
                                  {member.workflow_step || 'Not set'}
                              </span>
                            </div>
                        </div>
                              </div>

                          {/* Next Step Due Date */}
                          {member.Next_Step_Due_Date && (
                            <div className="mt-2 flex items-center gap-2 text-sm">
                              <Clock className={`h-4 w-4 ${isStepOverdue ? 'text-red-500' : isUrgent ? 'text-yellow-500' : 'text-gray-500'}`} />
                              <div>
                                <span className="text-gray-600">Due:</span>
                                <span className={`ml-1 font-medium ${
                                  isStepOverdue ? 'text-red-600' : 
                                  isUrgent ? 'text-yellow-600' : 
                                  'text-gray-900'
                                }`}>
                                  {formatDate(member.Next_Step_Due_Date)}
                                  {daysUntilDue !== 0 && (
                                    <span className="ml-1 text-xs">
                                      ({daysUntilDue > 0 ? `${daysUntilDue} days left` : `${Math.abs(daysUntilDue)} days overdue`})
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Workflow Notes */}
                          {member.workflow_notes && (
                            <div className="mt-2 text-sm">
                              <span className="text-gray-600">Notes:</span>
                              <span className="ml-1 text-gray-800">{member.workflow_notes}</span>
                        </div>
                          )}
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

      {/* Staff Member Management Modal */}
      <StaffMemberManagementModal
        isOpen={staffMemberModal.isOpen}
        onClose={() => setStaffMemberModal({ isOpen: false, staffName: '', members: [] })}
        staffName={staffMemberModal.staffName}
        members={staffMemberModal.members}
        onMemberUpdate={() => {
          // Refresh data after updates
          fetchMembers();
        }}
      />

      {/* Member Notes Modal */}
      <MemberNotesModal
        isOpen={memberNotesModal.isOpen}
        onClose={() => setMemberNotesModal({ isOpen: false, member: null, notes: [], isLoadingNotes: false })}
        member={memberNotesModal.member}
        notes={memberNotesModal.notes}
        isLoadingNotes={memberNotesModal.isLoadingNotes}
        newNote={newNote}
        onNewNoteChange={setNewNote}
        onCreateNote={handleCreateNote}
      />
    </div>
  );
}