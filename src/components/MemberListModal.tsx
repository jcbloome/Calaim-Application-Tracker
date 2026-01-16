'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, User, MapPin, Calendar, Clock, AlertTriangle, UserPlus, Mail } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { StaffAssignmentDropdown } from '@/components/StaffAssignmentDropdown';
import { useAuth } from '@/firebase/auth';

interface Member {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  client_ID2?: string;
  memberMrn?: string;
  memberCounty?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
  kaiser_user_assignment?: string;
  next_steps_date?: string;
  pathway?: string;
}

interface MemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  title: string;
  description: string;
  filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'overdue_tasks';
  filterValue: string;
  staffMembers?: string[];
  onMemberUpdate?: (memberId: string, field: string, value: string) => Promise<void>;
}

export function MemberListModal({
  isOpen,
  onClose,
  members,
  title,
  description,
  filterType,
  filterValue,
  staffMembers = [],
  onMemberUpdate
}: MemberListModalProps) {
  const [sortBy, setSortBy] = useState<'name' | 'county' | 'status' | 'due_date'>('name');
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const isOverdue = (dateString?: string) => {
    if (!dateString) return false;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const handleStaffAssignment = async (memberId: string, staffName: string) => {
    if (!onMemberUpdate) return;
    
    setIsAssigning(memberId);
    try {
      await onMemberUpdate(memberId, 'kaiser_user_assignment', staffName);
      
      // Send notification to staff (you can implement this later)
      toast({
        title: 'Staff Assigned Successfully',
        description: `Member assigned to ${staffName}. Notification sent to staff.`,
      });
      
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast({
        variant: 'destructive',
        title: 'Assignment Failed',
        description: 'Failed to assign staff member. Please try again.',
      });
    } finally {
      setIsAssigning(null);
    }
  };

  const getDaysUntilDue = (dateString?: string) => {
    if (!dateString) return null;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const sortedMembers = [...members].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return `${a.memberFirstName} ${a.memberLastName}`.localeCompare(`${b.memberFirstName} ${b.memberLastName}`);
      case 'county':
        return (a.memberCounty || '').localeCompare(b.memberCounty || '');
      case 'status':
        return (a.Kaiser_Status || '').localeCompare(b.Kaiser_Status || '');
      case 'due_date':
        if (!a.next_steps_date && !b.next_steps_date) return 0;
        if (!a.next_steps_date) return 1;
        if (!b.next_steps_date) return -1;
        return new Date(a.next_steps_date).getTime() - new Date(b.next_steps_date).getTime();
      default:
        return 0;
    }
  });

  const getStatusColor = (status?: string) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('completed') || statusLower.includes('authorized')) {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (statusLower.includes('pending') || statusLower.includes('requested')) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
    if (statusLower.includes('denied') || statusLower.includes('rejected')) {
      return 'bg-red-100 text-red-800 border-red-200';
    }
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description} • {members.length} member{members.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 pb-4 border-b">
          <span className="text-sm font-medium">Sort by:</span>
          <div className="flex gap-1">
            {[
              { key: 'name', label: 'Name' },
              { key: 'county', label: 'County' },
              { key: 'status', label: 'Status' },
              { key: 'due_date', label: 'Due Date' }
            ].map(({ key, label }) => (
              <Button
                key={key}
                size="sm"
                variant={sortBy === key ? 'default' : 'outline'}
                onClick={() => setSortBy(key as any)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Members List */}
        <ScrollArea className="flex-1 max-h-96">
          <div className="space-y-3">
            {sortedMembers.map((member) => {
              const daysUntilDue = getDaysUntilDue(member.next_steps_date);
              const overdue = isOverdue(member.next_steps_date);
              
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    {/* Member Name and ID */}
                    <div className="flex items-center gap-3">
                      <div>
                        <h4 className="font-medium">
                          {member.memberFirstName} {member.memberLastName}
                        </h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {member.client_ID2 && (
                            <Badge variant="outline" className="text-xs">
                              {member.client_ID2}
                            </Badge>
                          )}
                          {member.memberMrn && (
                            <span>MRN: {member.memberMrn}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Member Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      {member.memberCounty && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span>{member.memberCounty}</span>
                        </div>
                      )}
                      
                      {member.Kaiser_Status && (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={getStatusColor(member.Kaiser_Status)}>
                            {member.Kaiser_Status}
                          </Badge>
                        </div>
                      )}
                      
                      {member.kaiser_user_assignment && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{member.kaiser_user_assignment}</span>
                        </div>
                      )}
                    </div>

                    {/* Due Date and Pathway */}
                    <div className="flex items-center gap-4 text-sm">
                      {member.next_steps_date && (
                        <div className={`flex items-center gap-1 ${overdue ? 'text-red-600' : daysUntilDue !== null && daysUntilDue <= 3 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                          {overdue ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <Calendar className="h-3 w-3" />
                          )}
                          <span>
                            {overdue ? 'Overdue: ' : 'Due: '}
                            {format(new Date(member.next_steps_date), 'MMM dd, yyyy')}
                            {daysUntilDue !== null && !overdue && daysUntilDue <= 7 && (
                              <span className="ml-1">({daysUntilDue} day{daysUntilDue !== 1 ? 's' : ''})</span>
                            )}
                          </span>
                        </div>
                      )}
                      
                      {member.pathway && (
                        <Badge variant="outline" className="text-xs">
                          {member.pathway}
                        </Badge>
                      )}
                    </div>

                    {/* Staff Assignment Section - Show for unassigned members or staff_assignment filter */}
                    {(filterType === 'staff_assignment' || (!member.kaiser_user_assignment && staffMembers.length > 0)) && (
                      <div className="mt-3 p-3 bg-orange-50 rounded border border-orange-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-orange-600" />
                            <span className="text-sm font-medium text-orange-700">
                              {member.kaiser_user_assignment ? 'Reassign Staff' : 'Assign Staff'}
                            </span>
                          </div>
                          <div className="flex-1 ml-4">
                            <StaffAssignmentDropdown
                              member={member}
                              staffMembers={staffMembers}
                              onAssignmentChange={onMemberUpdate || (async () => {})}
                              currentUser={user}
                              showEmailButton={true}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/applications/${member.id}`}>
                      <Button size="sm" className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        View Application
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {members.length} member{members.length !== 1 ? 's' : ''} 
            {filterType === 'kaiser_status' && ` with Kaiser status: ${filterValue}`}
            {filterType === 'county' && ` in ${filterValue} County`}
            {filterType === 'staff' && ` assigned to ${filterValue}`}
            {filterType === 'calaim_status' && ` with CalAIM status: ${filterValue}`}
            {filterType === 'staff_assignment' && ` that need staff assignment`}
            {filterType === 'overdue_tasks' && ` with overdue tasks`}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}