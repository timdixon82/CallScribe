import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, createOcrClient } from '../src/ocr.js';
import { BOOTSTRAP_VERSION, LIMITS, OCR_FILES, PROTOCOL_VERSION } from '../src/ocr-protocol.js';
import { sha256Hex } from '../src/model-manifest.js';

// A fake page environment and a fake frame. The real MessageChannel is used, so port behaviour is genuine.
const fileBytes = (path) => new TextEncoder().encode(`file:${path}`).buffer;
const hashes = Object.fromEntries(await Promise.all(Object.entries(OCR_FILES).map(async ([key, path]) => [key, await sha256Hex(fileBytes(path))])));
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const hello = (overrides = {}) => ({ type: 'hello', v: PROTOCOL_VERSION, bootstrap: BOOTSTRAP_VERSION, ...overrides });

function setup({ controller = true, build = { protocol: PROTOCOL_VERSION, bootstrap: BOOTSTRAP_VERSION, hashes }, tamper } = {}, timeouts = { hello: 60, init: 400, job: 400, idle: 60000 }) {
  const listeners = new Set();
  const frames = [];
  const env = {
    build,
    hasController: () => controller,
    loadAsset: async (path) => { const bytes = new Uint8Array(fileBytes(path)); if (tamper === path) bytes[0] ^= 1; return bytes.buffer; },
    sha256: sha256Hex,
    createFrame(onLoad) {
      const frame = { sent: [], removed: false, window: { postMessage: (data, target, transfer) => frame.sent.push({ data, target, transfer }) }, remove: () => { frame.removed = true; }, load: onLoad };
      frames.push(frame);
      return frame;
    },
    listen: (handler) => { listeners.add(handler); return () => listeners.delete(handler); },
    createChannel: () => new MessageChannel(),
    decodeBlob: async () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  const client = createOcrClient(env, timeouts);
  const send = (frame, data = hello(), extra = {}) => { for (const handler of [...listeners]) handler({ source: frame.window, origin: 'null', data, ...extra }); };
  // The frame side: take the port from the init message and answer like the real engine, or as the test directs.
  const attach = (frame, reply = (message, port) => port.postMessage({ type: 'result', v: 1, id: message.id, text: 'READ' })) => {
    const port = frame.sent[0].transfer[0];
    port.unref();
    const received = [];
    port.onmessage = (event) => { received.push(event.data); if (event.data.type === 'recognise') reply(event.data, port); };
    return { port, received, ready: () => port.postMessage({ type: 'ready', v: 1 }) };
  };
  const start = async () => { const pending = client.getOcr(); await wait(); const frame = frames.at(-1); send(frame); await wait(); const side = attach(frame); side.ready(); await pending; return { frame, side }; };
  return { client, env, frames, listeners, send, attach, start };
}
const image = () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) });

test('handshake: hello, one init with one port and only public files, then ready', async () => {
  const t = setup();
  const { frame } = await t.start();
  assert.equal(frame.sent.length, 1);
  const { data, target, transfer } = frame.sent[0];
  assert.equal(target, '*');
  assert.deepEqual(Object.keys(data).sort(), ['core', 'det', 'dict', 'glue', 'rec', 'type', 'v', 'wasm']);
  assert.equal(transfer.filter((item) => item instanceof MessagePort).length, 1);
  assert.equal(t.listeners.size, 0, 'window messages are ignored after the first hello');
  t.client.disposeOcr();
});

test('a changed byte in any verified file means no frame is created and nothing is sent', async () => {
  for (const key of Object.keys(OCR_FILES)) {
    const t = setup({ tamper: OCR_FILES[key] });
    await assert.rejects(t.client.getOcr(), { message: MESSAGES.integrity }, key);
    assert.equal(t.frames.length, 0, key);
  }
});

