# Decision 001: Release pull request exemption from the checks requirement

## Status

- State: Accepted
- Decided: 2026-11-05
- Supersedes: None
- Superseded by: None

## Source

AgentTeam work folder `056-callscribe-release-pr-exemption`. The finding came from AgentTeam work folder `055-callscribe-release-version-gap`, during the v0.2.36 release. Tim chose a CallScribe-only exemption (Q346B) and a narrow one (Q347A).

## Context

Pull requests opened by the release bot (release-please, running as `github-actions`) never start the continuous integration checks by themselves. GitHub does not trigger workflows from events caused by the default workflow token. During the v0.2.36 release, each release pull request needed an empty commit and a manual run approval before checks ran, and the bot rewrote the pull request and dropped the checks again.

The same gap exists in other projects that use release-please. It has not been fixed there, and this decision does not change them.

A permanent fix, such as a personal access token or a GitHub App for release-please, was considered and declined for now.

## Decision

CallScribe gets a narrow exemption to the checks requirement of the merge gate. A release pull request may merge without passing checks only when all of these hold:

- The author is the release bot (`github-actions`).
- The title starts with `chore(main): release`.
- The changed files are limited to `.release-please-manifest.json`, `package.json`, `package-lock.json`, `public/assets/version.js`, `index.html` and `CHANGELOG.md`.

If the pull request touches any other file, the normal merge gate applies in full. Merging still needs Tim's express approval at the time. Sonja verifies the file list with `gh pr view <n> --json files` before presenting the merge.

The exemption is recorded in CallScribe's own files: the PROJECT OVERLAY of `.claude/agents/sonja.md` and `docs/release-process.md`. It is not added to any CORE block, so template syncs do not remove it.

## Consequences

- Releases no longer need an empty commit and a run approval just to start checks.
- A release pull request merges without automated checks. The risk is that the exemption is read too loosely and a non-version change merges unchecked. The file list limit and the title and author conditions are the guard against this.
- Other projects keep the gap. If it matters there, each project needs its own decision.
- To roll back, revert the documentation pull request that introduced this decision. The normal merge gate then applies to release pull requests again.
- If the permanent fix is adopted later, this decision should be superseded.
