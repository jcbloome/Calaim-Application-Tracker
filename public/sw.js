// Service Worker completely disabled to prevent webpack conflicts
// This prevents caching issues that cause "Cannot read properties of undefined" errors

self.addEventListener('install', () => {
  // Skip waiting and activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  // Clear all caches
  caches.keys().then(cacheNames => {
    return Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
  });
  
  // Take control immediately
  self.clients.claim();
});

// Don't cache anything - let everything go to network
self.addEventListener('fetch', (event) => {
  // Just pass through to network, no caching
  return;
});