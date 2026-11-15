// The text recognition engine. It is bundled into one file (scripts/build-ocr-core.mjs) and runs only inside the
// sandboxed frame, imported from a blob made by the frame bootstrap. It has no network and no storage: the page
// sends the models and the pixels over a private message port, and this file sends text back.
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';
import { frameReply, parseParentMessage } from './ocr-protocol.js';

// shortcut: Guten OCR reads its dictionary with fetch(); this answers only the made-up dict: address from memory.
const realFetch = globalThis.fetch.bind(globalThis);
let dictionary = '';
globalThis.fetch = (input, init) => (input === 'dict:' ? Promise.resolve(new Response(dictionary)) : realFetch(input, init));

function hasWebGpu() {
  const ua = navigator.userAgent || '';
  const appleMobile = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return Boolean(navigator.gpu) && !appleMobile;
}

// Guten OCR 1.4 returns an object containing `texts`; earlier releases returned the line array directly.
export function linesToText(result) {
  const lines = Array.isArray(result) ? result : Array.isArray(result?.texts) ? result.texts : [];
  return lines.map((line) => String(line.text || '').trim()).filter(Boolean).join('\n');
}

export async function start(port, assets, glueUrl) {
  dictionary = new TextDecoder().decode(assets.dict);
  ort.env.wasm.wasmBinary = new Uint8Array(assets.wasm);
  ort.env.wasm.wasmPaths = { mjs: glueUrl };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  let engine;
  let busy = false;
  port.onmessage = async (event) => {
    const parsed = parseParentMessage(event.data);
    if (event.ports.length) return port.postMessage(frameReply.error(0, 'bad-message', 'Bad message.'));
    if (!parsed.ok) return port.postMessage(frameReply.error(0, parsed.code, 'The request was refused.'));
    const message = parsed.value;
    if (message.type === 'cancel') return undefined; // the page removes the whole frame to stop a running job
    if (busy || !engine) return port.postMessage(frameReply.error(message.id, 'busy', 'Text recognition is busy.'));
    busy = true;
    try {
      const result = await engine.detect({ data: new Uint8ClampedArray(message.pixels), width: message.width, height: message.height });
      port.postMessage(frameReply.result(message.id, linesToText(result)));
    } catch {
      port.postMessage(frameReply.error(message.id, 'engine', 'Text recognition failed.'));
    } finally { busy = false; }
    return undefined;
  };
  engine = await Ocr.create({
    models: { detectionPath: new Uint8Array(assets.det), recognitionPath: new Uint8Array(assets.rec), dictionaryPath: 'dict:' },
    onnxOptions: { executionProviders: hasWebGpu() ? ['webgpu', 'wasm'] : ['wasm'] },
  });
  port.postMessage(frameReply.ready());
}
