// SPIKE ONLY. Not part of the app. Sandboxed OCR frame prototype.
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

const logs = [];
const log = (kind, detail) => { logs.push({ kind, detail: String(detail).slice(0, 300) }); };
window.addEventListener('error', (e) => log('error', e.message));
window.addEventListener('unhandledrejection', (e) => log('rejection', e.reason && e.reason.message || e.reason));
document.addEventListener('securitypolicyviolation', (e) => log('csp', `${e.violatedDirective} ${e.blockedURI}`));

let dictionary = '';
const realFetch = globalThis.fetch.bind(globalThis);
// shortcut: Guten OCR reads its dictionary with fetch(); this shim answers only the fake dict: address, other URLs go to the real fetch.
globalThis.fetch = (input, init) => (input === 'dict:' ? Promise.resolve(new Response(dictionary)) : realFetch(input, init));

let ocr;
const tryIt = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: `${e.name}: ${String(e.message).slice(0, 160)}` }; } };

async function probe() {
  const out = {};
  out.origin = self.origin; out.isSecureContext = self.isSecureContext; out.hasGpu = Boolean(navigator.gpu);
  out.eval = await tryIt(() => new Function('return 6*7')());
  out.wasm = await tryIt(async () => { await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return true; });
  out.fetchSelf = await tryIt(async () => (await realFetch(new URL('index.html', location.href))).status);
  out.fetchExternal = await tryIt(async () => (await realFetch('https://example.com/')).status);
  out.fetchBlob = await tryIt(async () => (await realFetch(URL.createObjectURL(new Blob(['x'])))).status);
  out.websocket = await tryIt(() => new Promise((resolve, reject) => { const ws = new WebSocket('wss://example.com/'); ws.onopen = () => resolve('open'); ws.onerror = () => reject(new Error('websocket error')); setTimeout(() => reject(new Error('websocket timeout')), 3000); }));
  out.beacon = await tryIt(() => navigator.sendBeacon('https://example.com/', 'x'));
  out.importExternal = await tryIt(() => import(/* @vite-ignore */ 'https://example.com/x.js'));
  out.indexedDB = await tryIt(() => new Promise((resolve, reject) => { const r = indexedDB.open('spike-db'); r.onsuccess = () => resolve([...r.result.objectStoreNames]); r.onerror = () => reject(r.error); }));
  out.localStorage = await tryIt(() => localStorage.getItem('spike-key'));
  out.caches = await tryIt(async () => caches.keys());
  out.cookie = await tryIt(() => document.cookie);
  out.parentDocument = await tryIt(() => parent.document.title);
  out.serviceWorker = await tryIt(() => (navigator.serviceWorker ? 'present' : 'absent'));
  out.workerBlob = await tryIt(() => { const w = new Worker(URL.createObjectURL(new Blob(['1'], { type: 'text/javascript' }))); w.terminate(); return 'created'; });
  return out;
}

function toText(result) {
  const lines = Array.isArray(result) ? result : Array.isArray(result?.texts) ? result.texts : [];
  return lines.map((l) => String(l.text || '').trim()).filter(Boolean).join('\n');
}

async function handle(port, msg) {
  if (msg.type === 'probe') return probe();
  if (msg.type === 'logs') return logs;
  if (msg.type === 'navigate') { location.href = msg.url; return 'requested'; }
  if (msg.type === 'recognise') {
    if (!ocr) throw new Error('no ocr');
    const data = new Uint8ClampedArray(msg.pixels);
    const result = await ocr.detect({ data, width: msg.width, height: msg.height });
    return toText(result);
  }
  throw new Error('bad-message');
}

async function init(msg, port) {
  dictionary = new TextDecoder().decode(msg.assets.dict);
  ort.env.wasm.wasmBinary = new Uint8Array(msg.assets.wasm);
  ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const started = performance.now();
  ocr = await Ocr.create({
    models: { detectionPath: new Uint8Array(msg.assets.det), recognitionPath: new Uint8Array(msg.assets.rec), dictionaryPath: 'dict:' },
    onnxOptions: { executionProviders: ['wasm'] },
  });
  return Math.round(performance.now() - started);
}

if (self.origin === 'null' && parent !== window) {
  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'init') return;
    const port = event.ports[0];
    port.onmessage = async (e) => {
      const { id, msg } = e.data;
      try { port.postMessage({ id, ok: true, value: await handle(port, msg) }); } catch (err) { port.postMessage({ id, ok: false, error: `${err.name}: ${err.message}` }); }
    };
    init(event.data, port).then((ms) => port.postMessage({ type: 'ready', ms }), (err) => port.postMessage({ type: 'init-error', error: `${err.name}: ${String(err.message).slice(0, 300)}`, logs }));
  });
  parent.postMessage({ type: 'hello', v: 1 }, '*');
}
