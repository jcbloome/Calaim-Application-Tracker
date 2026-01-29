'use client';

import { useEffect, useState } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { shouldSuppressWebAlerts } from '@/lib/notification-utils';

interface PushNotificationManagerProps {
  onTokenReceived?: (token: string) => void;
}

const shouldSuppressBrowserNotifications = () => shouldSuppressWebAlerts();

export default function PushNotificationManager({ onTokenReceived }: PushNotificationManagerProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Check if push notifications are supported
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
    }
  }, []);

  // Register service worker and get FCM token
  useEffect(() => {
    if (!isSupported || !user) return;

    const initializePushNotifications = async () => {
      try {
        // Register service worker
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          console.log('✅ Service Worker registered:', registration);
        }

        // Initialize Firebase Messaging
        const messaging = getMessaging();

        // Request permission if not granted
        if (permission === 'default' && 'Notification' in window) {
          const newPermission = await Notification.requestPermission();
          setPermission(newPermission);
          
          if (newPermission === 'granted') {
            toast({
              title: "Push Notifications Enabled",
              description: "You'll receive desktop notifications for new note assignments even when the app is closed",
            });
          }
        }

        // Get FCM token if permission is granted
        if (permission === 'granted' || (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')) {
          try {
            const token = await getToken(messaging, {
              vapidKey: 'BKxvxQ9K5wYzJ8FqXN2M3L4P6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H3I4J5K6L7M8N9O0P1Q2R3S4T5U6V7W8X9Y0Z' // You'll need to generate this
            });

            if (token) {
              console.log('✅ FCM Token received:', token);
              setFcmToken(token);
              
              // Register token with your backend
              await registerFCMToken(user.uid, token);
              
              if (onTokenReceived) {
                onTokenReceived(token);
              }
            }
          } catch (tokenError) {
            console.error('❌ Error getting FCM token:', tokenError);
          }
        }

        // Handle foreground messages (when app is open)
        onMessage(messaging, (payload) => {
          console.log('📱 Foreground message received:', payload);
          
          // Show in-app notification
          toast({
            title: payload.notification?.title || "New Note Assignment",
            description: payload.notification?.body || "You have a new note assignment",
          });

          // Also show browser notification if permission is granted
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            !shouldSuppressBrowserNotifications()
          ) {
            const notification = new Notification(
              payload.notification?.title || '📝 CalAIM Note Assignment',
              {
                body: payload.notification?.body || 'You have a new note assignment',
                icon: '/calaimlogopdf.png',
                tag: payload.data?.notificationId || 'calaim-note',
                requireInteraction: String(payload.data?.priority || '').toLowerCase().includes('urgent'),
                data: payload.data
              }
            );

            notification.onclick = () => {
              if (typeof window !== 'undefined') {
                window.focus();
                if (payload.data?.clientId2) {
                  window.location.href = `/admin/client-notes?client=${payload.data.clientId2}`;
                } else {
                  window.location.href = '/admin/client-notes';
                }
              }
              notification.close();
            };
          }
        });

      } catch (error) {
        console.error('❌ Error initializing push notifications:', error);
      }
    };

    initializePushNotifications();
  }, [isSupported, user, permission, toast, onTokenReceived]);

  // Register FCM token with backend
  const registerFCMToken = async (userId: string, token: string) => {
    try {
      const response = await fetch('/api/fcm-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          token,
          deviceInfo: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
            timestamp: new Date().toISOString()
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register FCM token');
      }

      console.log('✅ FCM token registered with backend');
    } catch (error) {
      console.error('❌ Error registering FCM token:', error);
    }
  };

  // Request permission manually
  const requestPermission = async () => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in this browser",
        variant: "destructive",
      });
      return;
    }

    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        toast({
          title: "Not Available",
          description: "Notifications are not available in this environment",
          variant: "destructive",
        });
        return false;
      }
      
      const newPermission = await Notification.requestPermission();
      setPermission(newPermission);

      if (newPermission === 'granted') {
        toast({
          title: "Permission Granted",
          description: "You'll now receive desktop notifications for note assignments",
        });
        
        // Re-initialize to get token
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } else {
        toast({
          title: "Permission Denied",
          description: "Please enable notifications in your browser settings to receive alerts",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast({
        title: "Error",
        description: "Failed to request notification permission",
        variant: "destructive",
      });
    }
  };

  // Don't render anything - this is a background service
  return null;
}

// Hook for using push notifications in components
export function usePushNotifications() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setIsEnabled(permission === 'granted');
      return permission === 'granted';
    }
    return false;
  };

  return {
    isEnabled,
    token,
    requestPermission,
    isSupported: typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
  };
}