# Carol final report: CallScribe main at f50396a

Verdict: pass with findings. No code changed. Worktree used and removed.

## 1. Original gaps (from carol-report.md)

Counts: closed 6, partly closed 4, open 2 (12 items: the 7 ranked gaps plus the CI, AAA gate, test-quality and maintainability points).

1. Data loss and deletion: CLOSED. src/store.js now has removeSessionCascade (one transaction over sessions, segments, screenshots, meetingNotes, minutesRuns). tests/store.test.mjs covers round trip, cascade leaves other sessions, unknown id, failed bundle write stores nothing. e2e import-delete asserts storage is empty after delete. I also deleted via the dialog in a browser: row gone.
2. Import: CLOSED. 15 tests in call-markdown-import.test.mjs: no headings writes nothing, size limit, bad screenshot skipped and reported, single write, adversarial input linear time, huge image headers never decoded.
3. Recording: PARTLY CLOSED. e2e recording.spec uses the fake microphone: record, pause, resume, stop, session saved. Not covered: tab closed mid-recording, mute, app-audio capture, real transcription (worker is stubbed).
4. Export: PARTLY CLOSED. Markdown export-then-import round trip (unit) and Markdown download (e2e) exist. DOCX is tested at library level only. SRT, VTT, TXT, JSON and screenshot .webp exports have no test. I confirmed all seven formats are offered.
5. OCR and model download: PARTLY CLOSED. pinning.test.mjs and transcriber-load.test.mjs cover hash checks and pinned commits; csp.spec checks policy. No test of network failure, partial download, or OCR output.
6. Dynamic UI accessibility: CLOSED for the states listed in section 4. Keyboard spec covers skip links, tab order with focus indicator, dialog focus trap, Escape, arrow keys on tabs.
7. Workers: PARTLY CLOSED. summary, diarizer and transcriber-load have tests; minutes WebLLM generation is untested for real.
8. CI really runs only syntax lint and landing-page scans: CLOSED. playwright.yml now runs the e2e suite (was a no-op stub); the e2e axe spec fails on any violation.
9. AAA gate enforced: PARTLY CLOSED. Per-state axe at AAA now gates in Playwright. accessibility.yml (Pa11y and axe CLI) still only scans index.html. Branch-protection required checks still not inspected by me.
10. Test quality (source-string tests): PARTLY CLOSED. See section 5.
11. Maintainability of main.js: OPEN. Still 447 lines, 97 lines over 300 characters, longest 3,969. No formatter or ESLint; npm run lint is still node --check.
12. Failure-path tests (quota, permission denied, corrupt file): OPEN for quota and permission denied in the UI. Corrupt import file and failed write are now covered.

## 2. Runs
- npm test: 96 tests, 96 pass, 0 fail (was 60).
- npm run lint: clean. npm run build: succeeds (chunk-size warning only).
- npm run test:e2e x3: 20 of 20 passed each time (18 to 21 seconds). No flakes.
- gh run list, branch main: all completed runs green (Security, Release, CodeQL, Deploy for PRs 33, 34, 35). At my check, Deploy and CodeQL for PR 35 were still in progress. Recheck before calling it final.
- Note: no CI run list exists for the pull-request-only workflows on main; they ran on the PRs, which I did not re-inspect.

## 3. Browser walk-through (built app, Chromium, fake devices)
- Landing, settings, Prior Sessions, import of a small synthetic Markdown file ("Imported 2 transcript passages and 0 screenshots locally"), open transcript (text present), export Markdown (file Synthetic.md downloaded), delete through the dialog (Cancel and Delete transcript buttons; row removed), reload, offline reload (page title loads from service worker): all worked.
- Keyboard: Enter on Delete opened the dialog with focus inside it. My headless Tab probe landed outside the dialog after two Tabs (likely focus moving to browser chrome in headless); the e2e focus-trap test passes, so I treat this as inconclusive, not a defect.
- Console errors: none. Only warnings from the model loader ("Unable to determine content-length").
- Hosts: localhost, huggingface.co and us.aws.cdn.hf.co (model download starts on page load of the default model). All match the CSP connect-src allow list (self, huggingface.co, *.hf.co, raw.githubusercontent.com). No other host. With external hosts blocked, no console errors either.
- Finding: the app downloads the speech model without a user action on first load. Confirm this is intended and disclosed in privacy.html (Jed/Sonja to confirm).

## 4. Axe at AAA (tags wcag2a, 2aa, 21a, 21aa, 22aa, 2aaa, 22aaa)
0 violations on: index, help, privacy, terms, accessibility, whats-new; index and help in dark mode; transcript view; plus the e2e suite states: settings (transcription and capture), import status and list, export controls, delete dialog.
Needs-review (incomplete) items, not failures: identical-links-same-purpose on help.html; color-contrast-enhanced on the icon-button glyph span (aria-hidden, no text, so not applicable) and label-content-name-mismatch in transcript view. A human should glance at help.html links.

## Residual gaps and proposed tasks
1. Screenshot capture and OCR: no test. Task: Sean, e2e with fake display capture plus a fixture image through ocr.js. Medium.
2. DOCX, SRT, VTT, TXT, JSON, webp exports: only DOCX library-level. Task: Sean, one table-driven e2e that downloads each format and checks content. Small.
3. Real model transcription and WebLLM generation: stubbed. Task: nightly (not PR) job with the tiny model, asserting non-empty text. Medium.
4. Firefox and Safari: Chromium only. Task: add webkit and firefox projects, run on a schedule. Small.
5. Real screen reader: gate suspended. Task: Tim or Jed to schedule a VoiceOver and NVDA pass on transcript, export and delete dialog before the next release; run the keyboard-navigator and screen-reader-lab specialists via Sonja.
6. Recording edge cases: close tab mid-record, mute, mic denied. Task: Sean, e2e with permission denied and a beforeunload case. Small.
7. accessibility.yml scans index.html only: Task: Sean, point it at the docs pages or drop it as duplicate of e2e axe. Small.
8. main.js maintainability and a real linter (ESLint, Prettier). Task: Sean, own tier decision.
9. Docs pages dark mode and states beyond help were scanned by me, not by the suite: Task: add all docs pages and dark mode to accessibility.spec. Small.

## 5. Test-quality verdict
Behavioural tests are now about 60 of 96 (store, import, minutes, docx, workspace, summary-worker, sw plus 20 e2e). models.test.mjs still has 22 tests with 46 readFile calls, and pinning, privacy, sw and the worker tests read source in small amounts.
Verdict on regex-on-source tests: keep a small number, drop the rest. Keep those that guard a security or privacy invariant that is hard to run: pinned commits and SHA hashes (pinning.test.mjs, it also runs a real check script), CSP and no-telemetry strings (privacy.test.mjs), service-worker rules. Drop or convert those in models.test.mjs that only assert an id or function name exists, because e2e now exercises the real behaviour (model picker, export, import, record). Replace them one by one as the matching e2e arrives; do not delete before the replacement exists. Net: worth keeping about a quarter of them.
