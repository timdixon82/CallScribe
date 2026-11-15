// The one list of Cache Storage names this app creates. Erase-all deletes only these, because the github.io host is shared with other sites.
// public/sw.js cannot import this file, so tests/erase-all.test.mjs checks that it uses SHELL_CACHE_PREFIX.
export const SHELL_CACHE_PREFIX = 'callscribe-shell-';
export const MODEL_CACHE_PREFIX = 'local-browser-transcriber-'; // OCR assets and the speaker model, any version
export const OCR_CACHE = 'local-browser-transcriber-ocr-v1';
export const TRANSFORMERS_CACHE = 'transformers-cache'; // Transformers.js speech and summary models
export const WEBLLM_CACHES = ['webllm/model', 'webllm/wasm', 'webllm/config']; // WebLLM detailed summary models
export const OWN_CACHE_PREFIXES = [SHELL_CACHE_PREFIX, MODEL_CACHE_PREFIX];
export const OWN_CACHE_NAMES = [TRANSFORMERS_CACHE, ...WEBLLM_CACHES];
export const isOwnCache = (name) => OWN_CACHE_NAMES.includes(name) || OWN_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
