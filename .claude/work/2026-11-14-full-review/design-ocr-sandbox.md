# Design: OCR in a sandboxed frame (N1, option B)

Tier 2. Design only. Author: Jacob. Date: 2026-11-15. Based on main at d3f1839.

## 1. Summary and recommendation

Run OCR inside a sandboxed iframe that loads its own page, `ocr-frame.html`, with its own meta policy: `unsafe-eval` and `wasm-unsafe-eval`, and no network. The iframe uses `sandbox="allow-scripts"` with no `allow-same-origin`, so it has an opaque origin and can reach none of the page's storage. The main page keeps its strict policy. The main page feeds the frame everything it needs (model bytes, pixels) through a private message channel, so the frame needs no network and no storage.

This design is sound in principle, but five facts depend on browser behaviour that I could not confirm from specifications or documentation. Section 8 lists them as the first task, a spike. If the spike fails on offline loading, fall back as described in section 9.

No decision here needs Opus-level reasoning. The riskiest unknown is empirical (browser behaviour), which a test settles.

## 2. What I verified, and what I could not

Verified in the code (main at d3f1839):

- `src/ocr.js` imports `@gutenye/ocr-browser` and `onnxruntime-web` on the main page. `enableOcr` (main.js line 56) copies OCR files into Cache Storage cache `local-browser-transcriber-ocr-v1`, then calls `getOcr()`. `processScreenshotOcr` (line 70) calls `recogniseImage(image || blob)`, where `image` is an already resized `ImageData` sized by the processing detail setting (640, 960 or 1280 longest edge).
- The page policy (index.html line 5) has no `frame-src`, so it falls back to `default-src 'none'`. The print frame uses `srcdoc`, and `tests/e2e/csp.spec.mjs` proves that works today.
- `tests/privacy.test.mjs` requires every docs page to carry a policy identical to the index policy, and forbids `unsafe-eval` and `unsafe-inline`. `tests/e2e/csp.spec.mjs` also forbids `unsafe-eval` on those pages.
- `.github/deploy-publish.txt` in this checkout looks like the generated default (it lists only `/index.html` and `/scripts/`). Sean must read `deploy.yml` to confirm how `dist` is published and that a second HTML file in `dist` goes live.

Confirmed from documentation:

- A meta policy cannot carry `report-uri`, `frame-ancestors` or `sandbox` (CSP Level 3, section 3.3). So the sandbox must come from the iframe attribute, not the frame's own policy.
- `wasm-unsafe-eval` permits only WebAssembly; `unsafe-eval` is what permits `new Function` (CSP Level 3).
- When several enforced policies apply to one document, a request must pass each of them. A policy can only tighten, never loosen, another.
- Cache Storage is denied to a sandboxed frame without `allow-same-origin`, with a SecurityError (Chromium message and web-platform test `sandboxed-iframes`). Storage Buckets also reject. Service worker installation and Cache API access are listed as restricted in opaque-origin contexts in the HTML standard.
- Community reports (not an official GitHub statement) say GitHub Pages sends `Access-Control-Allow-Origin: *` on its responses.

Not confirmed (treated as unknown; the spike settles each):

- Exactly which documents inherit the parent's policy. My understanding, from background knowledge and the MDN summary, is that `about:blank`, `about:srcdoc` and `blob:` documents inherit the creator's policy, so a `srcdoc` or blob frame could never gain `unsafe-eval` under the parent's strict policy. A frame loaded from its own `https` URL gets only the policy in its own response or meta tag; the parent's policy then governs only whether the frame may load (`frame-src`) and not the frame's scripts. The tooling I used could not return the exact specification text. This is why the design uses a separate file. The spike proves it directly (task T-O0, check 1).
- Whether the parent's `frame-src` is enforced when the child frame navigates itself. Chrome and Firefox are believed to enforce it. Matters for the data exfiltration path in section 7.
- Whether the Worker constructor accepts a blob URL created inside an opaque-origin frame. The standard requires worker scripts to be same-origin with the creator, and the opaque origin is not same-origin with the site. I could not read the constructor steps. Design avoids workers (section 3).
- Whether the service worker serves the frame's navigation and subresources to an opaque-origin client, which matters for offline use.
- Whether `navigator.gpu` and `isSecureContext` are available in an opaque-origin frame. Matters only for speed.

