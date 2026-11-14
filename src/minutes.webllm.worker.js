import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { chunkEvidence, consolidateExtractions, conservativeRecovery, validateExtraction } from './minutes.js';

let engine;
let cancelled = false;
let checkpoint = { extractions: [], total: 0 };
const send = (type, detail = {}) => postMessage({ type, ...detail });
function jsonFrom(text) { const value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim(); const first = value.indexOf('{'); const last = value.lastIndexOf('}'); if (first < 0 || last < first) return {}; try { return JSON.parse(value.slice(first, last + 1)); } catch { return {}; } }
function summary(extraction) { const topics = extraction.discussion?.slice(0, 3).map((item) => item.text) || []; return topics.length ? `Key themes:\n\n${topics.map((topic) => `- ${topic}`).join('\n')}` : 'No explicit discussion points could be extracted from the transcript.'; }

function compactChunk(chunk) {
  const segmentIds = new Map(chunk.entries.map((entry, index) => [`s${index + 1}`, entry.id]));
  return { segmentIds, evidence: chunk.entries.map((entry, index) => ({ id: `s${index + 1}`, speaker: entry.speaker, text: entry.text })) };
}

function restore(value, compact) {
  const ids = (items) => Array.isArray(items) ? items.map((id) => compact.segmentIds.get(id)).filter(Boolean) : [];
  for (const key of ['discussion', 'decisions', 'actions', 'questions', 'risks']) for (const item of value?.[key] || []) item.sourceSegmentIds = ids(item.sourceSegmentIds);
  return value;
}

function messages(evidence, modelId) {
  if (modelId === 'qwen3-0.6b') return [
    { role: 'system', content: 'Write accurate, concise meeting notes from only the supplied evidence. Do not invent commitments, people, dates, or facts.' },
    { role: 'user', content: `Write up to three short bullet points describing only substantive discussion in this transcript part. State each point plainly, without a heading or preamble. Ignore greetings, acknowledgements, fragments, and any phrase that sounds nonsensical or cannot be confidently restated. Do not use JSON. Evidence: ${JSON.stringify(evidence)}` },
  ];
  return [
    { role: 'system', content: 'Extract accurate meeting evidence. Return JSON only. Never invent a decision, owner, deadline, action, attendee, speaker, or screenshot detail. Do not treat "need to decide" as a decision or a tentative suggestion as a confirmed action.' },
    { role: 'user', content: `Return exactly one JSON object of this form: {"discussion":[{"text":"brief neutral one-sentence paraphrase","sourceSegmentIds":["s1"],"screenshotIds":[]}],"decisions":[{"text":"explicit decision only","status":"confirmed","sourceSegmentIds":["s1"],"screenshotIds":[]}],"actions":[{"text":"explicit commitment only","owner":null,"dueDate":null,"status":"proposed","sourceSegmentIds":["s1"],"screenshotIds":[]}],"questions":[],"risks":[],"screenshotIds":[]}. Extract up to three discussion points from meaningful speech. Use neutral wording such as “The discussion covered…” unless the evidence explicitly identifies a person, role, group, or team. Every item needs a supplied source ID; use [] only where that category has no explicit evidence. Evidence: ${JSON.stringify(evidence)}` },
  ];
}

