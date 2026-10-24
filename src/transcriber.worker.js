import { env, pipeline } from '@huggingface/transformers';

env.useBrowserCache = true;
let transcriber; let activeId;
const send = (type, detail = {}) => postMessage({ type, ...detail });

function progress(data) { send('progress', { data }); }
async function load(model, localOnly, preferredDevice) {
  send('model-status', { status: localOnly ? 'Verifying cached model' : 'Preparing download', modelId: model.id });
  let device = preferredDevice || (self.navigator.gpu ? 'webgpu' : 'wasm');
  try {
    transcriber = await pipeline('automatic-speech-recognition', model.repo, { device, dtype: device === 'webgpu' ? 'q4' : 'q8', local_files_only: localOnly, progress_callback: progress });
  } catch (error) {
    if (device !== 'webgpu') throw error;
    // Some published ONNX model variants do not provide WebGPU's requested dtype.
    // Fall back to the widely supported local WASM q8 route before reporting failure.
    device = 'wasm';
    send('model-status', { status: 'WebGPU was unavailable for this model; retrying locally with WebAssembly', modelId: model.id });
    transcriber = await pipeline('automatic-speech-recognition', model.repo, { device, dtype: 'q8', local_files_only: localOnly, progress_callback: progress });
  }
  activeId = model.id;
  send('model-ready', { modelId: model.id, device });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') return await load(data.model, data.localOnly, data.preferredDevice);
    if (data.type === 'transcribe') {
      if (!transcriber) throw new Error('No model is ready.');
      const output = await transcriber(data.audio, { sampling_rate: 16000, return_timestamps: true });
      send('segment', { requestId: data.requestId, source: data.source, capturedAt: data.capturedAt, durationMs: Math.round(data.audio.length / 16), text: output.text?.trim() || '', modelId: activeId });
    }
  } catch (error) { send('error', { operation: data.type, message: error instanceof Error ? error.message : String(error) }); }
};
