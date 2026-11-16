import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATED_FLAG, migrateLegacyCaches, sweepLegacyEntries } from '../src/legacy-caches.js';
import { rulesForModel } from '../src/legacy-match.js';
import { SETTINGS_PREFIX } from '../src/erase-all.js';
import { HF_REVISIONS, WEBLLM_MODELS, webllmLibUrl, webllmModelUrl } from '../src/model-manifest.js';
import { MODELS } from '../src/models.js';
import { fakeCacheStorage } from './fake-cache-storage.mjs';

const tiny = `https://huggingface.co/onnx-community/whisper-tiny/resolve/${HF_REVISIONS['onnx-community/whisper-tiny']}/onnx/model.onnx`;
const base = `https://huggingface.co/onnx-community/whisper-base/resolve/${HF_REVISIONS['onnx-community/whisper-base']}/onnx/model.onnx`;
const foreign = 'https://huggingface.co/someone-else/their-model/resolve/main/model.onnx';
const webllmId = Object.keys(WEBLLM_MODELS)[0];
const webllmWeights = `${webllmModelUrl(webllmId)}params_shard_0.bin`;
const webllmWasm = webllmLibUrl(WEBLLM_MODELS[webllmId].lib);
const storage = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), has: (k) => data.has(k) }; };
const seed = () => ({
  'transformers-cache': { [tiny]: { body: 'tiny-model' }, [base]: { body: 'base-model' }, [foreign]: { body: 'foreign' } },
  'webllm/model': { [webllmWeights]: { body: 'weights' }, [foreign]: { body: 'foreign' } },
  'webllm/wasm': { [webllmWasm]: { body: 'wasm' } },
});

test('the migration flag is a settings key, so erase-all clears it', () => assert.ok(MIGRATED_FLAG.startsWith(SETTINGS_PREFIX)));

test('legacy sweep deletes only the pinned entries and leaves foreign entries and the cache itself', async () => {
  const caches = fakeCacheStorage(seed());
  await sweepLegacyEntries(caches);
  assert.deepEqual(caches.urls('transformers-cache'), [foreign]);
  assert.deepEqual(caches.urls('webllm/model'), [foreign]);
  assert.deepEqual(caches.urls('webllm/wasm'), [], 'the cache stays even when empty');
  assert.equal(await caches.has('webllm/wasm'), true);
  assert.equal(await caches.has('webllm/config'), false);
  assert.deepEqual(caches.opened.filter((name) => name === 'webllm/config'), [], 'a missing legacy cache is not created');
});

test('single-model removal sweep touches only that model', async () => {
  const caches = fakeCacheStorage(seed());
  await sweepLegacyEntries(caches, rulesForModel(MODELS.find((model) => model.id === 'whisper-tiny')));
  assert.deepEqual(caches.urls('transformers-cache').sort(), [base, foreign].sort());
  assert.deepEqual(caches.urls('webllm/model'), [webllmWeights, foreign]);
});

test('migration copies matching entries only, moves them and sets the flag', async () => {
  const caches = fakeCacheStorage(seed()); const settings = storage();
  assert.equal(await migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks: undefined }), 'done');
  assert.deepEqual(caches.urls('callscribe-transformers-v1').sort(), [base, tiny].sort());
  assert.deepEqual(caches.urls('callscribe-webllm-model-v1'), [webllmWeights]);
  assert.deepEqual(caches.urls('callscribe-webllm-wasm-v1'), [webllmWasm]);
  assert.deepEqual(caches.urls('transformers-cache'), [foreign], 'foreign entry untouched');
  assert.deepEqual(caches.urls('webllm/model'), [foreign]);
  assert.equal(await caches.has('webllm/wasm'), true, 'the empty legacy cache is left in place');
  assert.equal(settings.has(MIGRATED_FLAG), true);
  const copy = await (await (await caches.open('callscribe-transformers-v1')).match(tiny)).text();
  assert.equal(copy, 'tiny-model');
});

test('entries that fail the integrity checks are skipped and left in place', async () => {
  const urls = { size: tiny, opaque: base, status: webllmWeights, missing: webllmWasm };
  const caches = fakeCacheStorage({
    'transformers-cache': { [urls.size]: { body: 'abc', length: 99 }, [urls.opaque]: { body: 'abc', type: 'opaque' } },
    'webllm/model': { [urls.status]: { body: 'abc', status: 404 } },
    'webllm/wasm': { [urls.missing]: { body: 'abc', length: null } },
  });
  const settings = storage();
  assert.equal(await migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks: undefined }), 'done', 'a failed check is expected, not an error');
  for (const name of ['callscribe-transformers-v1', 'callscribe-webllm-model-v1', 'callscribe-webllm-wasm-v1']) assert.deepEqual(caches.urls(name), [], name);
  assert.deepEqual(caches.urls('transformers-cache').sort(), [base, tiny].sort());
  assert.deepEqual(caches.urls('webllm/model'), [webllmWeights]);
  assert.deepEqual(caches.urls('webllm/wasm'), [webllmWasm]);
});

