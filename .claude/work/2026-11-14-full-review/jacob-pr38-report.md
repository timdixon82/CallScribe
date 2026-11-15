# Jacob: architecture conformance review, pull request 38

Tier 2. Head 75f2ef0, read-only worktree. Reviewed against design-ocr-sandbox.md, spike-ocr-sandbox.md and jed-ocr-design-report.md.

## Verdict

Conforms, with two conditions to settle before merge (section 6). No code change is required for conformance. The freeze caveat needs Tim's explicit acceptance and a follow-up task, not a redesign in this pull request.

## 1. Drift from the design (all intended)

The implementation follows the spike's header variant and Jed's six mandatory requirements, not the original design's static page:

- No `ocr-frame.html` file and no second Vite entry. `public/sw.js` holds the page as a build-stamped constant (`__OCR_FRAME_PAGE__`, stamped in `vite.config.js`) and serves it at one exact path. Matches Jed requirement 1 and 2.
- The iframe has no `sandbox` attribute on purpose. The worker adds `Content-Security-Policy: sandbox allow-scripts` plus no-referrer, nosniff and no-store, all constants.
- Engine is one esbuild bundle, `dist/ocr/core.js`, sent as bytes and imported from a blob in the frame. The design's "frame loads its own scripts over CORS" is gone, which also fixes the offline gap.
- URL token dropped (Jed advised); `hello` carries protocol and bootstrap versions.

Maintainability note: design-ocr-sandbox.md sections 3, 4 and 8 now describe a superseded shape. Mark it superseded and point to the ADR (below).

## 2. Conformance checks

- Handshake: parent accepts first `hello` only, checks `event.source` and origin `'null'`, then stops listening. Version mismatch disposes. Init holds only public files. Frame accepts one init with exactly one port, after three probes (opaque origin, has parent, storage throws). Conforms.
- Messages: exact-key validation both ways in `src/ocr-protocol.js`, limits as designed, text truncated, id matched, ports in frame replies treated as violations. Conforms.
- Policy: frame policy has a script hash, `blob:`, `unsafe-eval`, `wasm-unsafe-eval`, `connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`. Parent gains only `frame-src 'self'`, in `index.html` and all five docs pages. Conforms.
- Hash pinning: build-time SHA-256 of core, glue, wasm and three model files; parent hashes the exact bytes it sends. Second `load` event removes the frame and locks OCR until reload. Conforms.
- Fail closed: no controller, 5 second hello timeout, 404 from the worker for anything but an iframe GET. Conforms.
- Offline and caching: files come from `OCR_CACHE` (cache names unchanged), frame page from the worker, so offline works once the worker controls the page. Worker cache rules unchanged. Dispose is wired into OCR toggle-off, erase-all and idle (5 minutes).
- Tests: unit tests for protocol, bootstrap, worker headers and the built output; e2e for isolation, tamper and header-less cases.

## 3. Publish list

`.github/deploy-publish.txt` is still the generated default (`/index.html`, `/scripts/`). Because the build writes `dist/`, `deploy.yml` publishes `dist/` whole and the list only drives `require` checks. So `sw.js`, `ocr/core.js`, `ort/` and `models/` publish correctly and no list change is needed to work. Recommended hardening: add `require /sw.js` and `require /ocr/core.js` so a failed stamp or missing bundle stops the deploy instead of going live broken. Jed owns the publish-list review.

## 4. Chromium timer caveat

Cause: the engine runs on the frame's main thread (`numThreads = 1`, `proxy = false`, `worker-src 'none'`). Chromium evidence in known-limitations.md says it shares the page's thread. The parent's job timeout and the frame-removal teardown then cannot fire while WebAssembly compute runs. A merely slow job finishes and is fine. A truly hung job freezes the page until the browser's own hang handling.

Assessment: a real but low-likelihood availability risk. It is not a confidentiality risk. Inputs are capped (longest edge 1280 after resize, 16 MiB), and the engine is pinned and hash-checked. The timeout still protects the case where compute is slow but the thread yields (WebGPU path, and between awaits).

Is a worker needed now? No. Recommended follow-up spike (Sean, half a day): run the engine inside a dedicated worker created in the frame, with `worker-src blob:` added to the frame policy only. Unknowns to settle first: whether Chromium, Firefox and WebKit accept a blob worker created in an opaque-origin document; whether eval and WebAssembly are allowed in it under the frame policy; whether Guten OCR needs canvas or DOM in the engine. If it works, the parent timeout becomes reliable and frame removal then really stops a job. Do not use `allow-same-origin` or relax `connect-src` to get there. Also test whether Chromium puts the frame in its own process; do not assume.

## 5. Risks to maintainability

- No ADR exists. `docs/decisions/` holds only 001. This is a significant decision (eval kept off the page, service-worker-built frame, hash pinning).
- Version constants (`BOOTSTRAP_VERSION`) must be bumped by hand when the bootstrap changes. The unit test recomputes the hash but cannot detect a missed bump. Consider a test that stores the bootstrap hash for the current version.
- `core.js` is about 10 MB, and the OCR download is about 55 MB; documented.
- Firefox and WebKit self-navigation block is inferred only; offline in CI is Chromium only. Documented.

## 6. Conditions and tasks

Before merge:

1. Tim accepts the freeze caveat in writing (Sonja to ask; recommended: accept).
2. Add `docs/decisions/002` (ADR) recording the decision, the alternatives (page-level eval, static sandboxed page, same-origin frame, removing OpenCV) and the consequences including the timer caveat. Mark the design file superseded.

After merge:

<!-- TASK -->
- [ ] Spike: engine in a worker inside the frame, to make the job timeout reliable `priority:medium` `owner:sean` `from:jacob-pr38`
<!-- /TASK -->
<!-- TASK -->
- [ ] Add `require /sw.js` and `require /ocr/core.js` to the publish list (Jed to review) `priority:low` `owner:sean` `from:jacob-pr38`
<!-- /TASK -->