test('a build without hashes, or no service worker in control, fails closed with a plain message and no frame', async () => {
  const noBuild = setup({ build: null });
  await assert.rejects(noBuild.client.getOcr(), { message: MESSAGES.unavailable });
  const first = setup({ controller: false });
  await assert.rejects(first.client.getOcr(), { message: MESSAGES.setup });
  assert.equal(first.frames.length + noBuild.frames.length, 0);
});

test('hello from another window or origin is ignored; silence times out and removes the frame', async () => {
  const t = setup();
  const pending = t.client.getOcr();
  const outcome = assert.rejects(pending, { message: MESSAGES.setup });
  await wait();
  const frame = t.frames[0];
  t.send({ window: {} }, hello()); // a sibling window
  t.send(frame, hello(), { origin: 'https://example.com' });
  t.send(frame, hello({ extra: 1 }));
  t.send(frame, hello(), { source: {} });
  await outcome;
  assert.equal(frame.sent.length, 0);
  assert.equal(frame.removed, true);
});

test('a repeated hello does not trigger a second init', async () => {
  const t = setup();
  const { frame } = await t.start();
  t.send(frame);
  await wait();
  assert.equal(frame.sent.length, 1);
  t.client.disposeOcr();
});

test('a bootstrap or protocol version mismatch stops with the update message and sends nothing', async () => {
  for (const odd of [hello({ bootstrap: BOOTSTRAP_VERSION + 1 }), hello({ v: PROTOCOL_VERSION + 1 })]) {
    const t = setup();
    const pending = t.client.getOcr();
    const outcome = assert.rejects(pending, { message: MESSAGES.updating });
    await wait();
    t.send(t.frames[0], odd);
    await outcome;
    assert.equal(t.frames[0].sent.length, 0);
    assert.equal(t.frames[0].removed, true);
  }
});

test('a second load event removes the frame and stops text recognition until the page is reloaded', async () => {
  const t = setup();
  const { frame } = await t.start();
  frame.load();
  assert.equal(frame.removed, false, 'the first load is normal');
  frame.load();
  assert.equal(frame.removed, true);
  await assert.rejects(t.client.recogniseImage(image()), { message: MESSAGES.locked });
});

test('a bad message from the frame removes it and locks out', async () => {
  for (const bad of [{ type: 'result', v: 1, id: 1, text: 'x', extra: true }, 'text', { type: 'ready', v: 1, extra: 1 }]) {
    const t = setup();
    const { frame, side } = await t.start();
    side.port.postMessage(bad);
    await wait();
    assert.equal(frame.removed, true);
    await assert.rejects(t.client.getOcr(), { message: MESSAGES.locked });
  }
});

test('a message that carries a port is treated as a violation', async () => {
  const t = setup();
  const { frame, side } = await t.start();
  const spare = new MessageChannel();
  spare.port1.unref(); spare.port2.unref();
  side.port.postMessage({ type: 'ready', v: 1 }, [spare.port1]);
  await wait();
  assert.equal(frame.removed, true);
});

test('recognition sends only the pixels, one job at a time, and returns the frame text', async () => {
  const t = setup();
  const { frame, side } = await t.start();
  const answers = [];
  side.port.onmessage = (event) => { answers.push(event.data); };
  const one = t.client.recogniseImage(image());
  const two = t.client.recogniseImage(image());
  await wait();
  assert.equal(answers.length, 1, 'the second job waits for the first');
  assert.deepEqual(Object.keys(answers[0]).sort(), ['height', 'id', 'pixels', 'type', 'v', 'width']);
  assert.equal(answers[0].pixels.byteLength, 16);
  side.port.postMessage({ type: 'result', v: 1, id: answers[0].id + 99, text: 'WRONG' }); // unknown id: dropped
  side.port.postMessage({ type: 'result', v: 1, id: answers[0].id, text: 'y'.repeat(LIMITS.maxText + 10) });
  assert.equal((await one).length, LIMITS.maxText);
  await wait();
  assert.equal(answers.length, 2);
  side.port.postMessage({ type: 'result', v: 1, id: answers[1].id, text: 'SECOND' });
  assert.equal(await two, 'SECOND');
  assert.equal(frame.removed, false);
  t.client.disposeOcr();
});

