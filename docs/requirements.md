# Requirements: CallScribe

## Status

This document records the requirements supplied for model provisioning and download progress. They replace the relevant requirements in FR-11 through FR-15. Requirements for call capture, transcription interaction, transcript storage, supported browsers, and the remaining functional requirements have not yet been supplied.

## Product direction

CallScribe is a privacy-first application. Speech recognition runs locally on the user's device. Speech and transcript data must not be sent externally.

## Functional requirements

### FR-11: Default model provisioning

- Moonshine Base is the default speech-recognition model.
- On first launch, the application checks whether Moonshine Base is cached locally.
- If it is not cached, the application automatically begins downloading it.
- A visible, screen-reader-accessible progress bar is displayed.
- Transcription controls remain unavailable until the selected model is ready.
- On later launches, the cached model is reused without another download.
- If the application is offline and the default model is not cached, it displays an accessible error and Retry control.

### FR-12: Model download progress

Every model download provides:

- Model name.
- Downloaded megabytes.
- Total download size, where known.
- Percentage completed.
- Progress bar.
- Download status: Preparing, Downloading, Verifying, Ready, or Failed.
- Error information and a Retry control if downloading fails.

The progress bar uses an accessible HTML `progress` element with an associated label. Announcements are throttled so that screen readers receive useful updates, such as every 10 percent and on completion. The progress reflects bytes actually transferred rather than an artificial timer. For a model made of multiple files, the progress represents the combined download.

### FR-13: Optional model downloads

The following models remain optional:

1. Moonshine Tiny.
2. Whisper Tiny.
3. Whisper Base.
4. Whisper Small.

- Each optional model has a Download control.
- Optional models never download automatically.
- Downloaded models are retained in browser-managed disk storage.
- Users may keep multiple downloaded models simultaneously.
- A downloaded model can be selected without another download.
- Deleting a model requires confirmation.

### FR-14: Model storage and offline use

- Use the Origin Private File System (OPFS) or Cache Storage, according to browser and inference-runtime compatibility.
- Cache every file needed to load and run each model offline.
- Keep downloaded models between browser sessions.
- Check cache integrity before activating a model.
- Never re-download a complete, valid cached model unnecessarily.
- Handle interrupted downloads and insufficient storage.
- Let users view and manage model storage.
- Explain that clearing browser site data may remove downloaded models.

## Acceptance criteria

1. A fresh installation automatically downloads Moonshine Base.
2. A progress bar displays real download progress.
3. Progress information is accessible through NVDA and Narrator.
4. Closing and reopening the browser does not trigger another download when the model is cached.
5. Optional models download only following explicit user action.
6. All downloaded models can be used offline.
7. Failed downloads offer a clear recovery path.
8. Users can switch between downloaded models without restarting the application.
9. No speech or transcript data is transmitted externally.

## Open product decisions

- The initial set of supported browsers and operating systems.
- The model runtime and the authoritative source and manifest for each model's files.
- How calls or other audio enter the application.
- Transcript creation, export, retention, and deletion behaviour.
- The remaining functional requirements, including the original FR-15 that this amendment refers to.
