import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph } from 'docx';
import { readFile } from 'node:fs/promises';
import { chunkEvidence, consolidateExtractions, conservativeRecovery, DEFAULT_MINUTES_SETTINGS, evidenceFingerprint, evidenceReferences, MINUTES_MODELS, minutesMarkdown, perceptualDifference, prepareMinutesEvidence, selectRelevantScreenshots, summaryHeadline, validateExtraction } from '../src/minutes.js';

const session = { id: 'session-1', name: 'Planning', startedAt: 1000 };
const segments = [
  { id: 'a', sessionId: 'session-1', source: 'microphone', start: 1000, end: 2000, text: 'Alex confirmed the release. Sam will test it by Friday.', speakerIds: ['alex'] },
  { id: 'b', sessionId: 'session-1', source: 'system', start: 3000, end: 4000, text: 'The proposed budget is not agreed.', speakerIds: ['sam'] },
  { id: 'ocr', sessionId: 'session-1', source: 'ocr', start: 3500, end: 3500, text: 'Release plan version 2', screenshotId: 'shot-1' },
];
const screenshots = [{ id: 'shot-1', sessionId: 'session-1', capturedAt: 3500, ocrText: 'Release plan version 2', reason: 'Manual screenshot' }];

test('minutes catalogue makes model cost and requirements explicit', () => {
  assert.deepEqual(MINUTES_MODELS.map((model) => model.id), ['qwen3-0.6b', 'qwen3-4b']);
  assert.equal(DEFAULT_MINUTES_SETTINGS.screenshots, 'relevant');
  assert.match(MINUTES_MODELS[1].download, /GB/);
});

test('preparation preserves source IDs, speakers, chronology, and one OCR screenshot reference', () => {
  const evidence = prepareMinutesEvidence({ session, segments, screenshots, participants: [{ id: 'alex', name: 'Alex' }, { id: 'sam', name: 'Sam' }] });
  assert.deepEqual(evidence.entries.map((entry) => entry.id), ['a', 'b']);
  assert.deepEqual(evidence.entries[0].speaker, ['Alex']);
  assert.deepEqual(evidence.session.audioSources, ['microphone', 'system']);
  assert.equal(evidence.screenshots[0].ocrText, 'Release plan version 2');
});

test('preparation uses a linked OCR segment when an older screenshot has no OCR field', () => {
  const evidence = prepareMinutesEvidence({ session: { id: 'session-1' }, participants: [], screenshots: [{ id: 'shot-1', capturedAt: 2000, ocrText: '' }], segments: [{ id: 'ocr-1', source: 'ocr', screenshotId: 'shot-1', start: 2000, end: 2000, text: 'Legacy diagram title' }] });
  assert.equal(evidence.entries.length, 0);
  assert.equal(evidence.screenshots[0].ocrText, 'Legacy diagram title');
});

test('chunking retains a controlled overlap and nearby screenshots', () => {
  const evidence = prepareMinutesEvidence({ session, segments, screenshots });
  const chunks = chunkEvidence(evidence, 7, 3);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].entries[0].id, 'a');
  assert.equal(chunks[1].screenshots[0].id, 'shot-1');
});

test('chunking prefers a natural pause near the size boundary', () => {
  const evidence = prepareMinutesEvidence({ session, screenshots: [], segments: [
    { id: 'first', source: 'microphone', start: 0, end: 1000, text: 'one two three four' },
    { id: 'second', source: 'microphone', start: 1100, end: 2000, text: 'five six seven eight' },
    { id: 'after-pause', source: 'microphone', start: 6000, end: 7000, text: 'nine ten eleven twelve' },
    { id: 'last', source: 'microphone', start: 7100, end: 8000, text: 'thirteen fourteen fifteen sixteen' },
  ] });
  const chunks = chunkEvidence(evidence, 13, 0);
  assert.deepEqual(chunks[0].entries.map((item) => item.id), ['first', 'second']);
  assert.equal(chunks[1].entries[0].id, 'after-pause');
});

