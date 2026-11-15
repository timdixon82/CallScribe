# Brief: review follow-up, batch 1 (data fixes)

Status: active
Tier: 2 (personal data: call transcripts)
Mockup mode: not applicable

## Source

Reports in this folder: `jed-report.md` (security) and `carol-report.md` (tests). Tim chose Q-LCT1 A, Q-LCT2 A, Q-LCT3 A (see `answers.md`).

## Scope

Sean, one branch and one pull request:
- T1: unit tests for `src/store.js` using fake-indexeddb as a dev dependency.
- T2: one cascade-delete function that removes a session with its segments, screenshots, meeting notes and minutes run in a single IndexedDB transaction, used by the delete dialog in `src/main.js`, with tests.
- T3: `src/call-markdown-import.js` parses and validates everything before any write, adds a size limit, and reports skipped blocks; with tests.
- T4: an export-to-import round-trip test.
- Print export (Jed M4): fix `exportMinutes` so print works without `document.write` into a `noopener` window; use a Blob URL or sandboxed iframe.

Jacob, in parallel, design only: a Content Security Policy as a meta tag and pinning plus integrity for model and WebAssembly downloads (Jed M1, M2, M3). Output: `design-csp-pinning.md` in this folder.

## Out of scope

- Playwright and accessibility state suite (Carol T6 to T12).
- Splitting `src/main.js`.
- Privacy page rewrite, erase-all control, service worker fix (later batches).
- Any CSP or download change in code (Jacob designs only this batch).

## Risk and rollback

Delete and import touch stored personal data. Changes are on a branch, behind a pull request, reviewed by Jed and Carol before the merge gate. Rollback is reverting the merge commit. No data migration is involved.

## Definition of done

- `npm test` and `npm run lint` pass; new tests cover the cascade delete leaving no orphan rows in any store, a failed import writing nothing, and the round trip.
- Print export opens a print view in a manual or scripted check.
- Jed and Carol return pass; Jacob confirms conformance; CI passes.
- Tim approves the merge.
