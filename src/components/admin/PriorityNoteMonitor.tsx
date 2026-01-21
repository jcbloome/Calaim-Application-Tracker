'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Bell, 
  BellRing, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  User,
  FileText,
  Play,
  RefreshCw,
  Eye
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface PriorityNote {
  noteId: string;
  clientId2: string;
  memberName: string;
  noteContent: string;
  priority: 'low' | 'medium' | 'high';
  staffAssigned?: string;
  dateCreated: string;
  createdBy: string;
  isPriority: boolean;
}

interface MonitoringStats {
  isActive: boolean;
  lastCheck: string | null;
  notesFound: number;
  staffTokens: number;
  nextCheck: string | null;
}

export function PriorityNoteMonitor() {
  const [notes, setNotes] = useState<PriorityNote[]>([]);
  const [stats, setStats] = useState<MonitoringStats>({
    isActive: true,
    lastCheck: null,
    notesFound: 0,
    staffTokens: 0,
    nextCheck: null
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const functions = getFunctions();
  const testMonitoring = httpsCallable(functions, 'testPriorityNoteMonitoring');
  const getPriorityNotes = httpsCallable(functions, 'getPriorityNotesForDashboard');

  /**
   * Load priority notes for dashboard
   */
  const loadPriorityNotes = async () => {
    setLoading(true);
    try {
      const result = await getPriorityNotes();
      const data = result.data as any;
      
      if (data.success) {
        setNotes(data.notes || []);
        setStats(prev => ({
          ...prev,
          notesFound: data.count || 0
        }));
        
        toast({
          title: "Priority Notes Loaded",
          description: `Found ${data.count} priority notes in the last 7 days`,
        });
      } else {
        throw new Error(data.message || 'Failed to load priority notes');
      }
    } catch (error: any) {
      console.error('Error loading priority notes:', error);
      toast({
        title: "Error Loading Notes",
        description: error.message || 'Failed to load priority notes',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Test the monitoring system
   */
  const runTest = async () => {
    setTesting(true);
    try {
      const result = await testMonitoring();
      const data = result.data as any;
      
      if (data.success) {
        setStats(prev => ({
          ...prev,
          lastCheck: new Date().toISOString(),
          notesFound: data.notesFound || 0,
          staffTokens: data.staffTokens || 0
        }));
        
        toast({
          title: "Test Completed Successfully",
          description: `Found ${data.notesFound} notes, ${data.staffTokens} staff tokens`,
        });
        
        // Reload notes after test
        await loadPriorityNotes();
      } else {
        throw new Error(data.message || 'Test failed');
      }
    } catch (error: any) {
      console.error('Error testing monitoring:', error);
      toast({
        title: "Test Failed",
        description: error.message || 'Failed to test monitoring system',
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  /**
   * Get priority color for badge
   */
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  /**
   * Calculate next check time (every 15 minutes)
   */
  const getNextCheckTime = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    const nextQuarter = Math.ceil(minutes / 15) * 15;
    
    const nextCheck = new Date(now);
    if (nextQuarter >= 60) {
      nextCheck.setHours(nextCheck.getHours() + 1);
      nextCheck.setMinutes(0);
    } else {
      nextCheck.setMinutes(nextQuarter);
    }
    nextCheck.setSeconds(0);
    nextCheck.setMilliseconds(0);
    
    return nextCheck.toISOString();
  };

  // Load data on component mount
  useEffect(() => {
    loadPriorityNotes();
    
    // Update next check time
    setStats(prev => ({
      ...prev,
      nextCheck: getNextCheckTime()
    }));
    
    // Update next check time every minute
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        nextCheck: getNextCheckTime()
      }));
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Monitoring Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            Caspio Priority Note Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                stats.isActive ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="text-sm font-medium">
                {stats.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Last Check: {stats.lastCheck ? formatDistanceToNow(new Date(stats.lastCheck), { addSuffix: true }) : 'Never'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Notes Found: {stats.notesFound}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Staff Tokens: {stats.staffTokens}
              </span>
            </div>
          </div>
          
          {stats.nextCheck && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Clock className="h-4 w-4" />
              Next automatic check: {format(new Date(stats.nextCheck), 'h:mm a')}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button 
              onClick={runTest} 
              disabled={testing}
              size="sm"
            >
              {testing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Test System
                </>
              )}
            </Button>
            
            <Button 
              onClick={loadPriorityNotes} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Notes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Priority Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Recent Priority Notes (Last 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No priority notes found in the last 7 days</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {notes.map((note, index) => (
                  <div key={note.noteId}>
                    <div className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50">
                      <div className="flex-shrink-0 mt-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {note.memberName || 'Unknown Member'}
                          </span>
                          <Badge className={cn("text-xs", getPriorityColor(note.priority))}>
                            {note.priority.toUpperCase()}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {note.noteContent}
                        </p>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            Created: {format(new Date(note.dateCreated), 'MMM d, h:mm a')}
                          </span>
                          <span>
                            By: {note.createdBy || 'Unknown'}
                          </span>
                          {note.staffAssigned && (
                            <span>
                              Assigned: {note.staffAssigned}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          // Navigate to member page with note highlighted
                          window.open(`/admin/member/${note.clientId2}?tab=notes&highlight=${note.noteId}`, '_blank');
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {index < notes.length - 1 && <Separator className="my-2" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monitoring Frequency:</span>
              <span>Every 15 minutes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Operation Mode:</span>
              <span className="text-green-600 font-medium">READ-ONLY</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notification Method:</span>
              <span>Firebase Cloud Messaging (FCM)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target Priority:</span>
              <span>HIGH priority notes only</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Caspio Interference:</span>
              <span className="text-green-600 font-medium">ZERO - Safe Operation</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}