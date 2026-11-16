import { env, pipeline } from '@huggingface/transformers';
import { loadTranscriber } from './transcriber-load.js';
import { TRANSFORMERS_CACHE } from './cache-names.js';
import { scopedCache } from './scoped-cache.js';

// Cache Storage is checked before a remote request, under this app's own cache name (the library's default name is shared
// with other sites on this web address). Do not also probe Vite's SPA fallback as a local `/models/` directory: it returns
// index.html with a 200 response, which otherwise gets mistaken for a model asset.
env.useCustomCache = true; env.customCache = scopedCache(TRANSFORMERS_CACHE); env.useBrowserCache = false;
env.allowLocalModels = false;
// ONNX Runtime files for Transformers.js are served from this site, not a CDN (see scripts/copy-ocr-assets.mjs).
env.backends.onnx.wasm.wasmPaths = new URL('../ort-tfjs/', self.location.href).href;
let transcriber; let activeId;
const send = (type, detail = {}) => postMessage({ type, ...detail });

function progress(data) { send('progress', { data }); }
async function load(model, localOnly, preferredDevice) {
  send('model-status', { status: localOnly ? 'Verifying cached model' : 'Preparing download', modelId: model.id });
  const result = await loadTranscriber({ createPipeline: pipeline, nav: self.navigator, model, preferredDevice, progress, status: (text) => send('model-status', { status: text, modelId: model.id }) });
  transcriber = result.transcriber; const { device } = result;
  activeId = model.id;
  send('model-ready', { modelId: model.id, device });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') return await load(data.model, data.localOnly, data.preferredDevice);
    if (data.type === 'transcribe') {
      if (!transcriber) throw new Error('No model is ready.');
      const options = { sampling_rate: 16000, return_timestamps: true };
      if (data.language && data.language !== 'auto') { options.language = data.language; options.task = 'transcribe'; }
      const output = await transcriber(data.audio, options);
      const words = (output.chunks || []).map((chunk) => ({ text: chunk.text?.trim() || '', startMs: Math.round((chunk.timestamp?.[0] || 0) * 1000), endMs: Math.round((chunk.timestamp?.[1] || chunk.timestamp?.[0] || 0) * 1000) })).filter((chunk) => chunk.text);
      send('segment', { requestId: data.requestId, source: data.source, capturedAt: data.capturedAt, durationMs: Math.round(data.audio.length / 16), text: output.text?.trim() || '', words, modelId: activeId });
    }
  } catch (error) { send('error', { operation: data.type, message: error instanceof Error ? error.message : String(error) }); }
};
