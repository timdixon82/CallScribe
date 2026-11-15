// SPIKE ONLY (T-O0b). Builds spike2/out: frame page with hashed inline bootstrap, core bundle, parent pages, assets.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname; const out = `${root}spike2/out/`;
rmSync(out, { recursive: true, force: true }); mkdirSync(`${out}models`, { recursive: true }); mkdirSync(`${out}ort`, { recursive: true });
await build({ entryPoints: [`${root}spike2/frame-core.js`], bundle: true, format: 'esm', platform: 'browser', outfile: `${out}frame-core.js`, logLevel: 'warning', loader: { '.wasm': 'empty' }, external: ['fs','path','crypto','os'], absWorkingDir: root });
await build({ entryPoints: [`${root}spike2/parent.js`], bundle: true, format: 'iife', outfile: `${out}parent.js`, logLevel: 'warning' });
const m = `${root}node_modules/@gutenye/ocr-models/assets/`;
for (const f of ['ch_PP-OCRv4_det_infer.onnx', 'ch_PP-OCRv4_rec_infer.onnx', 'ppocr_keys_v1.txt']) cpSync(m + f, `${out}models/${f}`);
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) cpSync(`${root}node_modules/onnxruntime-web/dist/${f}`, `${out}ort/${f}`);
cpSync(`${root}spike2/sw2.js`, `${out}sw2.js`);
// The inline bootstrap. It is the only script the frame page carries.
const boot = readFileSync(`${root}spike2/bootstrap.js`, 'utf8');
const hash = `'sha256-${createHash('sha256').update(boot).digest('base64')}'`;
const framePolicy = `default-src 'none'; script-src ${hash} blob: 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'; img-src data: blob:; worker-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
const page = `<!doctype html>\n<html lang="en-GB"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${framePolicy}"><title>OCR frame</title><script>${boot}</script></head><body></body></html>\n`;
writeFileSync(`${out}frame2.html`, page);
const live = (extra) => `default-src 'none'; script-src 'self' ${extra}'wasm-unsafe-eval'; frame-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' data: https://huggingface.co https://*.hf.co https://raw.githubusercontent.com; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`;
for (const [name, extra] of [['parent-strict', ''], ['parent-hash', `${hash} `]]) writeFileSync(`${out}${name}.html`, `<!doctype html>\n<html lang="en-GB"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${live(extra)}"><title>parent</title><script defer src="parent.js"></script></head><body><p id="status">parent</p></body></html>\n`);
console.log('hash', hash);
