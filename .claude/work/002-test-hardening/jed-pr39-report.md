# Jed review of pull request 39

Verdict: pass.

## Checks
- Diff touches only tests/e2e/ocr.spec.mjs, tests/e2e/offline.spec.mjs and tests/hosts-policy.test.mjs. No production change, no secrets.
- Throwaway merge of current main (includes pull request 40) is clean.
- npm run lint passes. npm run test: 183 tests, 181 pass, 0 fail, 2 skipped (skips pre-existing).
- Host policy tests pass against post-PR-40 files (ALLOWED_HOSTS, connect-src on every page, privacy page, hosts note).
- Offline spec passes in Chromium (2 of 2). Mutation check: making navigation cache-first in public/sw.js makes the new network-first test fail. Mutation reverted, worktree removed.
- Double-Space OCR test not run (needs a model download of up to 120 seconds); read only. Uses web-first assertions with explicit timeouts, no fixed sleeps.

## Notes, non-blocking
- hosts-policy.test.mjs reads .claude/work/2026-11-14-full-review/hosts.md. If that work folder is archived or moved, the test fails. Consider moving the note to docs/.
- The double-Space test's second press may land before or after start-up; the assertions hold either way, so it is not flaky, but it may pass without exercising the race on a fast machine.
