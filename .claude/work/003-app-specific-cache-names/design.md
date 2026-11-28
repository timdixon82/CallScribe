# Design: app-specific cache names

Author: Jacob. Status: revision 2, resolves Jed's R1 to R6. Awaiting Jed's confirmation and Tim's decision on old copies. Assumed decision: move.

## Findings from the installed packages

- Transformers.js 3.8.1: the cache name is hard-coded as `transformers-cache` (`src/utils/hub.js` line 452). There is no name option. There is a supported route: `env.useCustomCache = true` and `env.customCache = <object with match and put>` (`src/env.js`, `hub.js` lines 426 to 439). It takes precedence over the browser cache.
- WebLLM 0.2.88: scope names `webllm/model`, `webllm/wasm` and `webllm/config` are string literals in the library. `AppConfig` has `cacheBackend` and `opfsAccessMode`, but no name or prefix option. Every backend uses the same scope string, so switching backend does not make the name app-specific. The Cache backend calls `caches.open(scope)`.
- The app sets these libraries up in `src/transcriber.worker.js`, `src/minutes.worker.v2.js` (Transformers.js) and `src/minutes.webllm.worker.js` (WebLLM, via `CreateMLCEngine` and `pinnedAppConfig`). Model removal in `src/main.js` line 405 and erase-all in `src/erase-all.js` use `src/cache-names.js`.

## Recommended approach

Use the prefix `callscribe-` followed by purpose: `callscribe-transformers-v1`, `callscribe-webllm-model-v1`, `callscribe-webllm-wasm-v1`, `callscribe-webllm-config-v1`. Define them in `src/cache-names.js` as the only source. Add `callscribe-` to `OWN_CACHE_PREFIXES` alongside the existing `local-browser-transcriber-`. Drop the four bare names from `OWN_CACHE_NAMES` and move them to a separate `LEGACY_CACHE_NAMES` list.

The prefix is a naming convention, not a security boundary. Any same-origin page can open a `callscribe-*` cache. The design reduces accidental collisions with sibling apps; it does not protect the data.

1. Transformers.js: in `src/scoped-cache.js`, export `scopedCache(name)`, an object implementing `match(key)` and `put(key, response)` by delegating to `caches.open(name)` lazily. Both Transformers workers set `env.useCustomCache = true; env.customCache = scopedCache(TRANSFORMERS_CACHE); env.useBrowserCache = false`.
2. WebLLM: no supported option exists. In `src/minutes.webllm.worker.js` only, before any engine is created, install a wrapper from `renameCaches(map)` in `src/scoped-cache.js`.
   - R1. Install with `Object.defineProperty(self, 'caches', { value: wrapper, configurable: true })`. Plain assignment is ignored in sloppy mode and throws in strict or module workers, because `caches` is an accessor on the global scope.
   - The wrapper maps `open`, `has`, `delete` and `match` for the three `webllm/...` names only. It does not map `keys` for unmapped names. Everything else passes through to the real `CacheStorage`.
   - R2. Fail closed. After installing, the worker checks that `self.caches === wrapper` and that `wrapper.open` maps a probe name (without creating a cache: use a pure `resolveName('webllm/model')` function exposed by the wrapper and assert it returns the new name). If either check fails, the worker posts an error and refuses to call `CreateMLCEngine`. It never falls back to shared names.
3. Fragility guard: a unit test reads the installed `@mlc-ai/web-llm` bundle and asserts it still contains the three literal scope names and that `createArtifactCache` still calls `caches.open`. A WebLLM upgrade that changes either fails the test. An end-to-end check confirms that after a WebLLM load no cache named `webllm/...` exists.
4. Integrity: neither route changes cache keys (request URLs). Whether cached reads are verified today must be stated by Sean when implementing: check whether the loaders verify hash or size on cache hits. If they do not, migration (below) carries its own checks and this design does not claim existing code covers cached reads.

## URL matching rule (R3)

One helper, `isOwnModelUrl(url)`, in a new `src/legacy-match.js`, derived only from `src/model-manifest.js`.

- Parse with `new URL`. Require exact origin (for example `https://huggingface.co`), and a path that starts with `/<repo>/resolve/<pinned revision>/` including the trailing slash boundary. The same for the WebLLM pinned repo and library commit URLs.
- Never use a loose `startsWith` on a repo name. `whisper-tiny` must not match `whisper-tiny-foo`; a different revision, a different origin, a missing trailing slash and a query-string trick must not match.
- Tests include near-miss URLs for each case above.

## Migration of existing old-name caches

