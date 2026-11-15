import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BOOTSTRAP_VERSION, OCR_FILES, PROTOCOL_VERSION } from '../src/ocr-protocol.js';
import { bootstrapSource, buildFramePage, sha256Source } from '../scripts/ocr-frame-page.mjs';

const root = new URL('../', import.meta.url).pathname;
const swSource = readFileSync(join(root, 'public/sw.js'), 'utf8');

// ---- the frame page ----------------------------------------------------------------------------------------------

test('the frame page carries its own policy: eval allowed, no network, one hashed inline script', () => {
  const { html, policy, hash, source } = buildFramePage();
  assert.match(policy, /script-src 'sha256-[A-Za-z0-9+/=]+' blob: 'unsafe-eval' 'wasm-unsafe-eval'/);
  assert.match(policy, /connect-src 'none'/);
  assert.doesNotMatch(policy, /https?:|\*/);
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /worker-src 'none'/);
  assert.equal(html.match(/<script/g).length, 1, 'exactly one script element');
  assert.doesNotMatch(html.replace(/<script>[\s\S]*<\/script>/, ''), /<script|<style|<link|<img|<iframe|\son[a-z]+=/i);
  const inline = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.equal(inline, source);
  assert.equal(`'sha256-${createHash('sha256').update(inline, 'utf8').digest('base64')}'`, hash, 'the policy hash matches the script exactly');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script>'), 'the policy comes before the script');
});

test('the bootstrap source has no unreplaced token, no closing script tag, and reports the protocol and bootstrap versions', () => {
  const source = bootstrapSource();
  assert.doesNotMatch(source, /__[A-Z_]+__|<\/script/i);
  assert.match(source, new RegExp(`const PROTOCOL_VERSION = ${PROTOCOL_VERSION};`));
  assert.match(source, new RegExp(`const BOOTSTRAP_VERSION = ${BOOTSTRAP_VERSION};`));
  assert.throws(() => bootstrapSource('x __OTHER__ y'), /unreplaced/);
  assert.throws(() => bootstrapSource('</script>'), /unreplaced|closing/);
});

// ---- the bootstrap, run against fake sandbox globals -------------------------------------------------------------

function runBootstrap({ origin = 'null', framed = true, storageThrows = true, cookieThrows = true } = {}) {
  const parent = { posted: [], postMessage(data, target) { this.posted.push({ data, target }); } };
  const win = { parent };
  if (!framed) win.parent = win;
  const handlers = [];
  const throwing = (name) => { throw new DOMException(`${name} is denied`, 'SecurityError'); };
  const context = {
    self: { origin }, window: win, addEventListener: (type, handler) => handlers.push({ type, handler }), URL, Blob,
    document: Object.defineProperty({}, 'cookie', { get: () => (cookieThrows ? throwing('cookie') : '') }),
  };
  Object.defineProperty(context, 'localStorage', { get: () => (storageThrows ? throwing('localStorage') : { getItem: () => null }) });
  vm.runInNewContext(bootstrapSource(), context);
  return { parent, win, handlers, message: (event) => handlers.find((entry) => entry.type === 'message')?.handler(event) };
}

test('the bootstrap greets the parent once, with both versions, when it really is in an opaque sandbox', () => {
  const run = runBootstrap();
  assert.equal(run.parent.posted.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(run.parent.posted[0].data)), { type: 'hello', v: PROTOCOL_VERSION, bootstrap: BOOTSTRAP_VERSION });
  assert.equal(run.handlers.length, 1);
});

test('the bootstrap does nothing at all if any of its three checks fails', () => {
  for (const options of [{ origin: 'https://example.test' }, { framed: false }, { storageThrows: false }, { cookieThrows: false }]) {
    const run = runBootstrap(options);
    assert.equal(run.parent.posted.length, 0, JSON.stringify(options));
    assert.equal(run.handlers.length, 0, JSON.stringify(options));
  }
});

test('the bootstrap considers only the first init from its parent, and needs exactly one port', async () => {
  const buffers = Object.fromEntries(['core', 'glue', 'wasm', 'det', 'rec', 'dict'].map((name) => [name, new ArrayBuffer(4)]));
  const init = { type: 'init', v: PROTOCOL_VERSION, ...buffers };
  const port = () => ({ posted: [], postMessage(data) { this.posted.push(data); } });
  // Not from the parent: ignored and does not use up the one chance.
  const run = runBootstrap();
  const first = port();
  await run.message({ source: {}, data: init, ports: [first] });
  assert.equal(first.posted.length, 0);
  // Two ports: refused with an error on neither (no port to trust), and the chance is used up.
  await run.message({ source: run.win.parent, data: init, ports: [port(), port()] });
  const later = port();
  await run.message({ source: run.win.parent, data: init, ports: [later] });
  assert.equal(later.posted.length, 0, 'a later init is ignored');
  // A malformed init with one port gets an error on that port, once.
  const second = runBootstrap();
  const bad = port();
  await second.message({ source: second.win.parent, data: { ...init, extra: 1 }, ports: [bad] });
  await second.message({ source: second.win.parent, data: init, ports: [port()] });
  assert.equal(bad.posted.length, 1);
  assert.equal(bad.posted[0].code, 'engine');
});

// ---- the service worker ------------------------------------------------------------------------------------------

