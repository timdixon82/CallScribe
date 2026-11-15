# Spike T-O0: OCR in a sandboxed frame

Author: Sean. Date: 2026-11-15. Branch `spike/ocr-sandbox` (draft pull request, not merged, not wired into the app). Based on main at d3f1839.

## Verdict

Works with changes. Security and loading work in Chromium, Firefox and WebKit. Offline use does not work through the service worker, and is the one real problem.

## What I built

A throwaway prototype on the branch: `ocr-frame.html` (own meta policy: script-src self, unsafe-eval, wasm-unsafe-eval, connect-src none), `spike-parent.html` (the live index policy plus `frame-src 'self'`, no unsafe-eval), the frame script, a parent script and a Playwright runner (`spike/run-spike.mjs`). The frame is a sandbox="allow-scripts" iframe with an opaque origin. Models come from `node_modules` (no download). Test image: "HELLO WORLD 2026" drawn on a canvas.

Servers tried: vite preview; python3 -m http.server (plain, no CORS headers); and a small Python server that copies the headers the live site sends. I checked the live custom domain with a header request: it sends `access-control-allow-origin: *` and `cache-control: max-age=600`.

Browsers: Chromium, Firefox and WebKit all installed already and all ran.

## Results by question

### 1. Does the opaque frame load its module script, wasm and assets? Yes, but only if the server sends CORS

- With `Access-Control-Allow-Origin: *` (as on the live site): the frame page, module script, shared chunk and the ONNX Runtime `.mjs` glue file all load. Chromium, Firefox, WebKit: pass. The frame reports origin `null`.
- Plain python server (no CORS headers): fails. Exact Chromium error: `Access to script at 'http://127.0.0.1:4180/assets/ocrFrame-CONBzbq-.js' from origin 'null' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.` No hello message arrives.
- vite preview as configured today: fails. Error: `The 'Access-Control-Allow-Origin' header has a value 'http://localhost:4174' that is not equal to the supplied origin.` Vite only allows localhost origins. Setting `preview: { cors: true }` in the Vite config sends `*` and the frame then works. This matters for the e2e tests (T-O5).
- Untested idea for hosts without CORS: a classic (non-module) script needs no CORS, but Vite emits modules and the ONNX glue is a dynamic import (always CORS).

### 2. Does the frame's own policy apply, and does the parent's strict policy stay strict? Yes

- A frame page with no policy of its own gets `new Function` to work while the parent has no unsafe-eval: the parent policy does not restrict a separately loaded frame page's scripts. Chromium, Firefox, WebKit: yes.
- The frame page with its own meta policy runs `new Function('return 6*7')()` and gets 42. WebAssembly compile works.
- A `srcdoc` frame (the permissive meta tag inside it) does not get eval: Chromium and WebKit refused it ("'unsafe-eval' is not an allowed source ... script-src 'self' 'wasm-unsafe-eval'"), which proves srcdoc inherits the parent policy. Firefox: probe timed out (inconclusive, no eval seen).
- The print `srcdoc` frame still works with `frame-src 'self'` in all three browsers.

### 3. Does OCR run in the frame with models passed by postMessage? Yes

- Handshake: frame posts hello, parent checks `event.source` and sees origin `null`, then sends init with a MessageChannel port and the model bytes (transferred). All traffic after that goes over the port.
- Result: `HELLO WORLD 2026`, exact, in Chromium, Firefox and WebKit. Session creation about 0.5 seconds, first recognition under 1 second (wasm execution provider, small image).
- Needed changes to the existing OCR code: pass the three models as `Uint8Array` (the library accepts bytes for the two models); the dictionary is read with `fetch`, so the prototype swaps `fetch` for a shim that answers a fake `dict:` address from the transferred text. The `ocr.detect` call accepts `{ data, width, height }` pixels directly (no blob or image decoding in the frame).
- Pitfall: the default `onnxruntime-web` build is the WebGPU (jsep) build. The wasm bytes must be `ort-wasm-simd-threaded.jsep.wasm`. The plain `.wasm` gives `Gf[(a >>> 0)] is not a function` and a hang.

### 4. connect-src none: does ONNX wasm load, and is the network closed? Yes

- ONNX Runtime works with `connect-src 'none'` using `ort.env.wasm.wasmBinary` (the bytes), `wasmPaths` pointing at the app's `ort/` folder (for the `.mjs` glue, loaded as a script), `numThreads = 1`, `proxy = false`.
- One harmless violation: the OpenCV glue tries `fetch('data:application/octet-stream;base64,...')`, which `connect-src 'none'` blocks, and it falls back and works. OCR still succeeds.
- From the frame, all failed in all three browsers: fetch to the app origin, fetch to https://example.com/, fetch of a blob URL, WebSocket, dynamic import of an outside script. `sendBeacon` returns true in Chromium and WebKit but no request left (Playwright saw no request to the outside host from the frame in any browser, apart from the blocked script import in Chromium, which is recorded as `failed: csp`). Blob URL fetch is also blocked, so the design's "connect-src blob:" is not needed.

