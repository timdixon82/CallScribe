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
