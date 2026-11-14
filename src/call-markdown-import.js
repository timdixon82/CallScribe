import { putSessionBundle } from './store.js';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_SCREENSHOTS = 200;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Headings the exporter writes that carry no importable passage of their own.
const QUIET_HEADINGS = /^(Generated with|Screenshot\s+[—-]|.+\s+[—-]\s+OCR\b)/i;

function timestamp(value, fallback) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : fallback; }
function textFromBlock(value) { return value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim(); }

/** Split Markdown into recognised blocks and a list of skipped headings with reasons. */
export function parseBlocks(markdown) {
  const blocks = []; const skipped = [];
  for (const block of markdown.split(/^##\s+/m).slice(1)) {
    const [heading = '', ...body] = block.split('\n'); const title = heading.trim();
    const match = title.match(/^(.+?)\s+[—-]\s+(Mic|App|Screenshot)(?:\s*[|(].*)?$/i);
    if (match) blocks.push({ timestamp: match[1], kind: match[2].toLowerCase(), body: body.join('\n').trim(), heading: title });
    else if (!QUIET_HEADINGS.test(title)) skipped.push(`Heading not recognised: ${title.slice(0, 60)}`);
  }
  return { blocks, skipped };
}

/**
 * Parse and validate everything, with no writes. Returns the records to store and the skipped blocks.
 * Throws before anything is stored if the file is too large or holds no usable passage.
 */
export async function parseCallScribeMarkdown(file, now = Date.now()) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error(`The file is larger than the ${MAX_IMPORT_BYTES / 1024 / 1024} megabyte limit.`);
  const { blocks, skipped } = parseBlocks(await file.text());
  if (!blocks.length) throw new Error('No CallScribe Mic, App, or Screenshot headings were found. Choose an exported CallScribe Markdown file.');
  const id = crypto.randomUUID(); const startedAt = timestamp(blocks[0].timestamp, now);
  const session = { id, name: file.name.replace(/\.md$/i, ''), startedAt, endedAt: timestamp(blocks.at(-1).timestamp, startedAt), status: 'stopped', imported: true, speakerAssignments: {} };
  const segments = []; const screenshots = [];
  for (const [index, entry] of blocks.entries()) {
    const capturedAt = timestamp(entry.timestamp, startedAt + index);
    const base = { sessionId: id, sessionStartedAt: startedAt, start: capturedAt, end: capturedAt, final: true };
    if (entry.kind === 'screenshot') {
      const dataUrl = entry.body.match(/\]\((data:([^;,)]+)[^)]*)\)/i);
      if (!dataUrl) { skipped.push(`Screenshot without an image: ${entry.heading.slice(0, 60)}`); continue; }
      if (!IMAGE_TYPES.includes(dataUrl[2].toLowerCase())) { skipped.push(`Screenshot with an unsupported image type: ${entry.heading.slice(0, 60)}`); continue; }
      if (screenshots.length >= MAX_IMPORT_SCREENSHOTS) { skipped.push(`Screenshot over the limit of ${MAX_IMPORT_SCREENSHOTS}: ${entry.heading.slice(0, 60)}`); continue; }
      let blob; try { blob = await (await fetch(dataUrl[1])).blob(); } catch { skipped.push(`Screenshot image could not be read: ${entry.heading.slice(0, 60)}`); continue; }
      const screenshotId = crypto.randomUUID(); const ocrText = textFromBlock(entry.body.replace(/^\[[^\]\n]*\]$/gm, '').replace(/^Screenshot OCR:\s*/m, ''));
      screenshots.push({ id: screenshotId, sessionId: id, capturedAt, reason: 'Imported screenshot', width: 0, height: 0, blob, ocrState: ocrText ? 'ready' : 'off', ocrText });
      segments.push({ ...base, id: crypto.randomUUID(), source: 'screen', text: '[Imported screenshot]', screenshotId });
      if (ocrText) segments.push({ ...base, id: crypto.randomUUID(), source: 'ocr', text: ocrText, screenshotId });
    } else {
      const text = textFromBlock(entry.body);
      if (!text) { skipped.push(`Empty passage: ${entry.heading.slice(0, 60)}`); continue; }
      segments.push({ ...base, id: crypto.randomUUID(), source: entry.kind === 'mic' ? 'microphone' : 'system', text, imported: true });
    }
  }
  if (!segments.length) throw new Error('The file had headings but no usable passages or screenshots, so nothing was imported.');
  return { session, segments, screenshots, skipped };
}

/** Import an exported CallScribe Markdown file into this browser's IndexedDB only. All records are written in one transaction. */
export async function importCallScribeMarkdown(file) {
  const { session, segments, screenshots, skipped } = await parseCallScribeMarkdown(file);
  await putSessionBundle({ session, segments, screenshots });
  return { session, transcriptCount: segments.filter((item) => item.imported).length, screenshotCount: screenshots.length, skipped };
}
