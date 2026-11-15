import { test as base } from '@playwright/test';
import { test, expect } from './helpers.mjs';
import AxeBuilder from '@axe-core/playwright';
import { buildFramePage } from '../../scripts/ocr-frame-page.mjs';

// Text recognition runs in an isolated frame that the service worker builds. These tests use the real built app, the real
// page policy (no unsafe-eval) and the real service worker. Synthetic data only: a picture of a made-up phrase.
const PHRASE = 'HELLO WORLD 2026';
const FRAME_URL = /\/ocr-frame\.html$/;
const normal = (text) => text.replace(/\s+/g, ' ').toUpperCase();

async function watchViolations(page) {
  const violations = [];
  await page.addInitScript(() => {
    // Only the page itself: the frame has its own policy, and its one known harmless violation is described in docs/known-limitations.md.
    document.addEventListener('securitypolicyviolation', (event) => { if (window === window.top) console.error(`CSP-VIOLATION ${event.violatedDirective} ${event.blockedURI}`); });
  });
  const fromFramePolicy = (message) => /^blob:|ocr-frame\.html/.test(message.location().url || '') || /data:application\/octet-stream/.test(message.text()); // the frame's one known, harmless data: fetch
  page.on('console', (message) => { if (!fromFramePolicy(message) && /CSP-VIOLATION|Content Security Policy|unsafe-eval/i.test(message.text())) violations.push(message.text()); });
  page.on('pageerror', (error) => { if (/Content Security Policy|unsafe-eval/i.test(error.message)) violations.push(error.message); });
  return violations;
}

// Open the app and wait until the service worker controls the page, which text recognition requires.
async function openApp(page) {
  await page.goto('/index.html');
  await expect(page.locator('#start-session')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
}

// The OCR switch is only offered once screen capture is in use; reveal it directly to exercise the real enable path.
async function turnOcrOn(page) {
  await page.evaluate(() => {
    const toggle = document.getElementById('toggle-ocr');
    toggle.disabled = false;
    toggle.closest('label').hidden = false;
  });
  await page.locator('#toggle-ocr').evaluate((el) => el.click());
}

const readyOcr = async (page) => {
  await turnOcrOn(page);
  await expect(page.locator('#ocr-status')).toContainText(/Local OCR is ready/, { timeout: 120000 });
};

// Run the real client export on a canvas picture of the phrase. The module is the one the app itself loaded.
const recognise = (page, { timeoutMs, asBlob = true } = {}) => page.evaluate(async ({ phrase, timeoutMs: limit, asBlob: blobInput }) => {
  const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\/assets\/ocr-[^/]*\.js$/.test(name));
  const { recogniseImage } = await import(url);
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 160;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 640, 160);
  context.fillStyle = '#000'; context.font = 'bold 56px Arial, sans-serif'; context.textBaseline = 'middle';
  context.fillText(phrase, 24, 80);
  const image = blobInput ? await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')) : context.getImageData(0, 0, 640, 160);
  try { return { text: await recogniseImage(image, limit ? { timeoutMs: limit } : undefined) }; } catch (error) { return { error: error.message }; }
}, { phrase: PHRASE, timeoutMs, asBlob });

const ocrFrame = (page) => page.frames().find((frame) => FRAME_URL.test(frame.url()));
const disposeFrame = (page) => page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\/assets\/ocr-[^/]*\.js$/.test(name));
  (await import(url)).disposeOcr();
});

test('OCR enables and reads known text under the page policy, with no unsafe-eval on the page', async ({ page }) => {
  test.setTimeout(180000);
  const violations = await watchViolations(page);
  await openApp(page);
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).not.toMatch(/'unsafe-eval'/);
  await readyOcr(page);
  const result = await recognise(page);
  expect(normal(result.text ?? result.error)).toContain('HELLO WORLD');
  expect((await recognise(page, { asBlob: false })).text).toBeTruthy(); // raw pixels, the path the screenshot flow uses
  expect(violations).toEqual([]);
});

