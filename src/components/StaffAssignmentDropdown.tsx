'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sendStaffAssignmentEmail } from '@/app/actions/send-email';
import { getStaffEmail, getAllStaff } from '@/lib/staff-directory';

interface Member {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn?: string;
  memberCounty?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
  kaiser_user_assignment?: string;
  next_steps_date?: string;
}

interface StaffAssignmentDropdownProps {
  member: Member;
  staffMembers: string[];
  onAssignmentChange: (memberId: string, field: string, value: string) => Promise<void>;
  currentUser?: {
    displayName?: string;
    email?: string;
  };
  showEmailButton?: boolean;
}

export function StaffAssignmentDropdown({
  member,
  staffMembers,
  onAssignmentChange,
  currentUser,
  showEmailButton = true
}: StaffAssignmentDropdownProps) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const { toast } = useToast();

  const handleStaffAssignment = async (newStaffName: string) => {
    if (newStaffName === member.kaiser_user_assignment) return;
    
    setIsAssigning(true);
    try {
      // Update the assignment
      await onAssignmentChange(member.id, 'kaiser_user_assignment', newStaffName === 'unassigned' ? '' : newStaffName);
      
      // Send email notification if assigning to a staff member (not unassigning)
      if (newStaffName && newStaffName !== 'unassigned') {
        await sendEmailNotification(newStaffName);
      }
      
      toast({
        title: 'Assignment Updated',
        description: newStaffName === 'unassigned' 
          ? `${member.memberFirstName} ${member.memberLastName} has been unassigned`
          : `${member.memberFirstName} ${member.memberLastName} assigned to ${newStaffName}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast({
        variant: 'destructive',
        title: 'Assignment Failed',
        description: 'Failed to update staff assignment. Please try again.',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const sendEmailNotification = async (staffName: string) => {
    const staffEmail = getStaffEmail(staffName);
    if (!staffEmail) {
      console.warn(`No email found for staff member: ${staffName}`);
      return;
    }

    try {
      await sendStaffAssignmentEmail({
        to: staffEmail,
        staffName: staffName,
        memberName: `${member.memberFirstName} ${member.memberLastName}`,
        memberMrn: member.memberMrn || 'N/A',
        memberCounty: member.memberCounty || 'N/A',
        kaiserStatus: member.Kaiser_Status || 'Pending',
        calaimStatus: member.CalAIM_Status || 'Pending',
        assignedBy: currentUser?.displayName || currentUser?.email || 'System Admin',
        nextStepsDate: member.next_steps_date ? new Date(member.next_steps_date).toLocaleDateString() : undefined,
      });
      
      console.log(`Assignment notification sent to ${staffEmail}`);
    } catch (error) {
      console.error('Failed to send assignment notification:', error);
      // Don't show error to user for email failures, assignment still succeeded
    }
  };

  const handleManualEmailSend = async () => {
    if (!member.kaiser_user_assignment) return;
    
    setIsSendingEmail(true);
    try {
      await sendEmailNotification(member.kaiser_user_assignment);
      toast({
        title: 'Notification Sent',
        description: `Email notification sent to ${member.kaiser_user_assignment}`,
        className: 'bg-blue-100 text-blue-900 border-blue-200',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Email Failed',
        description: 'Failed to send email notification',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={member.kaiser_user_assignment && member.kaiser_user_assignment.trim() !== '' ? member.kaiser_user_assignment : 'unassigned'}
        onValueChange={handleStaffAssignment}
        disabled={isAssigning}
      >
        <SelectTrigger className="w-full min-w-[150px]">
          <SelectValue>
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="text-sm">
                {isAssigning ? 'Updating...' : (member.kaiser_user_assignment || 'Unassigned')}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-gray-400" />
              <span className="text-gray-600">Unassigned</span>
            </div>
          </SelectItem>
          {staffMembers.map((staff) => (
            <SelectItem key={staff} value={staff}>
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-blue-600" />
                <span>{staff}</span>
                {getStaffEmail(staff) && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                    Email
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showEmailButton && member.kaiser_user_assignment && getStaffEmail(member.kaiser_user_assignment) && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleManualEmailSend}
          disabled={isSendingEmail || isAssigning}
          className="flex items-center gap-1"
        >
          {isSendingEmail ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Mail className="h-3 w-3" />
          )}
          Notify
        </Button>
      )}
    </div>
  );
}