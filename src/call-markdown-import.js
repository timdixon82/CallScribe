import { putScreenshot, putSegment, putSession } from './store.js';

function timestamp(value, fallback) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : fallback; }
function textFromBlock(value) { return value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim(); }
function blocks(markdown) {
  return markdown.split(/^##\s+/m).slice(1).map((block) => {
    const [heading = '', ...body] = block.split('\n');
    const match = heading.trim().match(/^(.+?)\s+[—-]\s+(Mic|App|Screenshot)(?:\s+\((.+)\))?\s*$/i);
    return match ? { timestamp: match[1], kind: match[2].toLowerCase(), body: body.join('\n').trim() } : null;
  }).filter(Boolean);
}

/** Import an exported CallScribe Markdown file into this browser's IndexedDB only. */
export async function importCallScribeMarkdown(file) {
  const markdown = await file.text(); const now = Date.now(); const parsed = blocks(markdown);
  if (!parsed.length) throw new Error('No CallScribe Mic, App, or Screenshot headings were found. Choose an exported CallScribe Markdown file.');
  const id = crypto.randomUUID(); const startedAt = timestamp(parsed[0].timestamp, now);
  const session = { id, name: file.name.replace(/\.md$/i, ''), startedAt, endedAt: timestamp(parsed.at(-1).timestamp, startedAt), status: 'stopped', imported: true, speakerAssignments: {} };
  let transcriptCount = 0; let screenshotCount = 0; await putSession(session);
  for (const [index, entry] of parsed.entries()) {
    const capturedAt = timestamp(entry.timestamp, startedAt + index);
    if (entry.kind === 'screenshot') {
      const dataUrl = entry.body.match(/\]\((data:image\/[^)]+)\)/i)?.[1]; if (!dataUrl) continue;
      const blob = await (await fetch(dataUrl)).blob(); const screenshotId = crypto.randomUUID(); const ocrText = textFromBlock(entry.body);
      await putScreenshot({ id: screenshotId, sessionId: id, capturedAt, reason: 'Imported screenshot', width: 0, height: 0, blob, ocrState: ocrText ? 'ready' : 'off', ocrText });
      await putSegment({ id: crypto.randomUUID(), sessionId: id, sessionStartedAt: startedAt, source: 'screen', start: capturedAt, end: capturedAt, text: '[Imported screenshot]', screenshotId, final: true });
      if (ocrText) await putSegment({ id: crypto.randomUUID(), sessionId: id, sessionStartedAt: startedAt, source: 'ocr', start: capturedAt, end: capturedAt, text: ocrText, screenshotId, final: true });
      screenshotCount += 1;
    } else {
      const text = textFromBlock(entry.body); if (!text) continue;
      await putSegment({ id: crypto.randomUUID(), sessionId: id, sessionStartedAt: startedAt, source: entry.kind === 'mic' ? 'microphone' : 'system', start: capturedAt, end: capturedAt, text, final: true, imported: true }); transcriptCount += 1;
    }
  }
  return { session, transcriptCount, screenshotCount };
}
