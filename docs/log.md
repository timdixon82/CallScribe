# Project Wiki: Operations Log: CallScribe

This log is chronological and append-only. It is never edited. Each entry starts with a heading in the form `## [YYYY-MM-DD] <operation> | <subject>`.

## [2026-10-24] ingest | Project wiki created

The CallScribe project wiki was created from the team template.

## [2026-11-05] decision | Release pull request exemption from the checks requirement

Recorded Decision 001: a CallScribe-only, narrow exemption lets release-please pull requests merge without checks, because bot-made pull requests never start checks. The exemption is stated in the Sonja PROJECT OVERLAY and in the merge gate section of the release process page. Merging still needs Tim's express approval.

## [2026-11-08] decision | accessibility-tools folder moved to ci-tools

Moved `.github/accessibility-tools` to `ci-tools/accessibility-tools`, because Dependabot cannot open npm update pull requests for folders under the root `.github` folder (error `dependency_file_not_supported`). The npm entry in `.github/dependabot.yml` now points at the new folder. `lint.yml` and `accessibility.yml` are on the protect list, so they were edited by hand to match the current template, keeping the root `package-lock.json` npm cache path in `lint.yml` and the Pa11y Chrome launch configuration flag (now `ci-tools/accessibility-tools/pa11y-chrome-launch.json`) in `accessibility.yml`. They also take the template's Ubuntu 24.04 runner pin. The vite and transformers major-version ignore rules in `dependabot.yml` are unchanged. The deploy workflow uses an allowlist and Pages runs in workflow mode, so `ci-tools` is not published.
