'use client';

import { useAdmin } from '@/hooks/use-admin';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Search, Calendar, User, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

interface StaffNotification {
  id: string;
  type: 'individual' | 'member-related' | 'system' | 'member-note';
  title: string;
  content: string;
  memberName?: string;
  memberId?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  isPrivate: boolean;
  isRead: boolean;
  createdAt: Timestamp;
  authorName: string;
  authorId: string;
  recipientId: string;
  requiresStaffAction: boolean;
  category: 'notification' | 'informational';
}

export default function MyNotesPage() {
  const { isLoading, isAdmin, user: adminUser } = useAdmin();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Load notes created by this user from Firestore
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoadingNotes(false);
      return;
    }

    setIsLoadingNotes(true);
    
    try {
      // Query notifications sent TO the current user
      const notificationsQuery = query(
        collection(firestore, 'staff-notifications'),
        where('recipientId', '==', user.uid)
      );

      const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const userNotifications: StaffNotification[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          userNotifications.push({
            id: doc.id,
            type: data.type || 'individual',
            title: data.title || 'Notification',
            content: data.content || '',
            memberName: data.memberName || undefined,
            memberId: data.memberId || undefined,
            priority: data.priority || 'Medium',
            isPrivate: data.isPrivate || false,
            isRead: data.isRead || false,
            createdAt: data.createdAt,
            authorName: data.authorName || 'System',
            authorId: data.authorId || 'system',
            recipientId: data.recipientId || user.uid,
            requiresStaffAction: data.requiresStaffAction || false,
            category: data.category || 'notification'
          });
        });
        
        // Sort notifications by creation date and read status
        userNotifications.sort((a, b) => {
          // Unread first, then by date
          if (a.isRead !== b.isRead) {
            return a.isRead ? 1 : -1;
          }
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime; // Newest first
        });
        
        setNotifications(userNotifications);
        setIsLoadingNotes(false);
        
        if (userNotifications.length === 0) {
          toast({
            title: 'No Notifications',
            description: 'You have no notifications at this time.',
            className: 'bg-blue-100 text-blue-900 border-blue-200',
          });
        }
      }, (error) => {
        console.error('Error loading notifications:', error);
        setIsLoadingNotes(false);
        toast({
          variant: 'destructive',
          title: 'Error Loading Notifications',
          description: 'Failed to load your notifications. Please try again.',
        });
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up notes listener:', error);
      setIsLoadingNotes(false);
    }
  }, [firestore, user?.uid, toast]);

  // Filter notifications based on search term
  const filteredNotifications = notifications.filter(notification => 
    notification.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (notification.memberName && notification.memberName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    notification.authorName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need administrator privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Notification Center</h1>
        <p className="text-muted-foreground">
          Your central hub for staff notifications, member alerts, and system messages.
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Notifications ({filteredNotifications.length})
                {unreadCount > 0 && (
                  <Badge className="bg-red-100 text-red-800 border-red-200">
                    {unreadCount} unread
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Staff notifications, member alerts, and system messages
              </CardDescription>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              size="sm"
              disabled={isLoadingNotes}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingNotes ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Notes List */}
          {isLoadingNotes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading notifications...</span>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                {searchTerm ? 'No matching notifications found' : 'No notifications yet'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm 
                  ? 'Try adjusting your search terms'
                  : 'Notifications sent to you will appear here'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNotifications.map((notification) => (
                <Card 
                  key={notification.id} 
                  className={`border-l-4 ${
                    notification.isRead 
                      ? 'border-l-gray-300 bg-gray-50' 
                      : notification.priority === 'High' || notification.priority === 'Urgent'
                        ? 'border-l-red-500 bg-red-50'
                        : 'border-l-blue-500 bg-blue-50'
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {notification.type === 'member-related' && notification.memberName && (
                          <>
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{notification.memberName}</span>
                          </>
                        )}
                        <Badge variant={
                          notification.priority === 'High' || notification.priority === 'Urgent' 
                            ? 'destructive' 
                            : notification.priority === 'Medium'
                              ? 'default'
                              : 'secondary'
                        }>
                          {notification.priority}
                        </Badge>
                        {!notification.isRead && (
                          <Badge className="bg-red-100 text-red-800 border-red-200">
                            New
                          </Badge>
                        )}
                        {notification.requiresStaffAction && (
                          <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                            Action Required
                          </Badge>
                        )}
                        {notification.isPrivate && (
                          <Badge variant="outline">Private</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {notification.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
                      </div>
                    </div>
                    
                    <div className="mb-2">
                      <h4 className="font-medium text-sm">{notification.title}</h4>
                      <p className="text-xs text-muted-foreground">From: {notification.authorName}</p>
                    </div>
                    
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {notification.content}
                    </p>
                    
                    {!notification.isRead && (
                      <div className="mt-3 pt-3 border-t">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            // Mark as read functionality would go here
                            console.log('Mark as read:', notification.id);
                          }}
                        >
                          Mark as Read
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}