import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('service worker precaches relative to its own folder so a Pages project path works', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /addAll\(\['\.\/'\]\)/);
  assert.doesNotMatch(source, /addAll\(\['\/'/);
});
