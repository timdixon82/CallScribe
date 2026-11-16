import { clearAllStores } from './store.js';
import { isOwnCache } from './cache-names.js';
import { sweepLegacyEntries } from './legacy-caches.js';

// Every localStorage key the app writes starts with this prefix.
export const SETTINGS_PREFIX = 'localBrowserTranscriber';

/**
 * Remove everything the app keeps in this browser: saved data, downloaded models and caches, settings and the
 * offline app copy. Each step runs even if another fails. Returns the plain-language names of the steps that failed.
 * The github.io host is shared with other sites, so only caches with this app's prefixes (cache-names.js) and service workers
 * whose scope is inside this app's base URL are deleted. Earlier versions stored models under the libraries' default cache
 * names (transformers-cache and webllm/...), which other sites may use too: those caches are never deleted, only the entries
 * whose URLs are this app's pinned model files. Entries it cannot attribute to itself stay until the user clears site data.
 */
export async function eraseAllData({ storage = globalThis.localStorage, cacheStorage = globalThis.caches, serviceWorker = globalThis.navigator?.serviceWorker, base = globalThis.document?.baseURI ? new URL('./', globalThis.document.baseURI).href : undefined, disposeOcr = async () => {} } = {}) {
  const failed = [];
  const step = async (name, action) => { try { await action(); } catch { failed.push(name); } };
  await step('the text recognition frame', disposeOcr); // removes the isolated frame and the model memory it holds
  // Order matters: stop the service worker first so it cannot refill a cache that is cleared after it.
  await step('the offline copy of the app', async () => { for (const registration of await serviceWorker?.getRegistrations?.() ?? []) if (base && registration.scope.startsWith(base)) await registration.unregister(); });
  await step('saved transcripts, screenshots, summaries, people and models', clearAllStores);
  await step('settings', async () => { for (const key of Object.keys(storage).filter((name) => name.startsWith(SETTINGS_PREFIX))) storage.removeItem(key); });
  await step('downloaded model files and caches', async () => {
    let error;
    try { for (const key of await cacheStorage?.keys?.() ?? []) if (isOwnCache(key)) await cacheStorage.delete(key); } catch (e) { error = e; }
    try { if (cacheStorage) await sweepLegacyEntries(cacheStorage); } catch (e) { error ??= e; } // runs even if the first part failed
    if (error) throw error;
  });
  return failed;
}
