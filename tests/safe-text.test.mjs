import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { cleanTitle, fileSafeName } from '../src/safe-text.js';
import { transcriptMarkdown } from '../src/call-markdown-export.js';
import { createTranscriptDocx } from '../src/transcript-docx.js';

const CRAFTED = 'Weekly\r\n## Injected heading\u2028next\u0000line\u0085end\ttab';

test('cleanTitle replaces line breaks and control characters with single spaces', () => {
  assert.equal(cleanTitle(CRAFTED), 'Weekly ## Injected heading next line end tab');
  assert.equal(cleanTitle('  \n\r  '), '');
  assert.equal(cleanTitle(undefined), '');
});

test('fileSafeName keeps only safe characters, never starts with a dot and is capped', () => {
  assert.equal(fileSafeName(CRAFTED), 'Weekly-Injected-heading-next-line-end-tab');
  assert.equal(fileSafeName('../../etc/passwd'), 'etc-passwd');
  assert.equal(fileSafeName('...'), 'transcript');
  assert.equal(fileSafeName('a'.repeat(300)).length, 100);
});

test('cleanTitle removes direction overrides and zero-width characters', () => {
  assert.equal(cleanTitle('a\u202Eb\u200Bc\uFEFFd'), 'abcd');
});

test('fileSafeName avoids Windows reserved names and drops format characters', () => {
  for (const name of ['CON', 'nul', 'COM1', 'lpt9', 'aux.txt', 'PRN.tar.gz']) assert.equal(fileSafeName(name), `transcript-${name}`);
  assert.equal(fileSafeName('COM10'), 'COM10');
  assert.equal(fileSafeName('console'), 'console');
  assert.equal(fileSafeName('re\u202Eport\u200B'), 'report');
  assert.equal(fileSafeName('\u200B\u202E'), 'transcript');
});

test('a crafted title cannot add a heading line to the Markdown export', async () => {
  const markdown = await transcriptMarkdown({ title: CRAFTED, provenance: 'p', exportedAt: 'now', segments: [], screenshots: [], formatDateTime: String, sourceName: String, speakerText: () => '', toDataUrl: async () => '' });
  const [first] = markdown.split('\n');
  assert.equal(first, '# Weekly ## Injected heading next line end tab');
  assert.equal(markdown.split('\n').filter((line) => line.startsWith('## Injected')).length, 0);
});

test('a crafted title is single-line in the Word document body and properties', async () => {
  const blob = await createTranscriptDocx({ title: CRAFTED, entries: [], screenshots: [] });
  const buffer = Buffer.from(await blob.arrayBuffer());
  let text = '';
  for (let offset = 0; offset < buffer.length - 30; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) continue;
    const size = buffer.readUInt32LE(offset + 18); const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    if (buffer.readUInt16LE(offset + 8) === 8) try { text += inflateRawSync(buffer.subarray(start, start + size)).toString(); } catch { /* skip */ }
  }
  assert.match(text, /Weekly ## Injected heading next line end tab/);
  assert.doesNotMatch(text, /Weekly\r?\n## Injected/);
});