### 5. Can the frame read the page's storage? No

Seeded IndexedDB, localStorage, Cache Storage and a cookie in the parent. In the frame, all threw SecurityError in Chromium, Firefox and WebKit (IndexedDB denied, localStorage forbidden in a sandboxed document, Cache Storage disabled, cookie access denied, `parent.document` blocked as cross-origin). `navigator.serviceWorker` is refused in Chromium and WebKit.

### 6. Does the service worker serve the frame and its assets offline? No (Chromium only tested)

- The opaque frame is not controlled by the service worker. With the existing `sw.js` and a no-store server, the frame navigation itself fails offline (`net::ERR_INTERNET_DISCONNECTED`). The worker did not intercept it.
- With a Pages-like server (`max-age=600`), the frame page and small files came from the browser HTTP cache, but the 10 MB shared chunk did not, and the frame failed. So offline OCR depends on HTTP cache luck, and the live site's max-age is only 10 minutes.
- I also tried a worker that serves the frame page with a `Content-Security-Policy: sandbox allow-scripts` response header on a plain iframe. The worker did serve the page offline, but the frame's script requests (the client is opaque) are still not intercepted, so scripts failed offline. Subresources of an opaque frame never go through the service worker.
- Firefox and WebKit offline: not tested.

### 7. Is a self-navigating frame blocked by frame-src? Chromium yes; Firefox and WebKit not shown navigating

- Chromium: `location.href = 'https://example.com/'` inside the frame produced `Framing 'https://example.com/' violates the following Content Security Policy directive: "frame-src 'self'". The request has been blocked.` The frame ended on the browser error page and no request reached example.com.
- Firefox and WebKit: the frame URL stayed on the original page after 3 seconds and no request to example.com was seen. That is consistent with a block but I saw no message, so treat as likely, not proven.

### Informational

- In headless Chromium, Firefox and WebKit the opaque frame reports `isSecureContext` true and `navigator.gpu` present. I did not test WebGPU OCR.
- `new Worker(blobUrl)` in the frame is refused by `worker-src 'none'`, so worker support was not shown either way. The design does not need workers.

## Recommendation: continue with the design, with two changes

1. Continue with design option B. The security properties hold in three engines and OCR gives the right text.
2. Change the frame policy: use `connect-src 'none'` (not `blob:`). Supply wasm as bytes (jsep build) and the dictionary as bytes with a fetch shim or a custom file reader.
3. Add `preview: { cors: true }` to the Vite config for the e2e server only, and note that the app depends on the host sending `Access-Control-Allow-Origin`. The live site does. Add a deploy or e2e check that fails if the header goes missing.
4. Offline: needs a decision. Options, cheapest first:
   - Accept that OCR runs offline only while the browser HTTP cache holds the frame files (max-age is 600 seconds on the live site). Not reliable; I would not ship this without Tim knowing.
   - Follow-up spike (about half a day): a tiny frame page that carries a script hash in its policy, receives the frame bundle as text from the parent over the message channel (the parent reads it from the service worker cache), and runs it inside the frame. That removes both the CORS dependency and the offline gap, at the cost of a classic-script bundle and bundling the ONNX glue. Untested.
   - Design fallback 2 (remove the need for eval in the OCR path): largest effort, strongest result.

Effort for the full design after this: about 3 to 4 days (T-O1 to T-O7), plus 0.5 day if the offline follow-up spike is taken.

## Evidence

Runner and prototype files are on branch `spike/ocr-sandbox` under `spike/`, `src/spike-*.js` and the extra HTML pages. Nothing in `index.html`, `src/main.js`, `src/ocr.js` or the service worker was changed. No models were downloaded and no personal data is in the commit.

## Follow-up spike T-O0b: offline OCR (Sean, 2026-11-15)

Branch: local `spike/ocr-sandbox-offline`, pushed to `spike/ocr-sandbox` (draft pull request 37). Files under `spike2/` (not wired into the app). Test server sends no CORS headers and `no-store`, so only the service worker or Cache Storage can supply files offline.

### Verdict

Works with changes. A design that was not on the list works offline in Chromium, Firefox and WebKit. Designs 1 and 2 as written do not work.

### Design 1: srcdoc or blob frame with its own policy and a hashed bootstrap. Does not work

Parent holds the OCR assets, builds a `blob:` or `srcdoc` document with its own meta policy (hash, `unsafe-eval`, `wasm-unsafe-eval`, `blob:`) and sends the code over a port.

