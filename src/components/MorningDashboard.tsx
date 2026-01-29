'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  BellRing, 
  Clock, 
  User, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  MessageSquare,
  Users,
  Activity
} from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

interface MorningNotification {
  id: string;
  title: string;
  content: string;
  memberName?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  type: 'member_note' | 'system' | 'reminder' | 'assignment';
  createdAt: any; // Firestore Timestamp
  isRead: boolean;
  requiresStaffAction: boolean;
  actionUrl?: string;
}

interface MorningStats {
  totalUnread: number;
  priorityAlerts: number;
  memberNotes: number;
  systemUpdates: number;
  overdueItems: number;
}

export default function MorningDashboard() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [notifications, setNotifications] = useState<MorningNotification[]>([]);
  const [stats, setStats] = useState<MorningStats>({
    totalUnread: 0,
    priorityAlerts: 0,
    memberNotes: 0,
    systemUpdates: 0,
    overdueItems: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  // Set greeting based on time of day
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('Good morning');
    } else if (hour < 17) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }
  }, []);

  // Load morning notifications
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoading(false);
      return;
    }

    console.log(`🌅 Loading morning dashboard for user: ${user.uid}`);

    // Query unread notifications from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const notificationsQuery = query(
      collection(firestore, 'staff-notifications'),
      where('recipientId', '==', user.uid),
      where('isRead', '==', false),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const morningNotifications: MorningNotification[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        morningNotifications.push({
          id: doc.id,
          title: data.title || 'Notification',
          content: data.content || '',
          memberName: data.memberName,
          priority: data.priority || 'Medium',
          type: data.type || 'system',
          createdAt: data.createdAt,
          isRead: data.isRead || false,
          requiresStaffAction: data.requiresStaffAction || false,
          actionUrl: data.actionUrl
        });
      });

      // Calculate stats
      const newStats: MorningStats = {
        totalUnread: morningNotifications.length,
        priorityAlerts: morningNotifications.filter(n => n.priority === 'Priority' || n.priority === 'Urgent').length,
        memberNotes: morningNotifications.filter(n => n.type === 'member_note').length,
        systemUpdates: morningNotifications.filter(n => n.type === 'system').length,
        overdueItems: morningNotifications.filter(n => n.requiresStaffAction).length
      };

      setNotifications(morningNotifications);
      setStats(newStats);
      setIsLoading(false);

      console.log(`🌅 Morning dashboard loaded: ${newStats.totalUnread} unread notifications`);
    }, (error) => {
      console.error('Error loading morning dashboard:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, firestore]);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    if (!firestore) return;
    
    try {
      await updateDoc(doc(firestore, 'staff-notifications', notificationId), {
        isRead: true
      });
      console.log(`✅ Marked notification as read: ${notificationId}`);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!firestore) return;
    
    try {
      const batch = firestore.batch();
      const unreadNotifications = notifications.filter(n => !n.isRead);
      unreadNotifications.forEach(n => {
        const docRef = doc(firestore, 'staff-notifications', n.id);
        batch.update(docRef, { isRead: true });
      });
      await batch.commit();
      console.log(`✅ Marked all ${notifications.length} notifications as read`);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'text-red-600 bg-red-50 border-red-200';
      case 'High': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'Medium': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTimeDisplay = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    if (isToday(date)) {
      return `Today at ${format(date, 'h:mm a')}`;
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'h:mm a')}`;
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading your morning dashboard...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                {greeting}, {user?.displayName || user?.email?.split('@')[0] || 'there'}! 👋
              </CardTitle>
              <CardDescription>
                Here's what happened while you were away
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats.totalUnread}</p>
                <p className="text-xs text-muted-foreground">Total Unread</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.priorityAlerts}</p>
                <p className="text-xs text-muted-foreground">Priority Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{stats.memberNotes}</p>
                <p className="text-xs text-muted-foreground">Member Notes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{stats.systemUpdates}</p>
                <p className="text-xs text-muted-foreground">System Updates</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{stats.overdueItems}</p>
                <p className="text-xs text-muted-foreground">Action Required</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <BellRing className="h-5 w-5" />
              <span>Recent Notifications</span>
            </CardTitle>
            {stats.totalUnread > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead}>
                Mark All as Read
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">All caught up!</h3>
              <p className="text-muted-foreground">No new notifications to review.</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-4 rounded-lg border transition-colors",
                      !notification.isRead ? "bg-blue-50/50 border-blue-200" : "bg-background"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge className={cn("text-xs", getPriorityColor(notification.priority))}>
                            {notification.priority}
                          </Badge>
                          {notification.memberName && (
                            <Badge variant="outline" className="text-xs">
                              {notification.memberName}
                            </Badge>
                          )}
                          {notification.requiresStaffAction && (
                            <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200">
                              Action Required
                            </Badge>
                          )}
                        </div>
                        
                        <h4 className="font-medium mb-1">{notification.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.content}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {getTimeDisplay(notification.createdAt)}
                          </span>
                          <div className="flex space-x-2">
                            {notification.actionUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  markAsRead(notification.id);
                                  window.location.href = notification.actionUrl!;
                                }}
                              >
                                View Details
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                            >
                              Mark as Read
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}