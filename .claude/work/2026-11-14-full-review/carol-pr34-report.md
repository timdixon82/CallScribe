# Carol report: pull request 34 (head 094e19d)

Verdict: rework

## Passed
- npm test 86 of 86, lint, build pass. gh pr checks: all 8 pass.
- Diarizer: removing the cache re-hash makes "tampered cache entry is deleted, refetched, rejected and not kept" fail. Good.
- Breaking the worklet path is caught: microphone status shows "Failed to load worklet module script".
- Inline script and inline style mutations: all 3 csp tests fail. Good.
- Privacy page: axe at WCAG 2.2 AAA, zero violations. One H1, then 8 H2, no skips. Link text descriptive. Flesch-Kincaid about 9.1 (my own estimate). Plain panels, no tables.
- sw.js: shell cache v25 holds the start page and the worklet; offline reload works, microphone status "Microphone on". Offline Record stays disabled because no model is cached (expected, not a regression).
- Print: csp flow test asserts the print frame body is 16px (print.css applied) when it gets that far.

## Problems
1. Flaky e2e test. tests/e2e/csp.spec.mjs "main flows..." fails at line 69 (#minutes-editor hidden after Open and Summary tab) in about 5 of 8 local runs (suite: 18 passed, 1 failed). CI passes only because playwright.config.mjs retries once in CI. The print and delete steps after it are therefore unreliable. Fix the race (seeded note read before render; wait for the note to load).
2. The real-worker test does not police worker network or wasm. A meta Content Security Policy governs the page, not workers loaded from same-origin files. Removing https://huggingface.co from connect-src, or 'wasm-unsafe-eval' from script-src, does not fail any test. The "every outside request goes to an allowed host" check is only the test's own host list. Workers genuinely start (4 workers, huggingface request seen), but policy enforcement on them is unproven. Either serve the policy as a header for workers (deploy host permitting) or state this limit in docs and rename the test.
3. Weak mutation: removing worker-src changes nothing (falls back to script-src 'self'); acceptable, but blob: workers are not tested.

## Not done
- Real print dialog and PDF output; manual VoiceOver or JAWS (gate suspended).
- Real model download and wasm run under policy.

## Re-test at cf5b86f

- Verdict: pass, with one caveat. Continuous integration checks were all still pending when I looked, so confirm they are green before merge.
- npm test: 86 pass, 0 fail. Lint and build pass.
- End-to-end suite: 57, 57 and 114 passed (three runs of 19 tests at repeat 3, 3 and 6). No failures, no toHaveCount flake reproduced in about 228 test runs.
- Mutation 1: extra fetch to an unexpected host appended to a worker file. The "drift script static checks" test failed. Same result for the diarizer worker. Reverted.
- Mutation 2: removed huggingface.co from connect-src. The privacy host test and the same-policy-on-every-page test failed, and the CSP end-to-end spec failed. Reverted.
- Privacy page: axe at WCAG 2.2 A to AAA, zero violations. Reading grade about 9.0 (rough Flesch-Kincaid), unchanged by the one-phrase edit.
- Worktree removed, no commits, nothing pushed.
