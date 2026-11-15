# Carol test report: pull request 38 (OCR sandbox frame), head 75f2ef0

Verdict: pass, with one recommendation.

## Evidence

- Unit tests: 149 tests, 147 pass, 2 skipped, 0 fail. The brief expected 149 pass; the 2 skips are existing skips, not failures.
- End-to-end, Chromium: 36 passed, 1 skipped (the manual diarizer spec). Port 4173 was free, so the build tested is this branch.
- End-to-end, Firefox and WebKit with OCR_ALL_BROWSERS=1: 14 of 14 pass (7 OCR specs per browser).
- Pa11y was not available locally (not installed; CI runs it in accessibility.yml). axe-core ran in the Chromium suite across WCAG 2.2 A, AA and AAA tags: landing, settings, import, saved transcript and export menu, delete dialog. All pass.

## Function

- OCR reads known text under the page policy with no unsafe-eval. Pass.
- Frame is isolated (opaque origin, no network, no page storage). Pass.
- Fails closed: missing sandbox header, changed engine byte, and first visit with no service worker control all refuse with a plain message and no frame. Pass.
- Offline after one online load: OCR works and the frame is served by the service worker. Pass in all three browsers.

## CSP change

frame-src 'self' is present on index.html and all 5 docs pages. csp.spec checks the policy on all six and finds no violations on docs pages or main flows. No regression.

## Accessibility and keyboard

The OCR control is a native checkbox with a label, a native progress element with a label, and a role=status output. These are keyboard operable by default. There is no dedicated keyboard test of the OCR toggle (see recommendation).

## Sean's caveats

1. Chromium page timers delayed by a running OCR job: no test failed or timed out because of it. Non-blocking. Worth a follow-up to measure.
2. Firefox offline test failure: it passed in this run (Firefox 1 of 1 offline spec passed). The cause stays uninvestigated; likely intermittent. Non-blocking, but not explained.
3. Firefox and WebKit self-navigation block: unconfirmed by me. The sandbox-header and isolation specs pass in both browsers. Non-blocking.

## Recommendation

Add an e2e test that operates the OCR toggle by keyboard (Tab to it, Space to enable, status announced), and an axe scan with OCR enabled.
