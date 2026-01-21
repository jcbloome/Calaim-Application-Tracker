// Service Worker DISABLED for debugging webpack issues
console.log('🚫 Service Worker: Completely disabled');

// Clear all caches and do nothing else
self.addEventListener('install', (event) => {
  console.log('🚫 Service Worker: Install - clearing all caches');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('🗑️ Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('🚫 Service Worker: Activate - claiming clients');
  event.waitUntil(self.clients.claim());
});

// Don't intercept any fetch requests
self.addEventListener('fetch', (event) => {
  // Do nothing - let all requests go through normally
});