import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DIARIZER, diarizerUrl, verifySha256 } from '../src/model-manifest.js';

// Runs the real worker source with fake browser globals, so the download and cache path is exercised end to end.
async function harness({ stored = {}, failV1Delete = false } = {}) {
  const source = (await readFile(new URL('../src/diarizer.worker.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const messages = []; const self = {}; const store = new Map(Object.entries(stored)); const fetched = [];
  const cache = {
    match: async (url) => (store.has(url) ? new Response(store.get(url)) : undefined),
    put: async (url, response) => { store.set(url, new Uint8Array(await response.arrayBuffer())); },
    delete: async (url) => store.delete(url),
  };
  const caches = { open: async () => cache, delete: async () => { if (failV1Delete) throw new Error('storage unavailable'); return true; } };
  const fetchFake = async (url) => { fetched.push(url); return new Response(new Uint8Array([1, 2, 3, 4])); };
  const make = new Function('ort', 'Diarizer', 'DIARIZER', 'diarizerUrl', 'verifySha256', 'caches', 'fetch', 'postMessage', 'self', source);
  make({ env: { wasm: {} } }, class {}, DIARIZER, diarizerUrl, verifySha256, caches, fetchFake, (message) => messages.push(message), self);
  await self.onmessage({ data: { type: 'load' } });
  return { messages, store, fetched };
}
const errorOf = (messages) => messages.find((message) => message.type === 'error')?.message;

test('tampered download is rejected and nothing is cached', async () => {
  const { messages, store } = await harness();
  assert.match(errorOf(messages), /failed its integrity check/);
  assert.equal(store.size, 0);
});

test('tampered cache entry is deleted, refetched, rejected and not kept', async () => {
  const url = diarizerUrl('embed.onnx');
  const { messages, store, fetched } = await harness({ stored: { [url]: new Uint8Array([9, 9]) } });
  assert.ok(fetched.includes(url), 'a bad cache hit must trigger a fresh download');
  assert.match(errorOf(messages), /failed its integrity check/);
  assert.equal(store.size, 0);
});

test('a failing cleanup of the old cache does not block loading', async () => {
  const { messages } = await harness({ failV1Delete: true });
  assert.match(errorOf(messages), /failed its integrity check/, 'load must get as far as the download, not stop on the cleanup error');
});
