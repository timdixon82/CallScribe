const DB_NAME = 'local-browser-transcriber';
const DB_VERSION = 5;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('segments')) { const segments = db.createObjectStore('segments', { keyPath: 'id' }); segments.createIndex('sessionId', 'sessionId'); }
      if (!db.objectStoreNames.contains('screenshots')) { const screenshots = db.createObjectStore('screenshots', { keyPath: 'id' }); screenshots.createIndex('sessionId', 'sessionId'); }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      // Names are user-entered labels only. No voice data or biometric templates are stored.
      if (!db.objectStoreNames.contains('participants')) db.createObjectStore('participants', { keyPath: 'id' });
      // Generated meeting notes are deliberately separate from immutable source
      // transcripts. A note retains segment and screenshot references rather
      // than duplicating audio, image blobs, or OCR text.
      if (!db.objectStoreNames.contains('meetingNotes')) { const notes = db.createObjectStore('meetingNotes', { keyPath: 'sessionId' }); notes.createIndex('updatedAt', 'updatedAt'); }
      if (!db.objectStoreNames.contains('minutesRuns')) db.createObjectStore('minutesRuns', { keyPath: 'sessionId' });
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
export const getParticipants = () => run('participants', 'readonly', (store) => store.getAll());
export const putParticipant = (value) => run('participants', 'readwrite', (store) => store.put(value));
export const removeParticipant = (id) => run('participants', 'readwrite', (store) => store.delete(id));
export const putSession = (value) => run('sessions', 'readwrite', (store) => store.put(value));
export const getSessions = () => run('sessions', 'readonly', (store) => store.getAll());
export const removeSession = (id) => run('sessions', 'readwrite', (store) => store.delete(id));
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
export async function removeParticipantFromSegments(participantId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('segments', 'readwrite');
    const store = tx.objectStore('segments');
    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const segment = cursor.value;
      if (segment.speakerIds?.includes(participantId)) {
        segment.speakerIds = segment.speakerIds.filter((id) => id !== participantId);
        cursor.update(segment);
      }
      cursor.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export const putScreenshot = (value) => run('screenshots', 'readwrite', (store) => store.put(value));
export const getScreenshot = (id) => run('screenshots', 'readonly', (store) => store.get(id));
export const getScreenshots = async (sessionId) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction('screenshots', 'readonly').objectStore('screenshots').index('sessionId').getAll(sessionId);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};
export const deleteScreenshots = async (sessionId) => {
  const items = await getScreenshots(sessionId);
  return Promise.all(items.map((item) => run('screenshots', 'readwrite', (store) => store.delete(item.id))));
};
export const getMeetingNotes = (sessionId) => run('meetingNotes', 'readonly', (store) => store.get(sessionId));
export const putMeetingNotes = (value) => run('meetingNotes', 'readwrite', (store) => store.put(value));
export const deleteMeetingNotes = (sessionId) => run('meetingNotes', 'readwrite', (store) => store.delete(sessionId));
export const getMinutesRun = (sessionId) => run('minutesRuns', 'readonly', (store) => store.get(sessionId));
export const putMinutesRun = (value) => run('minutesRuns', 'readwrite', (store) => store.put(value));
export const deleteMinutesRun = (sessionId) => run('minutesRuns', 'readwrite', (store) => store.delete(sessionId));
