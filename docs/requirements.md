# Requirements: Local Call Transcriber

This document records the requirements for Local Call Transcriber. It is produced during the Tad (business analyst) pass and is the contract that the architect, developer, and tester work from.

## Background

Local Call Transcriber is being established as a privacy-first call-transcription project. Its user needs, supported platforms, and technical approach have not yet been agreed.

## User stories

To be defined during discovery.

## Functional requirements

To be defined during discovery.

## Non-functional requirements

### Accessibility

WCAG 2.2 AAA conformance. Refer to the team's global `accessibility.md` and the project's `docs/accessibility.md` for specifics.

### Security

OWASP Top 10 mitigations applied. No paid third-party CI tokens; all scanning uses free, self-contained tooling (for example, `semgrep scan --config p/default --error`, not `semgrep ci`). Refer to the team's global `coding-standards.md` for the full security baseline.

### Performance

Record any specific performance targets here.

### Data protection

The setup page handles no personal data. The product may process sensitive call audio and transcripts, so its data-protection requirements must be established before implementation.

## Out of scope

The product implementation is out of scope for this setup phase.

## Definition of done

This setup phase is complete when the repository is public, the local scaffold is available, and GitHub Pages is configured to deploy the setup page.