function plainDiscussion(raw, compact) {
  const value = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[\s\S]*?```/g, '').trim();
  const lines = value.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((line) => line.length >= 20 && !/^(?:here|sure|based on)/i.test(line)).slice(0, 3);
  const sourceSegmentIds = [...compact.segmentIds.keys()];
  return { discussion: lines.map((text) => ({ text: text.slice(0, 360), sourceSegmentIds, screenshotIds: [] })), decisions: [], actions: [], questions: [], risks: [], screenshotIds: [] };
}

// Chunk overlap protects context, but it also means that a detailed model can
// describe the same theme in adjacent chunks with different words. Let the
// already-loaded local model select distinct candidates; preserve the original
// extracted records (and their source IDs) rather than asking it to invent a
// fresh global summary.
async function prioritiseDiscussion(extraction, modelId, detail) {
  if (modelId !== 'qwen3-4b' || extraction.discussion.length < 3) return extraction;
  const maximum = detail === 'concise' ? 5 : detail === 'detailed' ? 12 : 8;
  const candidates = extraction.discussion.map((item, index) => ({ id: `d${index + 1}`, text: item.text }));
  const response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: 'Select distinct, evidence-backed meeting topics. Answer only with comma-separated candidate IDs.' },
      { role: 'user', content: `Select at most ${maximum} IDs for genuinely different, substantive topics. Keep chronological order. Omit duplicates, greetings, fragments, and near-duplicate work-life, focus-time, break, scheduling, or assessment points. Do not rewrite or add text. Answer like d1,d4,d7. Candidates: ${JSON.stringify(candidates)}` },
    ],
    temperature: 0,
    max_tokens: 120,
    extra_body: { enable_thinking: false },
  });
  const raw = response.choices[0]?.message?.content;
  const jsonSelected = jsonFrom(raw).selected;
  const selected = Array.isArray(jsonSelected) ? jsonSelected : String(raw || '').match(/\bd(?:[1-9]|1[0-2])\b/gi) || [];
  const byId = new Map(candidates.map((candidate, index) => [candidate.id, extraction.discussion[index]]));
  const discussion = [...new Set(selected)].map((id) => byId.get(id)).filter(Boolean).slice(0, maximum);
  return discussion.length >= 2 ? { ...extraction, discussion } : { ...extraction, discussion: extraction.discussion.slice(0, maximum) };
}

async function load(model) {
  cancelled = false;
  checkpoint = { extractions: [], total: 0 };
  const startedAt = performance.now();
  engine = await CreateMLCEngine(model.webllmModel, { initProgressCallback: (report) => send('model-status', { status: report.text }) });
  if (cancelled) return send('cancelled', checkpoint);
  send('model-ready', { modelId: model.id, device: 'webgpu', loadMs: Math.round(performance.now() - startedAt) });
}

async function generate(data) {
  const startedAt = performance.now();
  const chunkMs = []; const extractions = Array.isArray(data.extractions) ? [...data.extractions] : []; const chunks = chunkEvidence(data.evidence, 450, 60); let structuredChunks = extractions.length; let recoveryChunks = 0; cancelled = false;
  checkpoint = { extractions, total: chunks.length };
  for (let index = extractions.length; index < chunks.length; index += 1) {
    if (cancelled) return send('cancelled', { extractions, total: chunks.length });
    const began = performance.now(); const chunk = chunks[index]; const compact = compactChunk(chunk);
    send('generation-progress', { completed: index, total: chunks.length, detail: `Analysing part ${index + 1} of ${chunks.length}` });
    const response = await engine.chat.completions.create({ messages: messages(compact.evidence, data.model.id), temperature: 0, max_tokens: 700, extra_body: { enable_thinking: false } });
    const raw = response.choices[0]?.message?.content;
    if (cancelled) return send('cancelled', checkpoint);
    let extraction; try { extraction = validateExtraction(restore(data.model.id === 'qwen3-0.6b' ? plainDiscussion(raw, compact) : jsonFrom(raw), compact), chunk); } catch { extraction = undefined; }
    const evidenceOnly = validateExtraction(conservativeRecovery(chunk), chunk);
    if (extraction?.discussion.length || extraction?.decisions.length || extraction?.actions.length || extraction?.questions.length || extraction?.risks.length) { structuredChunks += 1; for (const key of ['decisions', 'actions']) if (!extraction[key].length) extraction[key] = evidenceOnly[key]; }
    else { extraction = evidenceOnly; recoveryChunks += 1; }
    extractions.push(extraction); chunkMs.push(Math.round(performance.now() - began)); send('checkpoint', { extractions, total: chunks.length });
  }
  // The 0.6B model is intentionally a quick brief. Its smaller context and
  // lower confidence make a shorter standard output more useful than filling
  // every possible topic slot with marginal transcript fragments.
  const outputDetail = data.model.id === 'qwen3-0.6b' && data.settings?.detail === 'standard' ? 'concise' : data.settings?.detail;
  let extraction = consolidateExtractions(extractions, outputDetail);
  send('generation-progress', { completed: chunks.length, total: chunks.length, detail: 'Consolidating distinct topics locally.' });
  extraction = await prioritiseDiscussion(extraction, data.model.id, outputDetail);
  if (cancelled) return send('cancelled', checkpoint);
  send('complete', { extraction, summary: summary(extraction), chunks: chunks.length, generationMs: Math.round(performance.now() - startedAt), chunkMs, structuredChunks, recoveryChunks });
}

self.onmessage = async ({ data }) => { try { if (data.type === 'load') await load(data.model); else if (data.type === 'generate') await generate(data); else if (data.type === 'cancel') { cancelled = true; engine?.interruptGenerate(); } else if (data.type === 'dispose') { await engine?.unload?.(); engine = undefined; send('disposed'); } } catch (error) { if (cancelled) send('cancelled', checkpoint); else send('error', { operation: data.type, message: error instanceof Error ? error.message : String(error) }); } };
