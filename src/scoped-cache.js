// Gives the model libraries app-specific cache names. See docs/decisions/003-app-specific-cache-names.md.

/** An object with the match and put methods that Transformers.js accepts as env.customCache. The cache is opened on each call. */
export function scopedCache(name, storage = globalThis.caches) {
  return {
    match: async (key) => (await storage.open(name)).match(key),
    put: async (key, response) => { await (await storage.open(name)).put(key, response); },
  };
}

/**
 * A CacheStorage look-alike that renames the caches in `map` and passes everything else straight through.
 * `keys` is not mapped: it lists real names. `resolveName` is a pure probe so the guard can check the mapping without opening a cache.
 */
export function renameCaches(map, real) {
  const resolveName = (name) => (Object.hasOwn(map, name) ? map[name] : name);
  return {
    resolveName,
    open: (name) => real.open(resolveName(name)),
    has: (name) => real.has(resolveName(name)),
    delete: (name) => real.delete(resolveName(name)),
    match: (request, options) => real.match(request, options?.cacheName === undefined ? options : { ...options, cacheName: resolveName(options.cacheName) }),
    keys: () => real.keys(),
  };
}

/**
 * Check that `wrapper` is what the scope really uses and that it renames the names in `map`.
 * Throws if not, so the caller can refuse to start the library rather than write to the shared default names.
 */
export function assertCachesRenamed(scope, wrapper, map) {
  if (scope.caches !== wrapper) throw new Error('The browser did not accept the private cache names, so the detailed summary model was not started.');
  for (const [from, to] of Object.entries(map)) if (wrapper.resolveName(from) !== to) throw new Error('The private cache names are not in force, so the detailed summary model was not started.');
}

/**
 * Replace `scope.caches` with a renaming wrapper and verify it. `caches` is an accessor on the global scope, so plain assignment is
 * ignored or throws; defineProperty is needed. Throws (fails closed) if the override does not take effect.
 */
export function installCachesRename(scope, map) {
  const wrapper = renameCaches(map, scope.caches);
  try { Object.defineProperty(scope, 'caches', { value: wrapper, configurable: true }); } catch { /* the check below reports it */ }
  assertCachesRenamed(scope, wrapper, map);
  return wrapper;
}
