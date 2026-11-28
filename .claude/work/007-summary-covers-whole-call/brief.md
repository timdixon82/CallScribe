# Brief: 007-summary-covers-whole-call

## Summary

Meeting-notes summaries only cover the start of long calls. Cause: topics from all parts are joined in time order and cut with slice(0, limit), and the headline uses the first 3 topics. See outputs/spikes/2026-11-27-summary-first-part-only.md.

- Status: `done`
- Branch: `fix/summary-whole-call`
- Mockup mode: D
- Priority: 2
- Blockers: None

## Requirements

1. Consolidate down, do not truncate: gather the topics (and decisions, actions, questions, risks) from every part, merge near-duplicates and overlap, then reduce to the chosen limit (6, 12, 24) by keeping one representative per cluster while spreading coverage across the whole call, then re-sort by time. Prefer a local, deterministic step in src/minutes.js (no extra model call) unless Sean shows it is not good enough; an extra model pass is out of scope unless Tim asks.
2. Headline summary is built from topics spread across start, middle and end, through one shared function in src/minutes.js used by both workers (src/minutes.worker.v2.js and src/minutes.webllm.worker.js).
3. Remove the forced downgrade of the 0.6B model to Concise (webllm worker around line 102): it follows the length Tim chose (Tim, Q-LCT16 B).
4. Tests in tests/minutes.test.mjs with a long synthetic transcript (for example 38 parts): every third of the call is represented at each length; decisions and actions from late parts are kept; existing tests stay green.

## Routing plan

Sean builds, one combined review (Carol and Jed checklists; no user-facing layout change, but output content changes).

## Out of scope

- Changing models, prompts, chunk size or the extra model pass.
- Layout or export formats.

## Risk and rollback

Risk: merging may drop distinct topics that a model worded similarly, or keep too many early duplicates.

Rollback: revert the pull request.

## Definition of done

- [ ] A long transcript summary covers start, middle and end at Concise, Standard and Detailed.
- [ ] Late decisions and actions are not dropped in favour of early topics.
- [ ] 0.6B follows the chosen length.
- [ ] Lint, tests, build and CI pass; combined review passes.

## Approved GitHub actions

- [x] Create a branch
- [x] Commit to a branch
- [x] Push a branch other than the main branch
- [x] Open a pull request
- [x] Comment on a pull request or an issue
- [x] Create an issue
