/**
 * CNTXT® Tasks & Checklists - Service Worker PWA
 * Version 2.0.0
 */

const CACHE_NAME = 'cntxt-tasks-v2.2';
const STATIC_ASSETS = [
  '/tasks/',
  '/tasks/index.html',
  '/tasks/checklist.html',
  '/tasks/checklist.css?v=2.2',
  '/tasks/checklist.js?v=2.1',
  '/tasks/config.js',
  '/tasks/01.%20CNTXT_BLANCO.png',
  '/tasks/icon-192.png',
  '/tasks/icon-512.png',
  '/tasks/apple-touch-icon.png',
  '/tasks/manifest.json',
  '/tasks/Rota%20Complete%20Family/Rota-Regular.otf',
  '/tasks/Rota%20Complete%20Family/Rota-Medium.otf',
  '/tasks/Rota%20Complete%20Family/Rota-SemiBold.otf',
  '/tasks/Rota%20Complete%20Family/Rota-Bold.otf'
];

// Install: Cache Shell Assets safely
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Could not pre-cache asset:', asset, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: Purge Old Caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network First for API, Cache First / Stale While Revalidate for Static
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API calls: Network first, fall back to offline cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: Stale while revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
