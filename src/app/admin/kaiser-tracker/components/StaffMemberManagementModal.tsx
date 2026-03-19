'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
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
  void onMemberUpdate;

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
            View {members.length} members assigned to {staffName}. Tracker fields and notes are read-only (Caspio-backed).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-4">
          <div className="space-y-4">
            {members.map((member, index) => {
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