- Both document kinds inherit the parent policy in Chromium, Firefox and WebKit. The frame's own meta policy can only tighten.
- With the live parent policy plus `frame-src 'self' blob:`, even the inline bootstrap is refused (Chromium: "Executing inline script violates ... script-src 'self' 'wasm-unsafe-eval'").
- With the bootstrap hash added to the parent policy, the bootstrap runs, but `new Function` is blocked in all three browsers (Chromium: "'unsafe-eval' is not an allowed source"; Firefox: "call to Function() blocked by CSP"; WebKit: "Refused to evaluate a string as JavaScript"), and importing the bundle from a blob URL is blocked by the inherited script-src.
- Only way to make it work would be to put `unsafe-eval` in the parent, which is the rejected option.

### Design 2: sandbox attribute frame loaded from a URL, served by the service worker. Does not work

I logged every request the service worker handled.

- A frame with `sandbox="allow-scripts"` and `src="frame2.html"`: the service worker never saw the navigation (Chromium, Firefox, WebKit). Offline the frame fails: Chromium `net::ERR_INTERNET_DISCONNECTED`, Firefox `NS_ERROR_OFFLINE`, WebKit "internal error". Online it works (OCR text correct).

### Workaround that works: sandbox through a response header, bundle through the parent

- The frame is a plain `<iframe src="frame2.html">` with no sandbox attribute. The service worker answers the navigation from its cache and adds the response header `Content-Security-Policy: sandbox allow-scripts; ...`. The service worker did see this navigation in all three browsers (log: `navigate iframe /frame2.html`). The page is then opaque-origin (`origin` is `null`).
- The frame page is tiny: its own meta policy (`script-src 'sha256-...' blob: 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'` and the rest of the earlier policy) and one hashed inline bootstrap script. It is not under the parent's inheritance because it is loaded by URL.
- The parent reads the bundle code (an esbuild single-file module, 11 MB, including OpenCV and ONNX Runtime), the ONNX glue `.mjs` text, the models and the wasm from its own Cache Storage and sends them over the port. The frame imports the bundle from a blob URL made inside the frame, and points `ort.env.wasm.wasmPaths = { mjs: <blob URL> }`, `wasmBinary` as bytes. No CORS header and no network are needed by the frame after its page loads.
- Result with the context set offline after a first online load (service worker installed and controlling, assets cached): `HELLO WORLD 2026`, exact, in Chromium, Firefox and WebKit. Frame session start 0.3 to 0.6 seconds. The parent policy stayed strict (live policy, no `unsafe-eval`; `frame-src 'self'` only is needed, `blob:` is not).
- Negative checks, offline, from the frame (Chromium full list; Firefox and WebKit lists seen only in part, same results): fetch to the site, to https://example.com/ and to a blob URL all fail; WebSocket fails; dynamic import of an outside script fails; IndexedDB, localStorage, Cache Storage and cookie all throw SecurityError. `sendBeacon` returns true in Chromium and WebKit as before; no request reached the outside host. The one `connect-src` violation is the harmless OpenCV `data:` fetch seen earlier.
- Inert fallback proven in Chromium: loading the same frame page as a plain iframe with no sandbox header (no service worker help) gives no hello message at all, because the bootstrap refuses to run unless its origin is `null`. So a missing header cannot expose an eval-capable same-origin frame.

### Costs and caveats of the workaround

- The frame page is only offline-capable once the service worker controls the page and has cached it. The first load of a brand new visitor with no service worker yet: the header is absent, the bootstrap stays inert, OCR is unavailable until the service worker takes control (after one reload). OCR needs the OCR assets anyway, so enabling OCR can require the service worker to be active first.
- Needs a service worker change: add the `sandbox` header for the frame page, and precache it. Fetch handler must also return the page from cache when offline.
- The app's current `sw.js` uses network-first for navigations. The frame page must use cache-first or network-first with the header added in both paths, or an online network response will lack the header and the frame will stay inert. I recommend the service worker owns the frame page fully (always adds the header).
- The bundle is a single esbuild or Vite output of 11 MB sent as text (UTF-8 decode, blob, import). Cost is a few hundred milliseconds. The existing Vite build can produce it with a separate entry and `inlineDynamicImports`.
- The frame page needs no CORS header from the host, so the earlier CORS dependency goes away.
- Hash must be recomputed on each build (build script already does it, `spike2/build.mjs`). The shipped policy and the file must stay in step; add a unit test.

### Recommended path and effort

Take the header workaround (design 2 variant). Remaining fallback if Tim does not want service-worker-dependent OCR: removing the need for eval (large). Effort for the full design after this spike: about 3.5 to 4.5 days (T-O1 to T-O7 plus the service worker header and frame page caching, plus the bundle build change), against 3 to 4 days earlier. Recommend a Jed review of the header trick and the inert self-check; no specialist accessibility review is needed (no user interface in the frame).
