# Security design review: offline sandboxed OCR frame

Reviewer: Jed. Date: 2026-11-15. Tier 2. Read-only review of spike2 (commit def4089), spike-ocr-sandbox.md and design-ocr-sandbox.md.

## Verdict

Acceptable with conditions. The design keeps unsafe-eval out of the main page and gives the eval-capable code an opaque origin, no network and no storage. Six conditions are mandatory (section 8). The most important one: do not ship a static eval-capable frame page. Let the service worker build it.

## 1. Fail-safe when the header is missing

I ran the spike. Loading frame2.html as a plain iframe with no header: no hello message arrives (inert), as Sean reported. The page does run, though, with the app's real origin and a policy that allows unsafe-eval and blob: scripts.

What I confirmed with a test page (parent policy strict, parent script from its own origin):

- The parent's own `new Function` is blocked.
- The same parent script calling `iframe.contentWindow.Function('...')` on the header-less frame runs the string, and the frame reports origin `http://127.0.0.1:4290`.

So a header-less frame is a latent eval gadget. Any script that already runs in the main page can use it to run arbitrary strings with full same-origin power (IndexedDB, Cache Storage, localStorage). Attack needs prior script execution in the page, so severity is medium (A05 Security Misconfiguration, A03 Injection). It defeats the stated goal that the parent stays eval-free. It happens on first visit, hard reload, devtools bypass, a stale service worker, or any failure of the header path.

(Note: a Playwright `page.evaluate` check of parent eval says "allowed" because CDP bypasses CSP. Do not use `page.evaluate` for CSP assertions; use a script file the page loads.)

Fix: do not deploy `ocr-frame.html` as a static file. The service worker builds the whole page as a string constant (page, hashed bootstrap, meta policy) and returns it with the sandbox header. With no service worker control, the request gets a 404 and no eval-capable same-origin document ever exists. Failure then means unavailable, not inert-but-armed.

Inert check robustness. `self.origin !== 'null' || parent === window` is sound for the common cases:

- Real-origin page: origin is the site, so it returns early.
- Opened top-level, even with the header: `parent === window`, returns early.
- Third-party page framing our page: origin is ours, inert.
- Attacker's own sandboxed iframe loading our page: origin null, bootstrap runs, but the attacker supplies code into an opaque frame under our policy. It gains nothing it lacks on its own page. Acceptable.

Strengthen with a second independent probe: also require that `localStorage` access throws SecurityError, and that `document.cookie` throws. These fail when the sandbox is absent, whatever `self.origin` says. Also make the bootstrap accept `init` once only (spike accepts repeated inits and replaces state) and require exactly one MessagePort.

## 2. Integrity chain, handshake and output

Integrity. The bundle (11 MB, with eval-using OpenCV code), glue, wasm and models come from Cache Storage and are imported as code in the frame. Today nothing verifies them at send time. The repo already has `sha256Hex` and an integrity check in `src/model-manifest.js`. Required: the main bundle holds build-time SHA-256 constants for the frame core, the ONNX glue and the wasm; the parent hashes each buffer from Cache Storage and refuses to send on mismatch. Models: verify on every frame start as well as at download (hashing tens of MB is quick). Be honest about what this buys: it catches corruption, partial downloads and update races (old core with new page), and a poisoned cache entry. It does not defend against an attacker who already runs script in the page, who can change the constants. Hash the exact bytes sent, not a re-read.

Messages from other pages or scripts:

- Parent accepts hello only when `event.source === iframe.contentWindow`. Good. Accept the first hello only, and discard all window messages afterwards.
- Frame accepts init only when `event.source === parent`. Good. Add first-only and one-port checks. The design's URL token is redundant with the source check and hard to carry when the page is synthesised. Drop it, or keep it as extra; do not rely on it.
- Parent posts init with target `'*'`. The init carries only public assets. Do not ever put user data, settings or tokens in init (spike sends `base: location.href`; remove it). User pixels go only over the port.
- Frame page navigation. A header sandbox, unlike the attribute, does not persist across navigation. Hostile frame code could navigate the frame to a same-origin URL (`frame-src 'self'` allows it) and become a real-origin document in the frame. The old code is destroyed, so the gain is small, but the parent must treat it as compromise: count `load` events on the iframe, and if a second load fires, remove the frame and disable OCR for the session. Keep `frame-src 'self'` with no `blob:` and no `data:`; it is load-bearing. Blob frames would also inherit the parent policy.

