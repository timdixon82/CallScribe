import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODELS, findModel } from '../src/models.js';

test('catalogue contains the required five distinct models', () => {
  assert.equal(MODELS.length, 5);
  assert.equal(new Set(MODELS.map((model) => model.id)).size, 5);
  assert.deepEqual(MODELS.map((model) => model.name), ['Moonshine Base', 'Moonshine Tiny', 'Whisper Tiny', 'Whisper Base', 'Whisper Small']);
});

test('Moonshine Base alone is automatic default', () => {
  assert.deepEqual(MODELS.filter((model) => model.default).map((model) => model.id), ['moonshine-base']);
  assert.equal(findModel('whisper-small').language, 'Multilingual');
  assert.equal(findModel('unknown'), undefined);
});

test('worker permits cached-only model loads', async () => {
  const worker = await readFile(new URL('../src/transcriber.worker.js', import.meta.url), 'utf8');
  assert.match(worker, /env\.useBrowserCache\s*=\s*true/);
  assert.match(worker, /env\.allowLocalModels\s*=\s*true/);
});

test('launch restores a verified user-selected model, otherwise uses Moonshine Base', async () => {
  const app = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(app, /const defaultModel = findModel\('moonshine-base'\)/);
  assert.match(app, /savedModel && savedRecord\?\.ready \? savedModel : defaultModel/);
  assert.match(app, /ui\['start-session'\]\.disabled = true/);
});

test('voice-control setup uses the matching DOM IDs and cannot block launch', async () => {
  const app = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(app, /highPass: 'high-pass'/);
  assert.match(app, /lowPass: 'low-pass'/);
  assert.match(app, /const id = controlIds\[key\]/);
});

test('source controls expose a pressed state and the compact model picker remains available', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /function setCaptureToggle/);
  assert.match(app, /pipelines\.has\('microphone'\)/);
  assert.match(page, /id="model-select"/);
  assert.match(page, /aria-pressed="false"/);
});

test('audio processing has an explicit toggle and settings shortcut', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /function setAudioProcessingToggle/);
  assert.match(app, /audioProcessingEnabled/);
  assert.match(page, /id="toggle-audio-processing"/);
  assert.match(page, /id="audio-processing-settings"/);
});

test('screen capture supports manual, periodic, and screen-change screenshots', async () => {
  const [app, page, store] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/store.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /captureScreenshot\('Manual screenshot'\)/);
  assert.match(app, /screenshotMode === 'periodic'/);
  assert.match(app, /detectScreenChange/);
  assert.match(page, /value="periodic"/);
  assert.match(page, /value="changes"/);
  assert.match(store, /createObjectStore\('screenshots'/);
});

test('OCR is explicitly enabled, cached locally, and used as screenshot alternative text', async () => {
  const [app, page, ocr] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ocr.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /local-browser-transcriber-ocr-v1/);
  assert.match(app, /cacheOcrAssets/);
  assert.match(app, /processScreenshotOcr/);
  assert.match(app, /image\.alt = text/);
  assert.match(page, /id="toggle-ocr"/);
  assert.match(ocr, /recogniseImage/);
  assert.match(ocr, /hasWebGpu/);
  assert.match(ocr, /appleMobile/);
});

test('transcript uses source filters rather than separate source sections', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /selectedTranscriptSources/);
  assert.match(page, /name="transcript-source" value="microphone"/);
  assert.match(page, /name="transcript-source" value="system"/);
  assert.match(page, /name="transcript-source" value="screen"/);
  assert.match(page, /name="transcript-source" value="ocr"/);
});

test('model controls keep stable selection, expose languages, and list downloaded assets separately', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /renderModels\(\{ rebuild = false \} = \{\}\)/);
  assert.match(app, /Multilingual/);
  assert.match(app, /renderDownloadedModels/);
  assert.match(app, /requestOcrDelete/);
  assert.match(page, /id="downloaded-model-list"/);
  assert.match(page, /id="ocr-download-status" hidden/);
});

test('compact transcript action icons and duplicate session controls retain accessible names', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /transcriptIconButton/);
  assert.match(app, /syncSessionActionButtons/);
  assert.match(page, /data-session-action="start"/);
  assert.match(app, /'Download screenshot'/);
  assert.match(page, /id="share-system-audio"/);
});

test('help, privacy, terms and accessibility pages are published with the app', async () => {
  const pages = await Promise.all(['help', 'privacy', 'terms', 'accessibility'].map((name) => readFile(new URL(`../public/docs/${name}.html`, import.meta.url), 'utf8')));
  assert.match(pages[0], /Screenshots and OCR/);
  assert.match(pages[1], /does not send speech, transcript or screenshot content/);
  assert.match(pages[2], /obtaining any consent required/);
  assert.match(pages[3], /screenshot has alternative text/);
});