test('extraction validation rejects invented source identifiers and represents missing fields as null', () => {
  const chunk = chunkEvidence(prepareMinutesEvidence({ session, segments, screenshots }))[0];
  const result = validateExtraction({ actions: [{ text: 'Test the release', owner: '', dueDate: '', status: 'confirmed', sourceSegmentIds: ['a', 'invented'], screenshotIds: ['shot-1', 'invented'] }], decisions: [{ text: 'Release', status: 'confirmed', sourceSegmentIds: ['a'] }] }, chunk);
  assert.deepEqual(result.actions[0].sourceSegmentIds, ['a']);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[0].dueDate, null);
  assert.deepEqual(result.actions[0].screenshotIds, ['shot-1']);
  assert.throws(() => validateExtraction([], chunk));
});

test('unsupported actions and decisions are removed rather than presented as evidence', () => {
  const chunk = chunkEvidence(prepareMinutesEvidence({ session, segments, screenshots }))[0];
  const result = validateExtraction({ actions: [{ text: 'Invented action', owner: 'Alex', sourceSegmentIds: [] }], decisions: [{ text: 'Invented decision', status: 'confirmed', sourceSegmentIds: ['missing'] }] }, chunk);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.decisions, []);
});

test('conservative recovery retains traceable discussion without turning tentative language into commitments', () => {
  const chunk = chunkEvidence(prepareMinutesEvidence({ session, segments: [
    { id: 'tentative', source: 'microphone', start: 0, end: 1000, text: 'We need to decide whether the release should include the budget option.' },
    { id: 'confirmed', source: 'microphone', start: 2000, end: 3000, text: 'We agreed the release will use the local pipeline.' },
  ], screenshots: [] }))[0];
  const recovered = conservativeRecovery(chunk);
  assert.deepEqual(recovered.discussion.map((item) => item.sourceSegmentIds[0]), ['tentative', 'confirmed']);
  assert.deepEqual(recovered.decisions.map((item) => item.sourceSegmentIds[0]), ['confirmed']);
  assert.equal(recovered.actions.length, 0);
});

test('consolidation deduplicates exact repeats but preserves conflicting decisions', () => {
  const result = consolidateExtractions([{ decisions: [{ text: 'Use blue', status: 'proposed', sourceSegmentIds: ['a'], screenshotIds: ['one'] }] }, { decisions: [{ text: 'Use blue', status: 'confirmed', sourceSegmentIds: ['b'], screenshotIds: ['two'] }] }]);
  assert.equal(result.decisions.length, 2);
  assert.deepEqual(result.screenshotIds, ['one', 'two']);
});

test('consolidation removes near-duplicate discussion and honours output detail limits', () => {
  const repeated = Array.from({ length: 20 }, (_, index) => ({ discussion: [{ text: `The team discussed the support review and follow-up plan number ${index}.`, sourceSegmentIds: [`s${index}`], screenshotIds: [] }] }));
  const concise = consolidateExtractions(repeated, 'concise');
  assert.equal(concise.discussion.length, 1);
  const labels = ['budgeting', 'recruitment', 'architecture', 'accessibility', 'training', 'procurement', 'governance', 'research', 'scheduling', 'migration'];
  const distinct = labels.map((label, index) => ({ discussion: [{ text: `The meeting covered ${label} and its separate practical concern.`, sourceSegmentIds: [`d${index}`], screenshotIds: [] }] }));
  assert.equal(consolidateExtractions(distinct, 'concise').discussion.length, 6);
  assert.equal(consolidateExtractions(distinct, 'detailed').discussion.length, 10);
});

const longCall = () => Array.from({ length: 38 }, (_, part) => ({
  discussion: [0, 1, 2].map((k) => ({ text: `Part ${part} topic ${k} covers alpha${part}x${k} beta${part}x${k} gamma${part}x${k}`, sourceSegmentIds: [`s${part}-${k}`], screenshotIds: [] })),
  decisions: [{ text: `Decision ${part} on delta${part} epsilon${part} zeta${part}`, status: 'confirmed', sourceSegmentIds: [`d${part}`], screenshotIds: [] }],
  actions: [{ text: `Action ${part} for eta${part} theta${part} iota${part}`, owner: null, dueDate: null, status: 'proposed', sourceSegmentIds: [`a${part}`], screenshotIds: [] }],
}));
const partOf = (item) => Number(/(?:Part|Decision|Action) (\d+)/.exec(item.text)[1]);