Frame to parent output:

- Accept only a plain object with exactly the expected keys; `id` must match the in-flight job; `text` must be a string, truncated to a fixed limit (design says 100,000); `message` truncated. Drop anything else, including ports, buffers and objects.
- Never insert text as HTML, never eval, never use it as a URL or key. Use text nodes only. Keep that rule covered by a test.
- Structured clone of a huge string happens before the parent can check length. A hostile frame can cause memory pressure. Mitigate with the per-job timeout and frame teardown. Low severity.

## 3. Hostile screenshot content

Pixels are sent as a validated RGBA buffer (width and height 1 to 2048, byteLength match, 16 MiB cap). Pixels cannot carry script or choose a destination. Realistic outcomes: wrong text, hostile text (prompt injection toward the minutes model, existing risk), a crash or hang (timeout kills the frame), or a parser bug in ONNX Runtime or wasm contained by the wasm, opaque origin and process isolation. Acceptable. Keep the rule that the frame never decodes image files; the parent decodes and resizes. OCR text must be marked untrusted wherever it reaches the language model prompt (delimit it, and keep the model's output rendered as text).

## 4. Service worker header, redirects, cache poisoning, scope

The spike sw2.js is not safe to copy:

- It adds the header for any same-origin URL with a `sbx` query parameter, and takes the policy string from a response header (`x-frame-policy`). That is header injection by design if any response can carry that header. It also caches every same-origin 200 under the request key.
- Production worker rules: match the exact pathname only, GET only, `request.mode === 'navigate'` and `destination === 'iframe'`. Ignore the query string. The policy is a constant in the worker, never read from a response or the request. Never reflect request data into headers.
- Prefer a synthesised response (section 1). If a cached file is used instead: precache in install from the build list only, require `status === 200 && !res.redirected`, serve with the header on every path (cache hit, network, offline), never cache on demand.
- Response headers to set: `Content-Security-Policy: sandbox allow-scripts` (nothing else in the sandbox list: no same-origin, popups, forms, modals, top-navigation, downloads), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
- No redirect or open-redirect risk arises if there is no path parameter and no Location header.
- Scope: the worker already controls the whole site. The frame route adds one fixed URL. Document it as such.
- Header sandbox and meta policy together: the sandbox header does not restrict scripts; the meta policy does. Both are needed. If the policy moves into the header, a meta policy that omits eval would intersect and block it, so keep one source of truth and test it.

## 5. First visit and update races

Safe by construction if the parent fails closed:

- Before creating the frame, check `navigator.serviceWorker.controller`. If null (first visit, hard reload, devtools bypass), show: "Text recognition needs the app to finish setting up. Reload the page once, then try again." No frame is created.
- Hello timeout (5 seconds, not 8 or 120) with the same message plus a retry.
- Version handshake: the frame page reports `bootstrapVersion` and protocol version in hello; the parent compares with its build constant. Mismatch: stop, show "The app is updating. Reload to finish, then try again." Never send code to a mismatched bootstrap.
- Core and glue hashes are per build, so an old cached core against a new parent fails the hash check and closes. A stale service worker serving an old page fails the version check.
- Error messages are plain and non-technical; codes go to the console only (and never OCR text or pixels).
- Offline after first setup works per spike (Chromium, Firefox, WebKit). Tests in CI cover Chromium offline; run the Firefox and WebKit offline probe once before release (spike did not).

## 6. Privacy and UK GDPR

- Screenshots may show other people's names, numbers or messages. Processing stays on the device. No upload, no new processor, no international transfer. The lawful basis and retention rules of the existing app are unchanged, and OCR text is stored as before.
- The frame has no storage and no network (spike-proved in three engines: fetch, WebSocket, import, blob fetch all fail). Pixels live only in frame memory. Tear the frame down after idle (5 minutes), on OCR disable, on erase-all, and on timeout. Transferred buffers are detached in the parent.
- Do not log OCR text or image data to the console in either side.
- Wording: say "runs on your device in an isolated frame and does not send images or text anywhere". Do not say "cannot leak". Known residuals if the bundled code were itself compromised: DNS prefetch, WebRTC and `sendBeacon` return values (Chromium and WebKit return true but no request was seen) are not fully covered by `connect-src`. Record this in the exceptions or risk log, not on the public page, and rely on the pinned dependency and hash check.
- Update the data-protection notes (record of processing) to mention the frame. No DPIA trigger, as no new data category or recipient.

## 7. Residual risks accepted

- Supply-chain compromise of the pinned OCR dependency could attempt covert channels (prefetch, WebRTC). Mitigated by pinning, Trivy and the hash constants. Medium-low.
- Eval remains in the frame for as long as OpenCV code needs it. Revisit the removal of eval (fallback 2 in the design) later.
- The Firefox and WebKit self-navigation block was not observed with a message, only no request. Treat as likely.

## 8. Mandatory requirements and tests

Requirements:

1. No static `ocr-frame.html` in `dist`. The service worker builds the frame page from a constant and returns 404 or a network failure when the worker is not in control. Test: the build output has no file containing `unsafe-eval` apart from the worker; the page route without the worker gives no document.
2. Header only on the exact frame path, constant policy string, GET and navigate only, query ignored, no reflected input, no on-demand caching. Header value is exactly `sandbox allow-scripts`.
3. The bootstrap runs only when `self.origin === 'null'`, `parent !== window`, and `localStorage` access throws; accepts one init with one port; sends hello with protocol and bootstrap version. The bootstrap hash in the policy is generated by the build and a unit test recomputes it.
4. The parent checks service worker control, hello source, first hello only, version match, and SHA-256 of core, glue, wasm and models against build constants before sending anything. It sends no user data in init.
5. Strict message validation both ways (exact keys, types, limits, id match); text and message truncated; text used as text only; the parent removes the frame on a second `load` event, timeout, invalid message or hash failure.
6. Parent policy keeps no `unsafe-eval` and gains only `frame-src 'self'`. Disposal on idle, disable and erase-all. Privacy wording per section 6.

Tests (Playwright, real loaded script files, not `page.evaluate`, for CSP checks):

- A header-less load of the frame route yields no eval-capable same-origin document, and `iframe.contentWindow.Function` from a parent script cannot run strings.
- Wrong or missing hash for core, glue, wasm and each model: no init sent, clear message.
- Tampered cache entry; stale worker; first visit with no controller; hard reload; each shows the setup message and creates no frame.
- Forged hello from a sibling frame or window, repeated hello, repeated init, init with zero or two ports: ignored.
- Hostile frame replies (extra keys, huge text, wrong id, port or buffer payloads): dropped or truncated, no parent exception.
- Frame navigates itself (same-origin URL, outside URL, blob URL): second load detected, frame removed; outside and blob blocked.
- Frame cannot reach IndexedDB, localStorage, caches, cookies, `parent.document`, network (fetch, WebSocket, import, blob fetch) in Chromium, Firefox and WebKit; no request attributed to the frame after load.
- Offline OCR with the service worker in control (Chromium in CI, others once manually).
- Update race: old worker with new parent, new worker with old parent.
- Sandbox header exactly `sandbox allow-scripts`; no redirect responses; `?sbx=1`-style query does nothing.
- Existing `privacy.test.mjs` and `csp.spec.mjs` still pass; privacy wording test updated.

Housekeeping: spike worktree removed. No changes made to the repository.
