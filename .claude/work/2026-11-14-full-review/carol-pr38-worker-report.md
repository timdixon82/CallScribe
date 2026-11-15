# Carol re-test: PR 38 at e264d90 (blob worker in the frame)

Verdict: pass, with one non-blocking accessibility finding and one test-stability note.

## Method
- Worktree /private/tmp/claude-501/ocr-jacob at e264d90. Port 4173 was free; I rebuilt dist, and confirmed the served bundle (index-qWz_4TWo.js) matched the fresh build.
- The worktree's old dist was stale: the first unit run gave 149 of 150 (frame-page hash test). After npm run build, 150 of 150 pass.

## Results
- Unit: 150 pass, 0 fail.
- E2E, all three browsers (OCR_ALL_BROWSERS=1): 55 pass, 1 skipped, 1 fail (Firefox, keyboard test, see flake note). Sean reported 56 pass.
- OCR end to end, fails closed (no service worker, changed cached byte, missing sandbox header), offline after one online load, frame isolation, and the hung-job test (timers keep firing, timeout removes the frame): all pass in Chromium, Firefox and WebKit. Repeated Firefox runs of those tests, 3 to 4 times each: all pass.
- Axe with OCR enabled, run directly in Chromium: zero violations at A (wcag2a, wcag21a), AA (wcag2aa, wcag21aa, wcag22aa) and AAA (wcag2aaa), and zero with all tags combined. Pa11y not run locally; CI runs it.

## Flake note (keyboard test)
- Chromium: 8 of 8 serial, plus parallel runs, all pass. WebKit: 8 of 8 pass.
- Firefox: 6 of 8 serial pass. Both failures were "Page crashed" inside the axe scan with OCR loaded. One parallel run also failed once on the final not.toBeChecked check. So Sean's flake is real and Firefox-only. CI runs Chromium only, so it does not gate merge. Recommend a follow-up to harden the Firefox path.
- The test force-enables and unhides the switch before each keypress, so it does not exercise real focus behaviour (see below).

## Focus finding
- enableOcr sets the switch disabled while it starts up. I confirmed focus drops from the switch to the page body within 150 ms in Chromium, Firefox and WebKit, after Space.
- Standards: WCAG 2.4.3 Focus Order (Level A) and the AAA expectation that focus is not lost. A screen reader user hears no confirmation of where they are, though the status region still announces progress.
- Severity: moderate. It is pre-existing: the same disabled line is on main and this delta does not touch it. It is not caused by the worker change. Not a merge blocker for PR 38, but it should be fixed next: use aria-disabled and ignore changes instead of the disabled attribute, or return focus to the switch in the finally block.

<!-- TASK -->
- [ ] Keep keyboard focus on the OCR switch during start-up (use aria-disabled, or refocus after enable) and make the keyboard e2e test use the real reveal path `priority:medium` `owner:sean` `from:carol-pr38-worker`
- [ ] Stabilise the Firefox axe scan in the OCR keyboard e2e test (page crash, about 1 in 4 serial) `priority:low` `owner:sean` `from:carol-pr38-worker`
<!-- /TASK -->