test('a long call is summarised from start, middle and end at every length', () => {
  for (const [detail, limit] of [['concise', 6], ['standard', 12], ['detailed', 24]]) {
    const result = consolidateExtractions(longCall(), detail);
    assert.equal(result.discussion.length, limit);
    const parts = result.discussion.map(partOf);
    assert.deepEqual(parts, [...parts].sort((a, b) => a - b), 'chronological order');
    for (const third of [0, 1, 2]) assert.ok(parts.some((part) => Math.floor((part * 3) / 38) === third), `${detail} covers third ${third}`);
    assert.ok(result.discussion.every((item) => item.sourceSegmentIds.length === 1), 'source ids kept');
  }
});

test('late decisions and actions are kept, not dropped for early ones', () => {
  const result = consolidateExtractions(longCall(), 'concise');
  assert.ok(result.decisions.map(partOf).some((part) => part >= 26));
  assert.ok(result.actions.map(partOf).some((part) => part >= 26));
  assert.ok(result.decisions.every((item) => item.sourceSegmentIds.length === 1));
});

test('similar topics are merged before coverage is spread', () => {
  const repeats = Array.from({ length: 10 }, (_, i) => ({ discussion: [{ text: `Budget forecast review for the quarter ${i}`, sourceSegmentIds: [`b${i}`], screenshotIds: [] }] }));
  const late = { discussion: [{ text: 'Hiring plan for engineers', sourceSegmentIds: ['late'], screenshotIds: [] }] };
  const result = consolidateExtractions([...repeats, late], 'concise');
  assert.ok(result.discussion.some((item) => item.sourceSegmentIds[0] === 'late'));
});

test('the shared headline draws on start, middle and end', () => {
  const lines = summaryHeadline(consolidateExtractions(longCall(), 'standard')).split('\n').filter((line) => line.startsWith('- '));
  assert.equal(lines.length, 3);
  const parts = lines.map((line) => Number(/Part (\d+)/.exec(line)[1]));
  assert.ok(parts[0] < 13 && parts[1] >= 13 && parts[1] < 26 && parts[2] >= 26);
  assert.match(summaryHeadline({ discussion: [] }), /No explicit discussion points/);
});

