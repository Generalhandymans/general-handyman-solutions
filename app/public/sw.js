// GHS app service worker — caches the app shell so it opens fast and installs,
// while keeping every visitor on the CURRENT version of the page.
const CACHE = 'ghs-app-v80';
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Web Push (v66): an alert lands even with the app closed. The payload is
// the small JSON the server encrypted (title/body/url/tag); the sound on a
// locked phone is the system's (a custom sound needs the native app), but
// the vibration pattern is ours.
self.addEventListener('push', e => {
  let d = { title: 'General Handyman Solutions', body: '', url: '/', tag: 'ghs' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: d.url || '/' }, vibrate: [120, 40, 120], tag: d.tag || 'ghs'
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { try { c.navigate(url); } catch (err) {} return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache API calls — quotes and jobs must always be live.
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  // v27: documents / navigations are NETWORK-FIRST. A returning visitor (or a
  // tab that sat open) must never be served a stale cached page: fetch fresh,
  // replace the cached copy, and only fall back to the cache when the network
  // fails (offline).
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r && r.status === 200 && url.origin === location.origin) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('/index.html')))
    );
    return;
  }
  // Static assets (icons, manifest): cache-first, then network (and refresh cache).
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
