/** Titles go into Markdown headings, HTML titles and Word documents: line breaks and other control characters must never reach them. */
// \p{Cc} is every control character, \p{Zl} and \p{Zp} are the Unicode line and paragraph separators,
// \p{Cf} is every format character (direction overrides, zero-width characters).
export const cleanTitle = (value) => String(value ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\p{Cf}+/gu, '').replace(/\s+/g, ' ').trim();

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** A download name: letters, digits, dot, underscore and hyphen only, never starting with a dot, never a Windows reserved name, at most 100 characters. */
export const fileSafeName = (name) => {
  const safe = String(name ?? '').replace(/\p{Cf}+/gu, '').replaceAll(/[^a-z0-9._-]+/gi, '-').replaceAll(/^[-.]+|-+$/g, '').slice(0, 100).replace(/[.]+$/, '');
  return !safe || WINDOWS_RESERVED.test(safe) ? (safe ? `transcript-${safe}` : 'transcript') : safe;
};
