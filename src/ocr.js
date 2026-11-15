// Text recognition client. The engine runs in an isolated frame with no network and no storage (see
// src/ocr-frame-core.js and docs/known-limitations.md). This file is the page side: it checks that the service worker is in
// control, verifies every file against its build-time SHA-256, starts the frame, and sends it nothing but image pixels.
import { OCR_CACHE } from './cache-names.js';
import { sha256Hex } from './model-manifest.js';
import { BOOTSTRAP_VERSION, FRAME_PATH, OCR_FILES, PROTOCOL_VERSION, checkImageSize, parentRequest, parseFrameMessage, parseHello } from './ocr-protocol.js';

export const MESSAGES = {
  setup: 'Text recognition needs the app to finish setting up. Reload the page once, then try again.',
  updating: 'The app is updating. Reload the page to finish, then try again.',
  integrity: 'The text recognition files did not pass a safety check. Reload the page and try again. If it keeps happening, remove local OCR in Settings and turn it on again.',
  unavailable: 'Text recognition is not available in this copy of the app.',
  locked: 'Text recognition was stopped for safety after an unexpected reply. Reload the page to use it again.',
  timeout: 'Text recognition took too long and was stopped. Try again.',
  failed: 'Text recognition could not read this screenshot.',
  stopped: 'Text recognition was stopped.',
};
class OcrError extends Error {}

const TIMEOUTS = { hello: 5000, init: 120000, job: 60000, idle: 300000 };
const BLOB_MAX_EDGE = 1280;

/**
 * Build a client around an environment. The real environment is browserEnv() below; tests pass a fake one.
 * env: { build, hasController(), loadAsset(path), sha256(buffer), createFrame(onLoad), listen(handler), createChannel(),
 *        decodeBlob(blob), setTimeout, clearTimeout }
 */
export function createOcrClient(env, timeouts = {}) {
  const limit = { ...TIMEOUTS, ...timeouts };
  let session = null;
  let starting = null;
  let epoch = 0;
  let lockedOut = false; // set after a sign of compromise; cleared only by reloading the page
  let nextId = 1;
  let queue = Promise.resolve();

  function dispose(error) {
    epoch += 1;
    starting = null;
    const current = session;
    session = null;
    if (!current) return;
    current.closed = true;
    current.stopListening();
    env.clearTimeout(current.timer);
    current.port.onmessage = null;
    current.port.close();
    current.frame.remove();
    current.waiter?.reject(error || new OcrError(MESSAGES.stopped));
  }
  const violation = (why) => { console.warn('OCR frame removed:', why); lockedOut = true; dispose(new OcrError(MESSAGES.locked)); };

  async function loadVerified() {
    const hashes = env.build.hashes;
    const entries = await Promise.all(Object.entries(OCR_FILES).map(async ([key, path]) => {
      const buffer = await env.loadAsset(path);
      if (!(buffer instanceof ArrayBuffer) || !hashes[key] || await env.sha256(buffer) !== hashes[key]) throw new OcrError(MESSAGES.integrity);
      return [key, buffer];
    }));
    return Object.fromEntries(entries);
  }

  function armIdle(current) {
    env.clearTimeout(current.timer);
    current.timer = env.setTimeout(() => { if (session === current && !current.waiter) dispose(); }, limit.idle);
  }

  function connect(files) {
    return new Promise((resolve, reject) => {
      const channel = env.createChannel();
      let loads = 0;
      let greeted = false;
      const frame = env.createFrame(() => { loads += 1; if (loads > 1) violation('second load'); });
      const current = { frame, port: channel.port1, closed: false, isReady: false, waiter: { reject, resolve, ready: true }, timer: undefined, stopListening: () => {} };
      session = current;
      current.timer = env.setTimeout(() => dispose(new OcrError(MESSAGES.setup)), limit.hello);
      current.stopListening = env.listen((event) => {
        if (greeted || current.closed || event.source !== frame.window || event.origin !== 'null') return;
        const hello = parseHello(event.data);
        if (!hello) return;
        greeted = true;
        current.stopListening(); // every later window message is ignored
        if (hello.protocol !== PROTOCOL_VERSION || hello.bootstrap !== BOOTSTRAP_VERSION) { dispose(new OcrError(MESSAGES.updating)); return; }
        env.clearTimeout(current.timer);
        current.timer = env.setTimeout(() => dispose(new OcrError(MESSAGES.setup)), limit.init);
        // The start message holds only public program files. No user data, setting or token is ever put in it.
        frame.window.postMessage({ type: 'init', v: PROTOCOL_VERSION, ...files }, '*', [channel.port2, ...Object.values(files)]);
      });
      current.port.onmessage = (event) => {
        if (current.closed) return;
        const message = event.ports.length ? null : parseFrameMessage(event.data);
        if (!message) { violation('invalid message'); return; }
        const waiter = current.waiter;
        if (message.type === 'ready') {
          if (!waiter?.ready) { violation('unexpected ready'); return; }
          current.waiter = null;
          current.isReady = true;
          armIdle(current);
          waiter.resolve(current);
          return;
        }
        if (message.type === 'error' && message.id === 0 && waiter?.ready) { console.warn('OCR frame error:', message.code); dispose(new OcrError(MESSAGES.failed)); return; }
        if (!waiter || waiter.ready || waiter.id !== message.id) return; // unknown or repeated id: dropped
        current.waiter = null;
        if (message.type === 'result') { waiter.resolve(message.text); return; }
        console.warn('OCR frame error:', message.code);
        waiter.reject(new OcrError(MESSAGES.failed));
      };
    });
  }

  async function startSession() {
    if (lockedOut) throw new OcrError(MESSAGES.locked);
    if (!env.build?.hashes) throw new OcrError(MESSAGES.unavailable);
    if (!env.hasController()) throw new OcrError(MESSAGES.setup);
    const mine = epoch;
    const files = await loadVerified();
    if (mine !== epoch) throw new OcrError(MESSAGES.stopped);
    return connect(files);
  }

  function ensureSession() {
    if (session?.isReady) return Promise.resolve(session);
    if (!starting) {
      const attempt = startSession();
      starting = attempt;
      attempt.catch(() => { if (starting === attempt) starting = null; });
    }
    return starting;
  }

  async function pixelsOf(image) {
    const source = image instanceof Blob ? await env.decodeBlob(image) : image;
    const buffer = source?.data?.slice?.().buffer; // a copy: the image the app holds is never detached
    if (!(buffer instanceof ArrayBuffer)) throw new OcrError(MESSAGES.failed);
    checkImageSize(source.width, source.height, buffer.byteLength);
    return { width: source.width, height: source.height, buffer };
  }

  async function runJob(image, timeoutMs) {
    const { width, height, buffer } = await pixelsOf(image);
    const current = await ensureSession();
    if (current.closed || current.waiter) throw new OcrError(MESSAGES.stopped);
    const id = nextId;
    nextId += 1;
    env.clearTimeout(current.timer);
    return new Promise((resolve, reject) => {
      const finish = (action) => (value) => { env.clearTimeout(current.timer); if (!current.closed) armIdle(current); action(value); };
      current.waiter = { id, resolve: finish(resolve), reject: finish(reject) };
      current.timer = env.setTimeout(() => { current.port.postMessage(parentRequest.cancel(id)); dispose(new OcrError(MESSAGES.timeout)); }, timeoutMs ?? limit.job);
      current.port.postMessage(parentRequest.recognise(id, width, height, buffer), [buffer]);
    });
  }

  return {
    getOcr: async () => { await ensureSession(); return true; },
    recogniseImage(image, { timeoutMs } = {}) {
      const job = queue.then(() => runJob(image, timeoutMs));
      queue = job.catch(() => {});
      return job;
    },
    disposeOcr: () => dispose(),
  };
}

