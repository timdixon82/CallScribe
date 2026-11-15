# Carol test report: pull request 32 (fix/download-pinning)

Verdict: pass, with one non-blocking gap.

## Results

- npm test: 82 of 82 pass. npm run lint: clean.
- CI at the end of the run: all eight checks pass (gitleaks, Pa11y and axe AAA, build, lint, semgrep, Playwright, trivy, dependency-review).
- node scripts/check-pins.mjs: "All pins and hosts match."
- npm run build: succeeds. dist/ort-tfjs holds ort-wasm-simd-threaded.jsep.mjs and .wasm. The string jsdelivr remains in the bundled library only as a default guarded by "not wasmPaths already set", which both workers now set. Not reachable.
- Browser (vite preview of the built app, Playwright): 8 resource requests at load, zero to any host other than the app's own origin, no console errors. Note: the first load showed a stale service worker from an earlier build on the same port; I cleared it and the clean load was correct. Not a defect in this PR.

## Mutation checks (in the worktree, all discarded)

- Remove verifySha256 call in diarizer worker: caught.
- Remove revision from transcriber worker: caught.
- wasmPaths pointed at a CDN: caught (two tests).
- Rename verifySha256 export: caught (suite fails to load).
- Diarizer URL changed to resolve/main: caught (two tests).
- Make the hash comparison never throw: caught (SHA test).

## Adjusted existing tests

- models.test.mjs: assertion moved from the worker to model-manifest.js (still asserts the repo name) plus a check that the worker uses diarizerUrl. Not weakened.
- summary-worker.test.mjs: harness gained the two new injected names only. Not weakened.
- store.test.mjs: one test added, none changed.

## Gap (non-blocking)

"Hash mismatch rejects and caches nothing" is proved in two halves: verifySha256 behaviour is tested, and the worker's ordering is a source-text check (verifySha256 appears before cache.put). No test runs the worker with bad bytes and inspects the cache. A refactor that keeps the text order but changes the flow could slip through. Suggest a follow-up behavioural test.

## Not done

- No real model download in a browser, so I did not observe the live hash check, a real revision fetch, or offline transcription end to end. Pins checked by static tests and the drift script only.
- No screen-reader testing (suspended per project rules). Change touches no UI markup.

## Before merge

Nothing blocking.
