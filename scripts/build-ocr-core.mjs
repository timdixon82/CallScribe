import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OCR_FILES } from '../src/ocr-protocol.js';

// Builds the text recognition engine as one classic script file, and returns its bytes plus the SHA-256 of every file
// the page must verify before it starts the isolated frame. Run from vite.config.js at build time.
const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function buildOcrCore() {
  const result = await build({
    entryPoints: [`${root}src/ocr-frame-worker.js`], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    minify: true, logLevel: 'warning', loader: { '.wasm': 'empty' }, external: ['fs', 'path', 'crypto', 'os'], absWorkingDir: root,
  });
  const core = Buffer.from(result.outputFiles[0].contents);
  const hashes = { core: sha256(core) };
  for (const key of ['det', 'rec', 'dict', 'glue', 'wasm']) hashes[key] = sha256(readFileSync(`${root}public/${OCR_FILES[key]}`)); // run npm run copy:ocr-assets first
  return { core, hashes };
}
