// WebGPU is used only when an adapter really exists. navigator.gpu alone is not enough:
// some machines expose it but have no adapter, and the runtime then reports "no available backend found".
export async function hasWebGpuAdapter(nav) {
  try { return Boolean(nav?.gpu && await nav.gpu.requestAdapter()); } catch { return false; }
}

export async function loadTranscriber({ createPipeline, nav, model, preferredDevice, progress, status }) {
  let device = preferredDevice === 'wasm' || !(await hasWebGpuAdapter(nav)) ? 'wasm' : 'webgpu';
  if (preferredDevice !== 'wasm' && device === 'wasm') status('WebGPU is not available on this computer; using WebAssembly instead');
  const make = (dev) => createPipeline('automatic-speech-recognition', model.repo, { revision: model.revision, device: dev, dtype: dev === 'webgpu' ? 'q4' : 'q8', progress_callback: progress });
  try { return { transcriber: await make(device), device }; } catch (error) {
    if (device !== 'webgpu') throw error;
    // The adapter or the model's WebGPU variant failed; fall back to WebAssembly q8 before reporting failure.
    status('WebGPU was unavailable for this model; retrying locally with WebAssembly');
    return { transcriber: await make('wasm'), device: 'wasm' };
  }
}
