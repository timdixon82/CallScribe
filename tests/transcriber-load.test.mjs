import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTranscriber } from '../src/transcriber-load.js';

const model = { repo: 'r', revision: 'v' };
const run = (nav, createPipeline, preferredDevice) => { const messages = []; return loadTranscriber({ createPipeline, nav, model, preferredDevice, progress() {}, status: (m) => messages.push(m) }).then((r) => ({ ...r, messages })); };

test('gpu object with no adapter uses wasm without trying webgpu', async () => {
  const devices = [];
  const r = await run({ gpu: { requestAdapter: async () => null } }, async (_t, _r, o) => { devices.push(o.device); return 'p'; });
  assert.deepEqual(devices, ['wasm']); assert.equal(r.device, 'wasm'); assert.match(r.messages[0], /using WebAssembly/);
});
test('a saved webgpu preference is ignored when no adapter exists', async () => {
  const r = await run({ gpu: { requestAdapter: async () => { throw new Error('x'); } } }, async () => 'p', 'webgpu');
  assert.equal(r.device, 'wasm');
});
test('webgpu pipeline failure falls back to wasm q8 with a message', async () => {
  const calls = [];
  const r = await run({ gpu: { requestAdapter: async () => ({}) } }, async (_t, _r, o) => { calls.push(o); if (o.device === 'webgpu') throw new Error('no available backend found'); return 'p'; });
  assert.deepEqual(calls.map((c) => [c.device, c.dtype]), [['webgpu', 'q4'], ['wasm', 'q8']]); assert.equal(r.device, 'wasm'); assert.match(r.messages[0], /retrying locally with WebAssembly/);
});
test('wasm failure is reported, not hidden', async () => {
  await assert.rejects(run({}, async () => { throw new Error('boom'); }), /boom/);
});