function loadWorker(page = buildFramePage().html, source = swSource) {
  const handlers = {};
  const touched = [];
  const self = { registration: { scope: 'https://example.test/app/' }, location: { origin: 'https://example.test' }, addEventListener: (type, handler) => { handlers[type] = handler; }, clients: { claim() {} }, skipWaiting() {} };
  const caches = { open: async (name) => { touched.push(name); return { addAll: async () => {}, put: async () => {} }; }, match: async () => undefined, keys: async () => [], delete: async () => true };
  const network = async () => new Response('from the network', { status: 200 });
  vm.runInNewContext(source.replace("'__OCR_FRAME_PAGE__'", () => JSON.stringify(page)), { self, caches, URL, Response, Headers, fetch: network });
  const fetchEvent = (url, init = {}) => {
    let answer;
    handlers.fetch({ request: { url, method: 'GET', mode: 'navigate', destination: 'iframe', ...init }, respondWith: (value) => { answer = Promise.resolve(value); } });
    return answer;
  };
  return { fetchEvent, touched, page };
}
const FRAME = 'https://example.test/app/ocr-frame.html';

test('the worker serves the frame page to an iframe navigation with the exact constant headers', async () => {
  const { fetchEvent, page } = loadWorker();
  const response = await fetchEvent(FRAME);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), page);
  assert.equal(response.headers.get('content-security-policy'), 'sandbox allow-scripts');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.redirected, false);
});

test('a query string changes nothing: no reflected input, no other header, same body', async () => {
  const { fetchEvent, page } = loadWorker();
  for (const query of ['?sbx=1', '?x-frame-policy=allow-same-origin', '?a=%0d%0aSet-Cookie:%20x=1', '#fragment']) {
    const response = await fetchEvent(`${FRAME}${query}`);
    assert.equal(response.headers.get('content-security-policy'), 'sandbox allow-scripts', query);
    assert.equal(await response.text(), page, query);
    assert.deepEqual([...response.headers.keys()].sort(), ['cache-control', 'content-security-policy', 'content-type', 'referrer-policy', 'x-content-type-options'], query);
  }
});

test('only an iframe GET navigation gets the page; everything else on that path gets a plain 404', async () => {
  const { fetchEvent } = loadWorker();
  for (const init of [{ destination: 'document' }, { mode: 'cors', destination: '' }, { mode: 'no-cors', destination: 'script' }, { method: 'POST' }, { method: 'HEAD' }]) {
    const response = await fetchEvent(FRAME, init);
    assert.equal(response.status, 404, JSON.stringify(init));
    assert.equal(response.headers.get('content-security-policy'), null);
    assert.doesNotMatch(await response.text(), /unsafe-eval|<script/);
  }
});

test('other paths are not the frame: no header, no page, and nothing is cached for the frame', async () => {
  const { fetchEvent, touched } = loadWorker();
  for (const path of ['/app/ocr-frame.html.bak', '/app/ocr-frame.htm', '/app/x/ocr-frame.html', '/ocr-frame.html', '/app/OCR-FRAME.html', '/app/ocr-frame.html/', '/app/index.html']) {
    const response = await fetchEvent(`https://example.test${path}`);
    assert.equal(response.headers.get('content-security-policy'), null, path);
    assert.equal(await response.text(), 'from the network', path);
  }
  assert.equal(fetchEvent(FRAME.replace('example.test', 'other.test')), undefined, 'cross-origin requests are left alone');
  touched.length = 0;
  await fetchEvent(FRAME);
  assert.deepEqual(touched, [], 'the frame path touches no cache');
});

test('a worker whose build never stamped the frame page serves no page at all', async () => {
  const { fetchEvent } = loadWorker('placeholder text that is not a page');
  const response = await fetchEvent(FRAME);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('content-security-policy'), null);
});

test('the worker reads the policy only from its own constants', () => {
  assert.doesNotMatch(swSource, /headers\.get\(|searchParams|\.search\b|\.hash\b/);
  assert.equal([...swSource.matchAll(/'sandbox allow-scripts'/g)].length, 1);
});

// ---- the built output (skipped when the app has not been built) --------------------------------------------------

const dist = join(root, 'dist');
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

test('the build ships no static frame page, and no file but the worker carries an unsafe-eval policy', { skip: !existsSync(join(dist, 'sw.js')) }, () => {
  const files = walk(dist);
  assert.deepEqual(files.filter((file) => /ocr-frame/i.test(file)), []);
  const text = files.filter((file) => !/\.(wasm|onnx|png)$/.test(file));
  const carriers = text.filter((file) => readFileSync(file, 'utf8').includes("'unsafe-eval'")).map((file) => file.slice(dist.length));
  assert.deepEqual(carriers, ['/sw.js']);
});

test('the built worker holds the frame page whose script hash matches, and the page holds the files hashes the build computed', { skip: !existsSync(join(dist, 'sw.js')) }, () => {
  const worker = readFileSync(join(dist, 'sw.js'), 'utf8');
  assert.doesNotMatch(worker, /__OCR_FRAME_PAGE__|__BUILD_ID__/);
  const stamped = JSON.parse(worker.match(/const FRAME_PAGE = (".*");/)[1]);
  assert.equal(stamped, buildFramePage().html);
  const hash = stamped.match(/script-src ('sha256-[^']+')/)[1];
  assert.equal(hash, sha256Source(bootstrapSource()));
  const chunk = readdirSync(join(dist, 'assets')).filter((name) => /^ocr-.*\.js$/.test(name)).map((name) => readFileSync(join(dist, 'assets', name), 'utf8'))[0];
  const built = Object.fromEntries(Object.entries(OCR_FILES).map(([key, path]) => [key, createHash('sha256').update(readFileSync(join(dist, path))).digest('hex')]));
  for (const [key, value] of Object.entries(built)) assert.ok(chunk.includes(`${key}:"${value}"`), `the page holds the current ${key} hash`);
});
