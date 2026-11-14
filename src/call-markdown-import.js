import { putSessionBundle } from './store.js';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_SCREENSHOTS = 200;
export const MAX_IMPORT_SEGMENTS = 20000;
export const MAX_IMPORT_TEXT_CHARS = 100000;
const MAX_HEADING_CHARS = 300;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Headings the exporter writes that carry no importable passage of their own.
const QUIET_HEADINGS = /^(Generated with|Screenshot\s+[—-]|.+\s+[—-]\s+OCR\b)/i;

function timestamp(value, fallback) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : fallback; }
// Removes ![alt](url) with indexOf scans, so the cost stays linear however many "![" the input repeats.
function stripImages(value) {
  let out = ''; let from = 0; let close = -2; let end = -2;
  for (;;) {
    const open = value.indexOf('![', from);
    if (open < 0) break;
    if (close !== -1 && close < open + 2) close = value.indexOf(']', open + 2);
    if (close < 0) break;
    if (value[close + 1] !== '(') { out += value.slice(from, open + 2); from = open + 2; continue; }
    if (end !== -1 && end < close + 2) end = value.indexOf(')', close + 2);
    if (end < 0) break;
    out += value.slice(from, open); from = end + 1;
  }
  return out + value.slice(from);
}
function textFromBlock(value) { return stripImages(value).replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim(); }
/** First data: image link in a block, found without backtracking: { url, type } or null. */
function findDataUrl(body) {
  const start = /\]\(data:/gi; let hit;
  while ((hit = start.exec(body))) {
    const end = body.indexOf(')', hit.index);
    if (end < 0) return null;
    const type = body.slice(hit.index + 7, hit.index + 107).match(/^[^;,)]+/);
    if (type) return { url: body.slice(hit.index + 2, end), type: type[0] };
  }
  return null;
}

/** Split Markdown into recognised blocks and a list of skipped headings with reasons. Linear in the input size. */
export function parseBlocks(markdown) {
  const blocks = []; const skipped = []; let current = null;
  const finish = () => {
    if (!current) return; const { title, lines } = current; current = null;
    if (title.length > MAX_HEADING_CHARS) { skipped.push(`Heading too long to read: ${title.slice(0, 60)}`); return; }
    const match = title.match(/^(.+?)\s+[—-]\s+(Mic|App|Screenshot)(?:\s*[|(].*)?$/i);
    if (match) blocks.push({ timestamp: match[1], kind: match[2].toLowerCase(), body: lines.join('\n').trim(), heading: title });
    else if (!QUIET_HEADINGS.test(title)) skipped.push(`Heading not recognised: ${title.slice(0, 60)}`);
  };
  for (const line of markdown.split('\n')) {
    if (line.startsWith('##') && /\s/.test(line[2] ?? '')) { finish(); current = { title: line.slice(2).trim(), lines: [] }; } else if (current) current.lines.push(line);
  }
  finish();
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
    if (segments.length >= MAX_IMPORT_SEGMENTS) { skipped.push(`Over the limit of ${MAX_IMPORT_SEGMENTS} passages: ${entry.heading.slice(0, 60)}`); continue; }
    const capturedAt = timestamp(entry.timestamp, startedAt + index);
    const base = { sessionId: id, sessionStartedAt: startedAt, start: capturedAt, end: capturedAt, final: true };
    if (entry.kind === 'screenshot') {
      const dataUrl = findDataUrl(entry.body);
      if (!dataUrl) { skipped.push(`Screenshot without an image: ${entry.heading.slice(0, 60)}`); continue; }
      if (!IMAGE_TYPES.includes(dataUrl.type.toLowerCase())) { skipped.push(`Screenshot with an unsupported image type: ${entry.heading.slice(0, 60)}`); continue; }
      if (screenshots.length >= MAX_IMPORT_SCREENSHOTS) { skipped.push(`Screenshot over the limit of ${MAX_IMPORT_SCREENSHOTS}: ${entry.heading.slice(0, 60)}`); continue; }
      let blob; try { blob = await (await fetch(dataUrl.url)).blob(); } catch { skipped.push(`Screenshot image could not be read: ${entry.heading.slice(0, 60)}`); continue; }
      const screenshotId = crypto.randomUUID(); let ocrText = textFromBlock(entry.body.replace(/^\[[^\]\n]*\]$/gm, '').replace(/^Screenshot OCR:\s*/m, ''));
      if (ocrText.length > MAX_IMPORT_TEXT_CHARS) { skipped.push(`Screenshot text too long, kept the image only: ${entry.heading.slice(0, 60)}`); ocrText = ''; }
      screenshots.push({ id: screenshotId, sessionId: id, capturedAt, reason: 'Imported screenshot', width: 0, height: 0, blob, ocrState: ocrText ? 'ready' : 'off', ocrText });
      segments.push({ ...base, id: crypto.randomUUID(), source: 'screen', text: '[Imported screenshot]', screenshotId });
      if (ocrText) segments.push({ ...base, id: crypto.randomUUID(), source: 'ocr', text: ocrText, screenshotId });
    } else {
      const text = textFromBlock(entry.body);
      if (!text) { skipped.push(`Empty passage: ${entry.heading.slice(0, 60)}`); continue; }
      if (text.length > MAX_IMPORT_TEXT_CHARS) { skipped.push(`Passage too long: ${entry.heading.slice(0, 60)}`); continue; }
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
