import { cleanTitle } from './safe-text.js';

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
    lines.push(`## ${formatDateTime(segment.start)} — ${sourceName(segment.source)}${speakerText(segment)}`, '', segment.text || '', '');
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
