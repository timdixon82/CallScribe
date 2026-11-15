# Design: Content Security Policy and download pinning (Jed M1, M2, M3)

Tier 2. Design only. Author: Jacob. Date: 2026-11-14.

## 1. Facts verified in the code

- The app is a static Vite build with relative base, deployed to GitHub Pages. No server headers are possible.
- `index.html` has one external module script (`/src/main.js`), `assets/version.js` (same origin) and no inline script or inline style block. Docs pages in `public/docs/` each have a `<script` tag on line 2 (not yet checked for inline versus external; Sean must check).
- Four module workers are created from `main.js` lines 14 to 17. Vite bundles them as same-origin files.
- `src/ocr.js` sets `ort.env.wasm.wasmPaths` to local `ort/` and loads local models from `models/`.
- `src/diarizer.worker.js` fetches four files from `https://huggingface.co/NealCaren/Nemotron-3-Diarization-ONNX/resolve/main/` and stores them in Cache Storage.
- `src/models.js` and `minutes.js` use Transformers.js 3.8.1 with the default `remoteHost` `https://huggingface.co/` and revision `main` (transformers.web.js lines 5157 and 4951).
- New finding, not in Jed's report: transformers.web.js line 3098 sets the ONNX `wasmPaths` to `https://cdn.jsdelivr.net/npm/@huggingface/transformers@<version>/dist/` unless already set. Neither Transformers.js worker sets it, so executable `.mjs` and `.wasm` load from jsDelivr at run time. This is a mutable-ish third-party host (version-pinned path, but no hash) and is not disclosed. I treat it as part of M2.
- WebLLM (`CreateMLCEngine`, minutes.webllm.worker.js line 70) uses the default app config: model library `.wasm` from `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/...` (web-llm lib/index.js lines 970 and 971), weights from `https://huggingface.co/mlc-ai/Qwen3-<size>-q4f16_1-MLC`. Cache backend is Cache Storage.
- Hugging Face redirects large files to other hosts. I could not find an official allowlist; community and vendor lists name `cdn-lfs.hf.co`, regional `cdn-lfs-us-1.hf.co` and `cdn-lfs-eu-1.hf.co`, `cas-bridge.xethub.hf.co`, `transfer.xethub.hf.co`, `cas-server.xethub.hf.co`. Sean must confirm the real set in the browser network panel. `https://*.hf.co` matches any depth of subdomain in CSP and covers all of these.
- Service worker `public/sw.js` only handles same-origin GET, so cross-origin model fetches bypass it.

## 2. Content Security Policy (meta tag)

Place as the first element after `<meta charset>` in `index.html`, and in each `public/docs/*.html`.

```
default-src 'none';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
connect-src 'self' https://huggingface.co https://*.hf.co https://raw.githubusercontent.com;
img-src 'self' data: blob:;
media-src 'self' blob:;
style-src 'self' 'unsafe-inline';
font-src 'self';
manifest-src 'self';
base-uri 'none';
form-action 'none';
object-src 'none'
```

(Write it as one line in the attribute.)

Reasoning per directive:

- `script-src 'self' 'wasm-unsafe-eval'`: ONNX Runtime Web and WebLLM compile WebAssembly; `wasm-unsafe-eval` allows only that, not JavaScript `eval`. Module workers loaded from same-origin files and the dynamic `import()` of `ort/*.mjs` fall under `'self'`. If jsDelivr is retained (option B below) add `https://cdn.jsdelivr.net`. Do not add `unsafe-eval` unless a test proves WebLLM or the TVM runtime needs it; if it does, that is a decision for Tim (it weakens the policy).
- `worker-src 'self' blob:`: Vite workers are same-origin. ONNX Runtime with threads may spawn a blob worker; `blob:` is kept for that and removed later if the test shows it is unused. Note that a CSP delivered in a page does apply to dedicated workers it creates only through the worker script's own response headers; a meta tag in the page does not govern the worker's own fetches (see limits). Workers' own `connect-src` is therefore governed by the page policy only for worker creation, and by the headers of the worker script response, which GitHub Pages cannot set. This is why pinning (section 3) matters more than the CSP for worker downloads.
- `connect-src`: the fetch targets: Hugging Face (Transformers.js, diarizer, WebLLM weights), its CDN hosts, and raw.githubusercontent.com for WebLLM libraries. If section 3 self-hosts the WebLLM libraries, drop `raw.githubusercontent.com`. If Transformers.js wasm moves local, no jsDelivr is needed.
- `img-src 'self' data: blob:`: screenshots are shown from object URLs and the import path uses `data:` URLs (main.js line 373, call-markdown-import.js). SVG in an `img` runs no script.
- `media-src 'self' blob:`: only if audio playback uses object URLs; confirm in test.
- `style-src 'self' 'unsafe-inline'`: `main.js` and `workspace.js` set inline styles through the DOM (`style.` uses), and `style-src` without `unsafe-inline` blocks the style attribute and the CSSOM setters used as attributes. Setting `element.style.x = ...` via CSSOM is allowed under CSP, but `setAttribute('style')` and `cssText` are not. Sean should first try without `'unsafe-inline'` and add it only if the console reports violations. Style injection has low impact here.
- `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`: no forms post, no plugins, no base tag.
- Not set: `frame-src` falls back to `default-src 'none'`. The print fix (Jed M4) uses a Blob URL or sandboxed iframe: if it uses an iframe or popup, add `frame-src blob:` and `child-src blob:`. This design must be reconciled with the M4 fix in the current branch; Sean should add the directive in the same change as, or after, M4.

