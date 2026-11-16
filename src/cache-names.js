// The one list of Cache Storage names this app creates. Erase-all deletes caches that carry an own prefix, because the github.io host is shared with other sites.
// The prefix is a naming convention, not a security boundary: any page on this web address can open a callscribe-* cache.
// public/sw.js cannot import this file, so tests/erase-all.test.mjs checks that it uses SHELL_CACHE_PREFIX.
export const SHELL_CACHE_PREFIX = 'callscribe-shell-';
export const APP_CACHE_PREFIX = 'callscribe-';
export const MODEL_CACHE_PREFIX = 'local-browser-transcriber-'; // OCR assets and the speaker model, any version
export const OCR_CACHE = 'local-browser-transcriber-ocr-v1';
export const TRANSFORMERS_CACHE = 'callscribe-transformers-v1'; // Transformers.js speech and summary models
export const WEBLLM_CACHES = ['callscribe-webllm-model-v1', 'callscribe-webllm-wasm-v1', 'callscribe-webllm-config-v1']; // WebLLM detailed summary models
export const OWN_CACHE_PREFIXES = [SHELL_CACHE_PREFIX, APP_CACHE_PREFIX, MODEL_CACHE_PREFIX];
export const isOwnCache = (name) => OWN_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));

// The libraries' own default names, used by earlier versions of this app. Other sites on this web address may use them too,
// so they are never deleted as a whole: only entries this app can prove are its own (src/legacy-match.js) are touched.
export const LEGACY_TRANSFORMERS_CACHE = 'transformers-cache';
// WebLLM has no name option. These are its fixed names, mapped to ours by the wrapper in src/scoped-cache.js.
export const WEBLLM_CACHE_RENAMES = { 'webllm/model': WEBLLM_CACHES[0], 'webllm/wasm': WEBLLM_CACHES[1], 'webllm/config': WEBLLM_CACHES[2] };
// Each legacy cache and the new cache its own entries move to.
export const LEGACY_TO_NEW = { [LEGACY_TRANSFORMERS_CACHE]: TRANSFORMERS_CACHE, ...WEBLLM_CACHE_RENAMES };
export const LEGACY_CACHE_NAMES = Object.keys(LEGACY_TO_NEW);
