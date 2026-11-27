import { cleanTitle } from './safe-text.js';
import { escapeMarkdownText } from './call-markdown-import.js';
import { noteScreenshotIds, noteStamp } from './notes.js';

/** Build the CallScribe Markdown transcript lines. Pure: callers supply formatting and data URL helpers. */
export async function transcriptMarkdown({ title, provenance, exportedAt, segments, screenshots, formatDateTime, sourceName, speakerText, toDataUrl }) {
  const byId = new Map(screenshots.map((shot) => [shot.id, shot]));
  const exported = new Set();
  const lines = [`# ${cleanTitle(title) || 'Transcript'}`, '', '## Generated with', '', provenance, '', `Exported: ${exportedAt}`, ''];
  const picture = async (shot) => {
    lines.push(`![Screenshot captured ${formatDateTime(shot.capturedAt)}](${await toDataUrl(shot.blob)})`, '');
    if (shot.ocrText) lines.push(`Screenshot OCR: ${shot.ocrText}`, '');
  };
  for (const segment of segments) {
    if (segment.source === 'note') {
      // "[00:24] Note: text", then each attached screenshot as an ordinary Screenshot block so import reads it back.
      const stamp = noteStamp(segment);
      lines.push(`## ${formatDateTime(segment.start)} — Note`, '', escapeMarkdownText(`[${stamp}] Note: ${segment.text || ''}`), '');
      for (const id of noteScreenshotIds(segment)) {
        const shot = byId.get(id);
        if (!shot || exported.has(id)) continue;
        exported.add(id);
        lines.push(`## ${formatDateTime(shot.capturedAt)} — Screenshot`, '', `[Screenshot attached to note at ${stamp}]`, '');
        await picture(shot);
      }
      continue;
    }
    lines.push(`## ${formatDateTime(segment.start)} — ${sourceName(segment.source)}${speakerText(segment)}`, '', escapeMarkdownText(segment.text || ''), '');
    if (segment.source !== 'screen' || !segment.screenshotId || exported.has(segment.screenshotId)) continue;
    const shot = byId.get(segment.screenshotId);
    if (!shot) continue;
    exported.add(shot.id);
    await picture(shot);
  }
  for (const shot of screenshots) {
    if (exported.has(shot.id)) continue;
    lines.push(`## Screenshot — ${formatDateTime(shot.capturedAt)}`, '');
    await picture(shot);
  }
  return lines.join('\n');
}
