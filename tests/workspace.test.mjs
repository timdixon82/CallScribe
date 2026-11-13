import test from 'node:test';
import assert from 'node:assert/strict';
import { captureState } from '../src/workspace.js';

const ready = { modelReady: true, microphoneConnected: true, microphoneMuted: false, sharing: false, appAudioConnected: false, screenshotMode: 'audio', ocrEnabled: false };
test('connected sources are ready before recording and included during recording', () => {
  assert.equal(captureState(ready).microphone, 'Connected · Ready');
  const state = captureState({ ...ready, session: { startedAt: 1 } });
  assert.equal(state.microphone, 'Connected · Included in transcript');
  assert.equal(state.transcription, 'Transcribing');
});
test('screen sharing without an audio track never claims to include app audio', () => {
  const state = captureState({ ...ready, sharing: true, microphoneConnected: false, session: {} });
  assert.equal(state.appAudio, 'Screen shared — no app audio received');
  assert.equal(state.hasAudio, false);
  assert.equal(state.transcription, 'Recording — no included audio');
});
test('microphone exclusion is distinct from disconnecting and from pausing', () => {
  const state = captureState({ ...ready, microphoneMuted: true, paused: true, session: {}, sharing: true, appAudioConnected: true, screenshotMode: 'periodic', ocrEnabled: true });
  assert.equal(state.transcription, 'Paused');
  assert.equal(state.microphone, 'Connected · Excluded from transcript');
  assert.equal(state.appAudio, 'Connected · Ready');
  assert.equal(state.screenshots, 'Every interval · Paused · Text recognition on');
});
test('permission failures and browser support messages remain actionable', () => {
  const state = captureState({ ...ready, modelReady: false, microphoneConnected: false, microphoneMessage: 'Microphone permission blocked. Allow access in browser site controls.', shareMessage: 'Screen capture is not supported by this browser.' });
  assert.match(state.microphone, /permission blocked/i);
  assert.match(state.appAudio, /not supported/);
  assert.equal(state.transcription, 'Preparing transcription');
});
test('screenshot mode is inactive until a screen is connected', () => {
  assert.equal(captureState({ ...ready, screenshotMode: 'manual', ocrEnabled: true }).screenshots, 'Off');
  assert.equal(captureState({ ...ready, sharing: true, screenshotMode: 'manual' }).screenshots, 'Manual · Ready');
});
