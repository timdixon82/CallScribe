// Message rules shared by the page (src/ocr.js) and the isolated frame (src/ocr-frame-core.js).
// Every message is a plain object with exactly the expected keys. Anything else is rejected.
// The frame holds no user data except the pixels of the image being read.

export const PROTOCOL_VERSION = 1;
export const BOOTSTRAP_VERSION = 2; // bumped whenever src/ocr-frame-bootstrap.js changes in a way the page must know about
export const FRAME_PATH = 'ocr-frame.html'; // served by public/sw.js only, never a file on disk or in dist
export const LIMITS = Object.freeze({
  maxEdge: 2048,
  maxPixelBytes: 16 * 1024 * 1024,
  maxText: 100000,
  maxMessage: 200,
  maxId: Number.MAX_SAFE_INTEGER,
});
// Every file the page must verify (against a build-time SHA-256) before it starts the frame, keyed by role.
// The paths are relative to the app's base address and are also the keys in the OCR cache.
export const OCR_FILES = Object.freeze({
  det: 'models/ch_PP-OCRv4_det_infer.onnx',
  rec: 'models/ch_PP-OCRv4_rec_infer.onnx',
  dict: 'models/ppocr_keys_v1.txt',
  glue: 'ort/ort-wasm-simd-threaded.jsep.mjs', // the WebGPU (jsep) build of ONNX Runtime; the plain wasm file does not work with it
  wasm: 'ort/ort-wasm-simd-threaded.jsep.wasm',
  core: 'ocr/core.js',
});
export const ERROR_CODES = ['bad-message', 'too-large', 'engine', 'busy'];

const isPlainObject = (value) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const hasExactKeys = (value, keys) => isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isId = (value) => Number.isSafeInteger(value) && value >= 0;
const isDimension = (value) => Number.isInteger(value) && value >= 1 && value <= LIMITS.maxEdge;

/** Hello, sent by the frame bootstrap over window.postMessage. Returns the bootstrap version, or null. */
export function parseHello(data) {
  if (!hasExactKeys(data, ['type', 'v', 'bootstrap']) || data.type !== 'hello' || !Number.isInteger(data.v) || !Number.isInteger(data.bootstrap)) return null;
  return { protocol: data.v, bootstrap: data.bootstrap };
}

/** A recognise request, checked by the frame. Returns { ok: true, value } or { ok: false, code }. */
export function parseParentMessage(data) {
  if (isPlainObject(data) && data.v === PROTOCOL_VERSION && data.type === 'cancel' && hasExactKeys(data, ['type', 'v', 'id']) && isId(data.id)) return { ok: true, value: { type: 'cancel', id: data.id } };
  if (!hasExactKeys(data, ['type', 'v', 'id', 'width', 'height', 'pixels']) || data.type !== 'recognise' || data.v !== PROTOCOL_VERSION || !isId(data.id)) return { ok: false, code: 'bad-message' };
  if (!(data.pixels instanceof ArrayBuffer) || !Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 1 || data.height < 1) return { ok: false, code: 'bad-message' };
  if (!isDimension(data.width) || !isDimension(data.height) || data.pixels.byteLength > LIMITS.maxPixelBytes) return { ok: false, code: 'too-large' };
  if (data.pixels.byteLength !== data.width * data.height * 4) return { ok: false, code: 'bad-message' };
  return { ok: true, value: { type: 'recognise', id: data.id, width: data.width, height: data.height, pixels: data.pixels } };
}

/** A message from the frame, checked by the page. Returns a clean copy (text and message truncated), or null. */
export function parseFrameMessage(data) {
  if (!isPlainObject(data) || data.v !== PROTOCOL_VERSION) return null;
  if (data.type === 'ready' && hasExactKeys(data, ['type', 'v'])) return { type: 'ready' };
  if (data.type === 'result' && hasExactKeys(data, ['type', 'v', 'id', 'text']) && isId(data.id) && typeof data.text === 'string') return { type: 'result', id: data.id, text: data.text.slice(0, LIMITS.maxText) };
  if (data.type === 'error' && hasExactKeys(data, ['type', 'v', 'id', 'code', 'message']) && isId(data.id) && ERROR_CODES.includes(data.code) && typeof data.message === 'string') return { type: 'error', id: data.id, code: data.code, message: data.message.slice(0, LIMITS.maxMessage) };
  return null;
}

/** Validate the pixels the page is about to send. Throws a plain Error naming the problem. */
export function checkImageSize(width, height, byteLength) {
  if (!isDimension(width) || !isDimension(height) || byteLength !== width * height * 4 || byteLength > LIMITS.maxPixelBytes) throw new Error('The screenshot is too large for text recognition.');
}

export const frameReply = {
  ready: () => ({ type: 'ready', v: PROTOCOL_VERSION }),
  result: (id, text) => ({ type: 'result', v: PROTOCOL_VERSION, id, text: String(text).slice(0, LIMITS.maxText) }),
  error: (id, code, message) => ({ type: 'error', v: PROTOCOL_VERSION, id, code, message: String(message).slice(0, LIMITS.maxMessage) }),
};
export const parentRequest = {
  recognise: (id, width, height, pixels) => ({ type: 'recognise', v: PROTOCOL_VERSION, id, width, height, pixels }),
  cancel: (id) => ({ type: 'cancel', v: PROTOCOL_VERSION, id }),
};
