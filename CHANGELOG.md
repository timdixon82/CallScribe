# Changelog

All notable changes to Local Browser Transcriber are documented here.

## [0.2.16] - 2026-10-25

### Changed

- Replaced operational toggle buttons with labelled Apple-style switches, while retaining the separate button-label control.
- Placed automatic speaker separation with the microphone controls.
- Simplified detected-speaker naming to a type-ahead text field that saves new names when focus leaves the field.
- Made transcript display denser: short source names, time-only timestamps, plain speaker labels, and switches to show or hide speaker labels, times, and sources.
- Kept People and speaker labels directly below Prior Sessions.

## [0.2.15] - 2026-10-25

### Added

- Added optional, browser-local automatic speaker separation using the NVIDIA Nemotron ONNX model with timestamp-level transcript alignment.
- Added saved local people, one-time per-call detected-speaker naming, manual reassignment, overlapping-speaker labels, and a transcript-only speaker-label visibility filter.
- Added timestamp word data from the transcription worker so automatic labels can align to transcript text rather than coarse blocks.

### Privacy

- Speaker separation is opt-in, downloads its model only when requested, does not create voiceprints or recognise people across calls, and clears temporary call audio when the call ends.

## [0.2.14] - 2026-10-25

### Fixed

- Rotated the service-worker cache so returning visitors receive the current app shell after a release.

## [0.2.13] - 2026-10-25

### Fixed

- Aligned the microphone controls, removed duplicate Transcript content and session actions, and made Prior Sessions match the other primary disclosure panels.
- Kept paired visual states for toggle controls and restored the page-with-text / blank-page icon pair for button labels.

## [0.2.12] - 2026-10-25

### Changed

- Moved all-screenshot downloads into the export format selector and removed the separate action button.

## [0.2.11] - 2026-10-25

### Fixed

- Moved audio processing into the microphone control row and placed synchronised transcript-mute controls beside both screen-capture actions. Completed the audit of paired on/off toggle icons.

## [0.2.10] - 2026-10-25

### Fixed

- Made Prior Sessions use the same primary disclosure styling and placed the transcript summary below Search and source filters, only while a session is active.

## [0.2.9] - 2026-10-25

### Changed

- Renamed History to Prior Sessions, removed the redundant TXT action from each session row, and standardised the main collapsible section titles.

## [0.2.6] - 2026-10-25

### Fixed

- Serialised OCR recognition requests so overlapping screenshots cannot reuse an ONNX session and fail with “Session mismatch”.

## [0.2.5] - 2026-10-25

### Changed

- Made Capture settings, Transcript, and History collapsible, and replaced the label eye control with page-with-text and page-without-text icons.

## [0.2.4] - 2026-10-25

### Changed

- Renamed the initial area to Capture settings and moved saved transcripts into a dedicated History section between Transcript and Diagnostics.

## [0.2.3] - 2026-10-25

### Changed

- Kept model and spoken-language selection visible, with model details collapsed by default and automatic download when a missing model is selected.
- Replaced ambiguous capture controls with paired state icons, gated screen capture until screen sharing is selected, and moved voice settings beside audio processing.
- Consolidated exports into a format selector and single Export button; exports now include model, processing settings, and app provenance.

## [0.2.2] - 2026-10-25

### Changed

- Rebuilt the controls as one page: Models, Voice settings, and Diagnostics are inline expandable sections.
- Reworked Share Screen and Audio so screen selection comes first, followed by the independent screen-capture setup switch.
- Made recording, microphone, mute, audio-processing, and button-label states more visually explicit, with icon-only defaults and hover/focus names.

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