## 3. How OCR runs in the frame

### Files

- `ocr-frame.html` at the repository root, added as a second Vite entry: `build.rollupOptions.input = { main: 'index.html', ocrFrame: 'ocr-frame.html' }` in `vite.config.js`. Output is `dist/ocr-frame.html` plus hashed chunks in `dist/assets/`, paths relative (base is `./`).
- `src/ocr-frame.js` is the frame script. It contains today's `src/ocr.js` engine code (Guten OCR, ONNX Runtime, the `texts` shape handling, the line join).
- `src/ocr.js` becomes a thin client on the main page. It keeps its two exports, `getOcr()` and `recogniseImage(imageOrBlob)`, so `main.js` barely changes. It no longer imports Guten OCR, OpenCV or ONNX Runtime, so the page's own bundle loses the `new Function` code.

### The frame's policy (meta tag, first element after charset)

```
default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src blob:; img-src blob: data:; worker-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
```

(Write as one line.) Notes:

- `connect-src blob:` and not `'none'`: blob URLs the frame makes from bytes it received are local memory, not network. If the spike shows ONNX Runtime accepts raw buffers (model as a buffer, `env.wasm.wasmBinary`) then use `connect-src 'none'`. That is preferred and the test asserts it. Prefer `'none'` if achievable.
- `script-src 'self'`: in CSP, `'self'` is derived from the document's URL, not from the opaque security origin. I expect it still matches the site's own files; the spike confirms. No `blob:` in `script-src` unless ONNX Runtime's glue file needs it (if so, T-O0 records why).
- `worker-src 'none'`: OCR is single-threaded here anyway (no cross-origin isolation on GitHub Pages, so no shared memory, so no thread pool; the main page is in the same position today). Setting ONNX `numThreads = 1` and `proxy = false`. Not a regression: OCR already runs on the main page thread today.
- No inline script or style. The frame page is one element, one module script.

### Why the sandbox attribute, and why no `allow-same-origin`

`<iframe sandbox="allow-scripts" src="ocr-frame.html" hidden>`. Without `allow-same-origin` the frame gets an opaque origin. It cannot read the page's IndexedDB, localStorage, cookies or Cache Storage, cannot reach `window.parent.document` (cross-origin access throws), cannot register a service worker, and with no `allow-popups`, `allow-top-navigation`, `allow-forms` or `allow-modals` it cannot open windows, navigate the top page, submit forms or show dialogs.

