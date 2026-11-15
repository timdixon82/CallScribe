# Jed security and privacy review, CallScribe, 2026-11-14

Scope: read-only review of main at commit dba2718. Tier 2. Verdict: pass with findings. Counts: 0 critical, 0 high, 4 medium, 5 low, 3 informational.
Evidence: npm audit (production) reports 0 vulnerabilities; GitHub reports secret scanning and push protection enabled, Dependabot security updates enabled. I did not run Semgrep, Trivy or ZAP, and did not run the app. All line numbers are from the current tree.

## Findings

### M1. No Content Security Policy (A05 Security Misconfiguration)
index.html head, lines 3-11. No CSP of any kind. Impact is limited today because I found no untrusted HTML sink (see XSS section), but a CSP is the main defence in depth for an app holding transcripts. Meta tag option below. Needs design and a manual test pass.

### M2. WebLLM fetches executable WebAssembly from a mutable GitHub URL, undisclosed (A08 Integrity, UK GDPR transparency)
src/minutes.webllm.worker.js line 70 (CreateMLCEngine with default app config). The library default points model libraries at https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/ (confirmed in node_modules/@mlc-ai/web-llm/lib/index.js). That is a branch name, not a pinned commit, and no hash is checked. The weights come from huggingface.co. public/docs/privacy.html says downloads come from "their configured public model source or this site", which does not name GitHub raw or Hugging Face. Fix: pin a commit in a custom appConfig, or self-host; name the hosts in the privacy page. Needs design.

### M3. Model and ONNX downloads have no integrity check and no revision pin (A08)
src/diarizer.worker.js line 4 uses .../resolve/main/ (mutable branch of a third-party personal repo, NealCaren/Nemotron-3-Diarization-ONNX). Line 11 fetches with no hash check and line 14 caches whatever arrives. src/models.js lines 2-6 and the Transformers.js pipelines (src/transcriber.worker.js lines 6-7, src/minutes.worker.v2.js line 4) use default revision main. ONNX models are data rather than code, but a malicious or corrupted model can still alter output or exploit the runtime. Quick fix for the diarizer: pin a commit hash in BASE and verify SHA-256 with crypto.subtle before caching. Transformers.js: pass a revision per model (needs design to record hashes).

### M4. Print export is probably broken, and writes untrusted-derived HTML to a new window (A04 Insecure Design)
src/main.js line 437. window.open with the noopener feature returns null in current browsers, so the check on the next statement always throws the "blocked pop-up" error. Functional bug, and Carol or Sean should confirm. Security note: if fixed by dropping noopener, popup.document.write receives HTML whose text is escaped, so it is not itself exploitable, but the popup inherits the app origin and IndexedDB access. Safer fix: create a Blob of type text/html and open its object URL with noopener, or print from a hidden sandboxed iframe (sandbox without allow-scripts). Quick fix once design chosen.

### L1. Service worker caches the wrong root and caches everything same-origin forever (A05, A08)
public/sw.js line 2 precaches '/'. On a GitHub Pages project path the site is not at the origin root, so this caches the wrong page or fails the whole install (addAll rejects on any failure). The custom domain (callscribe.timdixon.net in src/main.js line 402) may hide this. Line 6 is cache-first with no expiry for every same-origin GET, including model files copied into public/models and public/ort. Stale or tampered cached code persists until the CACHE name is bumped manually (currently v24). Fix: precache via relative URL './', use stale-while-revalidate for code, and add a note to bump the version in the release step. Quick fix.

### L2. Markdown import has no size or type limits (A04, A05)
src/call-markdown-import.js lines 14-24. The whole file is read in memory; every embedded data: URL is fetched and stored as a Blob of whatever MIME type the data URL claims (image/svg+xml included). A large crafted file can exhaust storage or memory (self-inflicted denial of service). Stored SVG is only shown via img elements or object URLs (src/main.js line 373 and src/ocr.js line 33), where scripts do not run, but it should be restricted. Fix: cap file size and image count, allow only png, jpeg and webp, and reject others. Quick fix.

### L3. Import file name becomes the session name, and export title is not escaped in Markdown (A03)
call-markdown-import.js line 17, main.js line 408 (exportMarkdown title). A title with newlines or Markdown syntax can inject headings into exported files. Not a browser injection, only export-format integrity. Low. Quick fix: strip newlines.

### L4. localStorage and storage lifetime: no "delete everything" control (UK GDPR storage limitation, data subject rights)
Preferences are in localStorage under localBrowserTranscriber* keys (main.js lines 104-139, no personal data). Sessions, segments, screenshots, notes and participants live in IndexedDB (src/store.js) with deletion per session and per participant (main.js line 397). There is no single "erase all my data" action, no retention prompt, and no request for persistent storage handling statement. The deletion path at main.js line 397 deletes segments, screenshots, notes and runs for a session, which is good. Fix: add a clear-all button that removes IndexedDB databases, caches and localStorage keys. Needs light design.

### L5. Workflow hardening gaps (A05, A08)
Positive: every action in all nine workflows is pinned to a full commit SHA with a version comment; default permissions are contents read; pages write and id-token write are limited to the deploy job; no pull_request_target; no secrets other than the built-in GITHUB_TOKEN; the build job holds no write token (deploy.yml lines 59-63, 84-95).
Gaps: (a) release.yml lines 15-17 gives contents write and pull-requests write at workflow level; move to job level and add a repository check. It runs on every push to main, with a pinned action, so risk is low. (b) release.yml comment says to add a deploy stub; any future deploy there must not reuse that token. (c) No cooldown or lockfile-integrity step beyond npm ci; npm ci is used in deploy.yml line 154, so the lockfile is honoured. (d) semgrep and trivy in security.yml are skipped on push events (line 27 and 45 conditions), so main is scanned only through pull requests. (e) pip install semgrep==1.166.0 has no hash pinning. Quick fixes.

