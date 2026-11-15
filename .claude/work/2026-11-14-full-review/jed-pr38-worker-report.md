# Jed security re-review: pull request 38, head e264d90

## Verdict

Pass. No blocking issues.

## Findings

- Frame policy: only worker-src changed, from 'none' to blob:. A blob worker inherits the creating frame's policy, so connect-src 'none' applies to it. Same opaque origin (the worker also checks self.origin is 'null' and ignores the start message otherwise). It has no access to the page's storage, cookies or parent window. Its only link out is the transferred private port. No new network or storage route found.
- blob: was already in script-src before this change, so it does not widen script-src. worker-src blob: lets the frame create blob workers, but only the one pinned engine blob is built by the frame's single hashed script. Code injection would need prior code execution in the frame, which is the existing residual risk.
- Hash pinning: the page still verifies SHA-256 of the engine, runtime and models before init. The engine bytes are the pinned bytes, now a classic IIFE bundle built from the worker entry. Nested workers, if the engine spawns any, inherit the same policy.
- Six conditions, exact keys, handshake: bootstrap still checks all of them and the exact key set for init (core, glue, wasm, det, rec, dict). The worker adds its own exact-key check, first-message-only rule, and origin check. BOOTSTRAP_VERSION is 2, so the page refuses a stale frame. Unit test covers the one-classic-worker hand-off and the transfer list.
- Document shim: answers only createElement('canvas') with an OffscreenCanvas and throws for any other tag. It exposes no real document. Acceptable, marked as a shortcut.
- Worker death or hang: a hang is covered. The job timeout is a page timer, now proven to fire (new e2e test), and it removes the frame. A worker that dies after taking the port cannot report it, so the 120 second init timer on the page removes the frame. Both fail closed. Lockout after a violation is unchanged. Observation only: the 120 second wait before a dead worker is noticed is slow but safe.
- Privacy sentence: still accurate. Verified in public/docs/privacy.html.
- Documents: decision 002 and known-limitations.md match the code (policy, classic worker, BOOTSTRAP_VERSION 2, timer caveat, Firefox inference). The old "shares the page thread" limitation was correctly replaced. deploy-publish.txt now requires /sw.js and /ocr/core.js, which is a sensible guard.
- Sean's flake note on the keyboard e2e test: judged a low, test-only risk. The test forces the hidden switch visible and retries focus with toPass, but the app can re-hide the section between focus and the Space key press, which could lose a press. Not a product defect and not blocking. Optional hardening: retry the focus-and-press pair together until the checked state changes.

## Blocking issues

None.
