# Carol re-test: PR 38 at d594bbf (focus fix)

Verdict: pass.

## Method
- Worktree /private/tmp/claude-501/ocr-jacob, fetched and checked out d594bbf. Dist rebuilt (npm run build); new bundle contains the aria-disabled and ocrStarting code.
- Nothing was listening on port 4173 beforehand. Playwright's webServer ran npm run build then vite preview from this worktree, so the served build is d594bbf.

## Results
- Unit tests: 150 of 150 pass.
- Full e2e with OCR_ALL_BROWSERS=1: 56 passed, 1 skipped (Chromium, Firefox, WebKit).
- Keyboard test: passes in all three browsers. Firefox repeated 6 times with 2 workers: 6 of 6 pass, no flake.
- Focus: the test asserts focus stays on the switch after Space, during start-up (aria-disabled true), after ready, and after turning OCR off. All pass.
- Announcement: #ocr-status has role status and says "Local OCR is ready" when done. The switch is aria-disabled during start-up and the attribute is removed afterwards.
- axe at A, AA, AAA (wcag2a, 2aa, 21a, 21aa, 22aa, 2aaa, 22aaa) with OCR on: zero violations.
- End to end OCR reads known text; fail-closed tests (no service worker, missing sandbox header, changed byte) pass in all browsers.
- CI (gh pr checks 38): all 8 checks pass (Pa11y and axe AAA, Playwright, build, dependency-review, gitleaks, lint, semgrep, trivy).

## Second Space press during start-up
Code review of src/main.js line 201: while ocrStarting is true, the change handler calls setSwitch with the current ocrEnabled value and returns, so nothing starts twice and the switch stays on. The finally block clears the flag and aria-disabled. No e2e test presses Space twice, so this is verified by code reading only.

## Non-blocking
- Test gap: add an e2e step that presses Space again during start-up and asserts the switch stays checked and only one start occurs.

<!-- TASK -->
- [ ] Add e2e step: second Space press during OCR start-up leaves the switch checked and starts once `priority:low` `owner:sean` `from:carol-pr38-focus`
<!-- /TASK -->
