# Jacob: PR 38 worker re-check at head e264d90

Verdict: conforms. No required changes.

Method note: I had no shell tool, so I read the files at the new head directly instead of running the diff. I checked the bootstrap, worker, frame policy, build script, publish list, deploy workflow and decision 002. I did not run the tests.

## Timer-freeze condition

Resolved. The engine now runs in a classic blob worker (src/ocr-frame-bootstrap.js line 27, src/ocr-frame-worker.js). The page's timers are no longer on the engine's thread. The e2e test at tests/e2e/ocr.spec.mjs line 195 uses the real frame page and an engine that spins forever, and asserts at least 12 page timer ticks. I did not run it.

## Conformance to design and constraints

- No allow-same-origin: the header is still `sandbox allow-scripts`. The bootstrap and worker both check `self.origin === 'null'`. Tests cover the `x-frame-policy=allow-same-origin` query.
- connect-src not relaxed: the frame policy is still `connect-src 'none'`. The only change is `worker-src blob:` (scripts/ocr-frame-page.mjs line 18). The page policy in index.html is unchanged by this delta. It already had `frame-src 'self'` and blob workers.
- Hash check, exact-key message validation and first-message-only rules are kept in both the bootstrap and the worker.
- The IIFE bundle is correct: scripts/build-ocr-core.mjs uses esbuild `format: 'iife'`, which suits a classic worker.
- BOOTSTRAP_VERSION 2 is correctly wired. The build stamps it into the bootstrap, the page refuses a mismatch, and tests assert it.
- The document shim answers only `createElement('canvas')` and throws otherwise. It is recorded as a shortcut. Acceptable.

## Decision 002

Accurate and sufficient. It records the context, decision, alternatives (including the replaced main-thread version), the worker outcome across three browsers, consequences, residual risks and review triggers. My pre-merge condition 2 is met.

## Publish list

Correct. The deploy publishes dist/ as it is. The include lines are not used, and the `require` lines are checked on the built site and on the live site. The new `require /sw.js` and `require /ocr/core.js` lines are the right guard against shipping without the service worker or the engine.

## Non-blocking observations

1. The worker hard-codes `v: 1` in its error messages instead of importing PROTOCOL_VERSION. This is harmless today. It could drift if the protocol version changes.
2. The frame policy's `script-src` includes `blob:`. This is needed for the blob worker and the glue URL, and it is inside the opaque origin. It is worth a line in decision 002 next time it is edited.
3. design-ocr-sandbox.md exists only on main. Sonja should mark it superseded by decision 002.

<!-- TASK -->
- [ ] Import PROTOCOL_VERSION in src/ocr-frame-worker.js instead of the literal 1 in its error messages `priority:low` `owner:sean` `from:jacob-pr38-worker`
<!-- /TASK -->
