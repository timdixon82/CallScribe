# Carol report: test and quality review, CallScribe

Verdict: fail (quality gaps; no code changed). Read-only. npm test run: 60 tests, all pass.

## Correction to the brief
accessibility.yml does NOT only delegate to Playwright. For this project it builds, serves dist/ and runs Pa11y (WCAG2AAA) and axe-core (wcag2a to wcag22aaa tags, --exit so violations fail) against http://localhost:8080/index.html. Its own header admits the limit: only the initial served page is audited; full rendered-interface testing is left to a manual pass. The "Playwright carries the gate" note applies only to browser-extension archetype.

## What CI really runs (pull_request)
- ci.yml: npm ci, build, npm test (--if-present), then a warning only if no test script. Playwright browser install is gated on a playwright.config file, which does not exist, so it is skipped silently.
- lint.yml: npm run lint = node --check only. Syntax only; no ESLint, no HTML or CSS lint, no style rules.
- accessibility.yml: Pa11y and axe on the landing state of index.html only (see above).
- playwright.yml: stub; its only step echoes "not yet configured" and goes green. A green check that tests nothing.
- Skipped silently: every state after load (open dialogs, settings, transcript view, export menu, error messages, dark theme, session list), keyboard flows, focus order, live regions, reduced motion, the help/privacy/terms pages.

## Is the AAA gate enforced?
Partly. Landing-page automated scans are enforced (axe has --exit). Not enforced: anything dynamic. Automated tools also catch only a minority of WCAG issues. The "manual screen-reader gate is suspended" per CLAUDE.md, so currently no rendered-state, keyboard or focus check runs at all. Also verify the check is marked required in branch protection (not visible from the repo; ask Tim/Jed).

## Quality of existing tests
- minutes.test.mjs (232 lines), summary-worker, transcript-docx, workspace: behavioural. transcript-docx is the best: it unzips the output and checks XML escaping, ordering, image dedupe, size limits. workspace.captureState is pure-function behaviour.
- models.test.mjs (325 lines, 22 tests, 49 readFile calls): mostly source-string tests. It reads src/main.js and index.html and asserts regexes such as /function exportMarkdown/ or id="export-format". These prove a name exists, not that it works. Renaming-safe refactors fail them; broken logic passes them. Example: the export test never runs an export. Treat the 60 count as overstated; real behavioural tests are roughly 25.
- No test covers failure paths (quota exceeded, permission denied, corrupt file).

## Coverage gaps, ranked by risk
1. Data loss and deletion: src/store.js (IndexedDB, DB_VERSION 5 migration in onupgradeneeded, removeSession, deleteSegments, deleteScreenshots, removeParticipantFromSegments cursor). Observation: removeSession only deletes the session row; confirm main.js also calls deleteSegments, deleteScreenshots, deleteMeetingNotes, deleteMinutesRun, or orphans remain (privacy issue under UK GDPR erasure expectations). Untested. Note run() resolves on request success but closes db on tx complete; deleteSegments fans out many transactions with no atomicity: a failure mid-way leaves partial data.
2. Import: src/call-markdown-import.js (35 lines). Untested. Risks: regex heading parse, fetch(dataUrl) on untrusted data URLs, session written before validation of blocks (partial import on failure leaves a half session), silent skip of blocks with no data URL, invalid dates fall back silently, no size limit, name from file name unsanitised.
3. Recording: src/audio.js, audio-worklet.js, diarization.js, main.js capture flow. Untested; needs fake media devices in a browser. Pause, resume, mute, stop, tab close mid-recording (is partial transcript saved?).
4. Export: Markdown export, screenshots zip/download, and the DOCX path are only tested at library level (docx) or by string. exportMarkdown round trip (export then import) is untested and is the highest-value single test.
5. OCR (src/ocr.js) and model download/cache: network failure, partial download, cache verification. Untested.
6. Accessibility of dynamic UI: no tests.
7. Workers (transcriber, diarizer, minutes.webllm): only summary-worker covered.

## Maintainability note
src/main.js is 444 lines, but 97 lines exceed 300 characters and the longest is 3,969 characters. Many functions sit on one line with several statements joined by semicolons (for example startMinutesGeneration, enableOcr, the minutes onmessage handler). This blocks unit testing (main.js touches the DOM at import time via the ui lookup), hides logic in review diffs (line-level diffs show whole functions changed) and defeats coverage tools. Recommend: extract pure logic (export building, session deletion, minutes message handling) into modules with injected dependencies, and add a formatter (Prettier) and ESLint to lint.yml.

## Minimum plan, small tasks for Sean (in order)
T1. store.js unit tests with fake-indexeddb (dev dependency, node:test). Cases: put/get roundtrip; getSegments by sessionId index; deleteSegments and deleteScreenshots remove only that session; removeParticipantFromSegments removes only that id; upgrade from an older version creates all 8 stores. Small.
T2. Cascade-delete function: add a deleteSessionCompletely(id) in a module, test that no segments, screenshots, notes or runs remain; use it in main.js. Fixes finding 1. Small-medium.
T3. call-markdown-import tests (fake-indexeddb, stub crypto/fetch as needed): valid mic+app file; screenshot with data URL; no headings throws and writes nothing (needs fix: parse before putSession); bad timestamp; empty blocks skipped; counts returned. Small.
T4. Round-trip test: export Markdown then import, compare text and counts. Requires extracting exportMarkdown from main.js. Small-medium.
T5. Replace or supplement the source-string tests in models.test.mjs: mark each as TODO-behavioural, delete ones duplicated by T6. Small.
T6. Playwright setup: add @playwright/test, playwright.config.mjs (webServer: vite preview on built dist, chromium only), launch args --use-fake-ui-for-media-stream --use-fake-device-for-media-stream (optionally --use-file-for-fake-audio-capture with a short wav). Un-comment playwright.yml steps (also stops the green no-op). Small.
T7. @axe-core/playwright specs: scan the page in each state (landing, settings open, model picker, transcript view, help/privacy/terms, dark theme and light) with tags wcag2a, wcag2aa, wcag21aa, wcag22aa, wcag2aaa; fail on any violation. Small.
T8. Keyboard-only flow spec: Tab through to start recording, pause, stop, open saved session, export, delete with confirm; assert focus visible, focus order, dialog focus trap and return, Escape closes. Medium.
T9. Recording smoke spec with fake mic: start, wait for status text, stop, assert session saved in IndexedDB (page.evaluate), reload, still present. Medium.
T10. Delete and import e2e: import a sample .md via file chooser, confirm it lists, delete, confirm gone after reload. Small.
T11. Lint upgrade: ESLint + HTML validation in npm run lint; fail ci on no-op playwright.yml. Small.
T12. Refactor main.js incrementally (split one-line functions, extract modules). Ongoing, own tier decision.

## Recommended specialists (via Sonja)
- keyboard-navigator and screen-reader-lab on the transcript view, export and delete confirm dialogs (new interactive surfaces with no coverage).
- Tier note: data deletion and personal call transcripts make store/delete work Tier 2; recommend Jed review T2.

## Not done
Did not run the app in a browser (not cheap enough; no running server). Branch protection settings not inspected.