### I1. Privacy statements checked against behaviour
Accurate: no analytics, no cookies, no accounts, no telemetry code found (grep of fetch, XMLHttpRequest, sendBeacon found only model downloads and data URL decoding). Speech, transcripts, screenshots and OCR stay local. Exports leave only on user action.
Inaccurate or incomplete: (1) host names not given (Hugging Face, GitHub raw, and the Hugging Face CDN hosts). (2) index.html line 48 and the privacy note say network is used only for models chosen by the user, but the Qwen and diarizer downloads happen when the option is toggled (main.js line 383 auto-loads) and the diarizer model comes from a personal third-party repo. (3) The page says nothing about the IP address and user agent reaching GitHub raw and Hugging Face (it does say "normal network information", fine, but name them). (4) No lawful basis, controller identity, retention or rights statement. For a purely local tool the controller position is arguable (the user is the controller of their own recordings), but the page should state that, and warn users that recording other people needs their own lawful basis and notice. (5) Call recording of third parties and consent is not discussed. Recommend a short consent and recording-others section.

### I2. Supply chain
package-lock.json present; npm ci in deploy. Dependabot covers actions, npm root and ci-tools with weekly grouped updates and a 7-day cooldown. Major version holds on vite 8 and transformers 4 are documented with review date 2027-02-07; they suppress security updates needing those majors, so check the alert list. package.json overrides sharp to 0.35.5; dependencies use caret ranges but the lockfile pins. onnxruntime-web is pinned exactly. THIRD_PARTY_NOTICES.md exists (29 lines); I did not verify it lists the ONNX model licences (PaddleOCR, Moonshine, Whisper, Qwen, Nemotron diarizer repo) and recommend checking.

### I3. CODEOWNERS and secret scanning
CODEOWNERS owns every path by the single maintainer. Fine, but it only helps if branch protection requires code owner review, which I cannot verify read-only and must not edit. Secret scanning and push protection are enabled; gitleaks job also runs in security.yml. No secrets handling issues found; the only secret used is the built-in GITHUB_TOKEN.

## XSS and injection review
- innerHTML uses: src/workspace.js line 44 (static template, no interpolation), line 312 (static), line 352 (compares and copies existing nodes), main.js line 194 (static SVG path strings). No user data reaches innerHTML. Pass.
- escapeHtml (main.js line 418) uses a text node plus quote encoding. Correct for text and quoted attributes. Used for every note, OCR and title value in minutesHtml. The only unescaped values are blob data URLs generated by FileReader from stored Blobs, placed inside double-quoted src. A data URL from readAsDataURL cannot contain a double quote. Pass.
- minutesHtmlBody (line 421) escapes each line before building tags; a screenshot marker only resolves to a pre-built figure map. Pass.
- Imported markdown: text goes into IndexedDB and is later rendered through textContent per my grep (no innerHTML hit). Pass. See L2 for limits.
- Word export (src/transcript-docx.js and main.js line 438): built with the docx library, which XML-escapes text runs. Images are re-encoded to PNG through a canvas. Pass; add the escape test case "<w:p>" to tests if not present.
- Transcript text from models is untrusted; rendered as text. Pass.

## CSP via meta tag, assessment
A meta tag works on GitHub Pages but cannot enforce frame-ancestors, report-uri or sandbox, and must appear before any script. Clickjacking cannot be prevented on Pages without headers; add a frame-busting check only if needed (the app has no state-changing server calls, so impact is low).
Suggested starting policy, to be tested in report-only mode in a branch preview first (meta tags do not support report-only, so test with a local header-injecting preview server):
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com data: blob:; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
Effects to test:
- Workers: Vite builds module workers from same origin, so worker-src 'self' is fine; transformers.js and onnxruntime may create blob workers, hence blob:.
- WASM: needs 'wasm-unsafe-eval'. WebGPU needs nothing extra. If onnxruntime-web loads its JSEP loader from jsdelivr, set wasmPaths locally (already done for OCR in src/ocr.js line 11; the diarizer worker and Transformers.js do not set it, so they may fetch https://cdn.jsdelivr.net/npm/ and would need that host allowed, or better, set ort.env.wasm.wasmPaths locally in those workers).
- Model downloads: Hugging Face redirects large files to CDN hosts (hf.co subdomains); the list above must be verified against real network traces. A wrong connect-src silently breaks downloads, so test every model.
- Service worker: sw.js only handles same-origin requests and is governed by the page's CSP for registration (script-src 'self'). The SW needs no change.
- fetch of data: URLs in the markdown import (call-markdown-import.js line 24) needs data: in connect-src.
- style-src 'unsafe-inline' is probably needed for inline style attributes; check before tightening.
Residual: because CSP via meta cannot block iframe embedding and Vite may emit inline module preload code, treat this as medium effort with a browser test matrix (Chrome, Edge, Firefox, Safari).

## Quick fixes versus design
Quick: L1, L2, L3, L5, privacy page host names, M3 for the diarizer repo (pin commit and hash).
Design: M1 (CSP), M2 (WebLLM pinned appConfig), M3 for Transformers.js revisions, M4 (print path), L4 (erase all).

## Tasks raised
See handoff message; no files were changed except this report.
