// SPIKE ONLY (T-O0b). Frame engine delivered as text by the parent, imported from a blob URL inside the frame.
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

const logs = [];
const log = (kind, detail) => { logs.push({ kind, detail: String(detail).slice(0, 300) }); };
addEventListener('error', (e) => log('error', e.message));
addEventListener('unhandledrejection', (e) => log('rejection', (e.reason && e.reason.message) || e.reason));
document.addEventListener('securitypolicyviolation', (e) => log('csp', `${e.violatedDirective} ${e.blockedURI}`));

let dictionary = '';
const realFetch = globalThis.fetch.bind(globalThis);
// shortcut: Guten OCR reads its dictionary with fetch(); this shim answers only the fake dict: address.
globalThis.fetch = (input, init) => (input === 'dict:' ? Promise.resolve(new Response(dictionary)) : realFetch(input, init));

let ocr;
const tryIt = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: `${e.name}: ${String(e.message).slice(0, 160)}` }; } };

async function probe(base) {
  const out = {};
  out.origin = self.origin; out.isSecureContext = self.isSecureContext; out.hasGpu = Boolean(navigator.gpu);
  out.eval = await tryIt(() => new Function('return 6*7')());
  out.fetchSelf = await tryIt(async () => (await realFetch(new URL('index.html', base))).status);
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
  return out;
}

const toText = (result) => (Array.isArray(result) ? result : Array.isArray(result?.texts) ? result.texts : []).map((l) => String(l.text || '').trim()).filter(Boolean).join('\n');

export async function start(msg, port, glueUrl) {
  port.onmessage = async (e) => {
    const { id, msg: m } = e.data;
    try {
      let value;
      if (m.type === 'probe') value = await probe(msg.base);
      else if (m.type === 'logs') value = logs;
      else if (m.type === 'recognise') value = toText(await ocr.detect({ data: new Uint8ClampedArray(m.pixels), width: m.width, height: m.height }));
      else throw new Error('bad-message');
      port.postMessage({ id, ok: true, value });
    } catch (err) { port.postMessage({ id, ok: false, error: `${err.name}: ${err.message}` }); }
  };
  try {
    dictionary = new TextDecoder().decode(msg.assets.dict);
    ort.env.wasm.wasmBinary = new Uint8Array(msg.assets.wasm);
    ort.env.wasm.wasmPaths = { mjs: glueUrl };
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const started = performance.now();
    ocr = await Ocr.create({
      models: { detectionPath: new Uint8Array(msg.assets.det), recognitionPath: new Uint8Array(msg.assets.rec), dictionaryPath: 'dict:' },
      onnxOptions: { executionProviders: ['wasm'] },
    });
    port.postMessage({ type: 'ready', ms: Math.round(performance.now() - started) });
  } catch (err) { port.postMessage({ type: 'init-error', error: `${err.name}: ${String(err.message).slice(0, 300)}`, logs }); }
}
