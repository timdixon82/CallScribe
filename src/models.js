export const MODELS = [
  { id: 'moonshine-base', name: 'Moonshine Base', repo: 'onnx-community/moonshine-base-ONNX', language: 'English', default: true, resource: 'Balanced', description: 'Default English model.' },
  { id: 'moonshine-tiny', name: 'Moonshine Tiny', repo: 'onnx-community/moonshine-tiny-ONNX', language: 'English', resource: 'Low', description: 'Fast English model for lower-resource devices.' },
  { id: 'whisper-tiny', name: 'Whisper Tiny', repo: 'onnx-community/whisper-tiny', language: 'Multilingual', resource: 'Low', description: 'Lightweight multilingual model.' },
  { id: 'whisper-base', name: 'Whisper Base', repo: 'onnx-community/whisper-base', language: 'Multilingual', resource: 'Medium', description: 'General-purpose multilingual model.' },
  { id: 'whisper-small', name: 'Whisper Small', repo: 'onnx-community/whisper-small', language: 'Multilingual', resource: 'High', description: 'Higher-resource multilingual model.' },
];
export const findModel = (id) => MODELS.find((model) => model.id === id);
