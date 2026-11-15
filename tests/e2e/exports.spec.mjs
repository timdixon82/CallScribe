import { readFileSync } from 'node:fs';
import { crc32, deflateSync, inflateRawSync } from 'node:zlib';
import { test, expect, openPriorSessions } from './helpers.mjs';

// Every export format the transcript offers, downloaded from a small synthetic saved session (two passages and
// one screenshot, all made up). The Markdown round trip is covered in the import tests and import-delete spec.
// A real 4 by 4 grey PNG, built here so the browser can decode it for the Word export.
function makePng() {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(4, 0); header.writeUInt32BE(4, 4); header[8] = 8; header[9] = 0;
  const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, 80, 120, 160, 200])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng();
const PNG_BASE64 = PNG.toString('base64');
const SESSION_MD = [
  '# Synthetic export', '', '## Generated with', '', 'test', '', 'Exported: now', '',
  '## 14 Nov 2026, 10:00:00 — Mic', '', 'Hello from the sample file', '',
  '## 14 Nov 2026, 10:00:05 — App', '', 'Reply from the other side', '',
  '## 14 Nov 2026, 10:00:09 — Screenshot', '', `![Screenshot captured 14 Nov 2026, 10:00:09](data:image/png;base64,${PNG_BASE64})`, '', 'Screenshot OCR: Budget slide', '',
].join('\n');

async function openSynthetic(page) {
  await page.goto('/index.html');
  await openPriorSessions(page);
  await page.locator('#import-transcript-file').setInputFiles({ name: 'Synthetic export.md', mimeType: 'text/markdown', buffer: Buffer.from(SESSION_MD) });
  await expect(page.locator('#import-transcript-status')).toContainText('Imported 2 transcript passages and 1 screenshot');
  await page.locator('#saved-session-list tr', { hasText: 'Synthetic export' }).getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('#transcript-list')).toContainText('Hello from the sample file');
}

async function exportAs(page, format) {
  await page.locator('#export-format').selectOption(format);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-transcript').click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

// Minimal zip reader: finds a named entry through the central directory and inflates it.
function zipEntry(buffer, wanted) {
  for (let offset = 0; offset < buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    if (buffer.subarray(offset + 46, offset + 46 + nameLength).toString() !== wanted) continue;
    const local = buffer.readUInt32LE(offset + 42); const size = buffer.readUInt32LE(offset + 20);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    return buffer.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data;
  }
  throw new Error(`${wanted} not found in the download`);
}

test.describe('transcript exports', () => {
  test.beforeEach(async ({ page }) => { await openSynthetic(page); });

  test('plain text lists the provenance and both passages in order', async ({ page }) => {
    const { name, bytes } = await exportAs(page, 'txt');
    expect(name).toBe('Synthetic-export.txt');
    const text = bytes.toString('utf8');
    expect(text).toMatch(/^Generated with CallScribe\n/);
    expect(text).toContain('\n\nTranscript\n');
    expect(text).toMatch(/\| Mic \| Hello from the sample file\n.*\| App \| Reply from the other side/);
  });

  test('JSON holds the provenance and the segments', async ({ page }) => {
    const { name, bytes } = await exportAs(page, 'json');
    expect(name).toBe('Synthetic-export.json');
    const data = JSON.parse(bytes.toString('utf8'));
    expect(data.provenance.app).toBe('CallScribe');
    const spoken = data.segments.filter((segment) => segment.imported).sort((a, b) => a.start - b.start);
    expect(spoken.map((segment) => [segment.source, segment.text])).toEqual([['microphone', 'Hello from the sample file'], ['system', 'Reply from the other side']]);
  });

  test('SRT has numbered cues with millisecond timestamps using commas', async ({ page }) => {
    const { name, bytes } = await exportAs(page, 'srt');
    expect(name).toBe('Synthetic-export.srt');
    const text = bytes.toString('utf8');
    expect(text).toMatch(/^1\n00:00:00,000 --> 00:00:03,000\nGenerated with CallScribe/);
    expect(text).toContain('\n2\n00:00:00,000 --> 00:00:00,000\n[Mic] Hello from the sample file\n');
    expect(text).toContain('\n3\n00:00:05,000 --> 00:00:05,000\n[App] Reply from the other side\n');
  });

  test('VTT starts with the WEBVTT header and has cues', async ({ page }) => {
    const { name, bytes } = await exportAs(page, 'vtt');
    expect(name).toBe('Synthetic-export.vtt');
    const text = bytes.toString('utf8');
    expect(text).toMatch(/^WEBVTT\n\nNOTE Generated with CallScribe/);
    expect(text).toContain('\n00:00:00.000 --> 00:00:00.000\n[Mic] Hello from the sample file\n');
    expect(text).toContain('\n00:00:05.000 --> 00:00:05.000\n[App] Reply from the other side\n');
  });

  test('Word document contains the title, both passages and the screenshot', async ({ page }) => {
    const { name, bytes } = await exportAs(page, 'docx');
    expect(name).toBe('Synthetic-export.docx');
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const xml = zipEntry(bytes, 'word/document.xml').toString('utf8');
    for (const phrase of ['Synthetic export', 'Hello from the sample file', 'Reply from the other side', 'Budget slide']) expect(xml).toContain(phrase);
    expect(xml).toContain('<w:drawing>');
  });

  test('screenshot export downloads each image with its original bytes', async ({ page }) => {
    const { name, bytes } = await exportAs(page, 'screenshots');
    expect(name).toBe('Synthetic-export-screenshot-001.webp');
    expect(bytes.equals(PNG)).toBe(true);
  });
});