test('the frame is isolated: opaque origin, no network, no access to the page storage', async ({ page }) => {
  test.setTimeout(180000);
  const attempted = []; // the browser reports a request that its policy then blocks; it must have failed
  page.on('request', (request) => { if (request.frame() && FRAME_URL.test(request.frame().url()) && request.resourceType() !== 'document' && !request.url().startsWith('blob:')) attempted.push(request); }); // blob: URLs are the frame's own memory
  await openApp(page);
  await page.evaluate(() => { localStorage.setItem('seeded-key', 'seeded'); document.cookie = 'seeded=1'; });
  await readyOcr(page);
  await recognise(page);
  const frame = ocrFrame(page);
  expect(frame, 'the frame exists while OCR is on').toBeTruthy();
  const probes = await frame.evaluate(async () => {
    const attempt = async (run) => { try { return { ok: true, value: await run() }; } catch (error) { return { ok: false, name: error.name }; } };
    return {
      origin: self.origin,
      fetchSite: await attempt(() => fetch('/index.html').then((r) => r.status)),
      fetchOutside: await attempt(() => fetch('https://example.com/').then((r) => r.status)),
      fetchBlob: await attempt(() => fetch(URL.createObjectURL(new Blob(['x']))).then((r) => r.status)),
      socket: await attempt(() => new Promise((resolve, reject) => { const s = new WebSocket('wss://example.com/'); s.onopen = resolve; s.onerror = () => reject(new Error('blocked')); setTimeout(() => reject(new Error('timeout')), 3000); })),
      importOutside: await attempt(() => import('https://example.com/x.js')),
      indexedDB: await attempt(() => new Promise((resolve, reject) => { const r = indexedDB.open('x'); r.onsuccess = resolve; r.onerror = () => reject(r.error); })),
      localStorage: await attempt(() => localStorage.getItem('seeded-key')),
      caches: await attempt(() => caches.keys()),
      cookie: await attempt(() => document.cookie),
      parentDocument: await attempt(() => parent.document.title),
    };
  });
  expect(probes.origin).toBe('null');
  for (const name of ['fetchSite', 'fetchOutside', 'fetchBlob', 'socket', 'importOutside', 'indexedDB', 'localStorage', 'caches', 'cookie', 'parentDocument']) expect(probes[name].ok, name).toBe(false);
  expect(attempted.filter((request) => !request.failure()).map((request) => request.url()), 'requests from the frame that were not blocked').toEqual([]);
});

// Uses the plain test, without the network-blocking route. Cause found: in Firefox this test fails only when the route (request interception) and offline emulation are combined;
// the frame never greets and the app answers with its reload-once message. It passes online with the route, and offline without it. See docs/decisions/002.
// Offline, any outside request fails anyway.
base('offline: after one online load, OCR still works and the frame loads from the service worker', async ({ page, context }) => {
  test.setTimeout(240000);
  await openApp(page);
  await readyOcr(page);
  expect(normal((await recognise(page)).text)).toContain('HELLO WORLD');
  await disposeFrame(page);
  await expect.poll(() => page.frames().length).toBe(1);
  await context.setOffline(true);
  try {
    const offline = await recognise(page);
    expect(normal(offline.text ?? offline.error)).toContain('HELLO WORLD');
  } finally { await context.setOffline(false); }
});

test('the service worker serves the frame page only to an iframe, with the exact sandbox header', async ({ page }) => {
  test.setTimeout(180000);
  const headers = [];
  page.on('response', (response) => { if (FRAME_URL.test(response.url())) headers.push(response.headers()); });
  await openApp(page);
  await readyOcr(page);
  expect(headers.length).toBeGreaterThan(0);
  expect(headers[0]['content-security-policy']).toBe('sandbox allow-scripts');
  // A top-level visit and a script fetch of the same path, with a query that tries to change behaviour, get no document.
  for (const path of ['/ocr-frame.html', '/ocr-frame.html?sbx=1&x-frame-policy=allow-same-origin']) {
    const status = await page.evaluate(async (target) => (await fetch(target)).status, path);
    expect(status, path).toBe(404);
    const top = await page.goto(path);
    expect(top.status(), path).toBe(404);
  }
});

test('a changed byte in a cached engine file makes the page refuse to start the frame', async ({ page }) => {
  test.setTimeout(180000);
  await openApp(page);
  await readyOcr(page);
  await disposeFrame(page);
  await page.evaluate(async () => {
    const cache = await caches.open('local-browser-transcriber-ocr-v1');
    const key = new URL('ocr/core.js', document.baseURI).href;
    const bytes = new Uint8Array(await (await cache.match(key)).arrayBuffer());
    bytes[Math.floor(bytes.length / 2)] ^= 1;
    await cache.put(key, new Response(bytes, { headers: { 'content-type': 'text/javascript' } }));
  });
  const result = await recognise(page);
  expect(result.error).toMatch(/did not pass a safety check/);
  expect(page.frames().length, 'no frame was created').toBe(1);
});

