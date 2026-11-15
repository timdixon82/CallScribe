// SPIKE ONLY. Frame page loaded as a plain iframe with no sandbox header: it must stay inert (no hello).
import { chromium } from '@playwright/test';
const b = await chromium.launch(); const page = await b.newPage();
await page.goto('http://127.0.0.1:4290/parent-strict.html');
console.log(await page.evaluate(() => window.p2.openFrame({ mode: 'url', sandbox: null, url: 'frame2.html' }).catch((e) => String(e.message))));
console.log('parent eval:', await page.evaluate(() => { try { new Function('1'); return 'allowed'; } catch (e) { return 'blocked'; } }));
await b.close();
