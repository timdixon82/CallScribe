# Brief: 004-pane-switching-and-notes

## Summary

Two Tier 1 pieces. Piece A: layout. The right-hand pane switches between Settings and Controls, so the Back to transcript buttons go. The screen image moves up in the left side. The Quick start becomes more compact while keeping controls at the front and usable. Piece B: live notes typed during a call, inserted into the transcript at the right point.

- Status: `done`
- Branch: `none` (Sean creates a branch per piece)
- Mockup mode: A
- Priority: 1
- Blockers: None

## Requirements

Tim's request, 2026-11-26, and answers Q-LCT1 to Q-LCT5 in `answers.md`. No separate requirements document; this brief is the requirements.

- Right pane switches as focus or selection moves between Settings and Controls. Focus moves to the pane heading on each switch. Remove the Back to transcript buttons (`src/workspace.js`, around line 275).
- Screen image sits higher in the left side.
- Quick start (`src/workspace.js`, around line 54) is more compact. Its purpose is to bring controls to the front and allow their use. Consider icons, always with text or an accessible name.
- Notes: a text box plus Add note, and a keyboard shortcut. A Screenshot with note action takes a screenshot and opens the note box to caption it. Notes appear as labelled Note entries with a timestamp at the moment added, and are included in every export.

## Routing plan

Piece A: Simon produces static HTML mockup options for the Quick start and the pane switch. Tim picks. Sean builds. One combined review (Carol, user-facing).
Piece B: Tad writes short requirements for notes if needed, Simon mockup of the note box, Sean builds, one combined review (Carol).

## Out of scope

- Changes to transcription, model loading or audio capture logic.
- New storage of notes outside the existing local session data.
- Cloud sync or sharing of notes.
- Any change to release workflow or deployment.

## Risk and rollback

Risk: moving controls and focus could break keyboard order or screen-reader announcements, and notes could be lost on export.

Rollback: revert the pull request; no data migration is involved.

## Definition of done

- [ ] Quick start mockup option chosen by Tim.
- [ ] No Back to transcript button remains; the right pane switches between Settings and Controls by keyboard alone, with focus on the pane heading.
- [ ] Screen image sits higher in the left side at common window sizes.
- [ ] Quick start is more compact, with every control still reachable and named.
- [ ] A note can be added by keyboard, appears with a timestamp at the correct transcript position, and is present in every export format.
- [ ] Screenshot with note works as one action.
- [ ] Accessibility regression suite and existing tests pass; Carol's combined review returns pass.

## Approved GitHub actions

All six actions below are pre-approved for every work folder. Sonja does not need to ask Tim before running them. The wording of these six lines is fixed: the safety hook recognises only these exact phrases, so do not reword them or add new lines here. A new pre-approvable action requires a hook change.

- [x] Create a branch
- [x] Commit to a branch
- [x] Push a branch other than the main branch
- [x] Open a pull request
- [x] Comment on a pull request or an issue
- [x] Create an issue

## Not pre-approved

These always pause for Tim, whatever is ticked above:

- Merging to the main branch. This always needs Tim's express approval at the time.
- Publishing to a blog or a social media account.

## Never allowed

The hard deny-list from `CLAUDE.md`. These are refused outright, whatever a brief says: force-push, branch deletion, history rewrite, repository deletion, repository visibility change, branch-protection edits, collaborator changes, release deletion, and disabling secret or code scanning.