test('a set flag stops the migration, and a rerun after completion changes nothing', async () => {
  const caches = fakeCacheStorage(seed()); const settings = storage(); settings.setItem(MIGRATED_FLAG, '1');
  assert.equal(await migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks: undefined }), 'already');
  assert.equal(caches.urls('callscribe-transformers-v1').length, 0);
  const second = fakeCacheStorage(seed()); const flag = storage();
  await migrateLegacyCaches({ cacheStorage: second, storage: flag, locks: undefined });
  flag.setItem(MIGRATED_FLAG, ''); // force a second full pass
  const before = JSON.stringify(second.urls('callscribe-transformers-v1'));
  await migrateLegacyCaches({ cacheStorage: second, storage: { getItem: () => null, setItem() {} }, locks: undefined });
  assert.equal(JSON.stringify(second.urls('callscribe-transformers-v1')), before);
});

test('an interrupted run leaves the flag unset and the next run finishes the job', async () => {
  const failing = ['callscribe-webllm-model-v1']; const caches = fakeCacheStorage(seed(), { failPutIn: failing }); const settings = storage();
  assert.equal(await migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks: undefined }), 'incomplete', 'quota failure');
  assert.equal(settings.has(MIGRATED_FLAG), false);
  assert.deepEqual(caches.urls('webllm/model'), [webllmWeights, foreign], 'the old copy is kept when the new copy fails');
  assert.deepEqual(caches.urls('callscribe-transformers-v1').sort(), [base, tiny].sort(), 'other entries still moved');
  failing.length = 0; // space is available again
  assert.equal(await migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks: undefined }), 'done');
  assert.equal(settings.has(MIGRATED_FLAG), true);
  assert.deepEqual(caches.urls('callscribe-webllm-model-v1'), [webllmWeights]);
  assert.deepEqual(caches.urls('webllm/model'), [foreign]);
});

test('the old entry is deleted only after the new copy reads back at the same length', async () => {
  const inner = fakeCacheStorage(seed());
  const truncating = { ...inner, open: async (name) => { const cache = await inner.open(name); return name === 'callscribe-transformers-v1' ? { ...cache, put: (request, response) => response.arrayBuffer().then((bytes) => cache.put(request, new Response(bytes.slice(0, 1), { headers: { 'content-length': '1' } }))) } : cache; } };
  const settings = storage();
  assert.equal(await migrateLegacyCaches({ cacheStorage: truncating, storage: settings, locks: undefined }), 'incomplete');
  assert.deepEqual(inner.urls('transformers-cache').sort(), [base, foreign, tiny].sort(), 'old copies kept');
  assert.equal(settings.has(MIGRATED_FLAG), false);
});

test('two tabs at once end consistent, with and without Web Locks', async () => {
  for (const withLocks of [true, false]) {
    const caches = fakeCacheStorage(seed()); const settings = storage(); let queue = Promise.resolve();
    const locks = withLocks ? { request: (_name, run) => { const next = queue.then(run); queue = next.catch(() => {}); return next; } } : undefined;
    const results = await Promise.all([migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks }), migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks })]);
    assert.ok(results.includes('done'), JSON.stringify(results));
    assert.deepEqual(caches.urls('callscribe-transformers-v1').sort(), [base, tiny].sort());
    assert.deepEqual(caches.urls('transformers-cache'), [foreign]);
    assert.equal(settings.has(MIGRATED_FLAG), true);
    if (withLocks) assert.deepEqual(results, ['done', 'already']);
  }
});

test('with no legacy caches nothing is created, and a browser without caches is tolerated', async () => {
  const caches = fakeCacheStorage({ 'other-site': { 'https://x.test/': {} } }); const settings = storage();
  assert.equal(await migrateLegacyCaches({ cacheStorage: caches, storage: settings, locks: undefined }), 'done');
  assert.deepEqual(caches.opened, []);
  assert.equal(await migrateLegacyCaches({ cacheStorage: undefined, storage: storage() }), 'already');
});

test('the page starts the migration in the background and single-model removal sweeps the old caches', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /\nmigrateLegacyCaches\(\);/);
  assert.match(main, /async function removeModelFiles\(model\)[^\n]*sweepLegacyEntries\(caches, rules\)/);
  assert.match(main, /await removeModelFiles\(model\)/);
  assert.doesNotMatch(main, /\.url\.includes\(model\.repo\)/, 'the loose repository match is gone');
});
