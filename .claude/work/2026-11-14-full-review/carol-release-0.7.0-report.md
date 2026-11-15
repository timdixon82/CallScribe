# Release checklist: CallScribe 0.7.0 (pull request 31)

Verdict: ready, subject to Tim's approval and the manual screen reader pass he requested.

## Findings

1. Changelog completeness: pass. The release branch head is ab99bdc, created directly on b162a74 (pull request 38 merge) and last updated 21:06:20Z, after that merge at 21:05:51Z. The changelog lists the OCR frame (eb6c741, b162a74), the blob worker (e264d90), the focus fix (d594bbf), the semgrep fix (75f2ef0), and the work from pull requests 30, 32, 33, 34, 35 and 36. The only later main commit is a3560b8, a chore commit that adds review reports, which release-please does not list. No refresh is needed.
2. Allowed files: pass. The pull request changes only .release-please-manifest.json, package.json, package-lock.json, public/assets/version.js, index.html and CHANGELOG.md. The version moves from 0.6.0 to 0.7.0 in each. The merge state is UNSTABLE only because the bot branch has no checks, which the release exemption covers.
3. Main CI and deploy: pass. On a3560b8 (the current head), Security, Release, CodeQL and Deploy all succeeded. The same four succeeded on b162a74.
4. Local suites on the release branch head, with dist rebuilt: pass.
   - Build succeeded and the built version.js reports 0.7.0.
   - Unit tests: 150 of 150 passed.
   - Playwright with OCR_ALL_BROWSERS=1 (Chromium, Firefox, WebKit, including the axe check with OCR on): 56 passed, 1 skipped, 0 failed. I did not investigate the skipped test.
5. Test coverage: pass. v0.6.0 had 5 unit test files and no end-to-end tests. Now there are 150 unit tests and 39 listed end-to-end tests in 11 files. The new interactive surfaces (OCR switch, import, erase-all, export) each have end-to-end coverage.
6. Version and changelog: ready.
7. Architecture and security conformance: Jed's pull request 38 reports are in the work folder. I did not repeat that review.
8. Work folder log: not checked in this pass. Sonja should confirm it is complete.

## Needs Tim

- Real VoiceOver and NVDA pass, which Tim asked for before the next release. The automated AAA gate (axe) passes, but it cannot replace this.
- Express approval to merge. Sonja merges.

## Blockers

None from automated checks.
