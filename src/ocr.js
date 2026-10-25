import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web/wasm';

const assetUrl = (path) => new URL(path, document.baseURI).href;
const MODEL_PATHS = {
  detectionPath: assetUrl('models/ch_PP-OCRv4_det_infer.onnx'),
  recognitionPath: assetUrl('models/ch_PP-OCRv4_rec_infer.onnx'),
  dictionaryPath: assetUrl('models/ppocr_keys_v1.txt'),
};

ort.env.wasm.wasmPaths = assetUrl('ort/');

let ocrPromise;

export function getOcr() {
  if (!ocrPromise) {
    ocrPromise = Ocr.create({
      models: MODEL_PATHS,
      onnxOptions: { executionProviders: ['wasm'] },
    });
  }
  return ocrPromise;
}

export async function recogniseImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const lines = await (await getOcr()).detect(url);
    return (lines || []).map((line) => String(line.text || '').trim()).filter(Boolean).join('\n');
  } finally {
    URL.revokeObjectURL(url);
  }
}
