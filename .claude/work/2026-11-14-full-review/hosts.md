# Hosts the app contacts (T-CSP0 spike)

Method: read the code and the library source, and checked redirects with a plain HTTP request. No browser network panel was available, so the browser check in the design (section 2, verification) is still to do in batch 4.

## Hosts after this pull request

- `huggingface.co`: Transformers.js models (five speech models, Qwen3 0.6B ONNX), the diarizer files, and WebLLM weights. All pinned to a commit.
- `*.hf.co` redirect targets: Hugging Face answers large files with a 302 redirect. Observed today: `us.aws.cdn.hf.co` (path `xet-bridge-us`). The design also names `cdn-lfs*.hf.co` and `*.xethub.hf.co`. A `https://*.hf.co` wildcard covers all of them.
- `raw.githubusercontent.com`: WebLLM library `.wasm` files, now at a pinned commit of `mlc-ai/binary-mlc-llm-libs`.
- Same origin: all workers, the ONNX Runtime files for OCR (`ort/`), the Transformers.js ONNX Runtime files (`ort-tfjs/`, new), OCR models, docs pages.

## Removed

- `cdn.jsdelivr.net`: Transformers.js 3.8.1 sets its ONNX Runtime wasm path there by default (transformers.web.js, line 3098). Both Transformers.js workers now set `wasmPaths` to the local `ort-tfjs/` folder, so the host is no longer contacted. The string still appears in the bundled library as dead default code.

## Findings

- Version mismatch: Transformers.js bundles its own onnxruntime-web (1.22.0-dev), while the app uses 1.31.1 for OCR. The existing `public/ort` files are 1.31.1 and must not be reused for Transformers.js. Two files from the Transformers.js package (`ort-wasm-simd-threaded.jsep.mjs` and `.wasm`, about 21 MB) are copied to `public/ort-tfjs/` by `scripts/copy-ocr-assets.mjs`. These are the only files jsDelivr was serving.
- WebLLM 0.2.88 accepts `model` URLs of the form `https://huggingface.co/mlc-ai/<name>/resolve/<commit>/` (cleanModelUrl, index.js line 11285), so weights can be pinned. `model_lib` is a plain URL, so the library is pinned by commit too. A custom `appConfig` lists only the two models in use.
- Docs pages in `public/docs/` load one external same-origin script (`theme.js`) and have no inline script or style block.
- unsafe-eval: not added. Nothing here proves WebLLM needs it; that test belongs to batch 4 with the policy tag.
- Not pinned by hash: Transformers.js and WebLLM weights. Their loaders have no hash option. They are pinned by commit and checked for drift by `scripts/check-pins.mjs`.
- Cache effects: pinning changes cache keys, so every model downloads once more. The diarizer cache is renamed to `-v2` and the old `-v1` cache is deleted.
