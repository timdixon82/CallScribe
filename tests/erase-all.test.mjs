import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseAllData } from '../src/erase-all.js';
import { putMeetingNotes, putMinutesRun, putModel, putParticipant, putScreenshot, putSegment, putSession, putSetting, getSessions, getParticipants, getModel, getSetting, getMeetingNotes, getMinutesRun, getScreenshot, getSegments } from '../src/store.js';

const fakeStorage = (entries) => { const data = new Map(Object.entries(entries)); return { get length() { return data.size; }, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), key: (i) => [...data.keys()][i], has: (k) => data.has(k), keys: () => [...data.keys()] }; };
// Object.keys(storage) is how real localStorage lists keys, so mirror it with a Proxy.
const asStorage = (entries) => { const s = fakeStorage(entries); return new Proxy(s, { ownKeys: () => s.keys(), getOwnPropertyDescriptor: (_t, k) => (s.has(k) ? { enumerable: true, configurable: true, value: s.getItem(k) } : undefined) }); };
const fakeCaches = (names) => { const live = new Set(names); return { keys: async () => [...live], delete: async (n) => live.delete(n), live }; };
const fakeWorker = (count) => { const state = { unregistered: 0 }; return { state, getRegistrations: async () => Array.from({ length: count }, () => ({ unregister: async () => { state.unregistered += 1; return true; } })) }; };

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
  const cacheStorage = fakeCaches(['transformers-cache', 'local-browser-transcriber-ocr-v1', 'callscribe-shell-abc', 'webllm/model']);
  const serviceWorker = fakeWorker(2);
  assert.deepEqual(await eraseAllData({ storage, cacheStorage, serviceWorker }), []);
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
  const failed = await eraseAllData({ storage: asStorage({}), cacheStorage, serviceWorker: fakeWorker(1) });
  assert.deepEqual(failed, ['downloaded model files and caches']);
  assert.deepEqual(await getSessions(), []);
});

test('erasing when nothing is stored, or when the browser lacks caches and a service worker, succeeds', async () => {
  assert.deepEqual(await eraseAllData({ storage: asStorage({}), cacheStorage: undefined, serviceWorker: undefined }), []);
});
