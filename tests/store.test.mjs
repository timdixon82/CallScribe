import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMeetingNotes, getMinutesRun, getScreenshots, getSegments, getSessions, putMeetingNotes, putMinutesRun, putScreenshot, putSegment, putSession, putSessionBundle, removeSessionCascade } from '../src/store.js';

async function seed(id) {
  await putSession({ id, name: id });
  await putSegment({ id: `${id}-s1`, sessionId: id, text: 'a' });
  await putSegment({ id: `${id}-s2`, sessionId: id, text: 'b' });
  await putScreenshot({ id: `${id}-p1`, sessionId: id, blob: new Blob(['x']) });
  await putMeetingNotes({ sessionId: id, content: 'notes' });
  await putMinutesRun({ sessionId: id });
}

test('put and get round-trip for sessions and segments', async () => {
  await seed('basic');
  assert.ok((await getSessions()).some((item) => item.id === 'basic'));
  assert.equal((await getSegments('basic')).length, 2);
  assert.equal((await getScreenshots('basic')).length, 1);
});

test('cascade delete removes every row of one session and leaves others', async () => {
  await seed('gone'); await seed('kept');
  await removeSessionCascade('gone');
  assert.ok(!(await getSessions()).some((item) => item.id === 'gone'));
  assert.equal((await getSegments('gone')).length, 0);
  assert.equal((await getScreenshots('gone')).length, 0);
  assert.equal(await getMeetingNotes('gone'), undefined);
  assert.equal(await getMinutesRun('gone'), undefined);
  assert.equal((await getSegments('kept')).length, 2);
  assert.equal((await getScreenshots('kept')).length, 1);
  assert.ok(await getMeetingNotes('kept'));
  assert.ok(await getMinutesRun('kept'));
});

test('cascade delete of an unknown session succeeds and changes nothing', async () => {
  await removeSessionCascade('never-existed');
});

test('a bundle write that fails stores nothing', async () => {
  await assert.rejects(putSessionBundle({ session: { id: 'bad' }, segments: [{ id: 'bad-1', sessionId: 'bad' }], screenshots: [{ id: 'bad-p', sessionId: 'bad', blob: () => {} }] }));
  assert.ok(!(await getSessions()).some((item) => item.id === 'bad'));
  assert.equal((await getSegments('bad')).length, 0);
});

test('the unused per-store delete helpers are gone', async () => {
  const store = await import('../src/store.js');
  for (const name of ['removeSession', 'deleteSegments', 'deleteScreenshots', 'deleteMeetingNotes']) assert.equal(store[name], undefined, name);
});