External links (GitHub, timdixon.net) are navigation, not subject to CSP.

### What a meta tag cannot do

- No `frame-ancestors` (clickjacking defence), no `report-uri` or `report-to`, no `sandbox`; browsers ignore these in meta tags.
- Cannot set `Content-Security-Policy-Report-Only` via meta, so there is no report-only trial. Testing is manual or Playwright console capture.
- Applies only after the tag is parsed; scripts earlier in the head are not covered. Put it first.
- Does not apply to the response headers of worker scripts, so worker-initiated fetches follow the policy the worker script inherits from its creator only in some browsers. Treat workers as not fully covered.
- Also cannot add `X-Content-Type-Options`, HSTS or `Permissions-Policy`. If these matter, the option is a proxy such as Cloudflare in front of the custom domain `callscribe.timdixon.net` (decision for Tim, section 5).
- The service worker has its own scope and CSP: the page's meta tag does not cover it. Its fetches are same-origin only.

### Verification

1. Build, serve the `dist` folder locally over `http://localhost`.
2. With a clean browser profile, load the app and watch the console for "Refused to" messages while: loading the page; downloading Moonshine Base; starting a recording; running diarization; loading a screenshot and running OCR; generating minutes with Qwen3 0.6B (Transformers.js, then WebLLM) and Qwen3 4B; exporting; importing; printing.
3. Repeat on Chrome and one other engine (Firefox or Safari). WebGPU and WebLLM need Chrome or Edge.
4. Record each distinct host in the network panel; compare with the policy.
5. Add a Playwright test (the project has playwright.yml) that fails on any `securitypolicyviolation` event or CSP console error during page load and the OCR path. Model downloads are too large for CI; mock with a small local model or check only the page and OCR.
6. Check the policy tag exists in `dist/index.html` after build (a grep step in CI).

## 3. Pinning and integrity

### Per download

| Download | Today | Loader support for hash | Recommendation |
| --- | --- | --- | --- |
| Diarizer, 4 files | HF `resolve/main`, unverified | None in the code, but we own the fetch | Pin a full 40-character commit, and verify SHA-256 with `crypto.subtle.digest` before `cache.put`. Fail closed with a clear message. Hashes are in the HF API listing for LFS files (`lfs.oid`); small non-LFS files (the `.bin`) need a hash computed once by Sean. The existing cache `local-browser-transcriber-nemotron-v1` must be bumped to `v2` so old unverified bytes are re-fetched. |
| Transformers.js models (5 ASR, 1 minutes) | revision `main` | Option `revision` accepts a commit hash; no hash check | Pin `revision` per model in `models.js` and `minutes.js` and pass it into `pipeline(...)`. Record each file's SHA-256 in a manifest used by a CI drift check (script compares pinned revision files to the HF API listing). Runtime hash check is possible only by supplying a custom cache implementation (`env.customCache`); treat that as a spike for Sean, not a promise. Cache keys include the URL, so a revision pin changes keys and forces a one-time re-download. |
| Transformers.js ONNX Runtime wasm | jsDelivr, version-pinned path | None | Option A (recommended): set `env.backends.onnx.wasm.wasmPaths` to the local `ort/` folder in both Transformers.js workers, provided the `public/ort` files match the `onnxruntime-web` version bundled with Transformers.js 3.8.1 (Sean to check versions in `node_modules`). Removes a host and code from CSP. Option B: keep jsDelivr and add to CSP; no integrity. |
| WebLLM libraries (`.wasm`) | GitHub raw `main` | None; `appConfig.model_list[].model_lib` is a URL | Option A: custom `appConfig` listing only Qwen3-0.6B and Qwen3-4B with `model_lib` at a commit-pinned URL of the form `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/<commit>/web-llm-models/v0_2_87/base/<file>.wasm`. Option B: copy the two `.wasm` files into `public/` and point `model_lib` at them. |
| WebLLM weights | HF `main` of `mlc-ai/...-MLC` | None | Set `model` to `https://huggingface.co/mlc-ai/<name>/resolve/<commit>/`? Sean must verify WebLLM accepts that form; WebLLM builds `<model>/resolve/main/` itself in some versions, so a hosted pin may need a verified URL shape. If not supported, self-hosting 2.8 GB is not viable on GitHub Pages, so accept revision-unpinned weights and disclose it. |
| OCR models and ORT | Local `public/` | Not needed | Already same-origin. Record SHA-256 in a manifest checked in CI. |

