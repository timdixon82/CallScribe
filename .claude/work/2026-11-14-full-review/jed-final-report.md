# Jed final security review, CallScribe main at f50396a, 2026-11-15

Verdict: pass with findings. Tier 2. No critical or high issues. Original findings: 7 fixed, 1 accepted, 3 open (all low or partly open). Four new low or informational items.

## 1. Original findings

- M1 CSP: fixed (with known limits). Meta tag present on index.html and all five docs pages and in dist. Policy is default-src none, script-src self plus wasm-unsafe-eval, style-src self (no unsafe-inline), object-src none, base-uri none, form-action none. dist has no inline scripts.
- M2 WebLLM mutable library URL: fixed. src/model-manifest.js has WEBLLM_LIBS and per-model commits; minutes.webllm.worker.js line 71 passes pinnedAppConfig. check-pins.mjs passes.
- M3 unpinned model downloads: partly fixed. Diarizer has a pinned commit and SHA-256 check (verifySha256). All Transformers.js models have 40-character revisions (HF_REVISIONS, models.js). No hashes for Transformers.js or WebLLM weights: accepted residual (see section 4).
- M4 print export: fixed. printHtml (main.js line 439) uses a hidden iframe, sandbox allow-same-origin allow-modals, no scripts, stylesheet by link.
- L1 service worker: fixed. Per-build cache name, relative precache './', network-first for pages, old caches deleted, cache.put rejections caught.
- L2 import limits: fixed. 50 MB, 200 screenshots, 20000 segments, png/jpeg/webp only.
- L3 title and file name newline in Markdown export: open, low. call-markdown-export.js line 5 and call-markdown-import.js line 115 unchanged. Trivial fix: strip line breaks.
- L4 erase all: open. No erase-all control found in src or index.html. Privacy page (section "Browser storage and deletion") says users remove data in the app or clear site data, which is accurate. Per-session and per-participant deletion exists.
- L5 workflows: partly fixed. (a) open: release.yml lines 15-17 still gives contents write and pull-requests write at workflow level; move to job level. (c) fine. (d) accepted: semgrep and trivy skip on push (security.yml lines 28, 46); main is covered via pull requests. (e) open, low: pip install semgrep is version-pinned but not hash-pinned.
- I1 privacy page: fixed. Names Hugging Face (and hf.co hosts) and GitHub raw, states IP address exposure, says jsDelivr is no longer used, has a "Recording other people" section.
- I2 supply chain, I3 CODEOWNERS: unchanged, acceptable.

Counts: fixed 7 (M1, M2, M4, L1, L2, I1, plus M3 diarizer and Transformers.js pins), accepted 2 (M3 hashes, L5d), open 3 (L3, L4, L5a; L5e low).

## 2. Commands run (clean worktree at f50396a)

- npm audit production: 0 vulnerabilities. npm audit all: 0 vulnerabilities.
- npm test: 96 pass, 0 fail.
- npm run lint: clean.
- npm run build: succeeded (chunk size warning only).
- node scripts/check-pins.mjs (online): "All pins and hosts match."
- Not run: Semgrep, Trivy, ZAP, a real browser.

## 3. New findings

- N1 (low, test gap) CSP versus runtime code generation. dist/assets/ocr and diarizer chunks contain new Function (a code generator, likely protobuf or ONNX related). script-src has no unsafe-eval, so if that path executes, the browser blocks it. Needs a real-browser pass of OCR, diarization and WebLLM under the policy; I could not run one. Fails closed, so a security-safe but possibly functional risk.
- N2 (low) Dead jsDelivr fallback string in Transformers.js code in dist. CSP connect-src blocks it and the app sets wasmPaths locally in all workers (transcriber, minutes, OCR, diarizer). Fails closed. No action.
- N3 (info) dist contains .mjs files under ort/ with sourceMappingURL comments, but no .map files ship, so no source leakage. Nothing to fix.
- N4 (info) Branch protection: gh api on the protection endpoint was refused by the team's command hook, so I could not read it. Required checks and code-owner review are unverified. Please check in Settings, Branches. Secret scanning and push protection: enabled. Dependabot security updates: enabled. Non-provider patterns and validity checks: disabled (optional).
- N5 (info) Workflows: all actions pinned to full SHAs; default permissions contents read; pages write and id-token write only in the deploy job; pin-drift.yml is read-only, scheduled and dispatch only, pinned. No pull_request_target. Only release.yml has workflow-level write (L5a). CODEOWNERS: single owner for all paths; useful only if protection requires it.
- Dist scan: external hosts are only documentation and schema URLs (XML namespaces, links), Hugging Face, GitHub raw, the project site and the jsDelivr dead string. No inline scripts or styles, no secrets (matches were base64 wasm data), no source maps.

## 4. Residual risks for Tim, ranked

1. Model and runtime weights are pinned by commit but not hashed (except the diarizer). A compromise of Hugging Face or the pinned GitHub repository history could still serve altered files. Commit pins make this unlikely; hashes would close it.
2. A meta tag policy is weaker than a header. It cannot stop other sites framing the app (clickjacking), has no reporting, and only applies after the page starts parsing. GitHub Pages cannot send headers; a proxy such as Cloudflare would.
3. The policy has not been tested in a real browser for every feature (N1). A mistake breaks features rather than security, but a loosening to fix them could weaken it.
4. Branch protection and required reviews are unverified (N4). If not enforced, the pinned workflows and CODEOWNERS are advisory.
5. No erase-all control (L4). Data stays until the user deletes sessions or clears site data. Transparent in the privacy page, but a data protection nice-to-have.
6. release.yml has broad token write at workflow level (L5a). Low risk with a pinned action.
7. Browser storage is not encrypted. Anyone with access to the user profile can read transcripts. Stated generally in the privacy page.

## 5. UK GDPR

- Claims versus behaviour: consistent. No analytics, cookies, accounts or telemetry found. Only model downloads leave the device, and the privacy page names the hosts and the IP address exposure. Audio, transcripts and screenshots do not leave unless the user exports.
- Recording other people: now covered, with a prompt to get consent.
- Controller position: the user is effectively controller of their own recordings; the page should say so explicitly if it does not (I did not re-read it fully).
- Storage limitation and erasure: per-item deletion works; erase-all absent (L4, open).

## Tasks

<!-- TASK -->
- [ ] Add an erase-all control (IndexedDB, caches, localStorage) `priority:medium` `owner:sean` `from:jed-final` `tag:security`
<!-- /TASK -->
<!-- TASK -->
- [ ] Move release.yml write permissions to job level; strip line breaks from export titles and imported file names `priority:low` `owner:sean` `from:jed-final` `tag:security`
<!-- /TASK -->
<!-- TASK -->
- [ ] Browser test of OCR, diarization, WebLLM and transcription under the meta CSP (new Function use) `priority:medium` `owner:carol` `from:jed-final` `tag:security`
<!-- /TASK -->
