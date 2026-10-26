# Technical Validation and Delivery Plan

## Purpose

This document records the first feasibility assessment for the CallScribe PRD, version 1.0, dated 24 October 2026. It distinguishes design evidence from testing completed on target hardware.

## Outcome

The proposed static-browser architecture is feasible as an MVP, subject to the limitations below. macOS Chrome, Edge, and VoiceOver are also development validation targets. No Windows 11, Microsoft Edge, Google Chrome, NVDA, or Windows Narrator test has been completed yet. Windows-specific requirements remain unverified until they are tested on real target hardware.

## Highest-risk requirements

### Simultaneous microphone and computer-audio capture

The application can request a microphone with `getUserMedia()` and a display stream with `getDisplayMedia()` independently. The display request asks for audio, but the browser remains free to return a stream with no audio track. The implementation must therefore inspect the returned audio tracks, report the actual outcome, and continue in microphone-only mode when computer audio is unavailable.

Whether a Windows 11 sharing picker offers tab or system audio depends on the browser version, the selected share surface, and the user's choice in that picker. This cannot be proven from a non-Windows environment. The implementation must never claim that all Windows audio is captured.

### Local Moonshine inference

Moonshine Base has a browser implementation using ONNX Runtime Web through Transformers.js. The MVP uses this route in a dedicated worker, preferring WebGPU and falling back to WebAssembly. This is a compatible local-inference design, but real transcription quality, latency, and compatibility must be demonstrated separately in Edge and Chrome on Windows 11.

### Browser-managed model caching

The MVP stores downloaded model responses in Cache Storage and requests persistent storage where the browser supports it. The selected model is recorded locally, while transcripts and sessions use IndexedDB. Cache Storage is browser-managed: clearing site data or browser quota eviction can remove models, so the interface must make this clear. The model loader verifies a model-file manifest before declaring a model ready.

### Accurate model-download progress

The download manager reads each response body as a stream and sums actual transferred bytes. It sums the expected bytes for all files in a model manifest. If a total is unavailable, it exposes an indeterminate progress state rather than fabricating a percentage. File hashes from the source manifest are checked after the streamed download completes.

## Delivery phases

1. Build the secure static application shell, model catalogue, streamed Cache Storage download manager, worker boundary, and diagnostics.
2. Build independent microphone and browser display-audio capture pipelines, bounded audio queues, source-aware timestamped transcript storage, and export.
3. Add offline shell caching, session recovery, model management and deletion safeguards.
4. Test automated behaviours locally; carry out the documented Windows 11 browser, screen-reader, network, offline, and long-session procedures on target hardware.

## Evidence required before release

- Edge and Chrome results for each available share mode, recording whether an audio track was actually returned.
- macOS Chrome and Edge results for microphone, tab audio, and any system-audio modes they expose, plus VoiceOver results.
- A Moonshine Base transcription of a known test recording in each browser, including execution provider and latency.
- A download capture showing byte-based progress and a cache-reuse check after restart.
- NVDA and Narrator test results for model progress, errors, controls, and transcript announcements.
- Offline, privacy/network, optional-model, export, and two-hour-session results.

## Design decisions

- Application and transcript data remain local. Network requests are limited to initial static assets and explicitly initiated model downloads.
- Moonshine Base is the only model automatically requested, and only when no prior selected, valid model is available.
- Optional models require an explicit Download action.
- Browser responses and user media permissions are treated as authoritative at runtime; feature detection is not presented as proof that a capture mode works.
