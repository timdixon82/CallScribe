export const MINUTES_MODELS = [
  { id: 'qwen3-0.6b', name: 'Qwen3 0.6B', repo: 'onnx-community/Qwen3-0.6B-ONNX', webllmModel: 'Qwen3-0.6B-q4f16_1-MLC', dtype: 'q4f16', download: 'about 570 MB', requirement: 'WebGPU recommended; lightweight extraction.', tier: 'lightweight' },
  { id: 'qwen3-4b', name: 'Qwen3 4B', webllmModel: 'Qwen3-4B-q4f16_1-MLC', download: 'about 2.8 GB', requirement: 'WebGPU and at least 8 GB free memory/storage recommended.', tier: 'detailed' },
];

export const DEFAULT_MINUTES_SETTINGS = Object.freeze({
  modelId: 'qwen3-0.6b', detail: 'standard', screenshots: 'relevant',
  sections: ['summary', 'topics', 'decisions', 'actions', 'deadlines', 'questions', 'risks', 'followUp'],
  sectionOrder: ['summary', 'topics', 'decisions', 'actions', 'deadlines', 'questions', 'risks', 'followUp'],
});

const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);
const normal = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function speakerNames(segment, participants = []) {
  const names = new Map(participants.map((person) => [person.id, person.name]));
  return (segment.speakerIds || segment.automaticSpeakerIds || []).map((id) => names.get(id)).filter(Boolean);
}

export function prepareMinutesEvidence({ session, segments, screenshots, participants = [] }) {
  const screenshotById = new Map(screenshots.map((item) => [item.id, item]));
  // Screenshot OCR is attached to its screenshot below. Keeping it out of the
  // spoken-entry stream prevents the same OCR text being sent in every nearby
  // chunk as well as in the screenshot context.
  const entries = segments.filter((segment) => segment.source !== 'screen' && segment.source !== 'ocr' && String(segment.text || '').trim()).sort((a, b) => (a.start || 0) - (b.start || 0)).map((segment) => ({
    id: segment.id, start: segment.start, end: segment.end, source: segment.source,
    speaker: speakerNames(segment, participants), text: String(segment.text || ''), screenshotId: segment.screenshotId || null,
  }));
  const captures = screenshots.map((shot) => ({ id: shot.id, capturedAt: shot.capturedAt, ocrText: shot.ocrText || '', reason: shot.reason || '', width: shot.width, height: shot.height, exactHash: shot.exactHash || null, perceptualHash: shot.perceptualHash || null }));
  // Older records can have OCR only in a linked transcript segment. Fold it
  // into the one screenshot record used by the model; never repeat it in the
  // spoken-entry stream or every nearby chunk.
  for (const segment of segments) if (segment.source === 'ocr' && segment.screenshotId && screenshotById.has(segment.screenshotId)) {
    const target = captures.find((shot) => shot.id === segment.screenshotId); if (target && !target.ocrText) target.ocrText = String(segment.text || '');
  }
  return { session: { id: session.id, name: session.name, startedAt: session.startedAt, endedAt: session.endedAt || null, audioSources: [...new Set(entries.map((entry) => entry.source))] }, entries, screenshots: captures };
}

export function chunkEvidence(evidence, maxWords = 1150, overlapWords = 120) {
  const chunks = []; let current = []; let size = 0; let index = 0;
  for (const entry of evidence.entries) {
    const entryWords = Math.max(1, words(entry.text).length);
    if (current.length && size + entryWords > maxWords) {
      const boundary = preferredBoundary(current);
      const completed = current.slice(0, boundary);
      chunks.push(makeChunk(evidence, completed, index++));
      const overlap = tailOverlap(completed, overlapWords);
      current = [...overlap, ...current.slice(boundary)]; size = current.reduce((total, item) => total + words(item.text).length, 0);
    }
    current.push(entry); size += entryWords;
  }
  if (current.length) chunks.push(makeChunk(evidence, current, index));
  return chunks;
}

function preferredBoundary(entries) {
  if (entries.length < 2) return entries.length;
  const earliest = Math.max(1, Math.floor(entries.length * 0.6)); let speakerBoundary = entries.length;
  for (let index = entries.length - 1; index >= earliest; index -= 1) {
    const before = entries[index - 1]; const after = entries[index];
    const pause = Math.max(0, (after.start || 0) - (before.end || before.start || 0));
    if (pause >= 2000) return index;
    if (speakerBoundary === entries.length && before.speaker.join('|') !== after.speaker.join('|')) speakerBoundary = index;
  }
  return speakerBoundary;
}

function tailOverlap(entries, maximumWords) {
  if (maximumWords <= 0) return [];
  const overlap = []; let size = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) { const entry = entries[index]; const entryWords = words(entry.text).length; if (size && size + entryWords > maximumWords) break; overlap.unshift(entry); size += entryWords; if (size >= maximumWords) break; }
  return overlap;
}

