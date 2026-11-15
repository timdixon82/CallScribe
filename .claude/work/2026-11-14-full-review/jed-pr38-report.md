# Security code review: pull request 38, isolated OCR frame

Reviewer: Jed. Date: 2026-11-15. Tier 2. Branch feat/ocr-sandbox-frame, head 75f2ef0. Read-only review of the worktree. I read public/sw.js, scripts/ocr-frame-page.mjs, src/ocr-frame-bootstrap.js, src/ocr-protocol.js, src/ocr-frame-core.js, src/ocr.js, vite.config.js, scripts/build-ocr-core.mjs, the policy changes, erase-all wiring and the test names. I did not run the test suites (no node_modules in the worktree) and I did not run Semgrep. I relied on Sean's reported results for browser runs.

## Verdict

Pass. No blocking findings. Five follow-ups, none gating.

## The six mandatory conditions

1. No static frame page: met. The page is a constant substituted into dist/sw.js at build time and written nowhere else. The build fails if either placeholder is missing. A unit test scans dist for any file other than the worker carrying unsafe-eval. An end-to-end test checks the route without the worker.
2. Header only on the exact path: met. The check is the exact pathname, GET, navigate mode and iframe destination. Everything else on the path gets a plain 404. The query string is ignored. The policy, and every header, is a constant. The value is exactly "sandbox allow-scripts". Nothing is cached on demand for this route, and there is no redirect. The headers also include no-referrer, nosniff and no-store.
3. Bootstrap guard: met. It runs only if the origin is "null", the parent is not the window, and both localStorage and document.cookie throw. It accepts the first init only, with exactly one port, exact keys and ArrayBuffer values. Hello carries the protocol and bootstrap versions. The build computes the script hash and a test recomputes it. One note: the first init is consumed even when invalid, so a bad init locks the frame. That is fail-closed and acceptable.
4. Parent checks: met. It checks service worker control, then hashes all six files (core, glue, wasm, det, rec, dict) against build constants on every start, and hashes the same buffers it then transfers. It accepts only the first hello, requires source equal to the frame window and origin "null", and compares versions before sending anything. The init holds public files only. The 5 second hello timeout is in place.
5. Message validation: met. Exact keys, types, id match, text truncated to 100,000 and message to 200. The parent shows its own constant error text, never the frame's. Any invalid message, port payload, unexpected ready or second load removes the frame and locks OCR until reload. I did not trace every place OCR text is rendered; it was already stored and shown before this change. Confirm it uses text nodes (see follow-up 4).
6. Parent policy and disposal: met. The only change to the page policy is frame-src 'self', with no unsafe-eval, blob or data frames, and a test pins it. The frame is disposed on idle (5 minutes), timeout, the OCR toggle, removing local OCR, and erase-all.

## Wildcard postMessage annotations

Both are unavoidable and safe.

- Frame to parent hello: the frame has an opaque origin and cannot name the parent's origin, so only "*" works. The message holds two version integers and nothing else.
- Parent to frame init: the target is the frame window the page itself created. An opaque origin cannot be named, so "*" is the only option. The payload is public program files and models, with no user data. The parent verifies the sender's origin is "null" before it sends.

Residual (low): if a hostile frame navigated itself between hello and init, the init and its port could reach a same-origin document. The payload is public, and a page that could already navigate had compromised code and held the pixels anyway. The second-load check removes the frame. No change needed.

## Sean's caveats

1. Page timers delayed during a job, and a hung job could freeze the page so the timeout cannot fire. Not a blocker. It is an availability risk only, not a confidentiality or integrity one, and the trigger would be a hang in pinned, hash-checked code or a crafted image causing one. The documented limitation is honest. Do not claim a separate process or thread anywhere. Accept it as a recorded exception with Tim's approval (see follow-up 1). The 16 MiB and 2048 pixel caps limit exposure.
2. One Firefox offline test fails with network blocking. Not a blocker, with a condition. The no-network isolation test, which is the real security evidence, passes in all three engines per Sean, and the offline test passes without the blocking route. But the cause was not investigated and the test was weakened to avoid it. Investigate before relying on it (follow-up 2).
3. Firefox and WebKit self-navigation block unconfirmed. Not a blocker. In those engines no request was seen. The second-load check, the removal of the frame and the OCR lock are the backstop, and the compromise needed (code running in the frame) is already the threat model. Record it as accepted residual risk.

## Privacy sentence

"Reading text from screenshots runs on your device, in an isolated frame that is built to have no network access and no access to your stored data."

Accurate, and the "built to" hedge is correct. Evidence: opaque origin, connect-src 'none', worker-src and frame-src 'none', storage and cookies denied, and the isolation test passing in three engines. It is already in public/docs/privacy.html on the branch and a test covers the page policy. It does not overclaim a separate process or "cannot leak". The DNS prefetch and WebRTC residuals stay in known-limitations.md and the risk record, as I advised in the design review. Tim should still approve the sentence.

## Follow-ups (not blocking)

1. Write a security exception in the project wiki exceptions folder for the page-freeze risk and the DNS and WebRTC residual, with mitigation and Tim's approval and date.
2. Investigate the Firefox offline test failure with the blocking route.
3. Run the Firefox and WebKit self-navigation check with an observable message, once, before release if feasible.
4. Add a test that OCR text is only ever written with textContent or text nodes, and that it is delimited as untrusted in any language-model prompt.
5. Update the record of processing to mention the frame. No DPIA trigger.

<!-- TASK -->
- [ ] Write exception record for OCR page-freeze risk and DNS/WebRTC residual, for Tim's approval `priority:medium` `owner:sonja` `from:jed-pr38` `tag:security`
<!-- /TASK -->
<!-- TASK -->
- [ ] Investigate Firefox offline OCR test failure when the network-blocking route is active `priority:medium` `owner:sean` `from:jed-pr38` `tag:security`
<!-- /TASK -->
<!-- TASK -->
- [ ] Add test that OCR text is rendered as text only and delimited as untrusted in model prompts `priority:low` `owner:sean` `from:jed-pr38` `tag:security`
<!-- /TASK -->
