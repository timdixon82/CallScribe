import test from 'node:test';
import assert from 'node:assert/strict';
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
