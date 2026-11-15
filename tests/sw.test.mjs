import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = () => readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

test('service worker precaches relative to its own folder so a Pages project path works', async () => {
  const source = await read();
  assert.match(source, /addAll\(\['\.\/'\]\)/);
  assert.doesNotMatch(source, /addAll\(\['\/'/);
});

test('service worker goes network first for pages, caches only ok responses, and takes its version from the build', async () => {
  const source = await read();
  assert.match(source, /request\.mode === 'navigate'/);
  assert.match(source, /fetch\(request\)\.then\(\(response\) => keep\(request, response\)\)\.catch/);
  assert.match(source, /response\.status === 200/);
  assert.match(source, /cache\.put\(request, copy\)\)\.catch\(/);
  assert.match(source, /__BUILD_ID__/);
});
