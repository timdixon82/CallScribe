// The build replaces BUILD_ID (vite.config.js), so each build gets its own cache and old ones are deleted.
const CACHE = 'callscribe-shell-__BUILD_ID__';
const keep = (request, response) => { if (response.status === 200) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}); } return response; };
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./'])).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('callscribe-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Network first so a changed page (and its policy) reaches returning users; the cache is the offline fallback.
    event.respondWith(fetch(request).then((response) => keep(request, response)).catch(() => caches.match(request).then((cached) => cached || caches.match('./'))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => keep(request, response))));
});
