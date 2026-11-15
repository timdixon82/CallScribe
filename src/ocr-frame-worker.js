// Entry point of the text recognition worker. The frame bootstrap makes a worker from the verified engine bytes and
// hands it the private message port and the public program files. The engine then runs on this thread, so a job that
// never finishes cannot block the page's timers: the page's timeout fires and removes the whole frame, which ends this worker.
import { start } from './ocr-frame-core.js';

// shortcut: Guten OCR makes its scratch canvases with document.createElement('canvas'), and a worker has no document.
// This answers only that one call with an OffscreenCanvas. Upgrade if the engine ever needs more of the document.
globalThis.document = { createElement: (tag) => { if (tag !== 'canvas') throw new Error('Not available in the text recognition worker.'); return new OffscreenCanvas(1, 1); } };

const NAMES = ['wasm', 'glue', 'det', 'rec', 'dict'];
let used = false; // the first start message is the only one ever considered
addEventListener('message', (event) => {
  const data = event.data;
  if (used || self.origin !== 'null' || !data || typeof data !== 'object' || data.type !== 'start') return;
  used = true;
  const port = event.ports.length === 1 ? event.ports[0] : null;
  const keys = Object.keys(data).sort().join();
  const valid = port && keys === ['type', ...NAMES].sort().join() && NAMES.every((name) => data[name] instanceof ArrayBuffer);
  if (!valid) { try { port?.postMessage({ type: 'error', v: 1, id: 0, code: 'engine', message: 'The text recognition worker received an invalid start message.' }); } catch { /* the page will time out */ } return; }
  const glueUrl = URL.createObjectURL(new Blob([data.glue], { type: 'text/javascript' }));
  start(port, { wasm: data.wasm, det: data.det, rec: data.rec, dict: data.dict }, glueUrl)
    .catch(() => { try { port.postMessage({ type: 'error', v: 1, id: 0, code: 'engine', message: 'Text recognition could not start.' }); } catch { /* the page will time out */ } });
});
