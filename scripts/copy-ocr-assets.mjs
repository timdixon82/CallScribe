import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const models = join(root, 'node_modules', '@gutenye', 'ocr-models', 'assets');
const modelOutput = join(root, 'public', 'models');
const runtime = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const runtimeOutput = join(root, 'public', 'ort');

mkdirSync(modelOutput, { recursive: true });
mkdirSync(runtimeOutput, { recursive: true });

for (const file of ['ch_PP-OCRv4_det_infer.onnx', 'ch_PP-OCRv4_rec_infer.onnx', 'ppocr_keys_v1.txt']) {
  const source = join(models, file);
  if (!existsSync(source)) throw new Error(`Missing OCR asset: ${source}`);
  copyFileSync(source, join(modelOutput, file));
}

for (const file of readdirSync(runtime)) {
  if (/\.(wasm|mjs)$/.test(file) || /^ort-.*\.js$/.test(file)) copyFileSync(join(runtime, file), join(runtimeOutput, file));
}

console.log('Copied local PaddleOCR and ONNX Runtime assets.');
