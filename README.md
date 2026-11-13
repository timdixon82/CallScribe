# CallScribe

CallScribe is a static, privacy-first browser application for capturing microphone and browser-supported computer audio, then transcribing it locally. It can retain screen captures and, when explicitly enabled, run local PaddleOCR to add readable screenshot text to the transcript. It also offers optional local meeting notes: structured discussion points, decisions, actions, questions and risks linked back to their transcript evidence.

## Privacy and local storage

There is no backend or cloud inference. Audio, transcripts, screenshots, OCR text and generated meeting notes remain in browser-managed storage until removed. Meeting-note models download only after the user chooses to generate notes; Qwen3 4B requires separate explicit confirmation because it is approximately 2.8 GB. See the built-in [Help](public/docs/help.html) and [Privacy](public/docs/privacy.html) pages for operational details and limitations.

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

### Local test-import tool

Use **Import CallScribe Markdown** in **Prior Sessions** to import an export into the same browser profile's local storage. The selected file is never uploaded. Do not put confidential exports in the repository; select them from their existing local location. Delete the imported session from **Prior Sessions** when testing is complete.

## Production build

```text
npm run build
```

The static production application is written to `dist/`. GitHub Pages deploys that directory after a push to `main`.

## Validation status

This MVP is not release-approved. See `docs/technical-validation.md`, `docs/manual-test-procedure.md`, and `docs/known-limitations.md` for the completed checks and required macOS and Windows hardware validation.
