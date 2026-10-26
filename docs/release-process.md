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

## Release steps

Describe how a release is created and published once a merge lands on `main`. The team uses release-please for automated changelog and version management. Adapt this section to the project's hosting target (for example, Vercel auto-deploys on merge; a virtual private server requires a manual or scripted deploy step).
