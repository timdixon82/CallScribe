import { cpSync, readdirSync, rmSync } from 'node:fs';
import { test, expect } from './helpers.mjs';
import { DIARIZER, diarizerUrl } from '../../src/model-manifest.js';

// N1, speaker separation under the real page policy. LOCAL MANUAL RUN ONLY: it needs the pinned speaker model
// files (about 100 MB), so it is skipped unless DIARIZER_MODEL_DIR points at a folder holding them. CI never sets it.
//   DIARIZER_MODEL_DIR=/path/to/folder npx playwright test tests/e2e/diarizer.manual.spec.mjs
// The folder holds embed.onnx, step_int8.onnx, mel_filters.bin and silence_embeds.bin from the pinned commit; the
// worker still checks each SHA-256 itself. The files are served in place of huggingface.co, so nothing leaves the machine.
// The audio is synthetic: two alternating tones, 12 seconds, no speech.
const dir = process.env.DIARIZER_MODEL_DIR;
test.skip(!dir, 'Set DIARIZER_MODEL_DIR to run the speaker separation check locally.');

test('speaker separation runs under the page policy', async ({ page }) => {
  test.setTimeout(240000);
  const violations = [];
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP-VIOLATION ${event.violatedDirective}`)));
  page.on('console', (message) => { if (/CSP-VIOLATION|Content Security Policy|unsafe-eval/i.test(message.text())) violations.push(message.text()); });
  // Playwright cannot hand a 100 MB body to the browser, so the files are copied into dist/ and stored in the
  // worker's own cache under the pinned URLs. The worker then finds them and still verifies each SHA-256.
  cpSync(dir, new URL('../../dist/diarizer-model/', import.meta.url), { recursive: true });
  const worker = readdirSync(new URL('../../dist/assets/', import.meta.url)).find((name) => /^diarizer\.worker-.*\.js$/.test(name));
  await page.goto('/index.html');
  await page.evaluate(async ({ cacheName, files }) => { const cache = await caches.open(cacheName); for (const [file, url] of Object.entries(files)) await cache.put(url, await fetch(`diarizer-model/${file}`)); }, { cacheName: DIARIZER.cache, files: Object.fromEntries(Object.keys(DIARIZER.files).map((file) => [file, diarizerUrl(file)])) });
  const result = await page.evaluate((file) => new Promise((resolve) => {
    const w = new Worker(new URL(`assets/${file}`, document.baseURI), { type: 'module' });
    const messages = [];
    const timer = setTimeout(() => resolve({ timeout: true, messages }), 200000);
    w.onerror = (event) => resolve({ workerError: event.message, messages });
    w.onmessage = ({ data }) => {
      if (data.type === 'error') { clearTimeout(timer); resolve({ error: data.message, messages }); }
      if (data.type === 'diarization') { clearTimeout(timer); resolve({ frames: data.numFrames, probs: data.probs.length, messages }); }
      if (data.type === 'status') messages.push(data.text);
    };
    const audio = new Float32Array(16000 * 12);
    for (let i = 0; i < audio.length; i += 1) audio[i] = 0.3 * Math.sin(2 * Math.PI * (Math.floor(i / 16000 / 3) % 2 ? 300 : 180) * i / 16000);
    w.postMessage({ type: 'append', source: 'microphone', audio, capturedAt: 0, sessionId: 'synthetic' });
    w.postMessage({ type: 'flush', source: 'microphone' });
  }), worker);
  console.log('DIARIZER RESULT', JSON.stringify(result));
  expect(result.error ?? result.workerError ?? (result.timeout ? 'timeout' : undefined)).toBeUndefined();
  expect(result.frames).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test.afterAll(() => rmSync(new URL('../../dist/diarizer-model/', import.meta.url), { recursive: true, force: true }));
