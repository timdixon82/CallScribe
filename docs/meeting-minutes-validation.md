# Meeting-minutes validation record

This record distinguishes implemented behaviour from manual release checks. It
does not claim that a device-specific result has been tested until that test has
actually been run.

| Requirement | Implementation evidence | Validation state |
| --- | --- | --- |
| Local-only meeting analysis | Dedicated `minutes.worker.js`; no transcript data is sent outside the browser | Code and build verified |
| Optional post-stop/later generation | Native post-stop dialog and saved-session notes panel | Rendered accessibility tree verified |
| Model selection and cache reuse | Qwen3 0.6B and confirmed 4B selector; Transformers.js Cache Storage and IndexedDB model inventory | Code/tests verified; real load pending |
| Long transcript processing | Source-ID evidence preparation, pause/speaker-aware chunks, bounded overlap, per-chunk checkpoints and consolidation | Synthetic 241-minute test passed |
| Evidence and uncertainty | Schema validation, null owner/deadline handling, unsupported action/decision removal, source navigation | Unit tests passed |
| Screenshot relevance | OCR, exact hash, perceptual fingerprint and temporal proximity; editable inclusion | Unit tests passed |
| Editing and persistence | Separate `meetingNotes`/`minutesRuns` IndexedDB stores; narrative and structured editor; overwrite warning | Code/build verified |
| Exports | Markdown, self-contained HTML, print/PDF, DOCX, screenshots, alt text and optional evidence references | DOCX creation unit test passed; application interoperability pending |
| Accessibility | Native controls, labels, dialog, progress/status updates, keyboard evidence links and section-order buttons | Initial rendered accessibility tree verified; VoiceOver workflow pending |
| Resilience | Worker cancellation, dispose, cache reuse, storage-quota messaging and resumable checkpoints | Code/tests verified; interruption under real inference pending |
| Performance | Worker timing metrics saved with notes and shown in review view | Instrumented; real-device measurements pending |

## Automated checks

The current implementation is checked with:

```sh
npm test
npm run lint
npm run build
git diff --check
npm audit --omit=dev
```

The source tests use short, incomplete, malformed, screenshot-heavy and
241-minute synthetic transcript fixtures. They do not substitute for real model
quality evaluation or assistive-technology use.

## Manual release checks still required

1. Confirm the Qwen3 0.6B download and run it against authorised synthetic
   meeting data in a supported browser.
2. Record model load, chunk and total timings from the saved note; test
   cancellation/resume and browser-cache reuse.
3. Test the review, editing, evidence navigation and export workflow with
   VoiceOver and keyboard only.
4. Open a DOCX export in Word or LibreOffice and inspect accessible headings,
   bullets, image placement and alternative text.
5. Only after those checks pass: bump the visible version, commit, publish and
   verify the deployed cache-busted site. The shell cache name must be rotated
   for any deployed interface change.

## Observed Qwen validation attempt

On 11 November 2026, an approved synthetic-data browser run downloaded the
Qwen3 0.6B local model to 100% in Edge. The original WebGPU-preferred load did
not reach model-ready or emit an error after approximately three minutes. A
WebAssembly retry initially failed with `Unexpected token '<'`; investigation
showed that the worker was probing Vite's SPA fallback as a `/models/`
directory and treating its HTML response as a model asset. After configuring
Transformers.js to check its browser cache and remote model host without that
local-directory probe, an isolated Edge test completed a synthetic Qwen prompt
with WebAssembly. This validates local model loading and basic generation, not
meeting-extraction accuracy, end-to-end CallScribe flow, WebGPU performance or
the 4B model. The 4B model was not downloaded.
