# Changelog

All notable changes to Local Browser Transcriber are documented here.

## [0.2.1] - 2026-10-25

### Changed

- Made icon labels optional across the capture and transcript controls, with hover and keyboard-focus names retained.
- Added a transcript-only microphone mute that does not affect call applications such as Zoom.
- Added a screen-capture master control, disabled dependent controls when it is off, and clarified that screen audio is required to transcribe the other participant.
- Improved the settings icon and aligned buttons with adjacent input fields.

## [0.2.0] - 2026-10-25

### Added

- Screen capture controls, local OCR, and manual, periodic, or change-triggered screenshots.
- Portable Markdown exports with embedded screenshots and OCR text, plus individual screenshot downloads.
- An optional compact-label preference for transcript controls.

### Changed

- Reorganised the capture and transcript controls for clearer keyboard and visual navigation.
- Added the visible footer version, sourced from `src/version.js`.
