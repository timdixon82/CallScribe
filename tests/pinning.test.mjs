import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DIARIZER, pinnedAppConfig, sha256Hex, verifySha256, webllmLibUrl, webllmModelUrl, diarizerUrl } from '../src/model-manifest.js';
import { MODELS } from '../src/models.js';
import { MINUTES_MODELS } from '../src/minutes.js';
import { staticProblems } from '../scripts/check-pins.mjs';

const COMMIT = /^[0-9a-f]{40}$/;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('SHA-256 check accepts the right bytes and rejects tampered bytes', async () => {
  const bytes = new TextEncoder().encode('hello');
  const good = await sha256Hex(bytes);
  assert.equal(good, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  await verifySha256(bytes, good, 'file');
  await assert.rejects(verifySha256(new TextEncoder().encode('hellp'), good, 'file'), /integrity check/);
});

test('diarizer is fixed to a commit and every file has a hash', () => {
  assert.match(DIARIZER.commit, COMMIT);
  for (const file of ['embed.onnx', 'step_int8.onnx', 'mel_filters.bin', 'silence_embeds.bin']) {
    assert.match(DIARIZER.files[file], /^[0-9a-f]{64}$/);
    assert.ok(diarizerUrl(file).includes(`/resolve/${DIARIZER.commit}/`));
  }
  assert.ok(!DIARIZER.cache.endsWith('-v1'), 'cache name must be bumped so unverified bytes are refetched');
});

test('diarizer worker verifies bytes before caching and uses no unpinned URL', async () => {
  const worker = await read('../src/diarizer.worker.js');
  assert.ok(worker.indexOf('verifySha256(') > 0 && worker.indexOf('verifySha256(') < worker.indexOf('cache.put'));
  assert.doesNotMatch(worker, /resolve\/main/);
});

test('every Transformers.js model has a 40-character revision and the workers pass it', async () => {
  for (const model of [...MODELS, ...MINUTES_MODELS.filter((item) => item.repo)]) assert.match(model.revision, COMMIT, model.id);
  for (const file of ['transcriber-load.js', 'minutes.worker.v2.js']) assert.match(await read(`../src/${file}`), /revision: model\.revision/);
});

test('both Transformers.js workers use the local ONNX Runtime folder, not a CDN', async () => {
  for (const file of ['transcriber.worker.js', 'minutes.worker.v2.js']) {
    const text = await read(`../src/${file}`);
    assert.match(text, /env\.backends\.onnx\.wasm\.wasmPaths\s*=\s*new URL\('\.\.\/ort-tfjs\/'/);
    assert.doesNotMatch(text, /jsdelivr/i);
  }
  assert.match(await read('../scripts/copy-ocr-assets.mjs'), /ort-wasm-simd-threaded\.jsep\.wasm/);
});

test('WebLLM app config lists only the two pinned models with commit-pinned URLs', () => {
  const prebuilt = { useIndexedDBCache: false, model_list: ['Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-4B-q4f16_1-MLC', 'Other'].map((id) => ({ model_id: id, model: `https://huggingface.co/mlc-ai/${id}`, model_lib: 'x', vram_required_MB: 1 })) };
  const config = pinnedAppConfig(prebuilt);
  assert.deepEqual(config.model_list.map((item) => item.model_id), ['Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-4B-q4f16_1-MLC']);
  for (const item of config.model_list) {
    assert.equal(item.model, webllmModelUrl(item.model_id));
    assert.match(item.model, /\/resolve\/[0-9a-f]{40}\/$/);
    assert.match(item.model_lib, /binary-mlc-llm-libs\/[0-9a-f]{40}\//);
    assert.equal(item.vram_required_MB, 1);
  }
  assert.ok(webllmLibUrl('a.wasm').endsWith('/a.wasm'));
  assert.throws(() => pinnedAppConfig({ model_list: [] }), /no model record/);
});

test('every MINUTES_MODELS WebLLM id has a pin', () => {
  for (const model of MINUTES_MODELS) assert.ok(pinnedAppConfig({ model_list: MINUTES_MODELS.map((item) => ({ model_id: item.webllmModel })) }).model_list.some((item) => item.model_id === model.webllmModel));
});

test('drift script static checks pass on the current source', () => {
  assert.deepEqual(staticProblems(), []);
});
