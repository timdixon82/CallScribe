// SPIKE ONLY. Serves the frame page with a CSP sandbox header so a plain (attribute-free) iframe becomes an opaque origin document.
const CACHE = 'spike-sw';
const POLICY = "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'; img-src data: blob:; worker-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const { request } = event; const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let res = await cache.match(request);
    if (!res) { try { res = await fetch(request); if (res.status === 200) cache.put(request, res.clone()); } catch (e) { return new Response('offline', { status: 503 }); } }
    if (url.pathname.endsWith('/ocr-frame.html')) { const h = new Headers(res.headers); h.set('Content-Security-Policy', POLICY); return new Response(res.body, { status: res.status, headers: h }); }
    return res;
  })());
});
