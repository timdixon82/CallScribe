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

test('source controls use accessible switches and the compact model picker remains available', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /function setCaptureToggle/);
  assert.match(app, /pipelines\.has\('microphone'\)/);
  assert.match(page, /id="model-select"/);
  assert.match(page, /role="switch" aria-checked="false"/);
  assert.match(page, /class="toggle-slider"/);
});

test('audio processing has an explicit toggle and inline advanced settings', async () => {
  const [app, page, audio] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/audio.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /function setAudioProcessingToggle/);
  assert.match(app, /audioProcessingEnabled/);
  assert.match(page, /id="toggle-audio-processing"/);
  assert.match(page, /Voice and advanced processing settings/);
  assert.match(page, /class="toggle-slider microphone-switch"/);
  assert.match(page, /Automatically separate speakers/);
  assert.match(audio, /setMuted\(muted\)/);
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
  assert.match(page, /Screen capture mode/);
  assert.match(page, /<option value="audio">Audio Only<\/option>/);
  assert.match(app, /function setScreenCaptureEnabled/);
  assert.match(page, /<option value="manual">Manual screenshots<\/option>/);
  assert.match(page, /id="model-settings-section"/);
  assert.match(page, /id="voice-settings-section"/);
  assert.match(page, /id="diagnostics-panel" class="collapsible-section"/);
  assert.match(page, /id="toggle-button-labels"/);
  assert.ok(page.indexOf('class="screen-capture-settings"') < page.indexOf('id="session-name"'));
  assert.ok(page.indexOf('data-capture-screen') < page.indexOf('id="transcript-heading"'));
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
  assert.match(page, /role="switch" aria-checked="false"/);
  assert.match(ocr, /recogniseImage/);
  assert.match(ocr, /recognitionQueue/);
  assert.match(ocr, /Array\.isArray\(result\?\.texts\)/);
  assert.match(ocr, /hasWebGpu/);
  assert.match(ocr, /appleMobile/);
});

test('exports include a self-contained Markdown transcript and individual screenshots', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /id="export-format"/);
  assert.match(page, /id="export-transcript"/);
  assert.match(page, /value="screenshots"/);
  assert.match(app, /function exportMarkdown/);
  assert.match(app, /blobToDataUrl/);
  assert.match(app, /function downloadScreenshots/);
  assert.match(app, /getScreenshots/);
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

test('people are locally saved labels, manually assigned to blocks, and never voiceprints', async () => {
  const [app, page, store] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/store.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /People and speaker labels/);
  assert.match(page, /does not analyse voices, create voiceprints, or identify people automatically/);
  assert.match(page, /id="participant-command"/);
  assert.match(page, /id="speaker-assignment-person"/);
  assert.match(page, /Speaker assignment/);
  assert.match(page, /list="saved-person-names"/);
  assert.match(page, /id="add-speaker-to-selected"[^>]*>Add<\/button>/);
  assert.match(page, /id="remove-speaker-from-selected"[^>]*>Remove<\/button>/);
  assert.match(page, /id="clear-speakers-from-selected"[^>]*>Clear<\/button>/);
  assert.match(app, /function applyPersonToSelected/);
  assert.match(app, /speakerIds/);
  assert.match(app, /function runParticipantCommand/);
  assert.match(app, /function participantNames/);
  assert.match(store, /createObjectStore\('participants'/);
  assert.match(store, /removeParticipantFromSegments/);
});

test('speaker labels remain visible in every transcript export', async () => {
  const app = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(app, /function speakerText/);
  assert.match(app, /speakerText\(segment\)/);
  assert.match(app, /speakerText\(s\)/);
});

test('speaker separation, time, and source labels can be hidden from the transcript without changing exports', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /id="show-speaker-labels"/);
  assert.match(page, /id="show-timestamps"/);
  assert.match(page, /id="show-sources"/);
  assert.match(app, /localBrowserTranscriberShowSpeakerLabels/);
  assert.match(app, /const showSpeakerLabels = ui\['show-speaker-labels'\]\.checked/);
  assert.match(app, /const showTimestamps = ui\['show-timestamps'\]\.checked/);
  assert.match(app, /const showSources = ui\['show-sources'\]\.checked/);
});

