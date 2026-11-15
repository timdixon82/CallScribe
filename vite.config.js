import { defineConfig } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { buildOcrCore } from './scripts/build-ocr-core.mjs';
import { buildFramePage } from './scripts/ocr-frame-page.mjs';
import { BOOTSTRAP_VERSION, OCR_FILES, PROTOCOL_VERSION } from './src/ocr-protocol.js';

// Stamps the service worker with the build time (so a changed page never needs a manual version bump) and with the
// text recognition frame page. The frame page is a constant inside the worker and is never written to a file.
// Also adds the bundled text recognition engine to dist/ocr/core.js.
const ocrFrame = (core) => ({
  name: 'ocr-frame',
  apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: OCR_FILES.core, source: core }); },
  async closeBundle() {
    const file = new URL('./dist/sw.js', import.meta.url);
    const source = await readFile(file, 'utf8');
    for (const token of ['__BUILD_ID__', '__OCR_FRAME_PAGE__']) if (!source.includes(token)) throw new Error(`dist/sw.js has no ${token} placeholder to stamp.`);
    await writeFile(file, source.replace('__BUILD_ID__', Date.now().toString(36)).replace("'__OCR_FRAME_PAGE__'", () => JSON.stringify(buildFramePage().html)));
  },
});

// A relative base lets the static build work from this GitHub Pages project path
// and from any other static host subdirectory.
export default defineConfig(async ({ command }) => {
  const ocr = command === 'build' ? await buildOcrCore() : null;
  return {
    base: './',
    plugins: ocr ? [ocrFrame(ocr.core)] : [],
    // Build-time SHA-256 of every file the page checks before it starts the isolated frame (see src/ocr.js).
    define: { __OCR_BUILD__: JSON.stringify(ocr ? { protocol: PROTOCOL_VERSION, bootstrap: BOOTSTRAP_VERSION, hashes: ocr.hashes } : null) },
  };
});
