# Decision 002: Text recognition runs in an isolated frame, in a worker inside the frame

## Status

- State: Accepted, subject to Tim's approval at merge (pull request 38)
- Decided: 2026-11-15
- Supersedes: None
- Superseded by: None

## Source

AgentTeam work folder `2026-11-14-full-review`. Design by Jacob, security design review and code review by Jed, test pass by Carol, spike and build by Sean. Tim chose to fix the freeze risk inside pull request 38.

## Context

The text recognition engine (Guten OCR with ONNX Runtime and OpenCV) needs `eval`. The page policy forbids `unsafe-eval` and must stay that way. The engine must also have no network and no access to the stored transcripts.

## Decision

- The engine runs in a hidden iframe. The service worker builds the frame page from a build-time constant and serves it at one exact path, only to an iframe, with the header `Content-Security-Policy: sandbox allow-scripts`. The frame has an opaque origin. There is no `allow-same-origin`, ever.
- The frame policy is `connect-src 'none'`, `frame-src 'none'`, `eval` allowed, one hashed inline script, and `worker-src blob:`. The page policy only gains `frame-src 'self'`.
- The page checks the SHA-256 of the engine, the runtime and every model before it sends them over a private message port. Messages are validated by exact keys in both directions. The first `hello` only, then the first `init` only.
- The frame's one inline script (the bootstrap) starts a classic blob worker from the verified engine bytes. The engine and the models then run in that worker. The port is moved to the worker.

## Alternatives

- Page-level `unsafe-eval`: rejected. It weakens the whole app.
- A static sandboxed page file: rejected. A file on the site can be loaded top level, outside the sandbox, with `unsafe-eval` and no isolation.
- A same-origin frame (with `allow-same-origin`): rejected. It reaches page storage.
- Replacing OpenCV so that no `eval` is needed: still possible later. Not done now.
- Engine on the frame's main thread (the first version of pull request 38): replaced. In Chromium a running job delayed the page's own timers, so a hung job could freeze the page and stop the job timeout from firing.

## The worker outcome

A blob worker made inside the opaque-origin frame was tested in Chromium, Firefox and WebKit, in a frame under the real header.

- Classic blob worker: works in all three. The worker reports origin `null`, so it is as isolated as the frame.
- Module blob worker: fails in Chromium (the module script cannot load from an opaque origin). So the engine is bundled as one classic script, and the bootstrap uses a classic worker.
- The worker inherits the frame policy, so `connect-src 'none'` still applies. No relaxation of any network rule was needed. The only policy change is `worker-src` going from `'none'` to `blob:`.
- A worker has no `document`. Guten OCR makes scratch canvases with `document.createElement('canvas')`. The worker answers only that call with an `OffscreenCanvas` (marked as a shortcut in the code).
- The frame bootstrap changed, so `BOOTSTRAP_VERSION` is now 2. The page refuses a frame with a different version.
- Proof: an end-to-end test starts the real frame page with an engine that spins forever. The page's timers keep firing, and the page can remove the frame.

## Consequences and residual risks

- A hung job no longer blocks the page. The page timeout (60 seconds per job by default) removes the frame, which ends the worker, and OCR then locks until reload, as before.
- Timer caveat: the job timeout is a timer on the page. It now fires, because the engine is off the page's thread. If a worker dies after it has taken the port, it cannot report the death, and the page's start timeout (120 seconds) removes the frame instead.
- A frame that sandboxes by header loses the sandbox if it navigates itself. The page removes the frame on a second load event and locks OCR. The page policy's `frame-src 'self'` blocks navigation to other sites in Chromium. In Firefox and WebKit the block is inferred (no request seen), not confirmed. This is accepted residual risk. A compromise that gets that far already means code is running in the frame.
- `connect-src` does not cover DNS prefetch or WebRTC in every browser. The defences are pinning, the hash check and dependency scanning.
- The engine file is about 10 MB, and turning OCR on downloads about 55 MB in total.
- CI runs the browser tests in Chromium only. Firefox and WebKit run with `OCR_ALL_BROWSERS=1`.

## Firefox offline test cause

The offline test failed in Firefox only when the shared test fixture was used. That fixture blocks outside hosts with a route on the whole browser context (request interception). With the route and offline emulation together, the frame never greets and the app answers with its reload-once message. The same test passes in Firefox without the route, and with the route while online. The most likely cause is that Firefox request interception and offline emulation stop the service worker answering the frame page. This was narrowed by experiment, not traced inside Firefox. The offline test therefore uses the plain test object, which is safe because offline blocks all outside requests anyway.

## Review triggers

Revisit if Guten OCR or ONNX Runtime changes how it loads, if a browser allows module blob workers in opaque origins, or if `eval` can be removed from the engine.
