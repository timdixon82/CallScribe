import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eraseAllData } from '../src/erase-all.js';
import { OCR_CACHE, SHELL_CACHE_PREFIX } from '../src/cache-names.js';
import { DIARIZER, HF_REVISIONS } from '../src/model-manifest.js';
import { fakeCacheStorage } from './fake-cache-storage.mjs';

const BASE = 'https://example.github.io/Local-Call-Transcriber/';
import { putMeetingNotes, putMinutesRun, putModel, putParticipant, putScreenshot, putSegment, putSession, putSetting, getSessions, getParticipants, getModel, getSetting, getMeetingNotes, getMinutesRun, getScreenshot, getSegments } from '../src/store.js';

const fakeStorage = (entries) => { const data = new Map(Object.entries(entries)); return { get length() { return data.size; }, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), key: (i) => [...data.keys()][i], has: (k) => data.has(k), keys: () => [...data.keys()] }; };
// Object.keys(storage) is how real localStorage lists keys, so mirror it with a Proxy.
const asStorage = (entries) => { const s = fakeStorage(entries); return new Proxy(s, { ownKeys: () => s.keys(), getOwnPropertyDescriptor: (_t, k) => (s.has(k) ? { enumerable: true, configurable: true, value: s.getItem(k) } : undefined) }); };
const fakeCaches = (names) => { const live = new Set(names); return { keys: async () => [...live], delete: async (n) => live.delete(n), has: async (n) => live.has(n), open: async () => ({ keys: async () => [], delete: async () => false }), live }; };
const pinnedUrl = `https://huggingface.co/onnx-community/whisper-tiny/resolve/${HF_REVISIONS['onnx-community/whisper-tiny']}/onnx/model.onnx`;
const fakeWorker = (count, scopes = []) => { const state = { unregistered: 0, survivors: [] }; const own = Array.from({ length: count }, () => ({ scope: BASE, unregister: async () => { state.unregistered += 1; return true; } })); const foreign = scopes.map((scope) => ({ scope, unregister: async () => { state.survivors.push(scope); return true; } })); return { state, getRegistrations: async () => [...own, ...foreign] }; };

async function fill() {
  await putSession({ id: 's1', name: 'Synthetic', startedAt: 1 });
  await putSegment({ id: 'g1', sessionId: 's1', text: 'Hello' });
  await putScreenshot({ id: 'p1', sessionId: 's1', blob: new Blob(['x']) });
  await putMeetingNotes({ sessionId: 's1', content: 'notes' });
  await putMinutesRun({ sessionId: 's1' });
  await putParticipant({ id: 'a1', name: 'Alex' });
  await putModel({ id: 'm1', ready: true });
  await putSetting('theme', 'dark');
}

test('erase all empties every store, the app caches and settings keys, and unregisters the service worker', async () => {
  await fill();
  const storage = asStorage({ localBrowserTranscriberTheme: 'dark', localBrowserTranscriberOcrEnabled: 'true', unrelatedKey: 'keep' });
  const cacheStorage = fakeCaches(['callscribe-transformers-v1', 'callscribe-webllm-model-v1', 'local-browser-transcriber-ocr-v1', 'callscribe-shell-abc']);
  const serviceWorker = fakeWorker(2);
  assert.deepEqual(await eraseAllData({ storage, cacheStorage, serviceWorker, base: BASE }), []);
  assert.deepEqual(await getSessions(), []);
  assert.deepEqual(await getSegments('s1'), []);
  assert.equal(await getScreenshot('p1'), undefined);
  assert.equal(await getMeetingNotes('s1'), undefined);
  assert.equal(await getMinutesRun('s1'), undefined);
  assert.deepEqual(await getParticipants(), []);
  assert.equal(await getModel('m1'), undefined);
  assert.equal(await getSetting('theme'), undefined);
  assert.deepEqual([...cacheStorage.live], []);
  assert.equal(serviceWorker.state.unregistered, 2);
  assert.equal(storage.has('localBrowserTranscriberTheme'), false);
  assert.equal(storage.has('localBrowserTranscriberOcrEnabled'), false);
  assert.equal(storage.has('unrelatedKey'), true, 'keys the app did not write are left alone');
});