// A lightweight local change detector for resumable work. It avoids retaining
// another copy of transcript text in the checkpoint record; it is not a
// security or identity hash.
export function evidenceFingerprint(evidence) {
  let hash = 2166136261;
  const update = (value) => { for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } };
  update(evidence.session.id); for (const entry of evidence.entries) update(`${entry.id}|${entry.start}|${entry.end}|${entry.text}`); for (const shot of evidence.screenshots) update(`${shot.id}|${shot.capturedAt}|${shot.ocrText}`);
  return (hash >>> 0).toString(16);
}

function makeChunk(evidence, entries, index) {
  const first = entries[0]; const last = entries.at(-1);
  const captures = evidence.screenshots.filter((shot) => shot.capturedAt >= first.start - 120000 && shot.capturedAt <= last.end + 120000);
  return { id: `chunk-${index + 1}`, index, start: first.start, end: last.end, entries, screenshots: captures };
}

export function validateExtraction(value, chunk) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The model did not return a JSON object.');
  const allowedIds = new Set(chunk.entries.map((entry) => entry.id));
  const references = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => allowedIds.has(id)))];
  const screenshotIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => chunk.screenshots.some((shot) => shot.id === id)))];
  const list = (name, transform = (item) => item, sourceRequired = false) => (Array.isArray(value[name]) ? value[name] : []).filter((item) => item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim()).map((item) => ({ ...transform(item), text: item.text.trim(), sourceSegmentIds: references(item.sourceSegmentIds), screenshotIds: screenshotIds(item.screenshotIds) })).filter((item) => !sourceRequired || item.sourceSegmentIds.length);
  return {
    discussion: list('discussion'),
    decisions: list('decisions', (item) => ({ status: ['confirmed', 'proposed', 'conflicting'].includes(item.status) ? item.status : 'proposed' }), true),
    actions: list('actions', (item) => ({ owner: typeof item.owner === 'string' && item.owner.trim() ? item.owner.trim() : null, dueDate: typeof item.dueDate === 'string' && item.dueDate.trim() ? item.dueDate.trim() : null, status: ['confirmed', 'proposed', 'completed', 'unresolved'].includes(item.status) ? item.status : 'unresolved' }), true),
    questions: list('questions'), risks: list('risks'), screenshotIds: screenshotIds(value.screenshotIds),
  };
}