Entry level only, never whole-cache level. Runs in the page (not a worker) on first load after upgrade, in the background, never blocking start-up.

- R5, two tabs: take a Web Lock (`navigator.locks.request('callscribe-migrate', ...)`; if Web Locks is unavailable, run anyway, since copy-then-overwrite is idempotent). Inside the lock, re-read the flag and exit if set.
- Idempotent: copying uses `put`, which overwrites, so a repeat or interrupted run is safe. A partial run leaves the flag unset and resumes on next load.
- Flag: one localStorage key under `localBrowserTranscriber`, set only after a complete pass with no unexpected error. Erase-all clears it, which is fine because matching legacy entries are gone by then.
- For each legacy cache that exists (use `caches.has`, never `caches.open`, which would create it), for each entry where `isOwnModelUrl` is true:
  1. R4, validate before copying. Where the manifest holds a hash or size for the entry, check the response body against it. Where it does not, accept only status 200, `response.type` of `basic` or `cors` (not `opaque`), and a `Content-Length` that is present and matches the body length actually read. Otherwise skip the entry and let it download again.
  2. Put a copy in the new-name cache.
  3. Move variant (assumed): read the new copy back, confirm its length matches, then `cache.delete(request)` on the legacy entry. Per entry, not per cache, so peak extra storage is one file.
- Entries that do not match are never touched. Empty legacy caches are left in place, because a sibling may use them.
- If a copy fails (for example quota), skip that entry and leave its legacy copy. Migration is best effort.

## Erase-all behaviour

1. Delete every cache whose name starts with an own prefix (now covering the new names), as today.
2. New step: for each legacy cache that exists, delete only entries where `isOwnModelUrl` is true (`cache.delete(request)`). Do not delete the legacy cache itself.
3. Guarantee, stated honestly: erase-all removes everything this app can identify as its own. Legacy entries under URLs it cannot attribute stay. Fresh installs have none. The remaining gap closes only if the user clears site data in the browser, which also clears other pages on the same address; the privacy page says so.
4. The step list name stays "downloaded model files and caches". Order is unchanged (service worker first).

## Single-model removal (R5)

`src/main.js` line 405 currently removes a model from the new-name caches. Add the same legacy sweep, limited to that model: delete legacy entries where `isOwnModelUrl` matches that model's pinned repo and revision. Otherwise a removed model leaves an old copy behind. Share the sweep helper with erase-all.

## Privacy page and documents (R6)

In `public/docs/privacy.html`:

- Keep the existing "Delete all my data" statement about models, settings and caches. Then add these sentences, in this order: "Model files are now stored under names starting with callscribe-. If you used an earlier version, some older model files may remain under the default names that other sites can also use. Delete all my data removes the ones it can recognise as this app's. These are public model files, not your recordings. To remove the rest, clear this site's data in your browser settings, which also clears other pages on the same web address."
- Replace "Browser storage is scoped to this site" with "Browser storage is scoped to this web address, which other pages on the same host may share."
- Do not use "a few" for the old files; they can be large.

Other documents:

- `docs/privacy.md` is the stale setup-page statement; Sean refreshes it with the storage description (separate Tier 0 task, not blocking).
- `docs/technical-validation.md` line 25: name the new caches.
- Help page `public/docs/help.html`: no change found.

## ADR text (for `docs/decisions/`, to be saved after Tim agrees)

Title: Decision NNN: App-specific cache names

Status: Proposed.

Context: Transformers.js hard-codes the cache name `transformers-cache` and WebLLM hard-codes `webllm/model`, `webllm/wasm` and `webllm/config`. This app is served from a host shared with sibling apps on one origin. Erase-all and model removal acted on those shared names, so they could delete a sibling's models, and a sibling could delete ours.

Decision: Store this app's model files in caches named `callscribe-transformers-v1`, `callscribe-webllm-model-v1`, `callscribe-webllm-wasm-v1` and `callscribe-webllm-config-v1`. Transformers.js uses its supported `customCache` option. WebLLM, which has no option, runs behind a worker-scoped wrapper over `self.caches` that renames the three scopes, installed with `Object.defineProperty` and checked at runtime; the worker refuses to start an engine if the check fails. Existing entries under the old names are identified by exact pinned URL (origin, repo, pinned revision, path boundary), validated, and moved to the new names (copy, verify, delete per entry). Erase-all and single-model removal also sweep matching legacy entries. Legacy caches themselves are never deleted.

The `callscribe-` prefix is a naming convention, not a security boundary. Any same-origin page can read, write or delete `callscribe-*` caches. The change prevents accidental cross-deletion, not hostile access.

