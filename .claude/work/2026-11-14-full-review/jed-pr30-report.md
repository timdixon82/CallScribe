# Jed security review: pull request 30

Verdict: pass with findings. npm test: 69 pass, 0 fail. npm run lint: clean. npm audit (production): 0 vulnerabilities.

## Findings

### F1. Quadratic regex time in import (A04 Insecure Design, denial of service). Medium. Fix before merge.
Files: src/call-markdown-import.js line 10 (image-stripping regex), line 17 (heading regex), line 7 (quiet headings regex).
Reproduce with Node: a heading line of the form "a", then N spaces, then "b", takes 0.6 s at N=20000, 2.5 s at 40000, 10.6 s at 80000. A body of N repeats of "![" takes 1.3 s, 5.3 s, 22.9 s at the same sizes. The 50 MB limit allows far larger input, so one crafted file freezes the tab. This is the L2 gap that the size limit does not close.
Fix: cap line length and block length (for example 1 MB per block, and skip longer ones); replace the lazy dot and whitespace patterns with indexOf-based parsing; use a bounded image pattern or strip images with a linear scanner.

### F2. No cap on segment count or OCR text size (A04). Low.
Line 28 to 53. 50 MB of short "## time - Mic" headings gives millions of segments in memory and one huge transaction. Add a maximum block count (for example 20000) reported as skipped.

### F3. Data-URL MIME type is the claimed type only (A08). Low.
Line 39 to 43. Allow-list is correct and SVG is excluded, and the blob inherits the declared type, so SVG cannot be smuggled as PNG. No content sniffing. Acceptable. Note for the CSP work (M1): the import uses fetch on a data URL, so connect-src must allow data.

### F4. Print iframe cleanup. Low.
src/main.js printHtml. Sandbox is "allow-same-origin allow-modals" with no allow-scripts: script and event handlers in srcdoc cannot run, no popups, no navigation. Summary HTML escapes titles, OCR text and alt text (escapeHtml), and images are data URLs. The iframe inherits the page CSP when one exists. No Blob URL is used. Gaps: if the load event never fires the iframe is never removed; repeated clicks leave several iframes for up to 60 s. Fix: remove any earlier print frame before creating a new one, and add an error or timeout path. allow-same-origin is needed for contentWindow.print and is safe without allow-scripts, but add a comment saying never to add allow-scripts alongside it. M4 is otherwise resolved.

## Checked and fine
- store.js removeSessionCascade: one readwrite transaction over all five stores; cursors delete segments and screenshots by sessionId index; notes and runs keyed by sessionId. Both session-keyed stores are covered, so no orphans. Error, abort and exception paths reject, close the database, and abort the transaction. putSessionBundle is atomic. Tests cover both.
- call-markdown-export.js: pure, no new sink. Output is Markdown text only.
- Dependency: fake-indexeddb 6.2.8 is dev only, integrity hash present, registry URL is npmjs, Apache-2.0, no install scripts shown in the lock entry. Caret range flag is a false alarm.
- PR text: no personal data, secrets or tokens.
- Imported text is stored and later shown with textContent (earlier grep), so no HTML injection path.

## Must change before merge
F1 only. F2 and F4 can follow in a small commit or a task.

## Re-review of commit b07326a

Verdict: rework. F1 is mostly fixed but one quadratic path remains. F2 and F4 are fixed.

### F1 timings (Node, parseCallScribeMarkdown, input sizes 40000, 80000, 160000 units)
- Heading with inner spaces, heading tail spaces, hash lines, many blocks, long ">" lines, newline runs, trim spaces: 0.00 to 0.01 s at all sizes.
- Repeated "![", "![" plus "]", repeated "![a](": 0.00 to 0.02 s.
- Repeated "](data:" with no closing bracket: 0.00 s.
- Many "[" in screenshot OCR text: 0.02 s or less.
- Still quadratic (F1b, Medium): a screenshot block of repeated "](data:;" followed by one ")" takes 0.16 s, 0.61 s, 2.44 s. Cause: findDataUrl line 33 calls indexOf(")") from every hit, and each hit with an empty type is rejected, so each scan runs to the same far ")". At 1.3 MB it is 2.4 s; at the 50 MB limit it extrapolates to about an hour. Fix: remember the last found ")" position and reuse it while it is after the hit, or stop at the first hit and accept or reject it, or cap block length.

### Other checks
- F2: 20005 passages gives 20000 kept and 5 reported skipped. 203 screenshots gives 200 kept and 3 reported. Passage over 100000 characters is skipped and reported. File over 50 MB throws.
- F4: printHtml removes earlier iframe[data-print-frame] frames, has a 15 second load-failure timeout, and the sandbox is still "allow-same-origin allow-modals" with no allow-scripts. A comment warning against adding allow-scripts is still advisable, not blocking.
- npm test: 72 pass, 0 fail. npm run lint: clean.
- Valid imports: old (210f7b6) and new parsers give identical segments, screenshots and skipped lists on two exporter-style documents covering quiet headings, App and Mic with suffixes, OCR text, images, SVG rejection, missing image and unrecognised headings. One intended change: headings over 300 characters are now skipped and reported.

## Final re-review of commit 122c704

Verdict: pass. F1b is fixed; no blocking issues.

### Timings (seconds, Node, parseCallScribeMarkdown, at 40000, 80000, 160000, 640000 repeats)
- "](data:;" repeated plus one ")" (the F1b input): 0.02, 0.01, 0.01, 0.05. Previously 0.16, 0.61, 2.44 at the first three sizes. Growth is now linear.
- Empty and invalid types ("](data:,"), "](data:)" repeated, ")" far away, ")" absent, "](data:image/png;base64," repeated with and without a closing ")", alternating and nested tokens, 120-character types, and the same shape in OCR text: all 0.00 to 0.15 s at 640000 repeats, linear.

### Other checks
- A valid PNG data-URL screenshot still imports (1 screenshot, 70-byte blob, nothing skipped). A rejected empty-type hit before a valid image still finds the image.
- npm test: 73 pass, 0 fail. npm run lint: clean.
- Remaining note: the cached ")" logic is correct because hits advance monotonically. No new findings.
