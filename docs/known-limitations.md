# Known Limitations and Validation Status

## Current delivery status

This is a static MVP with real browser APIs and a real local Transformers.js Moonshine path. It is not a release-approved application. A successful production build only proves that the source bundles; it does not prove capture, inference, screen-reader operation, privacy, or performance on a particular computer.

## Not yet verified

- macOS Chrome and Edge microphone, tab-audio, and system-audio behaviour.
- Windows 11 Chrome and Edge system-audio modes and simultaneous capture.
- VoiceOver, NVDA, and Windows Narrator manual testing.
- A complete Moonshine Base download and local inference run; the model download is deliberately not run in development because it is large.
- Offline reload, interrupted-download recovery, two-hour sessions, and all-model benchmarks.

## MVP constraints

- Computer audio depends on the browser returning an audio track after the user grants display-sharing permission. The application clearly reports when it is absent and continues to support microphone-only use.
- Model integrity is established by a successful local-only model load after Cache Storage retrieval. A pinned, independently supplied per-file hash manifest is still required for release-grade cryptographic integrity verification.
- Each audio pipeline uses short, bounded chunks. If inference is already busy, a later chunk is currently not queued. This avoids unbounded memory growth but needs a benchmarked scheduling policy before the no-speech-loss requirement can be claimed.
- Saved segments are written incrementally to IndexedDB, but a prior-session browser interface has not yet been implemented.

## Model distribution

The model catalogue uses the browser-compatible repositories published for Transformers.js. Model downloads use the configured Hugging Face repository only when a model is first loaded. After a successful cached model load, the worker requests local files only.
