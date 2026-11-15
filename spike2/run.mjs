// SPIKE ONLY. Usage: node spike2/run.mjs <browser> <base> <experiment>   experiments: eval | offline-attr | offline-header
import { chromium, firefox, webkit } from '@playwright/test';
const [name, base, exp] = process.argv.slice(2);
const browser = await { chromium, firefox, webkit }[name].launch();
const context = await browser.newContext();
const page = await context.newPage();
const notes = { console: [], failed: [], frameReq: [] };
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) notes.console.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
page.on('requestfailed', (r) => notes.failed.push(`${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
page.on('request', (r) => { const f = r.frame(); if (f && f !== page.mainFrame()) notes.frameReq.push(`${r.method()} ${r.url().slice(0, 100)}`); });
const out = (l, v) => console.log(`${l}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
const step = async (l, fn) => { try { out(l, await fn()); } catch (e) { out(l, `THROWS ${String(e.message).split('\n')[0].slice(0, 220)}`); } };
const ready = () => Promise.race([page.evaluate(() => window.p2.ready()).then((r) => `${r.type} ${r.error || r.ms + 'ms'}${r.violations ? ' v=' + JSON.stringify(r.violations) : ''}`), new Promise((r) => setTimeout(() => r('TIMEOUT 60s'), 60000))]);

const parentPage = exp === 'eval' ? 'parent-strict.html' : 'parent-strict.html';
if (exp === 'eval') {
  for (const pp of ['parent-strict.html', 'parent-hash.html']) for (const mode of ['blob', 'srcdoc']) {
    await page.goto(`${base}/${pp}`);
    await page.evaluate(() => window.p2.enable());
    notes.console.length = 0; notes.failed.length = 0;
    await step(`${pp} ${mode} hello`, () => page.evaluate((m) => window.p2.openFrame({ mode: m }), mode));
    await step(`${pp} ${mode} ready`, ready);
    out(`${pp} ${mode} console`, notes.console.slice(0, 3));
  }
  await browser.close(); process.exit(0);
}
const header = exp === 'offline-header';
const opts = header ? { mode: 'url', sandbox: null, url: 'frame2.html?sbx=1' } : { mode: 'url' };
await page.goto(`${base}/parent-strict.html`);
await page.waitForSelector('#status[data-sw=registered]');
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
await page.evaluate(() => window.p2.seedDb());
await step('enable (online, assets into Cache Storage)', () => page.evaluate(() => window.p2.enable()));
await page.reload();
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
await step('online hello', () => page.evaluate((o) => window.p2.openFrame(o), opts));
await step('online ready', ready);
await step('online ocr', () => page.evaluate(() => window.p2.recognise('HELLO WORLD 2026')));
await step('sw saw (online)', () => page.evaluate(() => window.p2.swSeen()));
await context.setOffline(true);
await page.reload();
await step('offline parent controlled', () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
notes.failed.length = 0; notes.frameReq.length = 0; notes.console.length = 0;
await step('offline hello', () => page.evaluate((o) => window.p2.openFrame(o), opts));
await step('offline ready', ready);
await step('offline ocr', () => page.evaluate(() => window.p2.recognise('HELLO WORLD 2026')));
await step('offline probe', () => page.evaluate(() => window.p2.call({ type: 'probe' })));
await step('sw saw (all)', () => page.evaluate(() => window.p2.swSeen()));
out('notes', notes);
await browser.close();
