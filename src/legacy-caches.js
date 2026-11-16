import { LEGACY_CACHE_NAMES, LEGACY_TO_NEW } from './cache-names.js';
import { isOwnModelUrl } from './legacy-match.js';

// Earlier versions stored models under the libraries' default cache names, which other sites on this web address can share.
// Only entries that match this app's pinned model URLs are ever touched, and the legacy caches themselves are never deleted.
// This key starts with SETTINGS_PREFIX in erase-all.js, so erase-all clears it (tests/legacy-caches.test.mjs checks that).
export const MIGRATED_FLAG = 'localBrowserTranscriberCacheNamesMigrated';
const LOCK_NAME = 'callscribe-migrate';

/** Delete this app's own entries from the legacy caches. `rules` limits it to one model (see rulesForModel). Uses `has`, never `open`, so no cache is created. */
export async function sweepLegacyEntries(cacheStorage = globalThis.caches, rules) {
  for (const name of LEGACY_CACHE_NAMES) {
    if (!(await cacheStorage.has(name))) continue;
    const cache = await cacheStorage.open(name);
    for (const request of await cache.keys()) if (isOwnModelUrl(request.url, rules)) await cache.delete(request);
  }
}

// Without a hash in the manifest for these files, accept only a complete, same-origin-safe response whose length matches its header.
const sound = (response, body) => {
  const header = response.headers.get('content-length');
  return response.status === 200 && (response.type === 'basic' || response.type === 'cors') && header !== null && /^\d+$/.test(header) && Number(header) === body.byteLength;
};

async function pass(cacheStorage) {
  let complete = true;
  for (const [legacy, current] of Object.entries(LEGACY_TO_NEW)) {
    if (!(await cacheStorage.has(legacy))) continue;
    const from = await cacheStorage.open(legacy);
    for (const request of await from.keys()) {
      if (!isOwnModelUrl(request.url)) continue;
      try {
        const response = await from.match(request);
        if (!response) continue;
        const body = await response.arrayBuffer();
        if (!sound(response, body)) continue; // fails the checks: leave it, and the model downloads again
        const to = await cacheStorage.open(current);
        await to.put(request.url, new Response(body, { status: 200, statusText: response.statusText, headers: response.headers })); // put overwrites, so a repeat is safe
        const copy = await to.match(request.url);
        if (!copy || (await copy.arrayBuffer()).byteLength !== body.byteLength) { complete = false; continue; }
        await from.delete(request); // only after the copy reads back at the same length
      } catch { complete = false; } // for example quota: keep the old copy and try again on the next load
    }
  }
  return complete;
}

/**
 * Move this app's own model files from the old shared cache names to the app-specific ones, one entry at a time.
 * Safe to repeat and safe in two tabs. Returns 'done', 'already' or 'incomplete'. It never throws.
 */
export async function migrateLegacyCaches({ cacheStorage = globalThis.caches, storage = globalThis.localStorage, locks = globalThis.navigator?.locks } = {}) {
  try {
    if (!cacheStorage?.has || storage.getItem(MIGRATED_FLAG)) return 'already';
    const run = async () => {
      if (storage.getItem(MIGRATED_FLAG)) return 'already'; // another tab finished while this one waited
      if (!(await pass(cacheStorage))) return 'incomplete';
      storage.setItem(MIGRATED_FLAG, '1');
      return 'done';
    };
    // shortcut: without Web Locks two tabs may both run. The copy overwrites, so that is harmless; upgrade if migration ever stops being idempotent.
    return await (locks?.request ? locks.request(LOCK_NAME, run) : run());
  } catch { return 'incomplete'; }
}
