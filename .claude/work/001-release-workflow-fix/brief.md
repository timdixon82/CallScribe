# Release workflow fix

Status: active

## Summary

The template sync added `.github/workflows/release.yml`, which runs release-please on every push to main. It fails with "Missing required manifest config: release-please-config.json" because the project has no release-please configuration. This change adds `release-please-config.json` and `.release-please-manifest.json`.

Choices: release type `node` (the project is a Vite and Node tool; the version lives in `package.json`), manifest starting at 0.2.35 (the current `package.json` version and latest tag and release), tags in the form `v0.2.35` (no component). `public/assets/version.js` is registered as an extra file, with a release-please marker comment on the `APP_VERSION` line, so the `version.yml` tag check keeps passing after a release. The `VERSION` file holds the template version, not the app version, so it is deliberately not used.

## Out of scope

Changing the workflow, creating a release, version bumps, other workflows.

## Risk and rollback

A wrong starting version could cause an unexpected release PR. release-please only opens a pull request and never publishes without a merge. Rollback: revert the merge commit.

## Definition of done

- Config files added and valid JSON.
- CI green on the pull request.
- This brief committed.
- Pull request opened against main.
