import * as ort from 'onnxruntime-web';
import { Diarizer } from './diarization.js';
import { DIARIZER, diarizerUrl, verifySha256 } from './model-manifest.js';

const CACHE = DIARIZER.cache;
const RUN_EVERY_SAMPLES = 30 * 16000;
let diarizer; let loading; const recordings = new Map();
async function cached(file, label) {
  const url = diarizerUrl(file);
  const cache = await caches.open(CACHE); const hit = await cache.match(url);
  if (hit) {
    const stored = new Uint8Array(await hit.arrayBuffer());
    try { await verifySha256(stored, DIARIZER.files[file], label); return stored; } catch { await cache.delete(url); }
  }
  const response = await fetch(url); if (!response.ok || !response.body) throw new Error(`Could not download ${label}.`);
  const total = Number(response.headers.get('content-length')) || 0; const reader = response.body.getReader(); const pieces = []; let loaded = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; pieces.push(value); loaded += value.byteLength; postMessage({ type: 'status', text: `Downloading local speaker model: ${Math.round(loaded / 1e6)}${total ? ` of ${Math.round(total / 1e6)}` : ''} MB.` }); }
  const bytes = new Uint8Array(loaded); let offset = 0; pieces.forEach((piece) => { bytes.set(piece, offset); offset += piece.byteLength; }); await verifySha256(bytes, DIARIZER.files[file], label); await cache.put(url, new Response(bytes)); return bytes;
}
async function load() {
  if (diarizer) return diarizer; if (loading) return loading;
  loading = (async () => { try { await caches.delete('local-browser-transcriber-nemotron-v1'); } catch { /* cleanup must never block loading */ } ort.env.wasm.numThreads = 1; postMessage({ type: 'status', text: 'Preparing local speaker separation with single-threaded WebAssembly.' }); const [embed, step, mel, silence] = await Promise.all([cached('embed.onnx', 'feature model'), cached('step_int8.onnx', 'speaker model'), cached('mel_filters.bin', 'mel filters'), cached('silence_embeds.bin', 'silence embedding')]); const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }; diarizer = new Diarizer(ort, await ort.InferenceSession.create(embed, options), await ort.InferenceSession.create(step, options), new Float32Array(mel.buffer, mel.byteOffset, mel.byteLength / 4), new Float32Array(silence.buffer, silence.byteOffset, silence.byteLength / 4)); postMessage({ type: 'ready', backend: 'single-threaded WebAssembly' }); return diarizer; })();
  try { return await loading; } finally { loading = undefined; }
}
function append(source, audio, capturedAt, sessionId) { const item = recordings.get(source) || { parts: [], length: 0, labelled: 0, capturedAt, sessionId }; item.parts.push(audio); item.length += audio.length; item.capturedAt ??= capturedAt; recordings.set(source, item); }
function joined(item) { const audio = new Float32Array(item.length); let offset = 0; for (const part of item.parts) { audio.set(part, offset); offset += part.length; } return audio; }
async function run(source, force = false) { const item = recordings.get(source); if (!item || item.length < 16000 * 8 || (!force && item.length - item.labelled < RUN_EVERY_SAMPLES)) return; const model = await load(); item.running = true; postMessage({ type: 'status', text: 'Separating speakers locally. Recent labels may refine as more audio arrives.' }); const { probs, numFrames } = await model.run(joined(item)); item.labelled = item.length; item.running = false; postMessage({ type: 'diarization', source, sessionId: item.sessionId, capturedAt: item.capturedAt, probs, numFrames }, [probs.buffer]); if (item.clearAfterRun) recordings.delete(source); }
self.onmessage = async ({ data }) => { try { if (data.type === 'load') return void await load(); if (data.type === 'append') { append(data.source, data.audio, data.capturedAt, data.sessionId); const item = recordings.get(data.source); if (!item.running) await run(data.source); return; } if (data.type === 'flush') { const item = recordings.get(data.source); if (!item) return; item.clearAfterRun = true; if (item.length < 16000 * 8) { recordings.delete(data.source); return; } if (!item.running) await run(data.source, true); return; } if (data.type === 'reset') recordings.clear(); } catch (error) { recordings.delete(data.source); postMessage({ type: 'error', message: error.message || String(error) }); } };
