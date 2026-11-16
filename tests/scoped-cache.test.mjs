import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { scopedCache, renameCaches, installCachesRename, assertCachesRenamed } from '../src/scoped-cache.js';
import { LEGACY_CACHE_NAMES, LEGACY_TRANSFORMERS_CACHE, OCR_CACHE, OWN_CACHE_PREFIXES, TRANSFORMERS_CACHE, WEBLLM_CACHES, WEBLLM_CACHE_RENAMES, isOwnCache } from '../src/cache-names.js';
import { fakeCacheStorage } from './fake-cache-storage.mjs';

const accessorScope = (real, { configurable = true } = {}) => { const scope = {}; Object.defineProperty(scope, 'caches', { get: () => real, configurable }); return scope; };

test('the new cache names all start with callscribe-, differ from the library defaults and count as this app\'s', () => {
  for (const name of [TRANSFORMERS_CACHE, ...WEBLLM_CACHES]) { assert.ok(name.startsWith('callscribe-'), name); assert.equal(isOwnCache(name), true, name); assert.equal(LEGACY_CACHE_NAMES.includes(name), false, name); }
  assert.deepEqual([...LEGACY_CACHE_NAMES].sort(), ['transformers-cache', 'webllm/config', 'webllm/model', 'webllm/wasm']);
  for (const name of LEGACY_CACHE_NAMES) assert.equal(isOwnCache(name), false, `${name} is shared, so it is not an own cache`);
  assert.equal(isOwnCache(OCR_CACHE), true);
  assert.ok(OWN_CACHE_PREFIXES.includes('callscribe-') && OWN_CACHE_PREFIXES.includes('local-browser-transcriber-'));
  assert.deepEqual(Object.values(WEBLLM_CACHE_RENAMES), WEBLLM_CACHES);
});

test('scopedCache round-trips a response under its own cache name', async () => {
  const storage = fakeCacheStorage();
  const cache = scopedCache('callscribe-test-v1', storage);
  assert.equal(await cache.match('https://example.test/a'), undefined);
  await cache.put('https://example.test/a', new Response('hello'));
  assert.equal(await (await cache.match('https://example.test/a')).text(), 'hello');
  assert.deepEqual(storage.urls('callscribe-test-v1'), ['https://example.test/a']);
  assert.deepEqual(await storage.keys(), ['callscribe-test-v1']);
});

test('scopedCache opens nothing until it is used', () => {
  const storage = fakeCacheStorage(); scopedCache('callscribe-test-v1', storage);
  assert.deepEqual(storage.opened, []);
});

test('renameCaches maps the three WebLLM names, passes others through and does not map keys', async () => {
  const real = fakeCacheStorage({ other: { 'https://example.test/o': {} } });
  const wrapper = renameCaches(WEBLLM_CACHE_RENAMES, real);
  await wrapper.open('webllm/model'); await wrapper.open('webllm/wasm'); await wrapper.open('webllm/config'); await wrapper.open('other');
  assert.deepEqual(real.opened, [...WEBLLM_CACHES, 'other']);
  assert.equal(await wrapper.has('webllm/model'), true);
  assert.equal(await real.has('webllm/model'), false, 'the shared name was not created');
  assert.equal(await wrapper.delete('webllm/wasm'), true);
  assert.equal(await real.has('callscribe-webllm-wasm-v1'), false);
  assert.deepEqual((await wrapper.keys()).sort(), ['callscribe-webllm-config-v1', 'callscribe-webllm-model-v1', 'other'], 'keys lists real names');
  assert.equal(wrapper.resolveName('anything-else'), 'anything-else');
  assert.equal(wrapper.resolveName('constructor'), 'constructor', 'inherited object names are not mapped');
});

test('renameCaches maps a cacheName given to match', async () => {
  const seen = []; const real = { match: async (request, options) => { seen.push(options); } };
  const wrapper = renameCaches(WEBLLM_CACHE_RENAMES, real);
  await wrapper.match('u', { cacheName: 'webllm/model' }); await wrapper.match('u'); await wrapper.match('u', { ignoreSearch: true });
  assert.deepEqual(seen, [{ cacheName: 'callscribe-webllm-model-v1' }, undefined, { ignoreSearch: true }]);
});

test('the override takes effect on an accessor scope, and plain assignment would not have', async () => {
  const real = fakeCacheStorage();
  const plain = accessorScope(real);
  assert.throws(() => { plain.caches = {}; }, TypeError, 'strict assignment to the accessor throws');
  new Function('scope', 'scope.caches = {};')(plain); // sloppy assignment is silently ignored
  assert.equal(plain.caches, real, 'plain assignment did not change anything');
  const scope = accessorScope(real);
  const wrapper = installCachesRename(scope, WEBLLM_CACHE_RENAMES);
  assert.equal(scope.caches, wrapper);
  await scope.caches.open('webllm/model');
  assert.deepEqual(real.opened, ['callscribe-webllm-model-v1']);
});

test('installing fails closed when the override is blocked or the mapping is wrong', () => {
  const real = fakeCacheStorage();
  assert.throws(() => installCachesRename(accessorScope(real, { configurable: false }), WEBLLM_CACHE_RENAMES), /private cache names/);
  const scope = accessorScope(real);
  const wrapper = installCachesRename(scope, WEBLLM_CACHE_RENAMES);
  assert.throws(() => assertCachesRenamed(scope, wrapper, { 'webllm/model': 'something-else' }), /not in force/);
  assert.throws(() => assertCachesRenamed(accessorScope(real), wrapper, WEBLLM_CACHE_RENAMES), /did not accept/);
});

test('both Transformers.js workers use the shared app-specific cache and not the library default', async () => {
  for (const file of ['transcriber.worker.js', 'minutes.worker.v2.js']) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /env\.useCustomCache\s*=\s*true; env\.customCache\s*=\s*scopedCache\(TRANSFORMERS_CACHE\); env\.useBrowserCache\s*=\s*false/, file);
    assert.doesNotMatch(source, new RegExp(LEGACY_TRANSFORMERS_CACHE), file);
  }
});

// Pin test: the WebLLM wrapper depends on library internals. The package.json range allows minor upgrades, so this fails if one changes any of these.
test('the installed WebLLM bundle still uses the three cache names and caches.open that the wrapper renames', async () => {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@mlc-ai/web-llm');
  const bundle = await readFile(entry, 'utf8');
  for (const name of Object.keys(WEBLLM_CACHE_RENAMES)) assert.ok(bundle.includes(`"${name}"`), `${name} literal`);
  assert.match(bundle, /createArtifactCache\("webllm\/config"/);
  assert.match(bundle, /createArtifactCache\("webllm\/wasm"/);
  assert.match(bundle, /getTensorCacheAccessOptions\("webllm\/model"/);
  assert.match(bundle, /this\.cache = yield caches\.open\(this\.scope\)/, 'the Cache backend still opens caches through the global caches');
  const scopes = new Set([...bundle.matchAll(/"(webllm\/[a-z]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...scopes].sort(), Object.keys(WEBLLM_CACHE_RENAMES).sort(), 'no new webllm/ cache name has appeared');
});