function browserEnv() {
  return {
    build: typeof __OCR_BUILD__ === 'undefined' ? null : __OCR_BUILD__, // eslint-disable-line no-undef
    hasController: () => Boolean(navigator.serviceWorker?.controller),
    async loadAsset(path) {
      const url = new URL(path, document.baseURI).href;
      const cached = (await caches.has(OCR_CACHE)) ? await (await caches.open(OCR_CACHE)).match(url) : undefined;
      const response = cached || await fetch(url);
      if (!response.ok) throw new OcrError(MESSAGES.integrity);
      return response.arrayBuffer();
    },
    sha256: sha256Hex,
    createFrame(onLoad) {
      // No sandbox attribute here on purpose: the service worker adds the sandbox header to the page it serves, and an
      // attribute would stop the worker seeing the request. If the header is missing, the page does nothing at all.
      const iframe = document.createElement('iframe');
      iframe.hidden = true;
      iframe.tabIndex = -1;
      iframe.title = 'Text recognition engine (no visible content)';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.referrerPolicy = 'no-referrer';
      iframe.addEventListener('load', onLoad);
      iframe.src = new URL(FRAME_PATH, document.baseURI).href;
      document.body.append(iframe);
      return { window: iframe.contentWindow, remove: () => iframe.remove() };
    },
    listen(handler) { window.addEventListener('message', handler); return () => window.removeEventListener('message', handler); },
    createChannel: () => new MessageChannel(),
    async decodeBlob(blob) {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, BLOB_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return context.getImageData(0, 0, canvas.width, canvas.height);
    },
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
}

let client;
const shared = () => { client ||= createOcrClient(browserEnv()); return client; };
export const getOcr = () => shared().getOcr();
export const recogniseImage = (image, options) => shared().recogniseImage(image, options);
export const disposeOcr = () => { if (client) client.disposeOcr(); };
