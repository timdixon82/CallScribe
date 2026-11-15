// SPIKE ONLY (T-O0b). Cache-first service worker that logs which requests it handled. Adds a sandbox header for ?sbx=1 frame URLs.
const CACHE = 'sw2-shell';
const LOG = 'sw2-log';
const seen = [];
const note = async (request) => { seen.push(`${request.mode} ${request.destination} ${new URL(request.url).pathname}${new URL(request.url).search}`); await (await caches.open(LOG)).put('log', new Response(JSON.stringify(seen))); };
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const { request } = event; const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    await note(request);
    const cache = await caches.open(CACHE);
    let res = await cache.match(request);
    if (!res) { try { res = await fetch(request); if (res.status === 200) await cache.put(request, res.clone()); } catch (e) { return new Response('offline', { status: 503 }); } }
    if (url.searchParams.has('sbx') && res.status === 200) { const h = new Headers(res.headers); h.set('Content-Security-Policy', `sandbox allow-scripts; ${res.headers.get('x-frame-policy') || ''}`); return new Response(res.body, { status: 200, headers: h }); }
    return res;
  })());
});
