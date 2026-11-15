# Jed security review: pull request 34 (head 094e19d)

Verdict: rework (small). No exploitable flaw found. Two wording and honesty fixes before merge.

## Checks run
- npm test: 86 pass. npm run lint: clean. npm run test:e2e: 19 pass. npm run build: ok, dist/index.html keeps the meta tag, no inline script or style.
- All five docs pages carry the identical policy string as index.html. No other HTML entry points exist.

## Findings

1. Medium (A05 Security Misconfiguration, honesty): public/docs/privacy.html, Model downloads section, says the policy "tells the browser to contact only the hosts listed here". A meta tag governs the document only. The workers are static same-origin files (src/main.js lines 15 to 18) with no policy header, so connect-src is not enforced where the model downloads happen. The PR text admits this but the page does not. Fix: reword to say the page restricts what the main page can load, and that worker downloads are limited by the code, not enforced by the browser. Also add the limits (no frame-ancestors, no report-uri, no sandbox from a meta tag; clickjacking not covered; navigation not restricted) to docs/known-limitations.md.
2. Low (legal, for Tim): privacy.html "Who is responsible for the data: You are" and the Your rights and Recording other people sections make UK GDPR statements (controller role, domestic purposes position, rights, consent). I have not invented or confirmed any legal claim. Tim should read them. "You are" is a controller assertion that may be wrong for organisational users. Consider "In most cases you are".
3. Low (A05): manifest-src 'self' is unneeded, index.html has no manifest link. Remove for minimality. font-src 'self' is also unused (no font-face found); keep only if Tim wants a margin.
4. Low (A08, pre-existing, now more relevant): public/sw.js is cache-first for every same-origin GET, including the page shell, and also caches non-OK responses. Returning users keep an old index.html, so the new policy reaches them only because cache v25 was bumped. Every future change to index.html or its policy must bump the cache name. Suggest network-first for navigations and caching only response.ok. The './' precache change itself is correct and within scope.

## Reviewed and acceptable
- Residual abuse with an injection point: script-src self blocks inline and remote script. blob: workers only matter if an attacker already runs script. data: in connect-src is read-only, not an exfil path. wasm-unsafe-eval allows WebAssembly compile only, not JS eval. Remaining exfil routes for an attacker with script: write calls to huggingface.co with the attacker's own token, and top-level navigation (not restricted). Acceptable for this app.
- Diarizer worker: cache hits are re-hashed, a mismatch deletes the entry then refetches and re-verifies, and nothing is stored on failure; the old-cache delete is in try and catch. The three tests run the real worker source with tampered bytes, assert the error and an empty store. They are real. Gap: no test that a valid cached entry is accepted without refetch (needs a real hash).
- Audio worklet: now a same-origin file loaded from document.baseURI, no new injection path. print.css: the srcdoc frame sandbox is still allow-same-origin allow-modals, no allow-scripts. The srcdoc frame inherits the parent policy and loads print.css; the e2e test confirms the style applies (12pt body). The replace targets the first style block only, and user text is escaped, so no user-controlled style survives.
- Privacy hosts match code: huggingface.co, hf.co redirects, raw.githubusercontent.com; no jsDelivr or other CDN found in src. "Never leave the device" is accurate for content, with the IP address caveat stated.
- PR title and body contain no personal data, secrets or credentials. The developer's name on the page is already public.

## Must change before merge
Finding 1 (wording plus limits note). Tim's read of finding 2. Findings 3 and 4 may be deferred as tasks.

## Re-review at head cf5b86f

Verdict: pass. No blocking issues.

- Privacy page: the Model downloads section no longer says the policy restricts hosts. It now says the app is built to contact only the listed hosts and automated tests check this. Accurate.
- Legal sections: the only change is "In most cases you are." in the responsibility section. No other legal wording changed.
- docs/known-limitations.md: lists no frame-ancestors, no reporting, no sandbox, navigation unrestricted, worker scripts not governed. Accurate.
- Worker host test: allowlist parsed from connect-src in index.html. I added a fetch to an unexpected host in the transcriber worker in my worktree: the test failed naming that host. Reverted; the unmodified code passes all 3 CSP e2e tests. (Port 4173 was already in use locally, so I used another port in the discarded worktree only.)
- Diff 094e19d..cf5b86f touches only docs, the privacy page and the e2e test. No new security issue.
- Commit messages: no personal data.
- npm test: 86 pass. npm run lint: clean.