Alternatives considered: leave default names; delete whole legacy caches; never touch legacy entries; switch WebLLM to indexeddb or opfs (same literal scope name); patch or fork the libraries; prefix keys instead of cache names; own sub-domain.

Consequences:
- Positive: erase-all and model removal no longer touch sibling data; peak storage stays low because old copies are moved, not duplicated.
- Negative: a sibling that relied on the identical pinned file under the default name will download it again after the move. These are public model files, not personal data, and the harm is bandwidth only.
- Negative: the WebLLM wrapper depends on library internals; mitigated by the bundle pin test, the runtime fail-closed check and the end-to-end check.
- Old entries that cannot be attributed to this app remain until the user clears site data, which also affects other pages on the same address.

## Test plan

Unit (`tests/erase-all.test.mjs`, `tests/models.test.mjs`, new `tests/scoped-cache.test.mjs`, new `tests/legacy-match.test.mjs`):

- Constants: new names all start with `callscribe-`; none equals a legacy name; `isOwnCache` true for new, false for `transformers-cache` and `webllm/model`.
- Existing foreign-survival test updated: bare `transformers-cache` and `webllm/*` now survive as caches; `callscribe-transformers-v1` is deleted.
- `isOwnModelUrl`: matches pinned URLs; rejects near-misses (`whisper-tiny-foo`, other revision, other origin, no trailing boundary, query tricks).
- Legacy sweep: a legacy cache with one pinned-URL entry and one foreign entry: after erase-all the pinned entry is gone, the foreign entry and the cache remain. Same for single-model removal.
- Migration: copies matching entries only; skips foreign; skips entries failing integrity (wrong size, opaque, non-200, missing length); respects the flag and sets it only after a full pass; idempotent on rerun; two concurrent runs end consistent; tolerates quota failure; deletes the legacy entry only after read-back length matches.
- `scopedCache`: match and put round trip. `renameCaches` maps the three names, passes others through, does not map `keys` for unmapped names, and uses `has` not `open` for legacy checks.
- R1 effect test: in a test worker or a faked global with an accessor `caches`, after install `self.caches` is the wrapper and `caches.open('webllm/model')` opens the new name. A test also proves plain assignment would not have worked on the accessor fake, so the test cannot pass vacuously.
- R2 fail-closed test: if the override is blocked or the probe fails, the worker does not call `CreateMLCEngine` and reports an error.
- Pin test on the WebLLM bundle literals.
- Worker source tests: both Transformers workers set `useCustomCache` with the shared name; the WebLLM worker installs the wrapper and runs the check before `CreateMLCEngine`.

End to end (`tests/e2e/erase-all.spec.mjs`): update the seeded names to the new names and add a seeded legacy foreign cache that must survive. Manual or opt-in check: download the 0.6B model and confirm only `callscribe-` names appear.

## Options rejected

- Leave default names and document the risk: erase-all keeps wiping a sibling's models. Fails the goal.
- Delete whole legacy caches on upgrade or in erase-all: destroys sibling data.
- Never touch legacy anything: orphans up to about 3.4 GB and breaks "erase all".
- Switch WebLLM to `indexeddb` or `opfs`: the shared literal scope name is still used, and it adds a different storage path.
- Patch or fork WebLLM or Transformers.js: heavy upkeep and breaks the pin-check process.
- Wrap `self.caches` for Transformers.js as well: works, but `customCache` is the supported option.
- Prefix keys instead of cache names: does not isolate the cache.
- Own sub-domain: outside this hosting setup.

## Risks

- The WebLLM wrapper depends on library internals (mitigated by the pin test and the runtime fail-closed check).
- One re-download for users whose copy fails or fails validation.
- Custom cache loses nothing observed: progress is passed only as an ignored third argument.

## Decision for Tim: old copies

After copying matching entries to the new names, should the old copies be deleted (move) or left? Recommended and assumed above: move (copy, verify, delete per entry). It avoids storing up to about 3.4 GB twice and lowering quota headroom, and erase-all would delete matching legacy copies anyway, so "leave" only delays that. The cost is that a sibling using the identical pinned file downloads it again; bandwidth only.

If Tim chooses leave, what changes:

- Migration drops step 3 (read back and delete). Legacy entries stay after the copy.
- Storage is duplicated until Delete all my data or single-model removal, which still sweep matching legacy entries. Quota failures become more likely.
- The privacy wording and ADR add: "after upgrading, model files may be stored twice until you delete them."
- Tests: replace the "deletes legacy entry after read-back" case with "legacy entry untouched after migration".
- Everything else (R1 to R6, matching, sweeps) is unchanged.
