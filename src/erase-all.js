import { clearAllStores } from './store.js';

// Every localStorage key the app writes starts with this prefix.
export const SETTINGS_PREFIX = 'localBrowserTranscriber';

/**
 * Remove everything the app keeps in this browser: saved data, downloaded models and caches, settings and the
 * offline app copy. Each step runs even if another fails. Returns the plain-language names of the steps that failed.
 * Cache Storage is origin-scoped, so every cache here belongs to the app (speech, summary, OCR and speaker models,
 * the service worker shell), including caches created by libraries.
 */
export async function eraseAllData({ storage = globalThis.localStorage, cacheStorage = globalThis.caches, serviceWorker = globalThis.navigator?.serviceWorker } = {}) {
  const failed = [];
  const step = async (name, action) => { try { await action(); } catch { failed.push(name); } };
  // Order matters: stop the service worker first so it cannot refill a cache that is cleared after it.
  await step('the offline copy of the app', async () => { for (const registration of await serviceWorker?.getRegistrations?.() ?? []) await registration.unregister(); });
  await step('saved transcripts, screenshots, summaries, people and models', clearAllStores);
  await step('settings', async () => { for (const key of Object.keys(storage).filter((name) => name.startsWith(SETTINGS_PREFIX))) storage.removeItem(key); });
  await step('downloaded model files and caches', async () => { for (const key of await cacheStorage?.keys?.() ?? []) await cacheStorage.delete(key); });
  return failed;
}
