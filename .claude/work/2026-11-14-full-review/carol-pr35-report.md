# Carol test report: pull request 35 (head c8b93f5)

Verdict: pass, with two non-blocking notes.

## Results
- npm test: 92 of 92 pass. Lint clean. Build succeeds (chunk size warning only, pre-existing).
- test:e2e: three runs, 20 of 20 pass each time, no failures, no flakes.
- gh pr checks 35: all 8 pass (Pa11y and axe, Playwright, build, dependency-review, gitleaks, lint, semgrep, trivy).
- e2e csp.spec.mjs runs against the strict policy and fails on any securitypolicyviolation event or CSP console error. It passed. The trim removed font-src and manifest-src; the app has no manifest link or fonts, so nothing is blocked.

## Mutations (all discarded; worktree status clean after each)
- Remove the WebAssembly fallback (rethrow always): transcriber-load.test.mjs fails (1 fail). Caught.
- Service worker caches non-ok responses (if (true)): sw.test.mjs fails. Caught.
- Service worker goes cache-first for navigations (navigate branch disabled): sw.test.mjs fails. Caught by that test only; offline.spec.mjs still passed 20 of 20.
- Imported width and height forced to 0: call-markdown-import.test.mjs fails (1 fail). Caught.

## Other checks
- Stubbed gpu with no adapter: unit test covers it (no webgpu attempt, device wasm). Status text: "WebGPU is not available on this computer; using WebAssembly instead". Plain language, reads well aloud. It reaches the model download output element, which has role status, so a screen reader announces it prefixed by the model name. I read this in code; I did not run it in a real browser with a stubbed navigator.gpu or a screen reader.
- Offline reload: offline.spec.mjs passes against the built app.
- Cache name stamping: two builds a few seconds apart gave callscribe-shell-mwh1vrnv and callscribe-shell-mwh1w3l6. A changed index.html is picked up without a manual bump, and old caches are deleted on activate.

## Notes, not blocking
1. sw.test.mjs checks source text with regular expressions, not behaviour. No test proves navigations are network-first at run time; offline.spec.mjs does not fail under cache-first. Suggest an e2e that changes the served page and reloads online.
2. The stamp is build time, not a content hash, so every build invalidates the cache even if nothing changed. Harmless.

## Not done
No real-browser run of the stubbed-gpu path, no screen reader test, no visual pass on the docs pages beyond the CSP and axe e2e runs.
