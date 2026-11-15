# Jed security review: pull request 32 (fix/download-pinning)

Verdict: pass, with two low findings and one note. No blocking issues.

## Checks run
- npm test: 82 pass, 0 fail. npm run lint: clean. npm run build: succeeds; dist/ort-tfjs has both files (about 21 MB wasm, 44 KB mjs).
- node scripts/check-pins.mjs (live): all pins and hosts match.
- curl spot checks: diarizer mel_filters.bin at pinned commit returns 200 and its SHA-256 equals the manifest value; WebLLM Qwen3-4B wasm, Qwen3-0.6B MLC config and whisper-base config at pinned commits all return 200.

## Findings
1. Low (A08 integrity). src/diarizer.worker.js, cached(): a cache hit is returned without re-hashing. Verification happens only on download, before cache.put (order confirmed in code and by a test). Risk is limited to same-origin cache tampering. Optional fix: hash on hit and delete the entry on mismatch.
2. Low (A05). src/diarizer.worker.js load(): caches.delete of the v1 cache is inside the load promise, so a rejection would block loading. Wrap in try/catch so cleanup never blocks the feature.
3. Note (A08, accepted). Transformers.js and WebLLM weights, and the WebLLM wasm from raw.githubusercontent.com, are pinned by full 40-character commit but not hashed. Matches the PR known-limits and my M2/M3 intent. The weekly check covers drift.

## Confirmed good
- verifySha256 compares SHA-256 and throws on mismatch (fail closed); no bypass path; error text names the file only.
- All pins are 40-character commits; WebLLM lib path is versioned and commit-pinned. pinnedAppConfig throws if a model record is missing, and lists only the two pinned models.
- jsDelivr is not contacted: wasmPaths is overridden in both Transformers.js workers after import, and dist only contains the library default string (dead code, overridden). Only jsep files exist in the package, so no missing-file fallback.
- copy-ocr-assets.mjs fails loudly if a source file is missing; public/ort-tfjs/ is gitignored; vite copies public/ into dist, which the deploy publishes when a build exists, so the deploy publish list needs no change.
- pin-drift.yml: schedule and manual trigger only, no inputs, no secrets, contents: read, checkout and setup-node pinned to the same full SHAs used by the other workflows.
- check-pins.mjs: static host allow-list scans src only (not index.html); fine, note for the CSP batch.
- Removed store helpers have no remaining callers; a test asserts they are gone.
- PR text and manifest contain no personal data or secrets.

## Before merge
Nothing required. Recommend fixing finding 2 and considering finding 1. Manual browser download test of Moonshine, diarizer and Qwen3 0.6B is still outstanding (batch 4).