test('a failing step is reported by name and the other steps still run', async () => {
  await fill();
  const cacheStorage = { keys: async () => { throw new Error('denied'); } };
  const failed = await eraseAllData({ storage: asStorage({}), cacheStorage, serviceWorker: fakeWorker(1), base: BASE });
  assert.deepEqual(failed, ['downloaded model files and caches']);
  assert.deepEqual(await getSessions(), []);
});

test('erasing when nothing is stored, or when the browser lacks caches and a service worker, succeeds', async () => {
  assert.deepEqual(await eraseAllData({ storage: asStorage({}), cacheStorage: undefined, serviceWorker: undefined, base: BASE }), []);
});

test('caches and service workers that belong to other sites on the same host survive', async () => {
  const cacheStorage = fakeCaches(['transformers-cache', 'callscribe-transformers-v1', 'callscribe-shell-x', 'local-browser-transcriber-nemotron-v2', 'webllm/model', 'other-site-cache', 'workbox-precache', 'transformers-cache-extra']);
  const serviceWorker = fakeWorker(1, ['https://example.github.io/', 'https://example.github.io/other-project/', 'https://example.github.io/Local-Call-Transcriber-fork/']);
  assert.deepEqual(await eraseAllData({ storage: asStorage({}), cacheStorage, serviceWorker, base: BASE }), []);
  assert.deepEqual([...cacheStorage.live].sort(), ['other-site-cache', 'transformers-cache', 'transformers-cache-extra', 'webllm/model', 'workbox-precache'], 'the library default names are shared, so they survive');
  assert.equal(serviceWorker.state.unregistered, 1);
  assert.deepEqual(serviceWorker.state.survivors, [], 'foreign registrations were not unregistered');
});

test('the cache names used elsewhere in the app match the shared constants', async () => {
  assert.ok(DIARIZER.cache.startsWith('local-browser-transcriber-'));
  assert.ok(OCR_CACHE.startsWith('local-browser-transcriber-'));
  assert.match(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), new RegExp(`'${SHELL_CACHE_PREFIX}`));
});

test('erase all removes the text recognition frame before anything else, and names it if that fails', async () => {
  const order = [];
  const serviceWorker = { getRegistrations: async () => { order.push('worker'); return []; } };
  const failed = await eraseAllData({ storage: asStorage({}), cacheStorage: fakeCaches([]), serviceWorker, base: BASE, disposeOcr: async () => { order.push('ocr'); } });
  assert.deepEqual(failed, []);
  assert.deepEqual(order, ['ocr', 'worker']);
  const broken = await eraseAllData({ storage: asStorage({}), cacheStorage: fakeCaches([]), serviceWorker: fakeWorker(0), base: BASE, disposeOcr: async () => { throw new Error('x'); } });
  assert.deepEqual(broken, ['the text recognition frame']);
});

test('erase all removes this app\'s pinned entries from the old shared caches and leaves the caches and foreign entries', async () => {
  const cacheStorage = fakeCacheStorage({ 'transformers-cache': { [pinnedUrl]: {}, 'https://huggingface.co/someone-else/model/resolve/main/m.onnx': {} }, 'webllm/model': { [pinnedUrl.replace('whisper-tiny', 'whisper-tiny-foo')]: {} }, 'callscribe-transformers-v1': { [pinnedUrl]: {} } });
  assert.deepEqual(await eraseAllData({ storage: asStorage({}), cacheStorage, serviceWorker: fakeWorker(0), base: BASE }), []);
  assert.deepEqual(await cacheStorage.keys(), ['transformers-cache', 'webllm/model']);
  assert.deepEqual(cacheStorage.urls('transformers-cache'), ['https://huggingface.co/someone-else/model/resolve/main/m.onnx']);
  assert.equal(cacheStorage.urls('webllm/model').length, 1, 'a near-miss URL is not this app\'s');
});

test('the old-cache sweep still runs when deleting the app caches fails, and the failure is reported', async () => {
  const cacheStorage = fakeCacheStorage({ 'transformers-cache': { [pinnedUrl]: {} }, 'callscribe-transformers-v1': {} });
  const failing = { ...cacheStorage, delete: async () => { throw new Error('denied'); } };
  assert.deepEqual(await eraseAllData({ storage: asStorage({}), cacheStorage: failing, serviceWorker: fakeWorker(0), base: BASE }), ['downloaded model files and caches']);
  assert.deepEqual(cacheStorage.urls('transformers-cache'), []);
});
