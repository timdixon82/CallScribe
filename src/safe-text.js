/** Titles go into Markdown headings, HTML titles and Word documents: line breaks and other control characters must never reach them. */
// \p{Cc} is every control character, \p{Zl} and \p{Zp} are the Unicode line and paragraph separators.
export const cleanTitle = (value) => String(value ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** A download name: letters, digits, dot, underscore and hyphen only, never starting with a dot, at most 100 characters. */
export const fileSafeName = (name) => String(name ?? '').replaceAll(/[^a-z0-9._-]+/gi, '-').replaceAll(/^[-.]+|-+$/g, '').slice(0, 100) || 'transcript';
