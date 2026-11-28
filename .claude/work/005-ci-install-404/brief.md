# Brief: 005-ci-install-404

## Summary

CI install (npm ci) fails: onnxruntime-node postinstall gets 404 downloading binaries. Blocks every PR. Fix the install without weakening checks.

- Status: `done`
- Branch: `fix/ci-onnxruntime-install`
- Mockup mode: D
- Priority: 1
- Blockers: None

## Requirements

Find which dependency pulls onnxruntime-node (not a direct dependency; direct is onnxruntime-web). Prefer a fix in the dependency tree or npmrc or env, over editing many workflows. If workflow files must change, change only the install step, no permission or token changes.

## Routing plan

Sean builds, one combined review (Jed, CI tooling). Re-run tier-suggest.sh; if it says Tier 2, stop and report.

## Out of scope

- Any workflow permissions, tokens or deploy logic.
- Upgrading unrelated dependencies.

## Risk and rollback

Risk: skipping a binary download could break a feature that needs it, or hide a real install error.

Rollback: revert the pull request.

## Definition of done

- [ ] npm ci succeeds in CI on the branch.
- [ ] lint, build, Playwright and Pa11y checks run and pass.
- [ ] No change to permissions or deployment.

## Approved GitHub actions

- [x] Create a branch
- [x] Commit to a branch
- [x] Push a branch other than the main branch
- [x] Open a pull request
- [x] Comment on a pull request or an issue
- [x] Create an issue
