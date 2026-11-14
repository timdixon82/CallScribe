import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_IMPORT_BYTES, importCallScribeMarkdown, parseCallScribeMarkdown } from '../src/call-markdown-import.js';
import { transcriptMarkdown } from '../src/call-markdown-export.js';
import { getScreenshots, getSegments, getSessions } from '../src/store.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const file = (text, name = 'call.md') => new File([text], name, { type: 'text/markdown' });
const fmt = (time) => new Date(time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
const sourceName = (source) => (source === 'system' ? 'App' : source === 'screen' ? 'Screenshot' : source === 'ocr' ? 'OCR' : 'Mic');

test('a file with no recognised headings is rejected and nothing is written', async () => {
  const before = (await getSessions()).length;
  await assert.rejects(importCallScribeMarkdown(file('# Title\n\nhello')), /No CallScribe/);
  assert.equal((await getSessions()).length, before);
});

test('a file over the size limit is rejected before it is read', async () => {
  await assert.rejects(parseCallScribeMarkdown({ size: MAX_IMPORT_BYTES + 1, name: 'x.md', text: async () => assert.fail('read') }), /limit/);
});

test('a bad screenshot is skipped and reported, good blocks still import in one write', async () => {
  const md = `## 14 Nov 2026, 10:00:00 — Mic\n\nHello\n\n## 14 Nov 2026, 10:00:05 — Screenshot\n\n![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)\n\n## 14 Nov 2026, 10:00:09 — Screenshot\n\nno image\n\n## nonsense\n\nx\n`;
  const result = await importCallScribeMarkdown(file(md));
  assert.equal(result.transcriptCount, 1);
  assert.equal(result.screenshotCount, 0);
  assert.equal(result.skipped.length, 3);
});

test('a file whose blocks are all unusable writes nothing', async () => {
  const before = (await getSessions()).length;
  await assert.rejects(importCallScribeMarkdown(file('## 14 Nov 2026, 10:00:00 — Mic\n\n\n')), /nothing was imported/);
  assert.equal((await getSessions()).length, before);
});

test('export then import keeps text, sources, speakers and screenshots', async () => {
  const start = Date.UTC(2026, 10, 14, 10, 0, 0);
  const segments = [
    { id: 'a', source: 'microphone', start, text: 'Hello team', speaker: ' | Alice' },
    { id: 'b', source: 'system', start: start + 5000, text: 'Hi there' },
    { id: 'c', source: 'screen', start: start + 9000, text: '[Screenshot]', screenshotId: 'p' },
  ];
  const screenshots = [{ id: 'p', capturedAt: start + 9000, blob: new Blob(['x']), ocrText: 'Budget slide' }];
  const markdown = await transcriptMarkdown({ title: 'Weekly', provenance: 'test', exportedAt: 'now', segments, screenshots, formatDateTime: fmt, sourceName, speakerText: (s) => s.speaker || '', toDataUrl: async () => PNG });
  const { session, screenshotCount, transcriptCount, skipped } = await importCallScribeMarkdown(file(markdown, 'Weekly.md'));
  assert.deepEqual([transcriptCount, screenshotCount, skipped.length], [2, 1, 0]);
  const stored = (await getSegments(session.id)).sort((x, y) => x.start - y.start);
  assert.deepEqual(stored.filter((s) => s.imported).map((s) => [s.source, s.text]), [['microphone', 'Hello team'], ['system', 'Hi there']]);
  assert.equal(stored.find((s) => s.source === 'ocr').text, 'Budget slide');
  const [shot] = await getScreenshots(session.id);
  assert.equal(shot.blob.type, 'image/png');
  assert.equal(session.name, 'Weekly');
});