### Cost in size and offline

- Self-hosting the two WebLLM libraries: expected tens of MB (Sean to measure; do not assume). Acceptable.
- Self-hosting weights: Qwen3 4B about 2.8 GB, Qwen3 0.6B about 570 MB as stated in `minutes.js`; Whisper Small and others add hundreds of MB. GitHub Pages sites have a 1 GB soft limit, and the repository would bloat. Not recommended. Keep weights on Hugging Face.
- Offline: after the first download, models live in Cache Storage and work offline. Pinning changes cache keys once. Local copies work offline immediately and also pre-cache only if the service worker is changed (L1, later batch). Service worker caches everything same-origin forever, so the cache version must be bumped when local assets change.

### Recommendation

Pin everywhere that has a revision or URL parameter; hash-verify where we own the fetch (diarizer); localise only small, executable assets (ONNX Runtime wasm and WebLLM libraries); leave large weights on Hugging Face pinned by commit with a CI drift check. For the diarizer, the repository is a personal third-party one: Tim should decide whether to fork it into his own account (a fork is a copy; we still pin the commit) or accept the dependency. Opus-level reasoning is not needed for any of this.

## 4. Build order for Sean (small tasks)

1. **T-CSP0 (spike, no merge):** list the real hosts used across all flows (network panel). Check privacy-page claim and docs-page scripts. Check whether `public/ort` matches the ORT version inside Transformers.js. Check WebLLM model URL shape. Output: a note in the work log. Check: log entry.
2. **T-CSP1:** local ONNX Runtime wasm for both Transformers.js workers (`wasmPaths`). Check: network panel shows no jsDelivr; unit test or Playwright asserting no request to cdn.jsdelivr.net.
3. **T-CSP2:** diarizer pin and SHA-256 check with a manifest file `src/model-manifest.js`, cache name bumped. Check: unit test with a tampered buffer rejects; test with the right buffer passes (mock fetch).
4. **T-CSP3:** `revision` pins for Transformers.js models, with a manifest. Check: lint test that every entry in `MODELS` and `MINUTES_MODELS` has a 40-character revision.
5. **T-CSP4:** WebLLM custom `appConfig` pinned (or local libraries). Check: manual load of Qwen3 0.6B in Chrome; network panel hosts match policy.
6. **T-CSP5:** CSP meta tag on `index.html` and docs pages. Check: Playwright test for violations; grep for the tag in `dist`. Reconcile with the M4 print fix.
7. **T-CSP6:** CI drift script comparing manifest to HF API (scheduled workflow, not blocking merges). Check: dry run output.
8. **T-CSP7 (with privacy batch):** privacy page and footer name the hosts: Hugging Face and its CDN hosts, GitHub raw (if kept), and jsDelivr (if kept).

Order matters: pins and local assets first, so the final CSP can be tight. Ship CSP last, behind its own pull request.

## 5. Risks and rollback

- Risk: a missed host breaks model downloads for users with no error beyond a failed fetch. Mitigation: the verification steps, a clear in-app error when a download fails, and shipping the CSP as its own pull request.
- Risk: Hugging Face changes its CDN hosts; the `*.hf.co` wildcard reduces this.
- Risk: WebLLM or the TVM runtime needs `unsafe-eval`; then ask Tim before widening.
- Risk: revision pins freeze models; updating needs a deliberate change.
- Risk: cache key change forces everyone to re-download models once (up to GBs). Announce in the changelog.
- Rollback: each task is its own commit; revert the pull request. A bad CSP is fixed by reverting the single meta tag, since the tag is the only policy delivery point. Cache names can stay bumped.

## 6. Open decisions for Tim

- Q-LCT unset: fork the diarizer repository into Tim's own account, or keep the third-party dependency pinned by commit? Recommended: pin now, fork later.
- Q-LCT unset: keep jsDelivr and disclose it (B) or serve the ONNX Runtime wasm locally (A)? Recommended: A.
- Q-LCT unset: is a Cloudflare or similar proxy in front of the custom domain acceptable, to get real security headers? Recommended: not yet; ship the meta tag.
- Q-LCT unset: if WebLLM needs `unsafe-eval`, accept the weaker policy or drop WebLLM models? Decide only if the test shows it is needed.
