import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createTranscriptDocx } from '../src/transcript-docx.js';

function zipEntries(buffer) {
  const result = new Map();
  for (let offset = 0; offset < buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    const local = buffer.readUInt32LE(offset + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    result.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 45 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return result;
}
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1kAAAAASUVORK5CYII=', 'base64'));
test('Word export retains chronology, speaker text, multiline content and accessible screenshots', async () => {
  const blob = await createTranscriptDocx({ title: 'Review & decisions', provenance: 'Generated with CallScribe\nModel: Example', entries: [
    { source: 'microphone', heading: '09:00 — Mic | Tim', text: 'First point\nSecond point <verbatim>' },
    { source: 'screen', heading: '09:01 — Screenshot', text: 'Review screen', screenshotId: 'shot' },
    { source: 'ocr', heading: '09:01 — OCR', text: 'Read the example', screenshotId: 'shot' },
    { source: 'system', heading: '09:02 — App | Alex', text: 'Final response' },
  ], screenshots: [{ id: 'shot', data: png, width: 1600, height: 900, timestamp: '09:01', ocrText: 'Example & details' }, { id: 'orphan', data: png, width: 300, height: 1600, timestamp: '09:03', ocrText: 'Portrait screenshot' }] });
  const files = zipEntries(Buffer.from(await blob.arrayBuffer()));
  const xml = files.get('word/document.xml').toString();
  assert.match(xml, /Review &amp; decisions/);
  assert.match(xml, /Second point &lt;verbatim&gt;/);
  assert.ok(xml.indexOf('Mic | Tim') < xml.indexOf('Review screen'));
  assert.ok(xml.indexOf('Review screen') < xml.indexOf('App | Alex'));
  assert.match(xml, /Additional screenshots/);
  assert.match(xml, /descr="Example &amp; details"/);
  assert.match(xml, /descr="Portrait screenshot"/);
  assert.equal((xml.match(/<w:drawing>/g) || []).length, 2, 'a screenshot referenced by screen and OCR is embedded once');
  assert.ok([...files.keys()].some((name) => name.startsWith('word/media/')));
  assert.match(xml, /w:pStyle w:val="Title"/);
  for (const match of xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)) {
    assert.ok(Number(match[1]) <= 576 * 9525);
    assert.ok(Number(match[2]) <= 624 * 9525);
  }
});
test('an empty transcript remains a valid Word document', async () => {
  const blob = await createTranscriptDocx({ title: 'Empty transcript' });
  const files = zipEntries(Buffer.from(await blob.arrayBuffer()));
  assert.match(files.get('word/document.xml').toString(), /Empty transcript/);
});
