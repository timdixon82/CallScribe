# Release process: CallScribe

This document records the release process for CallScribe. It is produced during the project setup pass and updated whenever the process changes.

## Branching model

Describe the branching strategy. The team default is: `main` is the production branch; feature work happens on short-lived branches; no long-lived development branches unless the project has a specific reason.

## Pull-request flow

Describe the steps a change goes through before it reaches `main`. The team default:

1. Open a pull request from a feature branch to `main`.
2. Continuous integration checks pass (linting, accessibility, security, tests).
3. Carol signs off functional, accessibility, and visual testing.
4. Sonja reviews for architecture and security conformance.
5. Tim gives express approval to merge.
6. Sonja merges.

## Merge gate

List the conditions that must hold before Sonja merges. The team default:

- All required CI checks pass.
- Carol has signed off.
- The architecture-and-security conformance check has passed.
- Tim has given express approval.

### Exemption for release pull requests

Pull requests opened by the release bot never start checks by themselves. A release pull request may therefore merge without passing checks only when all of these hold:

- The author is the release bot (`github-actions`).
- The title starts with `chore(main): release`.
- The changed files are limited to `.release-please-manifest.json`, `package.json`, `package-lock.json`, `public/assets/version.js`, `index.html` and `CHANGELOG.md`.

If the pull request touches any other file, the normal merge gate applies in full and checks must pass. Sonja verifies the file list with `gh pr view <n> --json files` before presenting the merge. The exemption removes only the checks requirement. Every other gate item still applies, and Tim must still give express approval at the time of the merge. The reasoning is recorded in [Decision 001: Release pull request exemption from the checks requirement](decisions/001-release-pr-checks-exemption.md).

## Release steps

Release pull requests are opened by the release bot and do not start checks by themselves.

Describe how a release is created and published once a merge lands on `main`. The team uses release-please for automated changelog and version management. Adapt this section to the project's hosting target (for example, Vercel auto-deploys on merge; a virtual private server requires a manual or scripted deploy step).
