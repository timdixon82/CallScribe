import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedLabel, noteCueText, noteLines } from '../src/notes.js';
import { transcriptMarkdown } from '../src/call-markdown-export.js';
import { parseBlocks } from '../src/call-markdown-import.js';

const note = { id: 'n1', source: 'note', sessionStartedAt: 1000, start: 25000, text: 'Agree <b>budget</b>', screenshotIds: ['s1'] };

test('elapsedLabel gives mm:ss and h:mm:ss', () => {
  assert.equal(elapsedLabel(24000), '00:24');
  assert.equal(elapsedLabel(3723000), '1:02:03');
  assert.equal(elapsedLabel(-5), '00:00');
});

test('noteLines gives the bracketed line and one line per screenshot', () => {
  assert.deepEqual(noteLines(note), ['[00:24] Note: Agree <b>budget</b>', '[00:24] Screenshot 1 of 1 attached to note']);
  assert.deepEqual(noteLines({ ...note, screenshotIds: undefined }), ['[00:24] Note: Agree <b>budget</b>']);
});

test('noteCueText mentions screenshots for subtitle cues', () => {
  assert.equal(noteCueText(note), 'Agree <b>budget</b> (1 screenshot attached)');
  assert.equal(noteCueText({ ...note, screenshotIds: [] }), 'Agree <b>budget</b>');
});

test('noteCueText keeps SRT and VTT cues free of blank lines', () => {
  const multi = { ...note, text: 'Line one\nline two\r\n\r\n\nline three', screenshotIds: [] };
  assert.equal(noteCueText(multi), 'Line one line two line three');
  for (const header of ['1\n00:00:01,000 --> 00:00:02,000\n', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n']) {
    const cue = `${header}[Note] ${noteCueText(multi)}\n`;
    assert.ok(!/\n\s*\n./.test(cue.replace(/^WEBVTT\n\n/, '')), 'no blank line inside the cue');
  }
});

test('Markdown export carries the note and its screenshot, and import reads them back', async () => {
  const shot = { id: 's1', capturedAt: 26000, blob: {}, ocrText: '' };
  const markdown = await transcriptMarkdown({ title: 'T', provenance: 'p', exportedAt: 'now', segments: [note], screenshots: [shot], formatDateTime: (t) => `t${t}`, sourceName: () => 'x', speakerText: () => '', toDataUrl: async () => 'data:image/png;base64,AAAA' });
  assert.match(markdown, /^\[00:24\] Note: Agree <b>budget<\/b>$/m);
  assert.match(markdown, /Screenshot attached to note at 00:24/);
  assert.equal(markdown.match(/data:image\/png/g).length, 1, 'screenshot is exported once');
  const { blocks } = parseBlocks(markdown);
  assert.deepEqual(blocks.map((b) => b.kind), ['note', 'screenshot']);
});
