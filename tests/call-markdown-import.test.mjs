import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_IMPORT_BYTES, declaredImageSize, importCallScribeMarkdown, measureImage, parseCallScribeMarkdown } from '../src/call-markdown-import.js';
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

const bytes = (...parts) => Uint8Array.from(parts.flat());
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s) => [...s].map((c) => c.charCodeAt(0));
const pngHeader = (w, h) => bytes([0x89], text('PNG\r\n'), [0x1a, 0x0a], be32(13), text('IHDR'), be32(w), be32(h), [8, 6, 0, 0, 0]);
const jpegHeader = (w, h) => bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
const webpHeader = (w, h) => bytes(text('RIFF'), [30, 0, 0, 0], text('WEBPVP8X'), [10, 0, 0, 0, 0, 0, 0, 0], [(w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16, (h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16]);
const blobOf = (data) => new Blob([data]);

test('headers declaring huge sizes are never decoded and return quickly', async () => {
  const started = Date.now();
  for (const data of [pngHeader(30000, 30000), jpegHeader(30000, 30000), webpHeader(30000, 30000)]) {
    let called = 0;
    const result = await measureImage(blobOf(data), async () => { called += 1; return { width: 1, height: 1 }; });
    assert.equal(called, 0);
    assert.deepEqual([result.width, result.height, result.tooLarge], [0, 0, true]);
  }
  assert.ok(Date.now() - started < 1000);
});

test('small valid headers are decoded and give their real size', async () => {
  for (const [data, w, h] of [[pngHeader(640, 480), 640, 480], [jpegHeader(320, 200), 320, 200], [webpHeader(800, 600), 800, 600]]) {
    assert.deepEqual(declaredImageSize(data), { width: w, height: h });
    assert.deepEqual(await measureImage(blobOf(data), async () => ({ width: w, height: h })), { width: w, height: h });
  }
});

test('truncated or malformed headers give zeros without throwing or decoding', async () => {
  const bad = [new Uint8Array(0), pngHeader(5, 5).slice(0, 10), jpegHeader(5, 5).slice(0, 12), webpHeader(5, 5).slice(0, 20), bytes([0xff, 0xd8, 0xff, 0xc0, 0, 0]), bytes([0xff, 0xd8, 1, 2, 3, 4]), bytes(text('not an image at all, just text'))];
  for (const data of bad) {
    assert.equal(declaredImageSize(data), null);
    assert.deepEqual(await measureImage(blobOf(data), async () => assert.fail('decoded')), { width: 0, height: 0 });
  }
});

test('an oversized screenshot is kept without a size and reported in plain language', async () => {
  const result = await parseCallScribeMarkdown(file(`## 14 Nov 2026, 10:00:05 — Screenshot\n\n![x](${PNG})\n`), Date.now(), async () => ({ width: 0, height: 0, tooLarge: true }));
  assert.equal(result.screenshots[0].tooLarge, undefined);
  assert.match(result.skipped[0], /too large to measure/);
});

test('a screenshot with no linked passage survives an export and import round trip', async () => {
  const t = Date.UTC(2026, 10, 14, 10, 0, 0);
  const segments = [{ id: 'g1', start: t, source: 'microphone', text: 'Hello there' }];
  const screenshots = [{ id: 'orphan', capturedAt: t + 5000, blob: new Blob(['x'], { type: 'image/png' }) }];
  const md = await transcriptMarkdown({ title: 'Round trip', provenance: 'p', exportedAt: 'now', segments, screenshots, formatDateTime: fmt, sourceName: (s) => (s === 'microphone' ? 'Mic' : sourceName(s)), speakerText: () => '', toDataUrl: async () => PNG });
  assert.match(md, /## Screenshot — /);
  const parsed = await parseCallScribeMarkdown(file(md));
  assert.equal(parsed.screenshots.length, 1);
  assert.equal(parsed.skipped.length, 0);
  assert.ok(parsed.segments.some((s) => s.source === 'screen' && s.screenshotId === parsed.screenshots[0].id));
});

test('an orphan screenshot block that cannot be read is listed as skipped', async () => {
  const parsed = await parseCallScribeMarkdown(file(`## 14 Nov 2026, 10:00:00 — Mic\n\nHello\n\n## Screenshot — 14 Nov 2026, 10:00:05\n\nno image here\n`));
  assert.equal(parsed.screenshots.length, 0);
  assert.equal(parsed.skipped.length, 1);
  assert.match(parsed.skipped[0], /Screenshot without an image/);
});

test('note and passage text that looks like a heading or quote round-trips intact', async () => {
  const tricky = ['## 14 Nov 2026, 10:00:00 — Mic', '\\## already escaped', '> quoted', 'plain'].join('\n');
  const segments = [
    { id: 'n', source: 'note', sessionStartedAt: 1000, start: 5000, text: tricky },
    { id: 'm', source: 'microphone', start: 6000, text: tricky },
  ];
  const markdown = await transcriptMarkdown({ title: 'T', provenance: 'p', exportedAt: 'now', segments, screenshots: [], formatDateTime: fmt, sourceName, speakerText: () => '', toDataUrl: async () => PNG });
  const { segments: back, skipped } = await parseCallScribeMarkdown(file(markdown));
  assert.deepEqual(skipped, []);
  assert.deepEqual(back.map((s) => s.text), [tricky, tricky]);
});

test('older exports without escapes still import unchanged', async () => {
  const md = '## 14 Nov 2026, 10:00:00 — Note\n\n[00:05] Note: Plain note\n\n## 14 Nov 2026, 10:00:05 — Mic\n\nHello there\n';
  const { segments } = await parseCallScribeMarkdown(file(md));
  assert.deepEqual(segments.map((s) => s.text), ['Plain note', 'Hello there']);
});
