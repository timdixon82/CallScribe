# Changelog

All notable changes to CallScribe are documented here.

## [0.2.30] - 2026-10-27

### Improved

- Removed an unnecessary WebP encode and image decode before local OCR, passing resized screen pixels directly to the OCR model instead.

## [0.2.29] - 2026-10-27

### Added

- Added an OCR detail choice: Fast, Balanced (the default), or Detailed. It resizes only the temporary OCR input, while keeping saved screenshots at full quality.

## [0.2.28] - 2026-10-27

### Changed

- Kept recognised screenshot text as accessible image alternative text and in its separate OCR transcript entry, without repeating it visually beneath the screenshot.

## [0.2.27] - 2026-10-27

### Fixed

- Accepted the current local OCR library result object as well as the older line-array response, restoring screenshot OCR text extraction.

## [0.2.26] - 2026-10-26

### Fixed

- Applied the microphone icon state to both Transcript control rows.

## [0.2.25] - 2026-10-26

### Changed

- Replaced the mic-in-transcript labels with accessible microphone and crossed-microphone icons.
- Renamed Share app audio to Share App and positioned the Capture control beneath the live screen preview.

## [0.2.24] - 2026-10-26

### Changed

- Restored the mic-in-transcript mute control beside both transcript control rows.

## [0.2.23] - 2026-10-26

### Changed

- Added screen-capture controls above and below Transcript, alongside the duplicate recording controls.

## [0.2.22] - 2026-10-26

### Fixed

- Kept the duplicate recording controls above and below Transcript, rather than placing one set in Capture settings.

## [0.2.21] - 2026-10-26

### Changed

- Renamed the project and GitHub repository to CallScribe.
- Updated the project wiki, README, exports, and published information pages to use the CallScribe name and repository link.

### Added

- Added the Apache-2.0 licence and third-party notices, including the separate model-licence position.

## [0.2.20] - 2026-10-25

### Changed

- Styled Speaker assignment as the standard collapsible section used elsewhere in the app.
- Displayed the recording controls both in Capture settings and beneath the transcript.
- Kept Capture screen now directly below screen sharing as a full-width button with a permanent icon and text label.
- Removed the redundant CallScribe page heading above Capture settings.

## [0.2.19] - 2026-10-25

### Fixed

- Removed the previous product name from the CallScribe header.

## [0.2.18] - 2026-10-25

### Changed

- Introduced the CallScribe name in the browser title, app heading, and site header.
- Added the CallScribe waveform logo to the header, plus a favicon and Apple touch icon.

## [0.2.17] - 2026-10-25

### Changed

- Made Audio Only the default Screen capture mode and moved the manual screenshot control beneath the live screen preview.
- Rebuilt transcript options as a collapsible advanced area with separate source filters and display checkboxes.
- Made Speaker assignment collapsed by default, with a saved-name type-ahead field and only Add, Remove, and Clear actions.
- Restored transcript controls above export and simplified microphone capture controls.

### Fixed

- Made removing or clearing people from selected blocks also remove their automatic speaker labels.
- Downloaded the local speaker-separation model automatically when automatic separation is turned on.

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