// A narrow, evidence-preserving safety net. A model can return syntactically
// valid but completely empty JSON for a chunk that clearly contains speech.
// Retain traceable discussion passages, and classify commitments only where
// the words themselves are explicit; never upgrade a suggestion to a decision.
export function conservativeRecovery(chunk) {
  const rows = (chunk?.entries || []).filter((entry) => words(entry.text).length >= 6);
  const item = (entry) => ({ text: String(entry.text || '').replace(/\s+/g, ' ').trim().slice(0, 320), sourceSegmentIds: [entry.id], screenshotIds: [] });
  const has = (entry, expression) => expression.test(String(entry.text || ''));
  return {
    discussion: rows.slice(0, 3).map(item),
    decisions: rows.filter((entry) => has(entry, /\b(?:we(?:'ve| have)? (?:agreed|decided)|it (?:has been|is) agreed|the decision (?:is|was)|approved)\b/i)).slice(0, 2).map((entry) => ({ ...item(entry), status: 'confirmed' })),
    actions: rows.filter((entry) => has(entry, /\b(?:I|We|[A-Z][a-z]+)(?:'ll| will| shall) (?:follow up|review|send|arrange|prepare|complete|create|update|schedule|contact|document|check|share|confirm|discuss)\b/i)).slice(0, 3).map((entry) => ({ ...item(entry), owner: null, dueDate: null, status: 'proposed' })),
    questions: rows.filter((entry) => /\?\s*$/.test(String(entry.text || '').trim())).slice(0, 2).map(item),
    risks: rows.filter((entry) => has(entry, /\b(?:risk|risking|blocker|blocked|dependency|dependent on|concern)\b/i)).slice(0, 2).map(item),
    screenshotIds: [],
  };
}

function unique(items, key) { const seen = new Set(); return items.filter((item) => { const value = key(item); if (!value || seen.has(value)) return false; seen.add(value); return true; }); }
function isNearDuplicate(left, right) { const leftWords = new Set(normal(left).split(' ').filter((word) => word.length > 2)); const rightWords = new Set(normal(right).split(' ').filter((word) => word.length > 2)); if (!leftWords.size || !rightWords.size) return false; let overlap = 0; for (const word of leftWords) if (rightWords.has(word)) overlap += 1; return overlap / Math.min(leftWords.size, rightWords.size) >= 0.92; }
function distinct(items, key = (item) => item.text) { const kept = []; for (const item of items) if (!kept.some((prior) => isNearDuplicate(key(prior), key(item)))) kept.push(item); return kept; }
const DETAIL_LIMITS = { concise: { discussion: 6, decisions: 4, actions: 5, questions: 4, risks: 4 }, standard: { discussion: 12, decisions: 8, actions: 8, questions: 6, risks: 6 }, detailed: { discussion: 24, decisions: 14, actions: 14, questions: 10, risks: 10 } };
export function consolidateExtractions(extractions, detail = 'standard') {
  const all = (key) => extractions.flatMap((item) => item[key] || []);
  const itemScreenshotIds = ['discussion', 'decisions', 'actions', 'questions', 'risks'].flatMap((key) => all(key).flatMap((item) => item.screenshotIds || []));
  const limits = DETAIL_LIMITS[detail] || DETAIL_LIMITS.standard;
  return {
    discussion: distinct(unique(all('discussion'), (item) => normal(item.text))).slice(0, limits.discussion),
    decisions: distinct(unique(all('decisions'), (item) => `${item.status}|${normal(item.text)}`), (item) => `${item.status} ${item.text}`).slice(0, limits.decisions),
    actions: distinct(unique(all('actions'), (item) => `${item.status}|${normal(item.text)}|${normal(item.owner)}|${normal(item.dueDate)}`), (item) => `${item.status} ${item.text} ${item.owner || ''} ${item.dueDate || ''}`).slice(0, limits.actions),
    questions: distinct(unique(all('questions'), (item) => normal(item.text))).slice(0, limits.questions), risks: distinct(unique(all('risks'), (item) => normal(item.text))).slice(0, limits.risks),
    screenshotIds: [...new Set([...all('screenshotIds'), ...itemScreenshotIds])],
  };
}

export function selectRelevantScreenshots(screenshots, ids, mode = 'relevant') {
  if (mode === 'none') return [];
  const requested = mode === 'comprehensive' ? screenshots : screenshots.filter((shot) => ids.includes(shot.id));
  const kept = []; const seen = new Set();
  for (const shot of requested.sort((a, b) => a.capturedAt - b.capturedAt)) {
    const signature = normal(shot.ocrText).slice(0, 500);
    const nearDuplicate = kept.some((prior) => Math.abs(prior.capturedAt - shot.capturedAt) < 120000 && (prior.exactHash && prior.exactHash === shot.exactHash || signature && seen.has(signature) || perceptualDifference(prior.perceptualHash, shot.perceptualHash) < 5));
    if (!nearDuplicate) { kept.push(shot); if (signature) seen.add(signature); }
  }
  return kept;
}

export function perceptualDifference(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return Infinity;
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0) / left.length;
}

export function minutesMarkdown(note) {
  const enabled = new Set(note.settings?.sections || DEFAULT_MINUTES_SETTINGS.sections);
  const lines = [`# ${note.title}`, '']; const add = (heading, items, format = (item) => item.text) => { if (!items?.length) return; lines.push(`## ${heading}`, ''); for (const item of items) { lines.push(`- ${format(item)}`, ''); for (const screenshotId of item.screenshotIds || []) lines.push(`[[screenshot:${screenshotId}]]`, ''); } };
  const sections = {
    summary: () => lines.push('## Executive summary', '', note.summary || 'No summary was generated.', ''), topics: () => add('Topics discussed', note.discussion), decisions: () => add('Decisions made', note.decisions, (item) => `${item.text} (${item.status})`), actions: () => add('Actions and owners', note.actions, (item) => `${item.text}${item.owner ? ` — ${item.owner}` : ''}${item.dueDate ? `, due ${item.dueDate}` : ''} (${item.status})`), deadlines: () => add('Deadlines', (note.actions || []).filter((item) => item.dueDate), (item) => `${item.text} — ${item.dueDate}${item.owner ? ` (${item.owner})` : ''}`), questions: () => add('Outstanding questions', note.questions), risks: () => add('Risks and dependencies', note.risks), followUp: () => add('Follow-up items', (note.actions || []).filter((item) => item.status !== 'completed'), (item) => `${item.text}${item.owner ? ` — ${item.owner}` : ''}`),
  };
  const order = note.settings?.sectionOrder || DEFAULT_MINUTES_SETTINGS.sectionOrder;
  for (const key of order) if (enabled.has(key)) sections[key]?.();
  return lines.join('\n');
}

export function evidenceReferences(extraction, sourceLabel) {
  const lines = [];
  for (const [heading, items] of [['Decisions', extraction?.decisions], ['Actions', extraction?.actions]]) for (const item of items || []) for (const segmentId of item.sourceSegmentIds || []) lines.push(`- ${heading}: ${item.text} — ${sourceLabel(segmentId)}`);
  return lines.length ? `## Evidence references\n\n${lines.join('\n')}` : '';
}
