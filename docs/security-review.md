# Security Review: CallScribe

This document records the security review for CallScribe, carried out by Jed (penetration testing and security governance). It covers the OWASP Top 10 assessment, any findings, and the release condition.

## Verdict

State the overall verdict: SAFE, SAFE WITH CHANGES, or NOT SAFE. List any required changes.

## OWASP Top 10 assessment

For each category, record whether the project is affected and what mitigation is in place.

### A01 Broken access control

### A02 Cryptographic failures

### A03 Injection

### A04 Insecure design

### A05 Security misconfiguration

### A06 Vulnerable and outdated components

### A07 Identification and authentication failures

### A08 Software and data integrity failures

### A09 Security logging and monitoring failures

### A10 Server-side request forgery

## Continuous integration checks

Record which security checks run in CI and their status.

- CodeQL analysis: (pending / passing / failing)
- Trivy vulnerability scan: (pending / passing / failing)
- Dependency review: (pending / passing / failing)
- Semgrep scan (`semgrep scan --config p/default --error`, token-free): (pending / passing / failing)

Note: `semgrep ci` (which requires SEMGREP_APP_TOKEN) is not used. All scanning must be self-contained on free tooling.

## Findings

List each finding with a severity (HIGH, MEDIUM, LOW, NONE), a description, and its resolution status.

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
|    |          |             |        |

## Release condition

State what must be true before the project is cleared for release from a security perspective.
