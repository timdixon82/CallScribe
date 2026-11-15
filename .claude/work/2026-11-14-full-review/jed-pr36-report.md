# Jed security review: PR 36 (head 51b2157)

Verdict: pass with one medium finding to decide before merge.

## Checks
- npm test: 103 pass, 0 fail. npm run lint: clean.
- release.yml: only change is workflow permissions read, job-level write (contents, pull-requests). Same effective grant for the one job. Action pin unchanged (full SHA). No new expressions or injection surface.
- Delete-all: dialog uses autofocus on Cancel; Escape and Cancel give no confirm; no accesskey or keydown handler; only the click on the button opens it. Refused during a session or model download. Each step is isolated, failures are listed in plain language. localStorage removal limited to the app prefix. IndexedDB: all stores cleared in one transaction (all-or-nothing).
- Titles: control characters, Unicode line and paragraph separators removed; HTML title escaped; file names limited to a-z 0-9 . _ -, no leading dot, 100 characters. Path separators cannot survive.
- SRT and VTT: comma and full stop, three digits, numbering starts at 2 after the provenance cue. Correct.
- Privacy text: accurate to behaviour. OCR fixme and diarizer manual test: no secrets, no network by default (model directory from an environment variable, test is manual). PR text has no personal data.

## Findings
1. Medium (A01 broken access control, scope): src/erase-all.js lines 17-19. The app is served from a GitHub Pages project path, so its origin may be shared with other sites on the same host. Cache Storage and service worker registrations are origin-wide, so Delete all deletes every cache and unregisters every service worker for those sites, not only this app's. Fix: delete only caches with this app's names (callscribe-shell-, local-browser-transcriber-, and the known model cache names), and unregister only registrations whose scope is this app's base URL. Update the comment on lines 8-9 and the test.
2. Low: src/safe-text.js line 3. Windows reserved names (CON, NUL, COM1) pass through fileSafeName. Append a prefix or suffix for them.
3. Low: src/safe-text.js line 3. Unicode direction overrides (U+202A to U+202E, U+2066 to U+2069) and zero-width characters (category Cf) survive cleanTitle into titles and Markdown headings. Strip \p{Cf}.
4. Info: Markdown syntax in a title (links, emphasis) is kept in the heading. Low risk, no script execution in Markdown or Word.

## Re-review at head 088d6e6

Verdict: pass.

1. Blocking finding fixed. Greps of src and public find caches.open only in main.js (OCR cache), diarizer.worker.js (speaker model cache, name starts with the shared prefix) and public/sw.js (shell cache). Transformers.js uses transformers-cache and WebLLM uses webllm/model, webllm/wasm and webllm/config, both confirmed in node_modules. cache-names.js lists all of them. Erase-all deletes only exact names or the two prefixes. Service worker unregister requires the scope to start with this app's base URL, which ends in a slash, so sibling paths do not match. The unit test uses foreign caches, a near-miss name and three foreign scopes, and asserts they survive. A test also ties sw.js and the other cache names to the constants.
2. safe-text.js: reserved names with and without extensions, trailing dots and spaces, and Cf characters (zero-width, direction override) all handled in my probes.
3. Importer: orphan screenshot blocks go through the same image type, count (200), pixel cap, text length and segment limit code. Timings: 50,000 orphan headings with images 149 ms (200 kept); 100,000 orphans without images 68 ms; repeated markers 1.3 MB 1 ms; 4 MB of spaces 5 ms; 500,000 repeated image openers 4 ms. Linear.
4. Privacy sentences are accurate: the speech model does auto-load at startup (main.js line 174), and the delete control is in Settings, Prior Sessions.
5. Commits carry only the existing noreply address and the required attribution. No personal data.
6. npm test: 109 pass, 0 fail. npm run lint: clean.

Residual note (not blocking): transformers-cache and webllm/* are generic names. Another app on the same origin using those libraries would lose its copy. Documented in the code comment.
