const DB_NAME = 'local-browser-transcriber';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('models', { keyPath: 'id' });
      db.createObjectStore('sessions', { keyPath: 'id' });
      const segments = db.createObjectStore('segments', { keyPath: 'id' });
      segments.createIndex('sessionId', 'sessionId');
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function run(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export const getModel = (id) => run('models', 'readonly', (store) => store.get(id));
export const putModel = (value) => run('models', 'readwrite', (store) => store.put(value));
export const removeModel = (id) => run('models', 'readwrite', (store) => store.delete(id));
export const getSetting = async (key) => (await run('settings', 'readonly', (store) => store.get(key)))?.value;
export const putSetting = (key, value) => run('settings', 'readwrite', (store) => store.put({ key, value }));
export const putSession = (value) => run('sessions', 'readwrite', (store) => store.put(value));
export const putSegment = (value) => run('segments', 'readwrite', (store) => store.put(value));
export const getSegments = async (sessionId) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction('segments', 'readonly').objectStore('segments').index('sessionId').getAll(sessionId);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};
export const deleteSegments = async (sessionId) => {
  const items = await getSegments(sessionId);
  return Promise.all(items.map((item) => run('segments', 'readwrite', (store) => store.delete(item.id))));
};
