// Pinned download sources. Every remote model is fixed to a full commit so a
// change upstream cannot reach users unreviewed. scripts/check-pins.mjs compares
// these values with the live hosts. To update a pin, change it here deliberately.

export const DIARIZER = {
  repo: 'NealCaren/Nemotron-3-Diarization-ONNX',
  commit: '46642c09b3bd014c5ceb19d20524fa2f1dc27dee',
  cache: 'local-browser-transcriber-nemotron-v2',
  files: {
    'embed.onnx': '2e8796e42286abe2e2d7d44a97fab7e5a7d06b2d4cbee82a3a0f730cfff84a33',
    'step_int8.onnx': '1f18a5aed4909677d3618c9e6ed6e3003720b6d6e766f0f8b337aa4fcb0a9d2a',
    'mel_filters.bin': 'bce5ec5f194a5913f6508cee5a85512e7bad2352db8fc28f5c6ff75af8b09137',
    'silence_embeds.bin': 'd4417b3c0eabdf7c47032fac2b5b5a7ee83d819a6ddda8fd8eaf74e2b5cc4ac7',
  },
};
export const diarizerUrl = (file) => `https://huggingface.co/${DIARIZER.repo}/resolve/${DIARIZER.commit}/${file}`;

// Transformers.js model revisions (full 40-character commits), keyed by repo.
export const HF_REVISIONS = {
  'onnx-community/moonshine-base-ONNX': 'b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad',
  'onnx-community/moonshine-tiny-ONNX': 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95',
  'onnx-community/whisper-tiny': 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
  'onnx-community/whisper-base': '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c',
  'onnx-community/whisper-small': '36050c46d777d46dc4b5f43f6d90574fc38f8732',
  'onnx-community/Qwen3-0.6B-ONNX': '79346d370dfae34801d26993fda9ae2372900fd0',
};

// WebLLM: the library .wasm comes from a commit of binary-mlc-llm-libs and the
// weights from a commit of the Hugging Face repository.
export const WEBLLM_LIBS = { repo: 'mlc-ai/binary-mlc-llm-libs', commit: '146ed9cd4b4062e967b017fd2291f7106b50599f', path: 'web-llm-models/v0_2_87/base/' };
export const WEBLLM_MODELS = {
  'Qwen3-0.6B-q4f16_1-MLC': { commit: '8c14ce481d4c692769976ad52afea453a102df19', lib: 'Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm' },
  'Qwen3-4B-q4f16_1-MLC': { commit: 'a5c9fab855e3ccbdfed2e7e69683d75f30332161', lib: 'Qwen3-4B-q4f16_1_cs1k-webgpu.wasm' },
};
export const webllmLibUrl = (lib) => `https://raw.githubusercontent.com/${WEBLLM_LIBS.repo}/${WEBLLM_LIBS.commit}/${WEBLLM_LIBS.path}${lib}`;
export const webllmModelUrl = (id) => `https://huggingface.co/mlc-ai/${id}/resolve/${WEBLLM_MODELS[id].commit}/`;

/** Build a WebLLM app config listing only the pinned models, taken from the library's own records. */
export function pinnedAppConfig(prebuilt) {
  const model_list = Object.keys(WEBLLM_MODELS).map((id) => {
    const record = prebuilt.model_list.find((item) => item.model_id === id);
    if (!record) throw new Error(`WebLLM has no model record for ${id}.`);
    return { ...record, model: webllmModelUrl(id), model_lib: webllmLibUrl(WEBLLM_MODELS[id].lib) };
  });
  return { ...prebuilt, model_list };
}

const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }

/** Throw unless the bytes match the expected SHA-256. Fails closed. */
export async function verifySha256(bytes, expected, label) {
  if (await sha256Hex(bytes) !== expected) throw new Error(`The downloaded ${label} failed its integrity check and was discarded.`);
}
