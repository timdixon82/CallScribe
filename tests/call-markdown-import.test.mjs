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

async function timed(text) {
  const started = performance.now();
  const result = await parseCallScribeMarkdown(file(text)).catch((error) => error);
  return { result, ms: performance.now() - started };
}

test('adversarial headings and image markers are parsed in well under one second', async () => {
  const good = '## 2026-01-01 10:00 — Mic\n\nhello\n';
  for (const bad of [`## a${' '.repeat(80000)}b\n`, `## ${'a '.repeat(40000)}\n`, `## ${'— '.repeat(40000)}x\n`]) {
    const { result, ms } = await timed(good + bad);
    assert.ok(ms < 500, `heading took ${ms} ms`);
    assert.ok(result.skipped.some((item) => /too long/.test(item)));
  }
  for (const bad of ['![', '![](', '![a]', '![a](b']) {
    const { result, ms } = await timed(`${good}## 2026-01-01 10:01 — Mic\n\n${bad.repeat(80000)}\n`);
    assert.ok(ms < 500, `${bad} took ${ms} ms`);
    assert.ok(result.segments.length >= 1);
  }
  const { ms } = await timed(`## 2026-01-01 10:00 — Screenshot\n\n${'](data:'.repeat(80000)}\n`);
  assert.ok(ms < 500, `data url took ${ms} ms`);
});

test('repeated data-URL openers with one far closing bracket stay linear, and a valid image is still found', async () => {
  const head = '## 2026-01-01 10:00 — Screenshot\n\n';
  const bad = await timed(`${head}${'](data:;'.repeat(160000)})\n`);
  console.log(`160000 repeats took ${bad.ms} ms`);
  assert.ok(bad.ms < 500, `data url took ${bad.ms} ms`);
  assert.ok(bad.result instanceof Error);
  const good = await parseCallScribeMarkdown(file(`${head}${'](data:;'.repeat(1000)}\n![x](${PNG})\n`));
  assert.equal(good.screenshots.length, 1);
});

test('images are still stripped from passages', async () => {
  const { segments } = await parseCallScribeMarkdown(file('## 2026-01-01 10:00 — Mic\n\nbefore ![x](data:y) after ![z] kept\n'));
  assert.equal(segments[0].text, 'before  after ![z] kept');
});

test('too many passages and oversized text are skipped and reported', async () => {
  const { MAX_IMPORT_SEGMENTS, MAX_IMPORT_TEXT_CHARS } = await import('../src/call-markdown-import.js');
  const many = Array.from({ length: MAX_IMPORT_SEGMENTS + 3 }, (_, i) => `## 2026-01-01 10:00 — Mic\n\nline ${i}\n`).join('');
  const capped = await parseCallScribeMarkdown(file(many));
  assert.equal(capped.segments.length, MAX_IMPORT_SEGMENTS);
  assert.equal(capped.skipped.length, 3);
  const big = await parseCallScribeMarkdown(file(`## 2026-01-01 10:00 — Mic\n\nok\n\n## 2026-01-01 10:01 — App\n\n${'x'.repeat(MAX_IMPORT_TEXT_CHARS + 1)}\n\n## 2026-01-01 10:02 — Screenshot\n\n![s](${PNG})\n\nScreenshot OCR: ${'y'.repeat(MAX_IMPORT_TEXT_CHARS + 1)}\n`));
  assert.equal(big.segments.filter((s) => s.source === 'ocr').length, 0);
  assert.equal(big.screenshots.length, 1);
  assert.equal(big.skipped.length, 2);
});

test('imported screenshots keep the width and height the measure step reports, and zeros if it cannot decode', async () => {
  const md = `## 14 Nov 2026, 10:00:05 — Screenshot\n\n![x](${PNG})\n`;
  const sized = await parseCallScribeMarkdown(file(md), Date.now(), async () => ({ width: 640, height: 480 }));
  assert.deepEqual([sized.screenshots[0].width, sized.screenshots[0].height], [640, 480]);
  const plain = await parseCallScribeMarkdown(file(md)); // Node has no createImageBitmap
  assert.deepEqual([plain.screenshots[0].width, plain.screenshots[0].height], [0, 0]);
});
