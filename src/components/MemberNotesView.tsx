'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  Calendar,
  User,
  MessageSquareText,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Mail,
  Bell,
  FileText,
  Loader2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface MemberNote {
  id: string;
  timestamp: Date;
  source?: 'notification' | 'caspio';
  
  // Common fields
  memberName?: string;
  senderName?: string;
  staffName?: string;
  priority?: 'low' | 'medium' | 'high';
  
  // Caspio note fields
  Note_Content?: string;
  Note_Text?: string;
  Staff_Name?: string;
  Staff_Member?: string;
  Note_Date?: string;
  Note_Type?: string;
  Note_Category?: string;
  tableType?: 'calaim_members' | 'client_notes';
  
  // Notification fields
  title?: string;
  message?: string;
  type?: string;
  isRead?: boolean;
  applicationId?: string;
}

interface MemberInfo {
  memberId: string;
  memberName: string;
  tableType: string;
}

interface MemberNotesViewProps {
  memberId?: string;
  memberName?: string;
  onClose: () => void;
}

export default function MemberNotesView({ memberId, memberName, onClose }: MemberNotesViewProps) {
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    if (memberId || memberName) {
      loadMemberNotes();
    }
  }, [memberId, memberName]);

  const loadMemberNotes = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const params = new URLSearchParams();
      if (memberId) params.append('memberId', memberId);
      if (memberName) params.append('memberName', memberName);
      params.append('limit', '100');

      const response = await fetch(`/api/member-notes?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setNotes(data.notes || []);
        setMemberInfo(data.memberInfo);
      } else {
        throw new Error(data.message || 'Failed to load member notes');
      }
    } catch (error: any) {
      console.error('Error loading member notes:', error);
      toast({
        variant: 'destructive',
        title: 'Error Loading Notes',
        description: error.message || 'Failed to load member notes',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceIcon = (note: MemberNote) => {
    if (note.source === 'notification') {
      return <Bell className="h-4 w-4 text-blue-600" />;
    } else if (note.tableType === 'calaim_members') {
      return <FileText className="h-4 w-4 text-purple-600" />;
    } else if (note.tableType === 'client_notes') {
      return <MessageSquareText className="h-4 w-4 text-green-600" />;
    }
    return <Info className="h-4 w-4 text-gray-600" />;
  };

  const getSourceLabel = (note: MemberNote) => {
    if (note.source === 'notification') {
      return 'App Notification';
    } else if (note.tableType === 'calaim_members') {
      return 'CalAIM Note';
    } else if (note.tableType === 'client_notes') {
      return 'Client Note';
    }
    return 'System Note';
  };

  const getNoteContent = (note: MemberNote) => {
    return note.Note_Content || note.Note_Text || note.message || note.title || 'No content available';
  };

  const getNoteSender = (note: MemberNote) => {
    return note.Staff_Name || note.Staff_Member || note.senderName || 'System';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-2xl mx-4">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2">Loading member notes...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {memberInfo?.memberName || memberName || 'Unknown Member'}
                </CardTitle>
                <CardDescription>
                  All notes and notifications • {notes.length} total
                  {memberInfo?.memberId && (
                    <span className="ml-2">
                      ID: {memberInfo.memberId}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMemberNotes(true)}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
              {memberInfo?.memberId && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/applications/${memberInfo.memberId}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Application
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquareText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">No Notes Found</h3>
              <p className="text-sm text-muted-foreground">
                No notes or notifications have been recorded for this member yet.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-4">
                {notes.map((note, index) => (
                  <Card key={note.id} className={`${!note.isRead && note.source === 'notification' ? 'border-blue-200 bg-blue-50' : ''}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getSourceIcon(note)}
                          <Badge variant="outline" className="text-xs">
                            {getSourceLabel(note)}
                          </Badge>
                          {note.priority && (
                            <Badge variant="outline" className={getPriorityColor(note.priority)}>
                              {note.priority}
                            </Badge>
                          )}
                          {note.source === 'notification' && !note.isRead && (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                              Unread
                            </Badge>
                          )}
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <div>{format(new Date(note.timestamp), 'MMM dd, yyyy')}</div>
                          <div>{format(new Date(note.timestamp), 'HH:mm')}</div>
                          <div className="text-xs">
                            {formatDistanceToNow(new Date(note.timestamp), { addSuffix: true })}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>From: {getNoteSender(note)}</span>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-sm leading-relaxed whitespace-pre-wrap">
                            {getNoteContent(note)}
                          </div>
                        </div>

                        {note.Note_Type && (
                          <div className="text-xs text-muted-foreground">
                            Type: {note.Note_Type}
                          </div>
                        )}

                        {note.Note_Category && (
                          <div className="text-xs text-muted-foreground">
                            Category: {note.Note_Category}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}