// Firebase Messaging Service Worker
// This file handles background push notifications when the app is not active

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyBpZOy7gPkKXB_8N5-FxGOsy7VoOJYXKHE",
  authDomain: "studio-2881432245-f1d94.firebaseapp.com",
  projectId: "studio-2881432245-f1d94",
  storageBucket: "studio-2881432245-f1d94.firebasestorage.app",
  messagingSenderId: "2881432245",
  appId: "1:2881432245:web:f1d94e8b5c3a2f6e8d9c7b"
});

const messaging = firebase.messaging();

// Handle background messages when app is not in focus
messaging.onBackgroundMessage(async (payload) => {
  console.log('📱 Received background message:', payload);
  // Disable native OS notifications to keep a single in-app notification system.
  return;

  const notificationTitle = payload.notification?.title || 'Connections Note';
  const fallbackBody = payload.data?.message || 'You have a new note assignment';
  const notificationOptions = {
    body: payload.notification?.body || fallbackBody,
    icon: '/calaimlogopdf.png',
    badge: '/calaimlogopdf.png',
    tag: payload.data?.notificationId || 'calaim-note',
    requireInteraction: ['urgent', 'high'].includes(String(payload.data?.priority || '').toLowerCase()),
    silent: false,
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.actionUrl || payload.data?.url || '/admin/my-notes',
      noteId: payload.data?.noteId,
      clientId2: payload.data?.clientId2,
      notificationId: payload.data?.notificationId
    },
    actions: [
      {
        action: 'view',
        title: 'View Note',
        icon: '/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss.png'
      }
    ]
  };

  // Show the notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click events
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    // Mark notification as read via API call
    if (event.notification.data.notificationId) {
      fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationId: event.notification.data.notificationId
        }),
      }).catch(err => console.error('Failed to mark notification as read:', err));
    }
    return;
  }

  // Default behavior: open or focus the app and navigate to the note
  const urlToOpen = event.notification.data.url || '/admin/my-notes';
  const absoluteUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(absoluteUrl).then(() => client.focus());
          }
          client.focus();
          return;
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    })
  );
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('🔄 Push subscription changed:', event);
  
  event.waitUntil(
    // Re-subscribe and update the server
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: 'your-vapid-key-here' // You'll need to generate this
    }).then((subscription) => {
      // Send new subscription to your server
      return fetch('/api/push-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });
    })
  );
});