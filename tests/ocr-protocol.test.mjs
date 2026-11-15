import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, PROTOCOL_VERSION, checkImageSize, frameReply, parentRequest, parseFrameMessage, parseHello, parseParentMessage } from '../src/ocr-protocol.js';

const recognise = (extra = {}) => ({ ...parentRequest.recognise(1, 2, 2, new ArrayBuffer(16)), ...extra });

test('a good recognise request passes and keeps only its own fields', () => {
  const parsed = parseParentMessage(recognise());
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.value).sort(), ['height', 'id', 'pixels', 'type', 'width']);
});

test('the frame refuses extra keys, wrong types, wrong versions and unknown types', () => {
  for (const bad of [recognise({ extra: 1 }), recognise({ id: '1' }), recognise({ id: -1 }), recognise({ width: 2.5 }), recognise({ pixels: new Uint8Array(16) }), recognise({ v: 2 }), recognise({ type: 'run' }), null, 'text', [], Object.create({ type: 'recognise' })]) {
    assert.deepEqual(parseParentMessage(bad), { ok: false, code: 'bad-message' });
  }
});

test('the frame refuses oversize images and a pixel buffer that does not match the size', () => {
  assert.equal(parseParentMessage(recognise({ width: LIMITS.maxEdge + 1, pixels: new ArrayBuffer((LIMITS.maxEdge + 1) * 8) })).code, 'too-large');
  assert.equal(parseParentMessage(recognise({ pixels: new ArrayBuffer(15) })).code, 'bad-message');
  assert.equal(parseParentMessage(recognise({ width: 0, pixels: new ArrayBuffer(0) })).code, 'bad-message');
  assert.equal(parseParentMessage(recognise({ width: 2048, height: 2048, pixels: new ArrayBuffer(2048 * 2048 * 4) })).ok, true); // exactly the 16 MiB cap
});

test('cancel needs exactly its keys', () => {
  assert.equal(parseParentMessage(parentRequest.cancel(3)).ok, true);
  assert.equal(parseParentMessage({ ...parentRequest.cancel(3), width: 1 }).ok, false);
});

test('the page accepts only the three frame messages, with exact keys, and truncates text and messages', () => {
  assert.deepEqual(parseFrameMessage(frameReply.ready()), { type: 'ready' });
  assert.deepEqual(parseFrameMessage(frameReply.result(4, 'hi')), { type: 'result', id: 4, text: 'hi' });
  assert.equal(parseFrameMessage({ ...frameReply.result(4, 'x'.repeat(LIMITS.maxText + 50)) }).text.length, LIMITS.maxText);
  assert.equal(parseFrameMessage({ type: 'result', v: 1, id: 1, text: 'x'.repeat(LIMITS.maxText + 50) }).text.length, LIMITS.maxText);
  assert.equal(parseFrameMessage({ type: 'error', v: 1, id: 1, code: 'engine', message: 'm'.repeat(500) }).message.length, LIMITS.maxMessage);
  const bad = [{ ...frameReply.result(1, 'x'), extra: 1 }, { ...frameReply.result(1, 'x'), text: 5 }, { ...frameReply.result(1, 'x'), id: 1.5 }, { ...frameReply.error(1, 'engine', 'm'), code: 'other' }, { ...frameReply.ready(), v: 9 }, { type: 'result', v: 1, id: 1, text: { toString: () => 'x' } }, { type: 'result', v: 1, id: 1, text: new ArrayBuffer(4) }, { type: 'run', v: 1 }, 'text', null, 7];
  for (const message of bad) assert.equal(parseFrameMessage(message), null);
});

test('hello needs exact keys and numeric versions', () => {
  assert.deepEqual(parseHello({ type: 'hello', v: PROTOCOL_VERSION, bootstrap: 1 }), { protocol: 1, bootstrap: 1 });
  for (const bad of [{ type: 'hello', v: 1 }, { type: 'hello', v: 1, bootstrap: '1' }, { type: 'hello', v: 1, bootstrap: 1, base: 'x' }, { type: 'init', v: 1, bootstrap: 1 }, null]) assert.equal(parseHello(bad), null);
});

test('the page refuses to send an image the frame would refuse', () => {
  assert.doesNotThrow(() => checkImageSize(10, 10, 400));
  for (const args of [[0, 10, 0], [10, 10, 399], [3000, 10, 120000], [2049, 1, 2049 * 4]]) assert.throws(() => checkImageSize(...args), /too large/);
});
