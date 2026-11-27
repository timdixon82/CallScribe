# Jacob: conformance check of pull request 40

Verdict: conforms, with three non-blocking notes.

Method: Bash was not available, so I could not run the git diff. The working tree is on branch fix/app-specific-cache-names, so I read the changed files directly. I did not run tests.

## Design elements

- Names and prefix: conforms. `src/cache-names.js` is the single source, `callscribe-` is in the own prefixes, and the legacy names are in a separate list.
- Transformers.js: conforms. Both workers set the custom cache option to the shared name and turn off the browser cache.
- WebLLM wrapper: conforms. It is installed only in the WebLLM worker, using `Object.defineProperty`. It is checked before the engine is created. A failure throws, and the message handler posts an error, so the engine is never created and there is no fallback to shared names. `keys` is not mapped, and `has` is used for legacy checks.
- URL rule: conforms. Exact origin, pinned repository and revision with a trailing slash, and no query, fragment or credentials. WebLLM library files match as exact paths.
- Migration: conforms. It runs in the page, under a Web Lock, in the background, and it is idempotent. It uses `has` and never `open` on legacy caches. Validation is status 200, basic or cors, and a matching Content-Length. It reads the copy back, compares length, then deletes the legacy entry. The flag is set only after a full pass.
- Erase-all and single-model removal: conforms. Both share the legacy sweep helper and never delete legacy caches themselves.
- Privacy page: conforms. The wording matches the design.
- ADR 003: conforms. It records Tim's choice (move) and adds honest notes on unverified cache hits, content-encoding and the tvmjs cache.
- Module boundaries: conforms. `legacy-match.js` reads only the manifest, and `legacy-caches.js` depends on `cache-names.js` and `legacy-match.js`. No cycles seen.

## Notes, not blocking

1. The design's per-entry manifest hash check has no data to use (the manifest holds none for these files), so only the Content-Length path exists. The ADR says so.
2. Migration reads each file fully into memory. Peak memory is one large shard. Acceptable, but worth knowing on low-memory devices.
3. The check that no `webllm/` cache exists after a download stays manual or opt-in, as the ADR states.
