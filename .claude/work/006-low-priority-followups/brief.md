# Brief: 006-low-priority-followups

## Summary

Two small follow-ups from reviews of pull requests 44 and 46.

- Status: `done`
- Branch: `fix/followups-npmrc-md-import`
- Mockup mode: D
- Priority: 3
- Blockers: None

## Requirements

1. npm 11 warns that the onnxruntime-node-install-cuda key in .npmrc will stop working in the next npm major version. Move the CUDA skip to the ONNXRUNTIME_NODE_INSTALL_CUDA=skip environment variable in each CI job that runs npm ci, and remove that key from .npmrc (keep min-release-age). Env only, no permission, token or deploy logic change.
2. Markdown re-import can misread note text that looks like a heading (for example a line starting with ## and a time). Make export and import round-trip safely for note text, with tests.

## Routing plan

Sean builds, one combined review (Jed for the CI part, Carol for import).

## Out of scope

- Workflow permissions, tokens, deploy logic.
- Other import or export format changes.

## Risk and rollback

Risk: a missed CI job would fail npm ci again, or an import change could alter how existing files are read.

Rollback: revert the pull request.

## Definition of done

- [ ] All CI checks pass with no npm warning about the CUDA key.
- [ ] Existing Markdown exports still import unchanged; a note whose text looks like a heading round-trips intact.
- [ ] Tests added.

## Approved GitHub actions

- [x] Create a branch
- [x] Commit to a branch
- [x] Push a branch other than the main branch
- [x] Open a pull request
- [x] Comment on a pull request or an issue
- [x] Create an issue
