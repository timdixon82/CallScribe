# Jed report: pull request 29 (codeql-action v4.39.1 to v4.39.3)

Verdict: pass.

## Checks
- Diff: one file, .github/workflows/codeql.yml, 2 lines changed (init and analyze). No change to permissions, triggers, tokens or other steps.
- New SHA 33d7b85da1a04171e211befe2c739303b9a4c066: the v4.39.3 tag in github/codeql-action is an annotated tag that points to this commit. It is in the upstream repository, not a fork. Commit message is the upstream release merge (pull request 4299).
- Old SHA tag v4.39.1 resolves to an annotated tag object (8498dc4c...), consistent with the prior pin; not re-dereferenced as it is being removed.
- Comments: both lines now say v4.39.3, matching the SHA. Both init and analyze use the same SHA.

## Staleness
- mergeStateStatus: CLEAN. Base is dba27184; main is now a3560b87, 28 commits ahead.
- Changes on main since base under .github: deploy-publish.txt, pin-drift.yml, playwright.yml, release.yml. None touch codeql.yml, so no conflict.
- All 8 CI checks passed on 2026-11-14 against the old base. They are stale relative to main but the change is isolated to the CodeQL workflow.

## Recommendation
Rebase or re-run is not required for safety. Optional: update the branch so checks (including CodeQL itself running on v4.39.3) run against current main before merge. Merge needs Tim's approval.