test('automatic speaker separation is optional, local, timestamp-aligned, and maps anonymous slots to saved people', async () => {
  const [app, page, diarizer, frontend] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/diarizer.worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/diarization.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /id="enable-speaker-separation"/);
  assert.match(page, /id="detected-speaker-list"/);
  assert.match(app, /Type a saved name or a new name/);
  assert.match(app, /function applyDiarization/);
  assert.match(app, /automaticSpeakerSlots/);
  assert.match(app, /assignDetectedSpeaker/);
  assert.match(app, /saved-person-names/);
  assert.match(app, /chunk\.audio\.slice\(\)/);
  assert.match(app, /type: 'flush'/);
  assert.match(diarizer, /NealCaren\/Nemotron-3-Diarization-ONNX/);
  assert.match(diarizer, /mel_filters\.bin/);
  assert.match(diarizer, /silence_embeds\.bin/);
  assert.match(diarizer, /data\.type === 'reset'/);
  assert.match(diarizer, /numThreads = 1/);
  assert.match(frontend, /export class Diarizer/);
  assert.match(frontend, /frames \* CFG\.nSpk/);
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

test('compact transcript action icons retain accessible names without duplicating session controls', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /transcriptIconButton/);
  assert.match(app, /syncSessionActionButtons/);
  assert.doesNotMatch(page, /data-session-action="start"/);
  assert.equal((page.match(/id="start-session"/g) || []).length, 1);
  assert.match(app, /'Download screenshot'/);
  assert.match(page, /id="share-system-audio"/);
});

test('transcript controls can show labels by preference and otherwise provide hover labels', async () => {
  const [app, page, css] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/compact.css', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /id="toggle-button-labels"/);
  assert.match(app, /localBrowserTranscriberShowButtonLabels/);
  assert.match(css, /data-show-button-labels="true"/);
  assert.match(css, /\.icon-action:hover::after/);
});

test('toggle controls use switches and primary sections are not duplicated', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  for (const toggle of ['setCaptureToggle', 'setAudioProcessingToggle', 'setOcrToggle', 'setScreenCaptureEnabled', 'setButtonLabels']) {
    assert.match(app, new RegExp(`function ${toggle}`));
  }
  assert.match(app, /function setSwitch/);
  assert.match(page, /Automatically separate speakers/);
  assert.match(page, /class="toggle-control"/);
  assert.match(app, /section-summary-heading/);
  assert.equal((page.match(/id="transcript-heading"/g) || []).length, 1);
  assert.equal((page.match(/id="voice-settings-section"/g) || []).length, 1);
});

test('the footer displays the canonical release version', async () => {
  const [page, version, versionWorkflow, packageJson] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets/version.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/version.yml', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  const match = version.match(/APP_VERSION = '([^']+)'/);
  assert.ok(match, 'assets/version.js must define APP_VERSION');
  const appVersion = match[1];
  assert.match(page, /data-app-version/);
  assert.ok(page.includes(`src="assets/version.js?v=${appVersion}"`));
  assert.match(versionWorkflow, /public\/assets\/version\.js/);
  assert.equal(JSON.parse(packageJson).version, appVersion);
});

test('help, privacy, terms and accessibility pages are published with the app', async () => {
  const pages = await Promise.all(['help', 'privacy', 'terms', 'accessibility'].map((name) => readFile(new URL(`../public/docs/${name}.html`, import.meta.url), 'utf8')));
  assert.match(pages[0], /Screenshots and OCR/);
  assert.match(pages[1], /does not send speech, transcript or screenshot content/);
  assert.match(pages[2], /obtaining any consent required/);
  assert.match(pages[3], /screenshot has alternative text/);
});
