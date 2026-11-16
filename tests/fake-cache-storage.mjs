// An in-memory CacheStorage for tests. Each seed entry is { body, status, type, headers }; the content-length header is added
// from the body unless 'content-length' is given. Responses are rebuilt on every read, so bodies can be read more than once.
const urlOf = (request) => (typeof request === 'string' ? request : request.url);
const build = (entry) => { const response = new Response(entry.body, { status: entry.status, headers: entry.headers }); Object.defineProperty(response, 'type', { value: entry.type }); return response; };

export function fakeCacheStorage(seed = {}, { failPutIn = [] } = {}) {
  const store = new Map(); const opened = [];
  const make = (name) => {
    const entries = store.get(name);
    return {
      match: async (request) => (entries.has(urlOf(request)) ? build(entries.get(urlOf(request))) : undefined),
      put: async (request, response) => {
        if (failPutIn.includes(name)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        const body = new Uint8Array(await response.arrayBuffer());
        entries.set(urlOf(request), { body, status: response.status, type: response.type === 'default' ? 'basic' : response.type, headers: Object.fromEntries(response.headers) });
      },
      delete: async (request) => entries.delete(urlOf(request)),
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
    };
  };
  for (const [name, items] of Object.entries(seed)) {
    store.set(name, new Map(Object.entries(items).map(([url, spec]) => {
      const body = spec.body ?? 'x'; const length = new TextEncoder().encode(body).byteLength;
      return [url, { body, status: spec.status ?? 200, type: spec.type ?? 'cors', headers: { ...(spec.length === null ? {} : { 'content-length': String(spec.length ?? length) }), ...spec.headers } }];
    })));
  }
  return {
    opened,
    has: async (name) => store.has(name),
    open: async (name) => { opened.push(name); if (!store.has(name)) store.set(name, new Map()); return make(name); },
    delete: async (name) => store.delete(name),
    keys: async () => [...store.keys()],
    urls: (name) => [...(store.get(name)?.keys() ?? [])],
  };
}
