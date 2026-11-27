import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WEBLLM_CACHE_RENAMES } from '../src/cache-names.js';
import { assertCachesRenamed, installCachesRename } from '../src/scoped-cache.js';
import { fakeCacheStorage } from './fake-cache-storage.mjs';

// `caches` is an accessor on a real worker scope, so the fake scope has one too. blockCaches makes the override impossible.
async function harness({ blockCaches = false } = {}) {
  const source = (await readFile(new URL('../src/minutes.webllm.worker.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const messages = []; const realCaches = fakeCacheStorage(); const self = {}; let release; let created = 0; Object.defineProperty(self, 'caches', { get: () => realCaches, configurable: !blockCaches });
  const engine = { chat: { completions: { create: () => new Promise(resolve => { release = resolve; }) } }, interruptGenerate() {} };
  const make = new Function('CreateMLCEngine', 'chunkEvidence', 'consolidateExtractions', 'conservativeRecovery', 'spreadPick', 'summaryHeadline', 'validateExtraction', 'prebuiltAppConfig', 'pinnedAppConfig', 'postMessage', 'self', 'WEBLLM_CACHE_RENAMES', 'assertCachesRenamed', 'installCachesRename', source);
  make(async () => { created += 1; return engine; }, () => [{ entries: [{ id: 's1', text: 'Synthetic release planning.', speaker: [] }], screenshots: [] }], () => ({ discussion: [] }), () => ({}), (items) => items, () => 'Key themes', value => value, {}, () => ({}), message => messages.push(message), self, WEBLLM_CACHE_RENAMES, assertCachesRenamed, installCachesRename);
  await self.onmessage({ data: { type: 'load', model: { webllmModel: 'test' } } });
  return { messages, self, realCaches, created: () => created, send: data => self.onmessage({ data }), release: () => release({ choices: [{ message: { content: 'Synthetic release planning.' } }] }) };
}

test('stopping during the final chunk does not publish a completed summary', async () => {
  const worker = await harness();
  const run = worker.send({ type: 'generate', evidence: {}, model: { id: 'qwen3-0.6b' }, settings: {} });
  await worker.send({ type: 'cancel' }); worker.release(); await run;
  assert.equal(worker.messages.some(message => message.type === 'complete'), false);
  assert.equal(worker.messages.at(-1).type, 'cancelled');
  assert.deepEqual(worker.messages.at(-1).extractions, []);
});

test('compatible completed chunks are reused when restarting summary generation', async () => {
  const worker = await harness();
  await worker.send({ type: 'generate', evidence: {}, extractions: [{ discussion: [] }], model: { id: 'qwen3-0.6b' }, settings: {} });
  assert.equal(worker.messages.at(-1).type, 'complete');
  assert.equal(worker.messages.at(-1).chunkMs.length, 0);
});

test('the detailed summary worker uses app-specific cache names before the engine starts', async () => {
  const worker = await harness();
  assert.equal(worker.created(), 1);
  await worker.self.caches.open('webllm/model');
  assert.deepEqual(worker.realCaches.opened, ['callscribe-webllm-model-v1']);
  assert.equal(worker.self.caches.resolveName('webllm/wasm'), 'callscribe-webllm-wasm-v1');
});

test('the detailed summary worker refuses to start the engine, and reports an error, when the cache override is blocked', async () => {
  const worker = await harness({ blockCaches: true });
  assert.equal(worker.created(), 0, 'no engine was created');
  assert.equal(worker.messages.at(-1).type, 'error');
  assert.equal(worker.messages.at(-1).operation, 'load');
  assert.deepEqual(worker.realCaches.opened, [], 'no shared cache was opened');
});

test('the worker installs the cache rename before it creates the engine', async () => {
  const source = await readFile(new URL('../src/minutes.webllm.worker.js', import.meta.url), 'utf8');
  const install = source.indexOf('installCachesRename(self, WEBLLM_CACHE_RENAMES)');
  assert.ok(install > 0);
  assert.ok(install < source.indexOf('await CreateMLCEngine('));
  assert.match(source, /assertCachesRenamed\(self, renamed, WEBLLM_CACHE_RENAMES\)/);
});