test('the frame page does nothing when the sandbox header is missing', async ({ browser }) => {
  // A fresh context with no service worker, serving the real frame page without the header. The bootstrap must stay silent.
  const context = await browser.newContext({ serviceWorkers: 'block', baseURL: 'http://localhost:4173' });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/headerless.html') return route.fulfill({ contentType: 'text/html', body: buildFramePage().html });
    if (url.pathname === '/sandboxed.html') return route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': 'sandbox allow-scripts' }, body: buildFramePage().html }); // positive control
    return route.continue();
  });
  await page.goto('/index.html');
  await page.evaluate(() => { window.__hello = []; window.addEventListener('message', (event) => window.__hello.push(event.data)); const frame = document.createElement('iframe'); frame.src = '/headerless.html'; document.body.append(frame); });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__hello)).toEqual([]);
  await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/sandboxed.html'; document.body.append(frame); });
  await expect.poll(() => page.evaluate(() => window.__hello.map((message) => message.type))).toEqual(['hello']); // the same page, with the header, does greet
  // The test server falls back to the app page for unknown paths; the real host answers 404. Either way, no eval-capable page exists.
  const direct = await page.request.get('/ocr-frame.html');
  expect(await direct.text(), 'no static frame page exists on the server').not.toContain("'unsafe-eval'");
  await context.close();
});

test.describe('first visit, with no service worker in control', () => {
  test.use({ serviceWorkers: 'block' });
  test('OCR fails closed with a plain message and creates no frame', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/index.html');
    await expect(page.locator('#start-session')).toBeVisible();
    await turnOcrOn(page);
    await expect(page.locator('#ocr-status')).toContainText(/Reload the page once, then try again/, { timeout: 120000 });
    expect(page.frames().length).toBe(1);
    await expect(page.locator('#toggle-ocr')).not.toBeChecked();
  });
});

test('a job that never finishes cannot freeze the page: its timers keep firing and the timeout can remove the frame', async ({ browser }) => {
  // The real frame page and bootstrap, with a hostile engine that spins forever the moment it is started. The page plays
  // the part of the client: it greets, sends init, then counts its own timer ticks while the engine is stuck.
  const context = await browser.newContext({ serviceWorkers: 'block', baseURL: 'http://localhost:4173' });
  const page = await context.newPage();
  await page.route('**/sandboxed.html', (route) => route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': 'sandbox allow-scripts' }, body: buildFramePage().html }));
  await page.goto('/index.html');
  const outcome = await page.evaluate(() => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.src = '/sandboxed.html';
    window.addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'hello') return;
      const spin = new TextEncoder().encode('self.onmessage = () => { for (;;) {} };').buffer;
      const files = { core: spin, glue: new ArrayBuffer(1), wasm: new ArrayBuffer(1), det: new ArrayBuffer(1), rec: new ArrayBuffer(1), dict: new ArrayBuffer(1) };
      const channel = new MessageChannel();
      frame.contentWindow.postMessage({ type: 'init', v: event.data.v, ...files }, '*', [channel.port2, ...Object.values(files)]);
      let ticks = 0;
      const ticker = setInterval(() => { ticks += 1; }, 100);
      setTimeout(() => { clearInterval(ticker); const before = document.querySelectorAll('iframe').length; frame.remove(); resolve({ ticks, before, after: document.querySelectorAll('iframe').length }); }, 2000); // the stand-in for the job timeout
    });
    document.body.append(frame);
  }));
  expect(outcome.ticks, 'page timers kept firing while the engine spun').toBeGreaterThanOrEqual(12);
  expect(outcome).toMatchObject({ before: 1, after: 0 });
  expect(await page.evaluate(() => 1 + 1), 'the page still answers').toBe(2);
  await context.close();
});

test('the OCR switch works from the keyboard, is announced, and the page has no axe violations with OCR on', async ({ page }) => {
  test.setTimeout(180000);
  await openApp(page);
  const reveal = () => page.evaluate(() => { // show the switch the way a connected screen does; the keyboard then does the rest
    const toggle = document.getElementById('toggle-ocr');
    toggle.disabled = false;
    for (let node = toggle.parentElement; node; node = node.parentElement) { node.hidden = false; if (node.tagName === 'DETAILS') node.open = true; }
  });
  const focusSwitch = () => expect(async () => { await reveal(); await page.locator('#toggle-ocr').focus(); await expect(page.locator('#toggle-ocr')).toBeFocused({ timeout: 500 }); }).toPass({ timeout: 10000 }); // the app may hide the section again just after load
  await focusSwitch();
  await page.keyboard.press('Space');
  await expect(page.locator('#toggle-ocr')).toBeChecked();
  await expect(page.locator('#ocr-status')).toContainText(/Local OCR is ready/, { timeout: 120000 });
  expect(await page.locator('#ocr-status').getAttribute('role')).toBe('status');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa', 'wcag22aaa']).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  // The app disables the switch while it turns OCR on and hides the capture section again, so the reveal is repeated before the second keypress.
  await expect(page.locator('#toggle-ocr')).toBeEnabled();
  await focusSwitch();
  await page.keyboard.press('Space');
  await expect(page.locator('#toggle-ocr')).not.toBeChecked();
});
