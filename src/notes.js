// Pure helpers for live notes. A note is a transcript segment with source 'note'.

/** Elapsed time as 00:24, or 1:02:03 once an hour has passed. */
export function elapsedLabel(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const mm = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const noteScreenshotIds = (segment) => (Array.isArray(segment.screenshotIds) ? segment.screenshotIds : []);
export const noteStamp = (segment) => elapsedLabel(segment.start - segment.sessionStartedAt);

/** "[00:24] Note: text", followed by one line per attached screenshot. Used by the plain text export. */
export function noteLines(segment) {
  const stamp = noteStamp(segment);
  const count = noteScreenshotIds(segment).length;
  const lines = [`[${stamp}] Note: ${segment.text}`];
  for (let index = 1; index <= count; index += 1) lines.push(`[${stamp}] Screenshot ${index} of ${count} attached to note`);
  return lines;
}

/** Caption text for subtitle cues. */
export function noteCueText(segment) {
  const count = noteScreenshotIds(segment).length;
  return count ? `${segment.text} (${count} screenshot${count === 1 ? '' : 's'} attached)` : segment.text;
}
