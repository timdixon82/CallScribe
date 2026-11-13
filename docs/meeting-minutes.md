# Local meeting minutes

CallScribe can optionally turn a saved local transcript into editable meeting
notes. It is an assistive review feature, not an authoritative record.

## Architecture assessment and implementation approach

CallScribe is a Vite-built, static browser application. `src/main.js` composes
the runtime interface, coordinates transcription and capture, and persists
sessions through `src/store.js` IndexedDB stores. Existing transcription,
speaker-label, screenshot and local PaddleOCR pathways remain unchanged. The
application already uses browser workers and Transformers.js, so the notes
feature reuses those conventions rather than introducing a server, a second
application, or a competing cache mechanism.

The implementation was phased as follows:

1. Inspect the capture, OCR, persistence, export, worker and accessibility
   paths; preserve their source identifiers and local-only behaviour.
2. Add an isolated minutes evidence/chunking module and a dedicated inference
   worker, keeping model execution off the interface thread.
3. Store notes and resumable extraction checkpoints in new IndexedDB stores,
   separately from immutable transcript and screenshot data.
4. Integrate optional post-stop generation and later generation from saved
   sessions, then add accessible review, editing, evidence navigation and
   exports.
5. Add synthetic long-transcript and malformed-output tests. Manual model,
   assistive-technology and Office validation remain a release gate below.

## Privacy and models

All transcript, OCR and screenshot data remains in the browser. The worker
downloads model files only after the person using CallScribe selects Generate
meeting notes. No meeting content is included in a model download request.

| Model | Role | Approximate download | Device expectation |
| --- | --- | ---: | --- |
| Qwen3 0.6B q4f16 | Lightweight default | 570 MB | WebGPU recommended; a WebAssembly fallback is attempted |
| Qwen3 4B q4f16 | Detailed opt-in | 2.8 GB | Modern WebGPU and at least 8 GB free memory/storage recommended |

The 4B choice requires a separate confirmation. Both use the existing
Transformers.js and browser Cache Storage path; downloaded weights are reused
where browser storage permits. A successfully verified meeting-notes model is
also listed in CallScribe's downloaded-models panel and can be removed there.

If a selected model is not already cached, CallScribe explains that an initial
connection is required. Once cached, it can be selected and used offline.

### Selection rationale

The selected ONNX Community Qwen3 repositories are compatible with the
project's existing Transformers.js 3.8 browser runtime. Loading prefers
WebGPU and retries with quantised WebAssembly when WebGPU cannot initialise;
the larger 4B option is deliberately not downloaded until the person confirms
it. Its multi-part q4f16 weights make it unsuitable for constrained devices,
which is why the 0.6B option is the default.

IBM Granite lightweight instruction models were considered, but the current
efficient browser/WebGPU route requires a newer Transformers.js major version
than this application uses. Upgrading that unrelated inference foundation
would increase regression risk without a demonstrated benefit for this first
local integration. WebLLM was also considered; it would introduce a separate
WebGPU-only model/cache stack while CallScribe already has a working
Transformers.js cache and needs a WebAssembly fallback. Neither is included
until a later device evaluation demonstrates a material quality or performance
advantage.

## Data model

`meetingNotes` is an IndexedDB store keyed by `sessionId`. It contains the
editable content, selected screenshot IDs, settings, model ID, structured
extraction and creation/update times. It never replaces session segments or
screenshot blobs.

`minutesRuns` is a separate transient IndexedDB store. It checkpoints completed
chunk extractions after every local inference step. A cancelled or interrupted
run resumes only when the same transcript, model and settings are selected.
Deleting a session removes both its notes and its transient run.

If browser storage cannot save a checkpoint, CallScribe announces the failure
and explains that site storage must be freed. Initial checkpoint storage must
succeed before a model is loaded, preventing an expensive run that cannot be
recovered after interruption.

After completion, cancellation or a terminal failure, CallScribe asks the
minutes worker to release model memory. This does not remove the browser cache;
subsequent runs can load the already-downloaded weights again.

## Pipeline

1. `prepareMinutesEvidence()` preserves spoken segment IDs, timestamps, local
   speaker labels, contributing audio-source types and screenshot metadata. OCR
   is stored once with its screenshot instead of repeated in each transcript
   chunk.
2. `chunkEvidence()` creates chronological, word-bounded chunks with a bounded
   overlap and nearby OCR-only screenshot context. It prefers a nearby pause,
   then a speaker transition, over an arbitrary word boundary.
3. `minutes.worker.js` requests schema-shaped JSON for each chunk. It validates
   returned source and screenshot IDs, retries malformed JSON once, and never
   invents an ID during validation. Actions and decisions without at least one
   validated transcript source are discarded rather than displayed as evidence.
4. Consolidation deduplicates identical items but keeps decision statuses apart,
   so a proposal and a confirmation remain separate evidence. A final local
   model pass writes the executive summary from that consolidated data only.
5. Screenshot selection combines model relevance, OCR similarity, capture time
   an exact SHA-256 image digest, and a stored low-resolution perceptual
   fingerprint. A selected screenshot is represented in the appropriate minutes
   section with an explicit marker.

Actions and decisions retain `sourceSegmentIds`. The meeting-notes interface
uses these IDs to filter and reveal the supporting chronological transcript
entry.

## Accessibility and export

The feature uses labelled native controls, a native post-stop dialog, `progress`
and `role=status` updates, keyboard-operable evidence buttons, and an editable
textarea that is separate from source transcript editing. Decisions, actions,
owners, deadlines, statuses and individual screenshot inclusion also have
keyboard-operable review controls. Changing structured data rebuilds the
generated notes only after a warning if the user has edited the narrative. It
does not move focus while local processing runs.

The included minutes sections can be moved earlier or later with native select
and button controls; this order is used for generation and later regeneration.

When the model runtime supplies byte or percentage progress, the native
progress bar and status message announce the current local download file and
completion percentage. Otherwise the same control remains indeterminate rather
than implying an inaccurate amount of work completed.

Meeting notes export as Markdown with embedded selected screenshots,
self-contained HTML, browser-print PDF, and DOCX. DOCX export uses semantic
heading and bullet paragraphs and adds OCR-derived alternative text to embedded
PNG screenshots. An optional Include evidence references control appends the
supporting transcript time and passage for each extracted decision/action to
every notes export.

The HTML and print/PDF path renders Markdown bullet items in semantic `ul`/`li`
lists rather than standalone list items.

## Validation

The unit tests cover empty, short and 241-minute synthetic transcripts,
chunk overlap, source-ID validation, missing owner/deadline values, conflicting
decisions, OCR/perceptual screenshot deduplication, section selection and basic
DOCX generation. `npm run lint`, `npm test`, `npm run build` and `git diff
--check` are the project checks.

Each local run records model-load duration, total generation duration and
per-chunk duration alongside the meeting note. These metrics contain no meeting
content and support later device performance evaluation.

Real model inference, long-running device performance, VoiceOver interaction,
and DOCX interoperability still require manual device validation before a
release can claim those outcomes.

See [the validation record](meeting-minutes-validation.md) for the
requirement-by-requirement evidence and manual release checks.
