# CallScribe

CallScribe is a static, privacy-first browser application for capturing microphone and browser-supported computer audio, then transcribing it locally. It can also retain screen captures and, when explicitly enabled, run local PaddleOCR to add readable screenshot text to the transcript.

## Privacy and local storage

There is no backend or cloud inference. Audio, transcripts, screenshots and OCR text remain in browser-managed storage until removed. Models download only when required: Moonshine Base on first use, optional speech models when chosen, and the OCR model when local OCR is enabled. See the built-in [Help](public/docs/help.html) and [Privacy](public/docs/privacy.html) pages for the operational details and limitations.

## Licence

CallScribe's source code is licensed under [Apache-2.0](LICENSE). See
[third-party notices](THIRD_PARTY_NOTICES.md) for the licences that apply to
bundled software and separately downloaded models.

## Local development

Install the project dependencies, then start Vite:

```text
npm install
npm run dev
```

Open the localhost address printed by Vite. Do not open `index.html` directly with a `file:` address: Vite must process the application modules, and browser media permissions require localhost or HTTPS.

## Production build

```text
npm run build
```

The static production application is written to `dist/`. GitHub Pages deploys that directory after a push to `main`.

## Validation status

This MVP is not release-approved. See `docs/technical-validation.md`, `docs/manual-test-procedure.md`, and `docs/known-limitations.md` for the completed checks and required macOS and Windows hardware validation.
