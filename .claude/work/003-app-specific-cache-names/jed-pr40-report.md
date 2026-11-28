# Jed security review: pull request 40 (app-specific cache names)

Verdict: pass. No blocking issues. Two low advisory notes.

## Basis

Worktree at the branch head (bad4dea). Read the changed source, the privacy page diff and the tests. Ran `npm test` equivalent (`node --test tests/*.test.mjs`): 180 tests, 178 pass, 0 fail, 2 skipped. Ran my own adversarial script against `isOwnModelUrl` and `installCachesRename`. The end-to-end spec was not run (needs a browser); I read its diff only.

## R1 to R6

- R1 resolved. `installCachesRename` uses `Object.defineProperty(scope, 'caches', ...)`. A test proves plain assignment is ignored on an accessor scope.
- R2 resolved. The WebLLM worker calls `installCachesRename` (first load) or `assertCachesRenamed` (later loads) before `CreateMLCEngine`. Test: with a blocked override, zero engines are created, an error message is posted for operation `load`, and no cache is opened. I confirmed fail-closed on a frozen scope and a non-configurable accessor.
- R3 resolved. `isOwnModelUrl` parses with `new URL`, requires https, exact origin, path prefix ending in a slash, and no query, fragment or credentials. Rules come only from `model-manifest.js`. My near-miss results, all rejected: repo-name suffix (`-foo`), `main` instead of the pinned revision, revision with extra characters, no trailing slash, query, fragment, http, look-alike host, credentials, dot-dot traversal, encoded dot-dot, other port, garbage. Accepted: pinned URL and nested paths. Upper-case host is accepted because the URL parser lowercases it, which is the same origin.
- R4 resolved to the design's fallback. The manifest holds SHA-256 values only for the speaker model, not for Transformers.js or WebLLM files, so migration uses the fallback: status 200, `basic` or `cors`, `Content-Length` present, numeric, and equal to bytes read. Planted-entry cases are rejected and left in place (test "entries that fail the integrity checks"). Residual, accepted by the design: a same-origin sibling could plant bytes of the right length under a pinned URL and migration would copy them. A same-origin page can equally write `callscribe-*` directly, so migration adds no new capability. Cached reads are not hash-verified anywhere for these models (design item 4); the ADR states the prefix is not a security boundary.
- R5 resolved. Web Lock `callscribe-migrate`, flag re-read inside the lock, flag set only after a complete pass, `put` overwrites, `has` not `open`, delete only after read-back length matches. Two-tab test passes with and without locks. Single-model removal (`removeModelFiles` in `src/main.js`) sweeps the new caches and then legacy entries limited to that model's rules.
- R6 resolved. See privacy page below.

## Erase-all

Prefix deletion runs first, then the legacy sweep runs even if the first part throws, and the first error is rethrown so the failed step is reported. The sweep deletes only matching entries and never the legacy cache. Test with a foreign entry and a foreign cache passes. The migration flag key starts with the settings prefix, so it is cleared.

## Content Security Policy

`index.html` and `public/sw.js` are unchanged in the diff. No new hosts or eval in app code.

## Privacy page (UK GDPR)

The new paragraph matches the approved wording. "Scoped to this site" became "scoped to this web address, which other pages on the same host may share". The old-files caveat, the "public model files, not your recordings" statement and the clear-site-data limit are accurate to the code. Model files are not personal data, so the erasure promise risk is low and the wording is honest. A privacy test was added.

## Review-precheck FLAG

One flag: `new Function('scope', 'scope.caches = {};')` in `tests/scoped-cache.test.mjs`, two lines. The explanation is correct. It is test-only, uses a constant string with no input, and exists to create a sloppy-mode function that proves plain assignment is ignored. It is not shipped and not reachable from the page. `tests/summary-worker.test.mjs` also builds the worker with `new Function` from repository source, also test-only. Accept. All other precheck lines are PASS.

## Advisory, non-blocking

1. Low. `sound()` skips a legacy entry whose `Content-Length` differs from the decoded body (for example a compressed small JSON file). It then downloads again. This is fail-safe and costs only bandwidth. Note: no change needed.
2. Low. If Delete all my data runs in one tab while migration is mid-pass in another, a copy could land in a new-name cache after the erase and the flag would then be set. The window is small and the content is public model files. Optional later hardening: have erase-all take the same Web Lock.

## Not verified

Real-browser behaviour of the WebLLM wrapper against a live 0.6B download (design calls this a manual or opt-in check). Recommend Tim or Sean run it once before release and confirm only `callscribe-` names appear.
