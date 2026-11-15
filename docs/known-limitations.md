# Known Limitations and Validation Status

## Current delivery status

This is a static MVP with real browser APIs and a real local Transformers.js Moonshine path. It is not a release-approved application. A successful production build only proves that the source bundles; it does not prove capture, inference, screen-reader operation, privacy, or performance on a particular computer.

## Not yet verified

- macOS Chrome and Edge microphone, tab-audio, and system-audio behaviour.
- Windows 11 Chrome and Edge system-audio modes and simultaneous capture.
- VoiceOver, NVDA, and Windows Narrator manual testing.
- A complete Moonshine Base download and local inference run; the model download is deliberately not run in development because it is large.
- Offline reload, interrupted-download recovery, two-hour sessions, and all-model benchmarks.
- An end-to-end meeting-notes extraction run in the complete CallScribe interface. On 11 November 2026, an isolated Edge validation downloaded the approved Qwen3 0.6B model and completed a synthetic prompt with WebAssembly after the worker was corrected not to probe Vite's SPA fallback as a `/models/` directory. The first WebGPU-preferred attempt did not emit a model-ready event or error after roughly three minutes, so WebGPU performance remains unverified. The 4B model was not downloaded.
- Real VoiceOver review of the meeting-notes generation, editing, evidence-navigation and browser-print workflows.

## MVP constraints

- Computer audio depends on the browser returning an audio track after the user grants display-sharing permission. The application clearly reports when it is absent and continues to support microphone-only use.
- Model integrity is established by a successful local-only model load after Cache Storage retrieval. A pinned, independently supplied per-file hash manifest is still required for release-grade cryptographic integrity verification.
- Each audio pipeline uses short, bounded chunks. If inference is already busy, a later chunk is currently not queued. This avoids unbounded memory growth but needs a benchmarked scheduling policy before the no-speech-loss requirement can be claimed.
- Sessions and segments are written incrementally to IndexedDB and can be reopened, downloaded as text, and deliberately deleted in the browser interface. Persistence across a real browser restart still needs manual verification on macOS and Windows.
- Meeting-note extraction is assistive, not an authoritative record. Structured JSON and source-reference validation prevent malformed or invented IDs from being accepted, but users must review generated decisions, owners, dates and screenshot captions before relying on them.
- Meeting-note DOCX export uses browser-side document generation and embeds selected screenshots as PNG with OCR-derived alternative text. It still needs interoperability testing in current Word, LibreOffice and a screen reader before accessible Word output can be claimed.

## Model distribution

The model catalogue uses the browser-compatible repositories published for Transformers.js. Model downloads use the configured Hugging Face repository only when a model is first loaded. After a successful cached model load, the worker requests local files only.

## Content Security Policy limits

The Content Security Policy is set in a meta tag in each page, not in a response header. This has limits:

- It cannot use `frame-ancestors`, so the policy does not stop other sites from putting the app in a frame.
- It cannot send violation reports, so blocked requests are not reported anywhere.
- It cannot use `sandbox`.
- It does not restrict where the page can navigate to.
- It does not govern worker scripts that load from this site. The automated test for the workers checks the hosts they contact, but it does not prove that the policy is enforced in them.

A policy sent as a response header would remove these limits. It needs a proxy or a host that can set headers. Tim chose not to add one for now.

## Text recognition (OCR) runs in an isolated frame

Reading text from screenshots needs code that uses `eval`, which the page policy forbids. The page policy stays strict. The engine runs in a hidden frame instead, with its own policy.

How it works:

- The service worker builds the frame page from a constant and serves it only at one exact path, only to an iframe, with the header `Content-Security-Policy: sandbox allow-scripts`. No frame page file exists in the built site. Without the worker (first visit, hard reload, a worker that is not in control) there is no page and OCR says so.
- The sandbox gives the frame an opaque origin. It cannot read the page's IndexedDB, local storage, caches or cookies, and its policy sets `connect-src 'none'`. The page checks the SHA-256 of the engine, the runtime and every model before it sends anything, and then sends only public program files and, per job, image pixels.
- The frame page has one inline script, hashed in its policy. That script does nothing unless the origin is opaque, a parent window exists, and storage access is denied.

Limits and residual risks:

- First visit: OCR needs the service worker to be in control. On the very first load, after a hard reload, or with developer tools bypassing the worker, the app asks the user to reload the page once.
- The frame keeps `unsafe-eval` for as long as the OCR library needs it. Replacing OpenCV so that no `eval` is needed is still an option for later.
- `connect-src` does not cover DNS prefetch or WebRTC in every browser. If the pinned OCR code were itself compromised it could try those channels. The defences are pinning, the hash check and dependency scanning, not the policy alone. `navigator.sendBeacon` returns true in Chromium and WebKit, but no request was seen leaving the frame.
- In Chromium testing, a running recognition delayed the page's own timers, so the frame appears to share the page's thread. A hung recognition could then freeze the page until the browser reacts, and the job timeout cannot fire first.
- OpenCV tries one fetch of a `data:` address that `connect-src 'none'` blocks. It then carries on and works. The tests allow this one message.
- A header-sandboxed frame loses its sandbox if it navigates. The page removes the frame on a second load event and turns OCR off until the page is reloaded. The page policy's `frame-src 'self'` blocks navigation to other sites in Chromium. In Firefox and WebKit the block was only inferred (no request was seen), not confirmed by a message.
- Browser status: the OCR end-to-end tests pass in Chromium, Firefox and WebKit (Playwright builds, run locally with `OCR_ALL_BROWSERS=1`). CI runs Chromium only. Offline OCR was tested in all three. WebGPU speed in the frame is not benchmarked.
- The text recognition engine file is about 10 MB and is kept in the OCR cache with the models, so turning OCR on downloads about 55 MB in total.
