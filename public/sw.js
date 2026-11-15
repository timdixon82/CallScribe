// The build replaces BUILD_ID (vite.config.js), so each build gets its own cache and old ones are deleted.
const CACHE = 'callscribe-shell-__BUILD_ID__';
// The text recognition frame page. The build replaces the placeholder with the whole page (policy and hashed script included).
// There is no such file on the server: only this worker can produce the page, so a missing worker means no page at all.
const FRAME_PAGE = '__OCR_FRAME_PAGE__';
const FRAME_PATH = new URL('ocr-frame.html', self.registration.scope).pathname;
const FRAME_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': 'sandbox allow-scripts', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
const keep = (request, response) => { if (response.status === 200) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}); } return response; };
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./'])).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('callscribe-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === FRAME_PATH) {
    // Exact path only, query and fragment ignored and never copied into the response. The sandbox header and every other header
    // are constants. Only an iframe navigation by GET gets the page; anything else gets a plain 404 and no document.
    const framed = request.method === 'GET' && request.mode === 'navigate' && request.destination === 'iframe' && FRAME_PAGE.startsWith('<!doctype');
    event.respondWith(framed ? new Response(FRAME_PAGE, { status: 200, headers: FRAME_HEADERS }) : new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    // Network first so a changed page (and its policy) reaches returning users; the cache is the offline fallback.
    event.respondWith(fetch(request).then((response) => keep(request, response)).catch(() => caches.match(request).then((cached) => cached || caches.match('./'))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => keep(request, response))));
});
