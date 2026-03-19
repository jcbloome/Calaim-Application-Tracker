'use client';

import { Badge } from '@/components/ui/badge';
import { MessageSquare } from 'lucide-react';

interface MemberNoteCreatorProps {
  clientId2: string;
  memberName: string;
  memberHealthPlan?: string;
  context?: 'application' | 'general';
  className?: string;
}

export function MemberNoteCreator({
  clientId2,
  memberName,
  memberHealthPlan,
  context = 'general',
  className = ''
}: MemberNoteCreatorProps) {
  void clientId2;
  void memberName;
  void memberHealthPlan;
  void context;

  return (
    <div className={className}>
      <Badge variant="outline" className="bg-blue-50 text-blue-900 border-blue-200">
        <MessageSquare className="h-3.5 w-3.5 mr-1" />
        Member notes are read-only from Caspio
      </Badge>
    </div>
  );
}