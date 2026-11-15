import { clearAllStores } from './store.js';
import { isOwnCache } from './cache-names.js';

// Every localStorage key the app writes starts with this prefix.
export const SETTINGS_PREFIX = 'localBrowserTranscriber';

/**
 * Remove everything the app keeps in this browser: saved data, downloaded models and caches, settings and the
 * offline app copy. Each step runs even if another fails. Returns the plain-language names of the steps that failed.
 * The github.io host is shared with other sites, so only this app's own caches (named in cache-names.js) and
 * service workers whose scope is inside this app's base URL are touched. Foreign ones are left alone.
 */
export async function eraseAllData({ storage = globalThis.localStorage, cacheStorage = globalThis.caches, serviceWorker = globalThis.navigator?.serviceWorker, base = globalThis.document?.baseURI ? new URL('./', globalThis.document.baseURI).href : undefined } = {}) {
  const failed = [];
  const step = async (name, action) => { try { await action(); } catch { failed.push(name); } };
  // Order matters: stop the service worker first so it cannot refill a cache that is cleared after it.
  await step('the offline copy of the app', async () => { for (const registration of await serviceWorker?.getRegistrations?.() ?? []) if (base && registration.scope.startsWith(base)) await registration.unregister(); });
  await step('saved transcripts, screenshots, summaries, people and models', clearAllStores);
  await step('settings', async () => { for (const key of Object.keys(storage).filter((name) => name.startsWith(SETTINGS_PREFIX))) storage.removeItem(key); });
  await step('downloaded model files and caches', async () => { for (const key of await cacheStorage?.keys?.() ?? []) if (isOwnCache(key)) await cacheStorage.delete(key); });
  return failed;
}
