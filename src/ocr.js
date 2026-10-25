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

async function recogniseImageNow(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const lines = await (await getOcr()).detect(url);
    return (lines || []).map((line) => String(line.text || '').trim()).filter(Boolean).join('\n');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function recogniseImage(blob) {
  const job = recognitionQueue.then(() => recogniseImageNow(blob));
  recognitionQueue = job.catch(() => {});
  return job;
}
