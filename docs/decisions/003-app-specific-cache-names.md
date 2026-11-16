# Decision 003: App-specific cache names

## Status

- State: Proposed, subject to Tim's approval at merge
- Decided: 2026-11-16
- Supersedes: None
- Superseded by: None

## Source

AgentTeam work folder `003-app-specific-cache-names`. Design by Jacob (revision 2), governance review by Jed (required changes R1 to R6), build by Sean. Tim chose to move old copies (Q-LCT4, answer A).

## Context

Transformers.js hard-codes the cache name `transformers-cache` and WebLLM hard-codes `webllm/model`, `webllm/wasm` and `webllm/config`. This app is served from a host shared with sibling apps on one origin. Erase-all and model removal acted on those shared names, so they could delete a sibling's models, and a sibling could delete ours.

## Decision

- Store this app's model files in caches named `callscribe-transformers-v1`, `callscribe-webllm-model-v1`, `callscribe-webllm-wasm-v1` and `callscribe-webllm-config-v1`. The names live only in `src/cache-names.js`, and `callscribe-` is an own prefix.
- Transformers.js uses its supported `customCache` option (`src/scoped-cache.js`, set in both Transformers.js workers).
- WebLLM has no option, so the detailed summary worker runs behind a wrapper over `self.caches` that renames the three scopes. It is installed with `Object.defineProperty` (plain assignment fails on the accessor) and checked at runtime. The worker refuses to create an engine, and reports an error, if the check fails. It never falls back to the shared names.
- Existing entries under the old names are identified by exact pinned URL (`isOwnModelUrl` in `src/legacy-match.js`: https origin, repository, full revision and a path boundary, no query, fragment or credentials, derived only from `src/model-manifest.js`). They are validated (status 200, response type basic or cors, a Content-Length that matches the bytes read) and moved to the new names: copy, read back and compare length, then delete the old entry, one entry at a time. The migration runs in the page in the background under a Web Lock, is safe to repeat, and sets its flag only after a complete pass.
- Erase-all and single-model removal also delete matching entries from the old caches. The old caches themselves are never deleted.

The `callscribe-` prefix is a naming convention, not a security boundary. Any same-origin page can read, write or delete `callscribe-*` caches. The change prevents accidental cross-deletion, not hostile access.

## Alternatives

- Leave the default names: erase-all keeps wiping a sibling's models.
- Delete whole old caches: destroys sibling data.
- Never touch old entries: orphans up to about 3.4 GB and breaks "erase all".
- Switch WebLLM to indexeddb or opfs: the same fixed scope name is still used.
- Patch or fork the libraries: heavy upkeep and breaks the pin-check process.
- Prefix keys instead of cache names: does not isolate the cache.
- Own sub-domain: outside this hosting setup.

## Consequences

- Positive: erase-all and model removal no longer touch sibling data. Peak storage stays low because old copies are moved, not duplicated.
- Negative: a sibling that relied on the identical pinned file under the default name downloads it again after the move. These are public model files, not personal data, and the harm is bandwidth only.
- Negative: the WebLLM wrapper depends on library internals. Mitigations: a unit test on the installed bundle (the three literals and `caches.open` through the global), the runtime fail-closed check, and a manual check that no `webllm/` cache appears after a download.
- Old entries that cannot be attributed to this app remain until the user clears site data, which also affects other pages on the same address. The privacy page says so.
- Cached reads are not hash-checked by Transformers.js or WebLLM. Neither library verifies a cache hit, and this change does not add that. The migration carries its own checks (above), but entries that were already in a cache are trusted as before.
- Entries stored with a content encoding can have a Content-Length that differs from the bytes read. Those fail the migration check, stay in the old cache and download again. Erase-all still removes them.
- WebLLM can also write a small `tvmjs-cos-hash-meta` cache when its optional cross-origin storage feature is used. This app does not turn that on, so it is not renamed or swept.
