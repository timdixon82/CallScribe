# Carol test report: pull request 36 (head 51b2157)

## Verdict

Pass, with one non-blocking finding and two minor notes.

## Checks run in my own worktree (removed afterwards)

- npm test: 103 pass, 0 fail.
- Lint and build: clean (only the existing chunk-size warning).
- npm run test:e2e, three runs: 29 passed, 2 skipped each time, no failures, no flakes. Offline and CSP specs passed in all three.
- gh pr checks 36: all 8 pass (Pa11y and axe AAA, Playwright, build, dependency-review, gitleaks, lint, semgrep, trivy).

## The 2 skipped tests

- tests/e2e/ocr.spec.mjs line 11: test.fixme, because OCR needs unsafe-eval that the CSP forbids. Waiting on a decision from Tim. Justified, and the comment says so.
- tests/e2e/diarizer.manual.spec.mjs line 12: skipped unless DIARIZER_MODEL_DIR points at the roughly 100 MB model files. CI never sets it. Justified.

## Mutations (all reverted with git checkout)

- Erase-all skips a store: caught by tests/erase-all.test.mjs. The e2e spec did not catch it, so the unit test is the guard.
- Skip cache deletion: caught (unit and e2e).
- Skip service worker unregister: caught (unit and e2e).
- Skip the confirmation: caught by two e2e tests (cancel and Escape; Escape after an earlier erase).
- SRT numbering reverted to index+1, and numbering removed: both caught by the SRT export test.
- Milliseconds dropped from timestamps: caught by the SRT and VTT export tests.
- Control-character stripping broken in cleanTitle: caught (3 unit failures).

## Export tests assert content

Yes. TXT checks the header and passage order. JSON checks provenance and segments. SRT and VTT check exact cue text and timestamps. DOCX inflates word/document.xml and checks phrases and the drawing element. The screenshot export compares bytes with the source PNG. None only check that a download happened.

## Erase-all dialog accessibility

- axe with wcag2a through wcag22aaa tags runs against the open dialog in e2e: zero violations.
- Default focus is on Cancel (the safe choice). Escape and Cancel close it, keep the data, and return focus to the Delete all my data button. Confirmed in e2e.
- Status text sits in #erase-all-status with role=status. Confirmed.
- Reading level (my own Flesch-Kincaid estimate): dialog 6.2, completion message 4.7, new privacy paragraph 9.9. The privacy paragraph is slightly above the grade 9 target because it is a long list. Minor.
- The privacy path "Settings, then Prior Sessions" matches the real UI.
- release.yml: workflow permissions reduced to contents read, with write granted only on the one job. That is an improvement.

## Orphan screenshot Markdown round trip (confirmed, pre-existing on main)

I exported a session with one passage and one screenshot that has no linked passage. The export writes "## Screenshot — date", the image and "Screenshot OCR: ...". Importing that file gives 1 passage, 0 screenshots, and an empty skipped list. The cause: the import treats "Screenshot —" headings as quiet headings (src/call-markdown-import.js line 11) and ignores them.

User impact: a screenshot with no linked transcript passage is silently lost when the user re-imports their own export. The exported file still holds the image, so nothing is lost from the file, but the app gives no warning and the import message reports success. It is not caused by this pull request. Recommend a follow-up task, not a merge blocker.

## What I could not do

- No manual screen reader testing (suspended per CLAUDE.md).
- Mutation tests used the unit and the erase-all and export e2e specs only; I did not rerun the full e2e suite per mutation.
- The OCR path remains untested in CI because of the fixme.

## Must change before merge

Nothing.

<!-- TASK -->
- [ ] Fix import of orphan screenshot sections ("## Screenshot — date"): import them, or list them in the skipped report, and add a round-trip test `priority:medium` `owner:sean` `from:carol-pr36`
<!-- /TASK -->
<!-- TASK -->
- [ ] Add an e2e assertion that every IndexedDB store is empty after erase-all (e2e did not catch the skipped-store mutation; the unit test did) `priority:low` `owner:sean` `from:carol-pr36`
<!-- /TASK -->

## Re-test of head 088d6e6

Verdict: pass.

- All 8 GitHub checks pass. Unit tests 109 of 109, lint and build pass. End-to-end tests passed three times (29 passed, 2 skipped each run).
- Mutations, each caught and discarded: erase-all deleting a foreign cache (unit and end-to-end fail); skipping one IndexedDB store (end-to-end fails); orphan screenshots dropped from export (a unit test fails); removing aria-describedby from the erase dialog (end-to-end test at erase-all.spec.mjs line 81 fails, so a test exists).
- Erase dialog: axe AAA clean, Cancel has default focus, Escape returns focus to the button without erasing, focus lands on the role=status text after completion with the new message. All covered by the passing end-to-end tests.
- Privacy page: axe AAA 0 violations, headings H1 then H2 in order. Changed sentences score Flesch-Kincaid grade 5.6 and 7.5.
- Built app: an imported orphan screenshot shows in the transcript and survives Markdown export with its image.
