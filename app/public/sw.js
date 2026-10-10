// GHS app service worker — caches the app shell so it opens fast and installs.
const CACHE = 'ghs-app-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache API calls — quotes and jobs must always be live.
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  // App shell & static files: cache-first, then network (and refresh cache).
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fresh = fetch(e.request).then(r => {
        if (r && r.status === 200 && url.origin === location.origin) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
