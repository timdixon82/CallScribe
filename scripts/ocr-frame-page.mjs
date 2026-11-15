import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BOOTSTRAP_VERSION, PROTOCOL_VERSION } from '../src/ocr-protocol.js';

// Builds the text recognition frame page. Used by the build (vite.config.js) and by tests.
// The page is never written to a file: the build puts it into the service worker as a constant.
export const BOOTSTRAP_PATH = new URL('../src/ocr-frame-bootstrap.js', import.meta.url);

export function bootstrapSource(raw = readFileSync(BOOTSTRAP_PATH, 'utf8')) {
  const source = raw.replaceAll('__PROTOCOL_VERSION__', String(PROTOCOL_VERSION)).replaceAll('__BOOTSTRAP_VERSION__', String(BOOTSTRAP_VERSION));
  if (/__[A-Z_]+__/.test(source) || /<\/script/i.test(source)) throw new Error('The OCR frame bootstrap has an unreplaced token or a closing script tag.');
  return source;
}

export const sha256Source = (source) => `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;

export function framePolicy(hash) {
  return `default-src 'none'; script-src ${hash} blob: 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'; img-src data: blob:; worker-src blob:; frame-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
}

export function buildFramePage(source = bootstrapSource()) {
  const hash = sha256Source(source);
  const policy = framePolicy(hash);
  const html = `<!doctype html>\n<html lang="en-GB"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Text recognition frame</title><script>${source}</script></head><body></body></html>\n`;
  return { html, hash, policy, source };
}
