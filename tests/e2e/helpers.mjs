import { test as base, expect } from '@playwright/test';

// Stand-in for the transcriber worker: reports the model as ready and never touches the network.
const STUB_WORKER = "self.onmessage = ({ data }) => { if (data.type === 'load') self.postMessage({ type: 'model-ready', modelId: data.model.id, device: 'stub' }); };";

export const test = base.extend({
  page: async ({ page }, use) => {
    const external = [];
    await page.context().route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue(); // in-memory, not network (WebKit reports them)
      if (url.hostname !== 'localhost') { external.push(url.href); return route.abort(); }
      if (/transcriber\.worker/.test(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: STUB_WORKER });
      return route.continue();
    });
    await use(page);
    expect(external, 'no external network requests').toEqual([]);
  },
});
export { expect };

export const SAMPLE_MD = [
  '# E2E sample', '', '## Generated with', '', 'test', '', 'Exported: now', '',
  '## 14 Nov 2026, 10:00:00 — Mic', '', 'Hello from the sample file', '',
  '## 14 Nov 2026, 10:00:05 — App', '', 'Reply from the other side', '',
].join('\n');

export const importSample = (page, name = 'E2E sample.md') =>
  page.locator('#import-transcript-file').setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(SAMPLE_MD) });

export const storedCounts = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.databases().then((dbs) => dbs[0]?.name);
  open.then((name) => {
    if (!name) return resolve({});
    const req = indexedDB.open(name);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result; const names = [...db.objectStoreNames]; const out = {};
      if (!names.length) { db.close(); return resolve(out); }
      const tx = db.transaction(names, 'readonly');
      names.forEach((n) => { tx.objectStore(n).count().onsuccess = (e) => { out[n] = e.target.result; }; });
      tx.oncomplete = () => { db.close(); resolve(out); };
    };
  });
}));

// The saved-session list lives in the "Prior Sessions" view, reached from the Settings tab.
export async function openPriorSessions(page) {
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Prior Sessions' }).click();
  await expect(page.locator('#history-section')).toBeVisible();
}