With `allow-same-origin` the frame would be same-origin with the page. Script in it (including OpenCV's code-generator, or a compromised dependency) could call `parent.indexedDB`, read the transcripts, and use the parent's fetch, which the frame's own `connect-src` does not govern. That would void the point. Do not add it.

### What the opaque origin breaks, and the fixes

- **Frame's own script and glue, loaded from the site.** A module script from an opaque origin is a cross-origin request in CORS mode, so it needs `Access-Control-Allow-Origin`. GitHub Pages reportedly sends `*` (community reports only). Spike check: request `dist` files from a sandboxed frame on the live site. A classic script would not need CORS; Vite emits module scripts, so this relies on the header. If the header turns out to be absent on the custom domain, see section 9.
- **Models and wasm.** The frame cannot use Cache Storage and, with `connect-src blob:`, cannot fetch them. The main page already holds them in `OCR_CACHE`. The main page reads the three model files (and the ONNX Runtime wasm if needed) from the cache and sends them as transferred `ArrayBuffer` values with the init message. Zero copy. This keeps `OCR_CACHE`, `cache-names.js`, `isOcrCached`, "Remove OCR" and erase-all exactly as they are. Nothing in the frame stores anything.
- **ONNX Runtime wasm.** Today `ort.env.wasm.wasmPaths` points at `ort/`. In the frame, prefer `env.wasm.wasmBinary` from the transferred bytes. ONNX Runtime also loads a `.mjs` glue file by dynamic `import()` from `wasmPaths`; that import is a module-script load covered by `script-src 'self'` plus CORS, not by `connect-src`. T-O0 works out the exact configuration for the installed version and records it. Do not guess; read `node_modules/onnxruntime-web` first.
- **Workers.** Not used (above).
- **Service worker.** An opaque-origin client cannot be controlled by the service worker, so the frame's subresource requests go to the network or the browser HTTP cache. The navigation request for `ocr-frame.html` may or may not pass through the service worker. If OCR must work offline, this is the main risk: see section 8, check 5, and section 9.
- **WebGPU.** `hasWebGpu()` logic moves into the frame unchanged. If `navigator.gpu` is missing in the opaque frame, it falls back to wasm. Slower, still correct.

### Alternatives if the opaque origin breaks loading

Ranked in section 9.

## 4. Message protocol

Transport: a `MessageChannel`. One handshake over `window.postMessage`, then everything over the private port.

### Handshake

1. Parent creates the iframe with `src="ocr-frame.html#<random token>"` (token from `crypto.getRandomValues`, 16 bytes, hex).
2. Frame (once the script runs) first self-checks: if `self.origin !== 'null'` (not opaque) or `window.parent === window` (opened directly), it does nothing and shows nothing. This stops anyone loading `ocr-frame.html` as a normal same-origin page, where `unsafe-eval` would otherwise run with full access.
3. Frame posts `{ type: 'hello', v: 1 }` to its parent with target `'*'` (the message holds nothing secret).
4. Parent accepts `hello` only if `event.source === iframe.contentWindow` and `event.origin === 'null'` (the string an opaque origin presents). It then creates a `MessageChannel` and posts `{ type: 'init', v: 1, token, assets }` to the frame with target `'*'` (an opaque origin cannot be named as a target; the check is the `contentWindow` it holds), transferring `port2` and the asset buffers. After this the parent ignores every further window message.
5. Frame accepts the first `init` only, only if `event.source === window.parent` and the token equals its location hash. Further `init` messages are ignored. From then on it uses only the port.

A third party that frames our `ocr-frame.html` can only use our OCR for its own images. The frame holds nothing of ours, so I accept that. The token stops a second window on the same page posting to a frame it did not create.

### Messages over the port

Parent to frame:

- `{ type: 'recognise', id, width, height, pixels }`. `id` is an integer from a counter. `pixels` is an `ArrayBuffer` (transferred) of `width * height * 4` RGBA bytes.
- `{ type: 'cancel', id }`.

Frame to parent:

- `{ type: 'ready', models: 'loaded', backend: 'webgpu' | 'wasm' }` after the session is created.
- `{ type: 'result', id, text }`.
- `{ type: 'error', id, code, message }` with `code` one of `bad-message`, `too-large`, `engine`, `busy`.

### Validation, both sides

- Every message is a plain object with exactly the expected keys (reject extras), `type` from a fixed list, `v === 1`, integer `id`, strings only where expected. Anything else is dropped and, on the frame side, answered with `bad-message` (no echo of the input).
- Frame limits: width and height each 1 to 2048; `pixels.byteLength === width * height * 4` and at most 16 MiB; one job at a time (a second returns `busy`); asset buffers capped (each model at most 64 MiB, the dictionary at most 1 MiB, the wasm at most 32 MiB) and checked for presence before building the session.
- Parent limits: `text` must be a string of at most 100,000 characters (truncate, do not throw); `message` at most 200 characters; `id` must match the in-flight job; unknown or repeated ids are dropped. OCR text is untrusted. The app already renders it as a text node and stores it as text; keep it that way.
- The parent always sends `ImageData` pixel data, never a Blob. For the orphan or old path that holds only a Blob, the parent decodes it with `createImageBitmap` into a canvas and resizes it with the same `maxEdge` logic before sending. This means the frame never parses image file formats from the app, and the size cap is enforced once, in the parent.

### Timeouts, cancel and errors

- Init: 120 seconds (matches the existing e2e wait; model session creation is slow on first run). Recognition: 60 seconds for Fast and Balanced, 120 seconds for Detailed (the processing detail setting). Settings live next to `OCR_PROCESSING_DETAILS`.
- The frame's main thread is busy during WebAssembly compute, so a `cancel` message is not read until the job ends. Real cancel and every timeout therefore work the same way: the parent removes the iframe element (the browser tears down the frame and its memory), rejects the job with a clear error, and recreates the frame lazily on the next job. `cancel` is still sent first for the case where the frame is idle.
- The queue stays in the parent (`recognitionQueue` pattern), one job in flight.
- Errors reach the existing catch in `processScreenshotOcr`, which already marks the screenshot `failed` and keeps capturing. Message text stays plain and non-technical; the technical code goes in the console.
- No network: see policy and tests.

## 5. How it fits the existing code

- `src/ocr.js`: new client module (frame creation, handshake, queue, timeouts). `getOcr()` resolves when the frame reports `ready`. `recogniseImage` accepts `ImageData` or `Blob`. Add `disposeOcr()` which removes the frame and clears state.
- `enableOcr` (main.js line 56): unchanged flow. It still calls `cacheOcrAssets()` first (assets must be in the cache before the client reads them), then `getOcr()`. A failure message path already exists.
- OCR processing detail: resizing stays in `getScreenFrame` (main.js line 64). No change. Only the per-job timeout reads the setting.
- Screenshots flow: `processScreenshotOcr` unchanged except it may pass `ImageData` as today.
- OCR delete (`requestOcrDelete`, `OCR_CACHE`) and erase-all: call `disposeOcr()` before deleting caches so the frame holds no model memory. `cache-names.js` needs no change because the frame touches no cache. Add one line to `tests/erase-all.test.mjs` or a unit test that both paths call `disposeOcr`.
- Parent policy: add `frame-src 'self'` to `index.html`. Docs pages must carry the identical policy (`tests/privacy.test.mjs` line 21 requires it), so add it to all five docs pages; it is harmless there. The print frame uses `srcdoc`; spike check 3 confirms `frame-src 'self'` does not break it (otherwise add `about:srcdoc` handling per the print task). Keep `unsafe-eval` out of the parent; the existing assertions stay.
- Frame page policy has its own test (section 8, T-O5): it must contain `unsafe-eval`, `connect-src` of `'none'` or `blob:` only, and no `https:` host.
- Service worker (`public/sw.js`): no code change planned. It already caches same-origin navigations and subresources network-first or cache-first, and the build stamp replaces its cache name, so the new files are picked up. Whether an opaque client uses it is spike check 5.
- Deploy: confirm `ocr-frame.html` and its chunks are in the deployed `dist` (publish list review, section 2). Public docs pages are not affected except the `frame-src` addition.
- Privacy and help text: state that screenshot text recognition runs inside an isolated frame with no network access, and that images never leave the device. Update `tests/privacy.test.mjs` if it checks wording. Add a what's-new line.
- Build size: the main bundle shrinks (no OCR code); `dist/assets/ocr-frame-*.js` carries it.

## 6. Security assessment

What `unsafe-eval` in the frame can reach:

- JavaScript in the frame can compile and run strings. That is the capability OpenCV's glue needs. It runs inside an opaque-origin sandbox with `connect-src` limited to `blob:` (or `'none'`), no storage, no cookies, no access to the parent document, no popups, no forms, no top navigation, and `frame-src 'self'` in the parent. The only data it ever holds is the screenshot pixels and models the parent chose to send for the current job.
- Compared with the rejected option (page-level `unsafe-eval`), eval can no longer reach transcripts, the audio store, settings, or the network, and an XSS in the main page would not gain eval.

Why this is acceptable:

- The frame page has no HTML input at all. It parses only validated numeric fields and a pixel buffer. There is no route for attacker markup to become script.
- The code that uses eval is a pinned dependency, not text from the user.

What an attacker controlling the screenshot pixels could do:

- Craft pixels to trigger a bug in the image model, ONNX Runtime or OpenCV (memory corruption in wasm is contained by the wasm sandbox, then by the iframe sandbox and the browser's process isolation). Result is at worst wrong or hostile OCR text, a crash or a hang (the timeout kills the frame).
- Hostile OCR text is returned to the parent. It could try to steer the minutes model (prompt injection), which already exists today for any spoken or on-screen text. It cannot execute, because the parent renders text as text nodes. Keep the length cap.
- Pixels cannot carry script and cannot choose a destination. The pixel path never reaches a parser that runs strings.

Residual risks (only relevant if a dependency is itself compromised, supply-chain scenario):

- Navigation exfiltration: script could set the frame's own location to an attacker URL with data in the query. Mitigations: the sandbox forbids top navigation and popups; the parent's `frame-src 'self'` should block a navigation of the frame to another host. I believe Chrome and Firefox enforce this but have not confirmed, so T-O0 check 4 tests it.
- WebRTC and DNS or link prefetch may bypass `connect-src` in some browsers. Section 8 includes a test; mark anything that leaks as a known residual and disclose it.
- Meta policy limits (no `frame-ancestors`, applies after parse, no reporting). Same as the main page.
- Anyone can open `ocr-frame.html` directly. The self-check (opaque origin and framed) makes it inert.

Net: a clear improvement over page-level `unsafe-eval`, and OCR remains a genuinely local feature. Jed should review the finished frame, the init handshake and the exfiltration tests.

## 7. Open decisions for Tim

1. Q-LCT unset: if the spike shows the frame cannot work offline, accept "OCR needs the first load online and works offline only while the browser keeps the frame files" or choose the fallback in section 9? Recommended: decide only if the spike fails.
2. Q-LCT unset: is a short, plain statement on the privacy and help pages acceptable ("text recognition runs in an isolated, offline frame")? Recommended: yes.
3. Q-LCT unset: Tim might also want the longer-term option, replacing OpenCV so no eval is ever needed (section 9, rank 2), as a later project. Recommended: not now.

## 8. Build order for Sean (small tasks, each with a test)

1. **T-O0, spike, no merge.** On a scratch page with a sandboxed `allow-scripts` frame loading a second HTML file with its own meta policy, in Chromium (Playwright) and Firefox and WebKit if available, and once on the real Pages host, record yes or no for each:
   1. The frame page's own `unsafe-eval` works while the parent has none (run `new Function('return 1')()`), and a `srcdoc` or blob frame does not get it.
   2. A module script, a `.mjs` dynamic import and a wasm fetch from the site load in the opaque frame (CORS header present on Pages; test the custom domain too).
   3. `frame-src 'self'` in the parent leaves the print `srcdoc` frame working.
   4. A self-initiated `location = 'https://example.com/'` inside the frame is blocked by the parent's `frame-src`.
   5. Offline: with the service worker installed, `context.setOffline(true)`, the frame still loads and runs.
   6. ONNX Runtime in the frame with `wasmBinary` plus transferred model buffers and `connect-src` `'none'`; if not, `blob:`. Record exact `env` settings. Also record `navigator.gpu` and `isSecureContext`, and whether `new Worker(blobUrl)` works (informational).
   Output: a log entry. Check: the log lists each result. Decide with Sonja before continuing.
2. **T-O1, frame page and build entry.** `ocr-frame.html`, `src/ocr-frame.js`, Vite second input, self-check. Check: `npm run build` produces `dist/ocr-frame.html` with the frame policy; unit test (node) asserts the policy string (has `unsafe-eval`, no `https:` host in `connect-src`, no inline).
3. **T-O2, protocol module shared by both sides.** `src/ocr-protocol.js` with the validators and limits. Check: unit tests for good messages, extra keys, wrong types, oversized dimensions, `byteLength` mismatch, overlong text.
4. **T-O3, client rewrite.** `src/ocr.js` as client with handshake, queue, timeouts, `disposeOcr`. Check: unit test with a fake frame (a small harness) for handshake source and origin rejection, timeout kills the frame, one job at a time.
5. **T-O4, parent policy and wiring.** `frame-src 'self'` in index and docs pages, `disposeOcr` in OCR delete and erase-all, privacy text. Check: `privacy.test.mjs` and `csp.spec.mjs` still pass; unit check on dispose.
6. **T-O5, e2e.** Un-fixme `tests/e2e/ocr.spec.mjs`: enable OCR, run the synthetic "HELLO WORLD 2026" image through the real path (not by importing `ocr.js` internals; trigger through the app's screenshot flow or the client export), with the strict page policy and the violation watcher. Add to the same file or `csp.spec.mjs`:
   - The frame has no network: from the frame (`page.frames()`), `fetch` to an outside URL, to the site origin, `new WebSocket`, `navigator.sendBeacon` and a dynamic `import()` of an outside URL all fail; and `page.on('request')` shows no request attributed to the frame after load.
   - The frame cannot read the page's IndexedDB: seed a database in the page, then in the frame `indexedDB.open`, `localStorage`, `caches.open`, `document.cookie` and `parent.document` all throw or are empty.
   - Direct navigation to `/ocr-frame.html` does nothing (inert).
   - The parent policy still has no `unsafe-eval`; the frame policy has it.
   - A hostile message (extra keys, huge size) gets `bad-message`, and a timeout test kills and recreates the frame.
7. **T-O6, offline and cache lifecycle.** Verify with the service worker installed offline (per T-O0 result), OCR delete and erase-all remove the frame and the cache. Check: Playwright offline test.
8. **T-O7, docs and release.** What's-new and privacy wording, changelog. Check: docs tests.

Each task is its own commit; T-O0 gates the rest. Tasks 2 to 5 can merge only together or behind a flag, since OCR must work at every merge.

## 9. Risks, rollback, and fallbacks

Risks:

- Offline use through an opaque frame (largest unknown; T-O0 check 5).
- CORS header absent on the custom domain, which would break module scripts from the opaque frame.
- ONNX Runtime may insist on fetching its own wasm (then `connect-src blob:` plus transferred bytes, or `'self'` if unavoidable; the latter weakens "no network" to "own site only" and needs Tim's say).
- WebGPU missing in the opaque frame: slower OCR.
- Memory: the frame holds models (tens of MB) while alive. Dispose after idle (suggest 5 minutes) and on disable.
- Chromium and Firefox differ in edge behaviour; test at least two engines.

Rollback: revert the pull request. The previous `ocr.js` returns, `ocr.spec` goes back to fixme, and the page policy loses `frame-src 'self'` (harmless to leave). No cache names change, so no user data migration.

If the opaque-origin route cannot work, ranked options:

1. **Opaque frame with the parent supplying the frame bundle via same-origin load but allowing the frame `connect-src 'self'`** (only if ONNX Runtime must fetch). Trade-off: frame could request files from our own site. Harmless in practice (nothing secret is there, no listener of ours reads queries), but weaker than none. Needs Tim's approval.
2. **Remove the need for eval**: replace OpenCV's use in `@gutenye/ocr-common` (contour finding and rotated rectangle maths for the detection step) with a small in-repo implementation, or an OpenCV build without dynamic execution; then OCR runs on the main page under the strict policy and the frame is not needed. Strongest result, most work, likely a multi-week task with accuracy testing against known images. Needs its own spike on which OpenCV functions are used. Not Opus-level, but large.
3. **Same-origin frame (sandbox with `allow-same-origin`) with its own policy.** Works offline and loads easily, but the frame can use the parent's storage and network, so it protects the page's policy only on paper. Not recommended; weaker than the status quo in spirit. Tim must explicitly accept if chosen.
4. **Page-level `unsafe-eval`**: rejected by Tim. Not recommended.
5. **Leave OCR off (remove the feature)**: always safe.

Recommended order if T-O0 fails: 1 (if only wasm fetch is the issue), else 2, else 5.
