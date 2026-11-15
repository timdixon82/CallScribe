// SPIKE ONLY. Usage: node spike/run-spike.mjs <browser> <baseUrl> [offline]
import { chromium, firefox, webkit } from '@playwright/test';

const [name, base, mode] = process.argv.slice(2);
const type = { chromium, firefox, webkit }[name];
const browser = await type.launch();
const context = await browser.newContext();
const page = await context.newPage();
const notes = { browser: name, base, console: [], failed: [], frameRequests: [], pageErrors: [] };
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) notes.console.push(`${m.type()}: ${m.text().slice(0, 260)}`); });
page.on('pageerror', (e) => notes.pageErrors.push(String(e.message).slice(0, 200)));
page.on('requestfailed', (r) => notes.failed.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
page.on('request', (r) => { const f = r.frame(); if (f && f !== page.mainFrame()) notes.frameRequests.push(`${r.method()} ${r.url().slice(0, 110)}`); });
const out = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
const step = async (label, fn) => { try { out(label, await fn()); } catch (e) { out(label, `THROWS ${String(e.message).split('\n')[0].slice(0, 200)}`); } };

await page.goto(`${base}/spike-parent.html${mode === 'offline' ? '?sw=sw.js' : mode === 'offline-header' ? '?sw=sw-spike.js' : ''}`);

const offline = mode === 'offline' || mode === 'offline-header';
const frameOpts = mode === 'offline-header' ? { sandbox: null } : {};
if (offline) {
  await page.waitForSelector('#status[data-sw=registered]', { timeout: 10000 });
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
  await step('online hello', () => page.evaluate((opts) => window.spike.openFrame(opts), frameOpts));
  await step('online ready', () => page.evaluate(() => window.spike.ready()).then((r) => r.type + ' ' + (r.error || r.ms)));
  await step('online ocr', () => page.evaluate(() => window.spike.recognise('HELLO WORLD 2026')));
  await context.setOffline(true);
  await page.reload();
  await step('offline parent loaded', () => page.evaluate(() => typeof window.spike));
  notes.frameRequests.length = 0; notes.failed.length = 0;
  await step('offline hello', () => page.evaluate((opts) => window.spike.openFrame(opts), frameOpts));
  await step('offline ready', () => page.evaluate(() => window.spike.ready()).then((r) => r.type + ' ' + (r.error || r.ms)));
  await step('offline ocr', () => page.evaluate(() => window.spike.recognise('HELLO WORLD 2026')));
  out('notes', notes);
  await browser.close();
  process.exit(0);
}

await page.evaluate(() => window.spike.seedDb());
await step('1 hello (frame loaded its module script)', () => page.evaluate((opts) => window.spike.openFrame(opts), frameOpts));
const t0 = Date.now();
await step('3 ready', () => Promise.race([page.evaluate(() => window.spike.ready()).then((r) => r.type + ' ' + (r.error || r.ms + 'ms') + (r.logs ? ' logs=' + JSON.stringify(r.logs) : '')), new Promise((r) => setTimeout(() => r('TIMEOUT 60s'), 60000))]));
await step('3 recognise text', () => page.evaluate(() => window.spike.recognise('HELLO WORLD 2026')));
await step('recognise ms', () => String(Date.now() - t0));
await step('4,5 probe', () => page.evaluate(() => window.spike.call({ type: 'probe' })));
await step('frame logs', () => page.evaluate(() => window.spike.call({ type: 'logs' })));
await step('2 frame without own policy', () => page.evaluate(() => window.spike.probeFrame('ocr-frame-nopolicy.html')));
await step('2 srcdoc frame with permissive meta', () => page.evaluate(() => window.spike.probeFrame('ocr-frame-nopolicy.html', { srcdoc: true })));
await step('7 print srcdoc frame', () => page.evaluate(() => window.spike.printFrame()));
const frameUrl = () => page.frames().filter((f) => f !== page.mainFrame()).map((f) => f.url().slice(0, 60));
await step('7 frame urls before', frameUrl);
await page.evaluate(() => window.spike.call({ type: 'navigate', url: 'https://example.com/' })).catch(() => {});
await page.waitForTimeout(3000);
await step('7 frame urls after navigate to example.com', frameUrl);
out('notes', notes);
await browser.close();
