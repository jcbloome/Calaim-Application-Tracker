'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquare, Search, Calendar, User, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { addDoc, collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, getDocs, documentId } from 'firebase/firestore';

interface StaffNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  memberName?: string;
  memberId?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  isRead: boolean;
  createdAt: any;
  authorName: string;
  recipientId: string;
  senderId?: string;
  applicationId?: string;
  actionUrl?: string;
  status?: 'Open' | 'Closed';
}

function MyNotesContent() {
  const { user, isAdmin, loading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [isSendingReply, setIsSendingReply] = useState<Record<string, boolean>>({});
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [generalNote, setGeneralNote] = useState<{
    recipientId: string;
    title: string;
    message: string;
    priority: 'Regular' | 'Immediate';
  }>({
    recipientId: '',
    title: '',
    message: '',
    priority: 'Regular'
  });
  const [isSendingGeneral, setIsSendingGeneral] = useState(false);

  // Load notifications from Firestore
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoadingNotes(false);
      return;
    }

    setIsLoadingNotes(true);
    
    try {
      // Query notifications sent TO the current user
      const notificationsQuery = query(
        collection(firestore, 'staff_notifications'),
        where('userId', '==', user.uid)
      );

      const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const userNotifications: StaffNotification[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          userNotifications.push({
            id: doc.id,
            type: data.type || 'notification',
            title: data.title || 'Notification',
            content: data.message || data.content || '',
            memberName: data.memberName || undefined,
            memberId: data.clientId2 || data.memberId || undefined,
            priority: data.priority || 'Medium',
            isRead: Boolean(data.isRead),
            createdAt: data.timestamp || data.createdAt,
            authorName: data.createdByName || data.senderName || 'System',
            recipientId: data.userId || user.uid,
            senderId: data.createdBy || data.senderId,
            applicationId: data.applicationId || undefined,
            actionUrl: data.actionUrl || undefined,
            status: data.status === 'Closed' ? 'Closed' : 'Open'
          });
        });

        // Sort by creation date (newest first)
        userNotifications.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setNotifications(userNotifications);
        setIsLoadingNotes(false);
        
        console.log(`📋 Loaded ${userNotifications.length} notifications for user`);
      }, (error) => {
        console.error('❌ Error loading notifications:', error);
        setIsLoadingNotes(false);
        toast({
          title: "Error",
          description: "Failed to load notifications. Please refresh the page.",
          variant: "destructive"
        });
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('❌ Error setting up notifications listener:', error);
      setIsLoadingNotes(false);
      toast({
        title: "Error", 
        description: "Failed to load notifications. Please refresh the page.",
        variant: "destructive"
      });
    }
  }, [firestore, user?.uid, toast]);

  useEffect(() => {
    const replyTo = searchParams.get('replyTo');
    if (!replyTo || notifications.length === 0) return;
    const target = notifications.find((note) => note.id === replyTo);
    if (!target) return;
    setReplyOpen((prev) => ({ ...prev, [replyTo]: true }));
  }, [searchParams, notifications]);

  useEffect(() => {
    const compose = searchParams.get('compose');
    if (compose !== '1') return;
    if (typeof window === 'undefined') return;
    const element = document.getElementById('compose-note');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams]);

  useEffect(() => {
    const loadAdminStaff = async () => {
      if (!firestore) return;
      try {
        setIsLoadingStaff(true);
        const [adminSnap, superAdminSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')),
          getDocs(collection(firestore, 'roles_super_admin'))
        ]);
        const adminIds = adminSnap.docs.map((docItem) => docItem.id);
        const superAdminIds = superAdminSnap.docs.map((docItem) => docItem.id);
        const allIds = Array.from(new Set([...adminIds, ...superAdminIds]));
        if (allIds.length === 0) {
          setStaffList([]);
          return;
        }

        const chunks: string[][] = [];
        for (let i = 0; i < allIds.length; i += 10) {
          chunks.push(allIds.slice(i, i + 10));
        }

        const users: Array<{ uid: string; name: string }> = [];
        for (const chunk of chunks) {
          const usersSnap = await getDocs(
            query(collection(firestore, 'users'), where(documentId(), 'in', chunk))
          );
          usersSnap.forEach((docItem) => {
            const data = docItem.data() as any;
            users.push({
              uid: docItem.id,
              name: data.firstName && data.lastName
                ? `${data.firstName} ${data.lastName}`
                : data.email || 'Unknown Staff'
            });
          });
        }

        users.sort((a, b) => a.name.localeCompare(b.name));
        setStaffList(users);
      } catch (error) {
        console.error('Failed to load admin staff:', error);
        setStaffList([]);
      } finally {
        setIsLoadingStaff(false);
      }
    };

    loadAdminStaff();
  }, [firestore]);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    if (!firestore) return;
    
    try {
      await updateDoc(doc(firestore, 'staff_notifications', notificationId), { isRead: true });
      toast({
        title: "Success",
        description: "Notification marked as read",
      });
    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (!firestore) return;
    
    try {
      const unreadNotifications = notifications.filter(n => !n.isRead);
      
      if (unreadNotifications.length === 0) {
        toast({
          title: "Info",
          description: "No unread notifications to mark",
        });
        return;
      }

      const batch = writeBatch(firestore);
      unreadNotifications.forEach(notification => {
        batch.update(doc(firestore, 'staff_notifications', notification.id), { isRead: true });
      });
      
      await batch.commit();
      
      toast({
        title: "Success",
        description: `Marked ${unreadNotifications.length} notifications as read`,
      });
    } catch (error) {
      console.error('❌ Failed to mark all notifications as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive",
      });
    }
  };

  const handleReplySend = async (notification: StaffNotification) => {
    if (!firestore || !user?.uid) return;
    if (!notification.senderId) {
      toast({
        title: "Missing Sender",
        description: "This note does not have a sender to reply to.",
        variant: "destructive",
      });
      return;
    }
    const message = replyDrafts[notification.id]?.trim();
    if (!message) {
      toast({
        title: "Missing Reply",
        description: "Enter a reply message before sending.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingReply((prev) => ({ ...prev, [notification.id]: true }));
      await addDoc(collection(firestore, 'staff_notifications'), {
        userId: notification.senderId,
        title: `Reply: ${notification.title}`,
        message,
        memberName: notification.memberName,
        clientId2: notification.memberId,
        applicationId: notification.applicationId,
        type: 'interoffice_reply',
        priority: 'Medium',
        status: 'Open',
        isRead: false,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Staff',
        senderName: user.displayName || user.email || 'Staff',
        timestamp: serverTimestamp(),
        replyToId: notification.id,
        threadId: notification.id,
        actionUrl: notification.actionUrl || (notification.applicationId ? `/admin/applications/${notification.applicationId}` : '/admin/my-notes')
      });

      toast({
        title: "Reply Sent",
        description: "Your reply was sent to the original sender.",
      });
      setReplyDrafts((prev) => ({ ...prev, [notification.id]: '' }));
      setReplyOpen((prev) => ({ ...prev, [notification.id]: false }));
    } catch (error) {
      console.error('❌ Failed to send reply:', error);
      toast({
        title: "Error",
        description: "Failed to send reply.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply((prev) => ({ ...prev, [notification.id]: false }));
    }
  };

  const handleSendGeneralNote = async () => {
    if (!firestore || !user?.uid) return;
    if (!generalNote.recipientId || !generalNote.message.trim()) {
      toast({
        title: "Missing Details",
        description: "Select a staff member and enter a message.",
        variant: "destructive",
      });
      return;
    }

    const recipient = staffList.find((staff) => staff.uid === generalNote.recipientId);
    if (!recipient) {
      toast({
        title: "Recipient Not Found",
        description: "Selected staff member was not found.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingGeneral(true);
      await addDoc(collection(firestore, 'staff_notifications'), {
        userId: recipient.uid,
        title: generalNote.title?.trim() || 'General Note',
        message: generalNote.message.trim(),
        type: 'interoffice_note',
        priority: generalNote.priority === 'Immediate' ? 'Urgent' : 'Low',
        status: 'Open',
        isRead: false,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Staff',
        senderName: user.displayName || user.email || 'Staff',
        timestamp: serverTimestamp(),
        isGeneral: true,
        actionUrl: '/admin/my-notes'
      });

      toast({
        title: "Note Sent",
        description: `Sent to ${recipient.name}.`,
      });

      setGeneralNote({
        recipientId: '',
        title: '',
        message: '',
        priority: 'Regular'
      });
    } catch (error) {
      console.error('Failed to send general note:', error);
      toast({
        title: "Error",
        description: "Failed to send note.",
        variant: "destructive",
      });
    } finally {
      setIsSendingGeneral(false);
    }
  };

  // Refresh notifications
  const refresh = () => {
    setIsLoadingNotes(true);
    // The useEffect will handle reloading
  };

  // Filter notifications based on search term
  const filteredNotifications = notifications.filter(notification => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      notification.title?.toLowerCase().includes(searchLower) ||
      notification.content?.toLowerCase().includes(searchLower) ||
      notification.memberName?.toLowerCase().includes(searchLower) ||
      notification.authorName?.toLowerCase().includes(searchLower)
    );
  });

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                You need admin permissions to access notifications.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My Notifications</h1>
          <p className="text-muted-foreground">
            View and manage your personal notifications and member-related alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {filteredNotifications.some(n => !n.isRead) && (
            <Button onClick={markAllAsRead} variant="outline" size="sm">
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      <Card id="compose-note">
        <CardHeader>
          <CardTitle>Send General Staff Note</CardTitle>
          <CardDescription>
            Send a non-member note to another staff member. This stays in the app only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="general-recipient">Recipient</Label>
            <Select
              value={generalNote.recipientId}
              onValueChange={(value) => setGeneralNote((prev) => ({ ...prev, recipientId: value }))}
              disabled={isLoadingStaff}
            >
              <SelectTrigger id="general-recipient">
                <SelectValue placeholder={isLoadingStaff ? 'Loading staff...' : 'Select staff member'} />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((staff) => (
                  <SelectItem key={staff.uid} value={staff.uid}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="general-title">Title (optional)</Label>
            <Input
              id="general-title"
              value={generalNote.title}
              onChange={(e) => setGeneralNote((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="General Note"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="general-message">Message</Label>
            <Textarea
              id="general-message"
              rows={3}
              value={generalNote.message}
              onChange={(e) => setGeneralNote((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="Write a note for staff..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="general-priority">Priority</Label>
            <Select
              value={generalNote.priority}
              onValueChange={(value: 'Regular' | 'Immediate') =>
                setGeneralNote((prev) => ({ ...prev, priority: value }))
              }
            >
              <SelectTrigger id="general-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Regular">Regular (no popup)</SelectItem>
                <SelectItem value="Immediate">Immediate (popup)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSendGeneralNote} disabled={isSendingGeneral} className="w-full">
            {isSendingGeneral ? 'Sending...' : 'Send Note'}
          </Button>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search notifications..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading State */}
      {isLoadingNotes && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading notifications...</p>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Notifications List */}
      {!isLoadingNotes && (
        <div className="space-y-4">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No notifications match your search' : 'No notifications found'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={`transition-colors hover:bg-accent/50 ${
                  !notification.isRead ? 'border-blue-200 bg-blue-50/30' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between space-x-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center space-x-2">
                        <h3 className={`font-medium ${!notification.isRead ? 'text-blue-900' : ''}`}>
                          {notification.title}
                        </h3>
                        <Badge 
                          variant="outline" 
                          className={getPriorityColor(notification.priority)}
                        >
                          {notification.priority}
                        </Badge>
                        {!notification.isRead && (
                          <Badge variant="default" className="bg-blue-600">
                            New
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        {notification.content}
                      </p>
                      
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <User className="h-3 w-3" />
                          <span>{notification.authorName}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatTimestamp(notification.createdAt)}</span>
                        </div>
                        {notification.memberName && (
                          <div className="flex items-center space-x-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>Member: {notification.memberName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-2">
                      {!notification.isRead && (
                        <Button 
                          onClick={() => markAsRead(notification.id)}
                          variant="outline" 
                          size="sm"
                        >
                          Mark Read
                        </Button>
                      )}
                      <Button
                        onClick={() =>
                          setReplyOpen((prev) => ({
                            ...prev,
                            [notification.id]: !prev[notification.id]
                          }))
                        }
                        variant="outline"
                        size="sm"
                      >
                        Reply
                      </Button>
                    </div>
                  </div>

                  {replyOpen[notification.id] && (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        rows={3}
                        value={replyDrafts[notification.id] || ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [notification.id]: e.target.value }))
                        }
                        placeholder="Write a reply to the sender..."
                      />
                      <Button
                        onClick={() => handleReplySend(notification)}
                        size="sm"
                        disabled={isSendingReply[notification.id]}
                      >
                        {isSendingReply[notification.id] ? 'Sending...' : 'Send Reply'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Summary */}
      {!isLoadingNotes && filteredNotifications.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
                {searchTerm && ` matching "${searchTerm}"`}
              </span>
              <span>
                {filteredNotifications.filter(n => !n.isRead).length} unread
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MyNotesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" />Loading...</div>}>
      <MyNotesContent />
    </Suspense>
  );
}