# Local Browser Transcriber

Local Browser Transcriber is a static, privacy-first browser application for capturing microphone and browser-supported computer audio, then transcribing it locally.

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