test('both workers share the headline and the 0.6B model follows the chosen length', async () => {
  for (const file of ['minutes.worker.v2.js', 'minutes.webllm.worker.js']) assert.match(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'), /summaryHeadline/);
  assert.doesNotMatch(await readFile(new URL('../src/minutes.webllm.worker.js', import.meta.url), 'utf8'), /qwen3-0\.6b' && data\.settings/);
});

test('relevant screenshot selection removes close OCR duplicates without removing distinct evidence', () => {
  const chosen = selectRelevantScreenshots([{ id: 'one', capturedAt: 1000, ocrText: 'Plan A' }, { id: 'two', capturedAt: 2000, ocrText: 'Plan A' }, { id: 'three', capturedAt: 3000, ocrText: 'Plan B' }], ['one', 'two', 'three']);
  assert.deepEqual(chosen.map((item) => item.id), ['one', 'three']);
});

test('relevant screenshot selection removes exact local image duplicates', () => {
  const chosen = selectRelevantScreenshots([{ id: 'one', capturedAt: 1000, ocrText: 'First caption', exactHash: 'abc' }, { id: 'two', capturedAt: 2000, ocrText: 'Second caption', exactHash: 'abc' }, { id: 'three', capturedAt: 3000, ocrText: 'Distinct', exactHash: 'def' }], ['one', 'two', 'three']);
  assert.deepEqual(chosen.map((item) => item.id), ['one', 'three']);
});

test('relevant screenshot selection also removes near-identical visual captures with different OCR', () => {
  const chosen = selectRelevantScreenshots([{ id: 'one', capturedAt: 1000, ocrText: 'Plan A', perceptualHash: [10, 20] }, { id: 'two', capturedAt: 2000, ocrText: 'Plan A revised', perceptualHash: [11, 19] }, { id: 'three', capturedAt: 3000, ocrText: 'Plan B', perceptualHash: [80, 20] }], ['one', 'two', 'three']);
  assert.deepEqual(chosen.map((item) => item.id), ['one', 'three']);
  assert.equal(perceptualDifference([1, 2], [2, 4]), 1.5);
});

test('minute rendering honours the selected sections', () => {
  const output = minutesMarkdown({ title: 'Test', summary: 'Summary', settings: { sections: ['actions'] }, actions: [{ text: 'Do it', owner: null, dueDate: null, status: 'confirmed', screenshotIds: ['shot-1'] }], decisions: [{ text: 'Agree it', status: 'confirmed' }] });
  assert.match(output, /Actions and owners/);
  assert.match(output, /\[\[screenshot:shot-1\]\]/);
  assert.doesNotMatch(output, /Executive summary|Decisions made/);
});

test('minute rendering honours a user-selected section order', () => {
  const output = minutesMarkdown({ title: 'Test', summary: 'Summary', settings: { sections: ['summary', 'actions'], sectionOrder: ['actions', 'summary'] }, actions: [{ text: 'Do it', status: 'confirmed', screenshotIds: [] }] });
  assert.ok(output.indexOf('## Actions and owners') < output.indexOf('## Executive summary'));
});

test('minute rendering includes structured extraction fields retained alongside evidence', () => {
  const extraction = { discussion: [], decisions: [{ text: 'Use the local pipeline', status: 'confirmed', screenshotIds: [] }], actions: [{ text: 'Publish notes', owner: 'Sam', dueDate: null, status: 'confirmed', screenshotIds: [] }], questions: [], risks: [], screenshotIds: [] };
  const output = minutesMarkdown({ title: 'Test', summary: 'Summary', settings: { sections: ['decisions', 'actions'] }, ...extraction });
  assert.match(output, /Use the local pipeline/);
  assert.match(output, /Publish notes — Sam/);
});

test('requested evidence references preserve decision and action source labels', () => {
  const references = evidenceReferences({ decisions: [{ text: 'Use local inference', sourceSegmentIds: ['a'] }], actions: [{ text: 'Test exports', sourceSegmentIds: ['b'] }] }, (id) => id === 'a' ? '09:00: Confirmed local processing' : '09:05: Sam will test');
  assert.match(references, /Decisions: Use local inference — 09:00/);
  assert.match(references, /Actions: Test exports — 09:05/);
});

test('the browser-side DOCX dependency can create an Office document', async () => {
  const blob = await Packer.toBlob(new Document({ sections: [{ children: [new Paragraph('CallScribe summary')] }] }));
  assert.ok(blob.size > 1000);
});

test('an hour-plus synthetic transcript is chunked without losing chronological source references', () => {
  const longSegments = Array.from({ length: 241 }, (_, index) => ({ id: `minute-${index}`, source: 'microphone', start: index * 60000, end: index * 60000 + 59000, text: Array.from({ length: 100 }, () => `word${index}`).join(' ') }));
  const chunks = chunkEvidence(prepareMinutesEvidence({ session, segments: longSegments, screenshots: [] }));
  assert.ok(chunks.length > 20);
  assert.equal(chunks[0].entries[0].id, 'minute-0');
  assert.equal(chunks.at(-1).entries.at(-1).id, 'minute-240');
  assert.ok(chunks.every((chunk) => chunk.entries.every((entry) => /^minute-\d+$/.test(entry.id))));
});

test('empty and incomplete transcripts remain safe inputs', () => {
  const evidence = prepareMinutesEvidence({ session, segments: [{ id: 'blank', source: 'microphone', start: undefined, end: undefined, text: '' }], screenshots: [] });
  assert.deepEqual(chunkEvidence(evidence), []);
});

test('the resumable-run fingerprint changes when source evidence changes without storing a duplicate transcript', () => {
  const evidence = prepareMinutesEvidence({ session, segments, screenshots });
  const changed = structuredClone(evidence); changed.entries[0].text = 'A corrected transcript passage';
  assert.notEqual(evidenceFingerprint(evidence), evidenceFingerprint(changed));
  assert.match(evidenceFingerprint(evidence), /^[0-9a-f]+$/);
});

test('the active worker creates a conservative evidence-based result after chunk extraction', async () => {
  const worker = await readFile(new URL('../src/minutes.worker.v2.js', import.meta.url), 'utf8');
  assert.match(worker, /env\.useCustomCache\s*=\s*true; env\.customCache\s*=\s*scopedCache\(TRANSFORMERS_CACHE\); env\.useBrowserCache\s*=\s*false/);
  assert.match(worker, /env\.allowLocalModels\s*=\s*false/);
  assert.doesNotMatch(worker, /local_files_only/);
  assert.match(worker, /Use an empty array whenever there is no explicit evidence/);
  assert.match(worker, /conservativeRecovery/);
  assert.match(worker, /consolidateExtractions\(extractions, data\.settings\?\.detail\)/);
  assert.match(worker, /structuredChunks/);
  assert.match(worker, /recoveryChunks/);
  assert.match(worker, /async function dispose\(\)/);
  assert.match(worker, /generator\?\.dispose\?\.\(\)/);
  assert.match(worker, /generationMs/);
  assert.match(worker, /chunkMs/);
});

test('the WebLLM detailed path performs a local distinct-topic consolidation pass', async () => {
  const worker = await readFile(new URL('../src/minutes.webllm.worker.js', import.meta.url), 'utf8');
  assert.match(worker, /async function prioritiseDiscussion/);
  assert.match(worker, /Consolidating distinct topics locally/);
  assert.match(worker, /preserve the original[\s\S]*extracted records/);
  assert.match(worker, /comma-separated candidate IDs/);
  assert.match(worker, /Never invent a decision, owner, deadline, action, attendee, speaker/);
  assert.match(worker, /summaryHeadline/);
});

test('the interface explains offline first-download requirements before inference', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /is not cached\. Connect to the internet once/);
  assert.match(source, /navigator\.onLine === false/);
});

