import { cleanTitle } from './safe-text.js';
import { putSessionBundle } from './store.js';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_SCREENSHOTS = 200;
export const MAX_IMPORT_SEGMENTS = 20000;
export const MAX_IMPORT_TEXT_CHARS = 100000;
const MAX_HEADING_CHARS = 300;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Headings the exporter writes that carry no importable passage of their own.
const QUIET_HEADINGS = /^(Generated with|.+\s+[—-]\s+OCR\b)/i;

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
// Export puts one backslash before any line that starts like a heading ("## ") or a quote (">"), and before such lines that already start with backslashes, so import can undo it exactly. Files written before this existed are read as before, except that a line which began with "\## " now reads as "## ".
const ESCAPE_LINE = /^(\\*(?:##\s|>))/gm;
const UNESCAPE_LINE = /^\\(\\*(?:##\s|>))/gm;
export const escapeMarkdownText = (value) => String(value).replace(ESCAPE_LINE, '\\$1');
export const unescapeMarkdownText = (value) => value.replace(UNESCAPE_LINE, '$1');
function textFromBlock(value) { return stripImages(value).replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim(); }
/** First data: image link in a block, found without backtracking: { url, type } or null. */
function findDataUrl(body) {
  const start = /\]\(data:/gi; let hit; let end = -2;
  while ((hit = start.exec(body))) {
    // Reuse the cached ")" while it is still ahead of this hit, so rejected hits never rescan.
    if (end < hit.index) end = body.indexOf(')', hit.index);
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
    const match = title.match(/^(.+?)\s+[—-]\s+(Mic|App|Note|Screenshot)(?:\s*[|(].*)?$/i);
    if (match) blocks.push({ timestamp: match[1], kind: match[2].toLowerCase(), body: lines.join('\n').trim(), heading: title });
    else if (/^Screenshot\s+[—-]\s+\S/i.test(title)) blocks.push({ timestamp: title.replace(/^Screenshot\s+[—-]\s+/i, ''), kind: 'screenshot', body: lines.join('\n').trim(), heading: title }); // an exported screenshot with no linked passage
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
export const MAX_IMPORT_IMAGE_PIXELS = 40_000_000;
const HEADER_BYTES = 1024 * 1024;
const u16 = (b, i) => (b[i] << 8) | b[i + 1];
const ascii = (b, i, text) => { for (let k = 0; k < text.length; k += 1) if (b[i + k] !== text.charCodeAt(k)) return false; return true; };

/** Read the declared width and height from PNG, JPEG or WebP header bytes without decoding. Returns null if unknown or malformed. Linear and bounds-checked. */
export function declaredImageSize(b) {
  if (b.length >= 24 && ascii(b, 1, 'PNG') && b[0] === 0x89 && ascii(b, 12, 'IHDR')) return { width: u16(b, 16) * 65536 + u16(b, 18), height: u16(b, 20) * 65536 + u16(b, 22) };
  if (b.length >= 30 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) {
    if (ascii(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (ascii(b, 12, 'VP8L') && b[20] === 0x2f) return { width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
    if (ascii(b, 12, 'VP8X')) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      const length = u16(b, i + 2);
      if (length < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return i + 9 <= b.length ? { width: u16(b, i + 7), height: u16(b, i + 5) } : null;
      i += 2 + length;
    }
  }
  return null;
}

const browserDecode = async (blob) => {
  const bitmap = await createImageBitmap(blob); const size = { width: bitmap.width, height: bitmap.height }; bitmap.close?.(); return size;
};

// Reads the declared size from the header first, and decodes only when it is within MAX_IMPORT_IMAGE_PIXELS, so a tiny file cannot force a huge decode.
// Returns zeros where the size is unknown, too large or cannot be decoded, so import never fails on it. `tooLarge` is set when the cap applied.
export async function measureImage(blob, decode = browserDecode) {
  const none = { width: 0, height: 0 };
  try {
    if (decode === browserDecode && typeof createImageBitmap !== 'function') return none;
    const declared = declaredImageSize(new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer()));
    if (!declared || !declared.width || !declared.height) return none;
    if (declared.width * declared.height > MAX_IMPORT_IMAGE_PIXELS) return { ...none, tooLarge: true };
    return await decode(blob);
  } catch { return none; }
}

export async function parseCallScribeMarkdown(file, now = Date.now(), measure = measureImage) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error(`The file is larger than the ${MAX_IMPORT_BYTES / 1024 / 1024} megabyte limit.`);
  const { blocks, skipped } = parseBlocks(await file.text());
  if (!blocks.length) throw new Error('No CallScribe Mic, App, or Screenshot headings were found. Choose an exported CallScribe Markdown file.');
  const id = crypto.randomUUID(); const startedAt = timestamp(blocks[0].timestamp, now);
  const session = { id, name: cleanTitle(file.name.replace(/\.md$/i, '')) || 'Imported transcript', startedAt, endedAt: timestamp(blocks.at(-1).timestamp, startedAt), status: 'stopped', imported: true, speakerAssignments: {} };
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
      const { tooLarge, ...size } = await measure(blob);
      if (tooLarge) skipped.push(`Screenshot too large to measure, kept without its size: ${entry.heading.slice(0, 60)}`);
      screenshots.push({ id: screenshotId, sessionId: id, capturedAt, reason: 'Imported screenshot', ...size, blob, ocrState: ocrText ? 'ready' : 'off', ocrText });
      segments.push({ ...base, id: crypto.randomUUID(), source: 'screen', text: '[Imported screenshot]', screenshotId }); // a screenshot with no linked passage in the file still gets one, so it shows in the transcript
      if (ocrText) segments.push({ ...base, id: crypto.randomUUID(), source: 'ocr', text: ocrText, screenshotId });
    } else {
      const text = unescapeMarkdownText(textFromBlock(entry.kind === 'note' ? entry.body.replace(/^\[[^\]\n]*\]\s*Note:\s*/, '') : entry.body));
      if (!text) { skipped.push(`Empty passage: ${entry.heading.slice(0, 60)}`); continue; }
      if (text.length > MAX_IMPORT_TEXT_CHARS) { skipped.push(`Passage too long: ${entry.heading.slice(0, 60)}`); continue; }
      segments.push({ ...base, id: crypto.randomUUID(), source: entry.kind === 'mic' ? 'microphone' : entry.kind === 'note' ? 'note' : 'system', text, imported: true });
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
