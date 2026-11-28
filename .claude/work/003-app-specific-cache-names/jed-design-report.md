# Jed design review: app-specific cache names

Verdict: pass with required design changes (R1 to R6).

## Scope and basis

Read brief.md and design.md, the Content Security Policy in index.html, `src/cache-names.js` and `public/docs/privacy.html`. No code was run.

## Content Security Policy

No change needed. The custom cache and the worker wrapper make no new network calls and use no eval. `worker-src 'self' blob:` and `connect-src` (Hugging Face, hf.co, raw.githubusercontent) already cover the model fetches. Both are local code in workers the app already starts.

## Assessment

### Worker-scoped caches wrapper for WebLLM

Acceptable in principle. It is confined to one dedicated worker and there is no supported option. Problems:

- R1. In a worker, `caches` is an accessor on the global scope. Plain assignment `self.caches = ...` is ignored in sloppy mode and throws in strict mode (module workers). Use `Object.defineProperty(self, 'caches', { value: wrapper, configurable: true })`. The test must prove the override takes effect, not only that the code exists.
- R2. It must fail closed (OWASP A04, A05). If the override fails or the library changes, WebLLM silently writes to shared names, which is the original bug. The worker must check that the wrapper is active (`self.caches` is the wrapper) and refuse to create the engine otherwise. The bundle-literal pin test and the end-to-end check stay.
- Wrapper must map `open`, `has`, `delete` and `match` for the three names only, and must not map `keys` for unmapped names. Pass-through for the rest is correct.

Honest limit: a prefix is a naming convention, not a security boundary. Any same-origin page can open `callscribe-*` caches. Do not describe the new names as protected.

### Entry-level migration and erase by pinned model URL

Sound approach, but URL matching needs care:

- R3. Match by exact origin, path and pinned revision, with a boundary (for example `https://huggingface.co/<repo>/resolve/<revision>/`), never a loose `startsWith` on a repo name. Otherwise `whisper-tiny` would match `whisper-tiny-foo` belonging to a sibling. Derive the list from `src/model-manifest.js` only, and test near-miss URLs.
- R4. Migration treats a legacy entry as trusted because its URL matches. A sibling on the same origin could have stored different bytes under a pinned URL (OWASP A08, integrity). Before copying, apply the app's existing integrity check (hash or size from the manifest) where one exists. If none exists for an entry type, accept only status 200, same-origin-safe response type, and expected content length; otherwise skip and let it download again. State in the design whether loads already verify; the design says integrity code is "unaffected" without saying it covers cached reads.
- R5. Make migration idempotent and safe across two tabs (Web Locks, or copy-then-flag with overwrite allowed). The localStorage flag is cleared by erase-all; that is fine, since matching legacy entries are gone by then. Set the flag only after a complete pass. Also make single-model removal (`src/main.js` line 405) sweep matching legacy entries for that model, or the user removes a model and an old copy stays.

### Move versus leave old copies

Recommend move (copy, verify, then delete), with these conditions. Per entry, not per cache, which keeps peak extra storage to one file. Delete only after the new copy is read back and its length matches. Empty legacy caches stay.

Reasons: leaving would duplicate up to about 3.4 GB and consume quota, which raises the chance of quota failure and later download errors. Erase-all would delete the matching legacy copies anyway, so "leave" does not avoid touching them, it only delays it. The cost of move is that a sibling using the identical pinned file re-downloads it; that is public model data, not personal data, and the harm is bandwidth only. Disclose this in the ADR. Tim decides.

### UK GDPR and erasure promise

Model files are not personal data, so the erasure risk from legacy leftovers is low. Transcripts, screenshots and notes are not in Cache Storage. The promise matters mainly for accuracy.

- R6. Privacy wording changes:
  - "Delete all my data ... deletes ... models ... and caches" overstates for old unrecognised entries. Keep the statement, then add the limit in short sentences. Proposed: "Model files are now stored under names starting with callscribe-. If you used an earlier version, some older model files may remain under the default names that other sites can also use. Delete all my data removes the ones it can recognise as this app's. These are public model files, not your recordings. To remove the rest, clear this site's data in your browser settings, which also clears other pages on the same web address." The last clause is needed because the host is shared, so clearing site data affects siblings.
  - Existing sentence "Browser storage is scoped to this site" is inaccurate on a shared origin. Change to "scoped to this web address, which other pages on the same host may share."
  - Avoid "a few"; the files can be large.

## Required design changes

1. R1 defineProperty override, tested for effect.
2. R2 fail-closed runtime check in the WebLLM worker.
3. R3 strict URL boundary matching from the manifest, with near-miss tests.
4. R4 integrity validation before migrating legacy entries.
5. R5 idempotence, two-tab safety, and legacy sweep on single-model removal.
6. R6 privacy wording corrections above; also state the prefix is not a security boundary in the ADR.

## Agreement

Decision for Tim: move is recommended. Everything else in Jacob's design is agreed once R1 to R6 are in.

## Confirmation

Verdict: pass. Revision 2 of design.md resolves R1 to R6, and Tim's move decision matches the assumed variant.

- R1: resolved. `Object.defineProperty` on `self`, with an effect test that proves plain assignment fails on an accessor fake.
- R2: resolved. Worker checks `self.caches === wrapper` and a pure `resolveName` probe, and refuses `CreateMLCEngine` on failure. Fail-closed test listed.
- R3: resolved. `isOwnModelUrl` uses `new URL`, exact origin, and a path with a trailing boundary, derived from the manifest only. Near-miss tests listed.
- R4: resolved. Manifest hash or size where present, otherwise status 200, non-opaque, and matching Content-Length. Otherwise skip and re-download.
- R5: resolved. Web Lock with idempotent fallback, flag set only after a full pass, and a legacy sweep on single-model removal.
- R6: resolved. Privacy wording matches my proposal, the shared-address sentence is replaced, and the ADR states the prefix is not a security boundary.

Move conditions are kept: per entry, read-back length check before delete, empty legacy caches left in place. No remaining changes. Sean should state at implementation whether cached reads are already verified (design item 4).
