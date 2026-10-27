import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

const assetUrl = (path) => new URL(path, document.baseURI).href;
const MODEL_PATHS = {
  detectionPath: assetUrl('models/ch_PP-OCRv4_det_infer.onnx'),
  recognitionPath: assetUrl('models/ch_PP-OCRv4_rec_infer.onnx'),
  dictionaryPath: assetUrl('models/ppocr_keys_v1.txt'),
};

ort.env.wasm.wasmPaths = assetUrl('ort/');

let ocrPromise;
let recognitionQueue = Promise.resolve();

function hasWebGpu() {
  const ua = navigator.userAgent || '';
  const appleMobile = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return Boolean(navigator.gpu) && !appleMobile;
}

export function getOcr() {
  if (!ocrPromise) {
    ocrPromise = Ocr.create({
      models: MODEL_PATHS,
      onnxOptions: { executionProviders: hasWebGpu() ? ['webgpu', 'wasm'] : ['wasm'] },
    });
  }
  return ocrPromise;
}

async function recogniseImageNow(image) {
  const url = image instanceof Blob ? URL.createObjectURL(image) : undefined;
  try {
    const result = await (await getOcr()).detect(url || image);
    // Guten OCR 1.4 returns an object containing `texts`; earlier releases
    // returned the line array directly. Support both shapes so an installed
    // browser cache cannot turn a successful recognition into a transcript
    // error merely because the library changed its return type.
    const lines = Array.isArray(result) ? result : Array.isArray(result?.texts) ? result.texts : [];
    return (lines || []).map((line) => String(line.text || '').trim()).filter(Boolean).join('\n');
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export function recogniseImage(blob) {
  const job = recognitionQueue.then(() => recogniseImageNow(blob));
  recognitionQueue = job.catch(() => {});
  return job;
}