test('the notes interface keeps generation inline, remembers customisation, and has one editable notes surface', async () => {
  const [source, page, css] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/compact.css', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /<h1 id="meeting-notes-heading">Summary<\/h1>/);
  assert.match(css, /#meeting-notes-heading \{ font-size: 1\.5rem; \}/);
  assert.match(source, /putSetting\('minutesSettings', selectedMinutesSettings\(\)\)/);
  assert.match(source, /getSetting\('minutesSettings'\)/);
  assert.doesNotMatch(source, /post-stop-dialog/);
  assert.doesNotMatch(page, /post-stop-dialog|add-minutes-decision|add-minutes-action|minutes-structure/);
  assert.match(page, /id="minutes-customisation"/);
  assert.match(page, /This is the one editable version of the notes/);
  assert.match(css, /#minutes-content \{ width: 100%; max-width: none; min-height: clamp\(28rem, 60vh, 52rem\)/);
  assert.match(source, /ui\['minutes-editor'\]\.hidden = busy \|\| !minutesNote/);
  assert.doesNotMatch(source, /Qwen3 4B downloads \$\{model\.download\}/);
});

test('the application shell cache is versioned and removes only prior shell caches', async () => {
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(worker, /callscribe-shell-__BUILD_ID__/);
  assert.match(worker, /key\.startsWith\('callscribe-shell-'\)/);
  assert.match(worker, /clients\.claim\(\)/);
  assert.match(worker, /skipWaiting\(\)/);
});

test('HTML minutes export groups bullet items in semantic lists', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /function minutesHtmlBody/);
  assert.match(source, /<ul>\$\{list\.map/);
  assert.doesNotMatch(source, /safe\.startsWith\('- '\) \? `<li>/);
  assert.match(source, /element\.textContent = String\(value \?\? ''\)/);
  assert.doesNotMatch(source, /replaceAll\('&', '&amp;'\)/);
});
