'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  limit,
  Timestamp 
} from 'firebase/firestore';
import { db } from '@/firebase';
import { CursorStyleNotification } from './CursorStyleNotification';
import { useGlobalNotifications } from './NotificationProvider';

interface StaffNotification {
  id: string;
  userId: string;
  noteId: string;
  title: string;
  message: string;
  senderName: string;
  memberName: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Timestamp;
  isRead: boolean;
  applicationId?: string;
}

interface NotificationData {
  id: string;
  title: string;
  message: string;
  senderName: string;
  memberName: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  applicationId?: string;
}

export function RealTimeNotifications() {
  const { user } = useAuth();
  const { showNotification } = useGlobalNotifications();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    console.log('🔔 Setting up real-time notifications for user:', user.uid);

    // Listen for new notifications for this user
    const notificationsQuery = query(
      collection(db, 'staff_notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const newNotifications: NotificationData[] = [];
        
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as StaffNotification;
            const notification: NotificationData = {
              id: change.doc.id,
              title: data.title,
              message: data.message,
              senderName: data.senderName,
              memberName: data.memberName,
              type: data.type,
              priority: data.priority,
              timestamp: data.timestamp?.toDate() || new Date(),
              applicationId: data.applicationId,
            };
            
            newNotifications.push(notification);
            console.log('🔔 New notification received:', notification);
          }
        });

        if (newNotifications.length > 0) {
          setNotifications(prev => [...newNotifications, ...prev]);
          
          // Show system tray notification for each new notification
          newNotifications.forEach(notification => {
            showNotification({
              type: notification.type === 'assignment' ? 'task' : 'note',
              title: notification.title,
              message: notification.message,
              author: notification.senderName,
              memberName: notification.memberName,
              priority: notification.priority === 'high' ? 'High' : notification.priority === 'medium' ? 'Medium' : 'Low',
              duration: 0, // Stay until dismissed
              sound: true,
              soundType: 'arrow-target',
              animation: 'slide'
            });
          });
          
          // Play notification sound if enabled
          playNotificationSound();
        }

        setUnreadCount(snapshot.size);
      },
      (error) => {
        console.error('❌ Error listening to notifications:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const playNotificationSound = () => {
    // Check if user has sound enabled in their settings
    const soundEnabled = localStorage.getItem('notificationSoundEnabled') !== 'false';
    
    if (soundEnabled) {
      try {
        // Create a simple notification sound
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (error) {
        console.log('Could not play notification sound:', error);
      }
    }
  };

  const handleNotificationClose = async (notificationId: string) => {
    try {
      // Remove from local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Mark as read in Firebase
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationIds: [notificationId]
        }),
      });

      if (!response.ok) {
        console.error('Failed to mark notification as read');
      }
    } catch (error) {
      console.error('Error closing notification:', error);
    }
  };

  // Don't render anything if no user or no notifications
  if (!user || notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <CursorStyleNotification
          key={notification.id}
          notification={notification}
          onClose={() => handleNotificationClose(notification.id)}
        />
      ))}
    </div>
  );
}

// Badge component to show unread count
export function NotificationBadge() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const notificationsQuery = query(
      collection(db, 'staff_notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setUnreadCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [user]);

  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );
}