test('the image the app holds is copied, not detached', async () => {
  const t = setup();
  const { side } = await t.start();
  side.port.onmessage = () => {};
  const source = image();
  const job = t.client.recogniseImage(source);
  job.catch(() => {});
  await wait();
  assert.equal(source.data.buffer.byteLength, 16);
  t.client.disposeOcr();
  await assert.rejects(job);
});

test('a timeout removes the frame, and the next job starts a fresh frame', async () => {
  const t = setup();
  const { side: firstSide } = await t.start();
  firstSide.port.onmessage = () => {}; // the frame never answers
  const first = t.frames[0];
  await assert.rejects(t.client.recogniseImage(image(), { timeoutMs: 30 }), { message: MESSAGES.timeout });
  assert.equal(first.removed, true);
  const next = t.client.recogniseImage(image());
  await wait();
  assert.equal(t.frames.length, 2, 'a new frame was created');
  t.send(t.frames[1]);
  await wait();
  const side = t.attach(t.frames[1], () => {});
  side.ready();
  await wait();
  assert.equal(side.received.at(-1).type, 'recognise');
  t.client.disposeOcr();
  await assert.rejects(next);
});

test('an error reply gives a plain message, never the frame text', async () => {
  const t = setup();
  const { side } = await t.start();
  side.port.onmessage = (event) => side.port.postMessage({ type: 'error', v: 1, id: event.data.id, code: 'engine', message: 'secret internals' });
  await assert.rejects(t.client.recogniseImage(image()), { message: MESSAGES.failed });
  t.client.disposeOcr();
});

test('an image that is too large, or not pixels, is refused before any frame work', async () => {
  const t = setup();
  await assert.rejects(t.client.recogniseImage({ width: 3000, height: 3000, data: new Uint8ClampedArray(3000 * 3000 * 4) }), /too large/);
  await assert.rejects(t.client.recogniseImage({ width: 2, height: 2, data: 'no' }), { message: MESSAGES.failed });
  assert.equal(t.frames.length, 0);
});

test('a Blob is decoded by the page, so the frame never parses image files', async () => {
  const t = setup();
  const { side } = await t.start();
  const seen = [];
  side.port.onmessage = (event) => { seen.push(event.data); side.port.postMessage({ type: 'result', v: 1, id: event.data.id, text: 'BLOB' }); };
  assert.equal(await t.client.recogniseImage(new Blob(['x'])), 'BLOB');
  assert.ok(seen[0].pixels instanceof ArrayBuffer);
  t.client.disposeOcr();
});

test('disposeOcr removes the frame, rejects the running job and is safe to call twice', async () => {
  const t = setup();
  const { frame, side } = await t.start();
  side.port.onmessage = () => {};
  const job = t.client.recogniseImage(image());
  await wait();
  t.client.disposeOcr();
  t.client.disposeOcr();
  assert.equal(frame.removed, true);
  await assert.rejects(job, { message: MESSAGES.stopped });
});

test('the idle timer removes the frame', async () => {
  const t = setup(undefined, { hello: 60, init: 400, job: 400, idle: 30 });
  const { frame } = await t.start();
  await wait(100);
  assert.equal(frame.removed, true);
});

test('a start error from the frame is reported plainly and removes the frame', async () => {
  const t = setup();
  const pending = t.client.getOcr();
  const outcome = assert.rejects(pending, { message: MESSAGES.failed });
  await wait();
  const frame = t.frames[0];
  t.send(frame);
  await wait();
  const side = t.attach(frame);
  side.port.postMessage({ type: 'error', v: 1, id: 0, code: 'engine', message: 'x' });
  await outcome;
  assert.equal(frame.removed, true);
});
