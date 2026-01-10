'use client';

import { Badge } from '@/components/ui/badge';
import { FileText, Upload } from 'lucide-react';

interface NewDocumentBadgeProps {
  hasNewDocuments?: boolean;
  newDocumentCount?: number;
  className?: string;
}

export function NewDocumentBadge({ 
  hasNewDocuments, 
  newDocumentCount = 0,
  className = '' 
}: NewDocumentBadgeProps) {
  if (!hasNewDocuments || newDocumentCount === 0) {
    return null;
  }

  return (
    <Badge 
      variant="outline" 
      className={`bg-blue-100 text-blue-800 border-blue-200 animate-pulse ${className}`}
    >
      <Upload className="mr-1 h-3 w-3" />
      {newDocumentCount} new doc{newDocumentCount !== 1 ? 's' : ''}
    </Badge>
  );
}