# Release checklist: CallScribe 0.7.1 (pull request 41)

Verdict: ready to merge, subject to Tim's express approval.

## Pre-merge items

1. Allowed files: pass. The release branch (head a91fbcb) changes only .release-please-manifest.json, CHANGELOG.md, index.html, package-lock.json, package.json and public/assets/version.js. This meets the release exemption in docs/release-process.md. No checks run by design.
2. Branch base: the bot branch sits on d46e71c (pull request 40 merge), not on current main e6983ef (pull request 39 tests). Compared directly, the branch looks like it removes three test files, but that is only because it predates them. The merge result keeps them, so I tested main plus the six release files.
3. Version strings: pass. 0.7.1 in .release-please-manifest.json, package.json, package-lock.json (top entry and package entry), public/assets/version.js, and index.html (version.js query string). CHANGELOG.md has a 0.7.1 heading dated 2026-11-16. The built dist/assets/version.js reports 0.7.1.
4. Changelog: pass. It lists the cache name fix (bad4dea, d46e71c). Pull request 39 added tests only, which release-please does not list.
5. Main CI and deploy: pass. Security, Release, CodeQL and Deploy all succeeded on e6983ef and on d46e71c.
6. Lint: pass. Build: pass.
7. Unit tests: 183 of 183 passed.
8. Playwright, all three browsers, OCR_ALL_BROWSERS=1: 60 passed, 1 skipped, 0 failed. This includes axe with OCR on. I did not investigate the skipped test (same one as in 0.7.0).
9. Test coverage: pass. Up from 150 unit tests at 0.7.0 to 183. Pull request 40 added suites for legacy caches, legacy match and scoped caches. The e2e erase-all spec was updated, and pull request 39 added double-Space OCR, service worker and host policy tests. This release adds no new interactive surface.
10. Architecture and security conformance: Jed's reports for pull request 40 are in this folder (jed-design-report.md, jed-pr40-report.md). I did not repeat that review.
11. Work folder log: not checked by me. Sonja should confirm .claude/work/003-app-specific-cache-names/log.md is complete.

## Live smoke test of main as deployed (version 0.7.0 with pull request 40 code)

Live site reports v0.7.0, the expected pre-release version. I seeded the legacy transformers-cache with real, sound entries and cleared the migration flag, then reloaded.

- A real pinned model file (fetched from Hugging Face, with a length header) moved into callscribe-transformers-v1 and was removed from the legacy cache.
- A foreign entry (example.org) stayed in the legacy cache, and the legacy cache itself was not deleted.
- A synthetic entry without a real network response was left alone, which matches the soundness rule in src/legacy-caches.js.
- The migration flag was set to 1 after the run.
- No application errors. The console shows only the onnxruntime warnings, plus one Content Security Policy block on a fetch to projects.timdixon.net/CallScribe/. That fetch was not caused by my test and the block is the policy working. Someone may want to find what requests the old address.
- I removed my seeded entries afterwards. No server was started by me, and my temporary worktree is removed.

## Post-merge items for you

1. Merge only on Tim's express approval, then wait for the Deploy workflow to succeed on the new main commit.
2. Check https://callscribe.timdixon.net/assets/version.js shows 0.7.1 (add a cache-busting query string), and the page footer shows v0.7.1.
3. Confirm the release bot creates tag v0.7.1 and the GitHub release.
4. Reload once in a browser that holds older models and confirm the old transformers-cache entries move across, as in the smoke test.

## Blockers

None.
