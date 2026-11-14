import { test as base, expect } from '@playwright/test';
import { test, importSample, openPriorSessions } from './helpers.mjs';

// Content Security Policy checks. The policy is a meta tag in index.html, so these load the built app and
// fail on any securitypolicyviolation event or CSP console error. Synthetic data only.
const ALLOWED_HOSTS = /^(localhost|huggingface\.co|(.+\.)?hf\.co|raw\.githubusercontent\.com)$/;
const IS_CSP = /Content Security Policy|Refused to|CSP-VIOLATION/i;

async function watchCsp(page) {
  const problems = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP-VIOLATION ${event.violatedDirective} ${event.blockedURI}`));
    window.print = () => {}; // the print dialog is native and cannot be driven; the frame still loads
  });
  page.on('console', (message) => { if (IS_CSP.test(message.text())) problems.push(message.text()); });
  page.on('pageerror', (error) => { if (IS_CSP.test(error.message)) problems.push(error.message); });
  return problems;
}

test('policy is present in the page and in every docs page, and the docs pages raise no violations', async ({ page }) => {
  const problems = await watchCsp(page);
  for (const path of ['/index.html', '/docs/help.html', '/docs/privacy.html', '/docs/terms.html', '/docs/accessibility.html', '/docs/whats-new.html']) {
    await page.goto(path);
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(policy, path).toContain("default-src 'none'");
    expect(policy, path).not.toMatch(/'unsafe-eval'/);
    expect(policy, path).not.toMatch(/style-src[^;]*unsafe-inline/);
    await page.locator('select[data-theme-control], #theme-select').first().selectOption('dark');
  }
  expect(problems, 'CSP violations or console errors').toEqual([]);
});

test('main flows raise no policy violations: landing, settings, import, export, print, delete, record', async ({ page }) => {
  const problems = await watchCsp(page);
  await page.goto('/index.html');
  await expect(page.locator('#start-session')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#microphone-status')).toContainText(/Microphone on/i, { timeout: 15000 });

  // Record with the fake microphone.
  await page.locator('#start-session').click();
  await expect(page.locator('#stop-session')).toBeEnabled();
  await page.locator('#stop-session').click();

  // Settings, import, export (Markdown and Word), delete.
  await openPriorSessions(page);
  await importSample(page);
  const row = page.locator('#saved-session-list tr', { hasText: 'E2E sample' });
  await expect(row).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Export Markdown' }).click()]);
  expect(md.suggestedFilename()).toMatch(/\.md$/);

  // Print export: seed a saved note, open it, choose print. The frame must load its stylesheet under the policy.
  await page.evaluate(() => new Promise((resolve, reject) => {
    indexedDB.databases().then(([{ name }]) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        db.transaction('sessions').objectStore('sessions').getAll().onsuccess = (found) => {
          const tx = db.transaction('meetingNotes', 'readwrite');
          tx.objectStore('meetingNotes').put({ sessionId: found.target.result[0].id, title: 'Policy sample', content: '## Summary\n\nSynthetic note.', updatedAt: Date.now() });
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      };
    });
  }));
  await row.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('tab', { name: 'Summary' }).click();
  await expect(page.locator('#minutes-editor')).toBeVisible();
  await page.locator('#minutes-export-format').selectOption('print');
  await page.locator('#export-minutes').click();
  const frame = page.locator('iframe[data-print-frame]');
  await expect(frame).toHaveCount(1);
  const printFrame = page.frame({ url: 'about:srcdoc' });
  await expect.poll(() => printFrame.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px'); // 12pt from print.css

  // Delete.
  await openPriorSessions(page);
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.locator('#confirm-delete').click();
  await expect(row).toHaveCount(0);

  expect(problems, 'CSP violations or console errors').toEqual([]);
});

// The real workers, no stub, no network. Starting a model download makes the real transcriber worker import its libraries.
base('real workers start under the policy; every outside request goes to an allowed host', async ({ page }) => {
  const problems = await watchCsp(page);
  const hosts = new Set();
  await page.addInitScript(() => localStorage.setItem('localBrowserTranscriberSpeakerSeparation', 'true'));
  await page.context().route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    hosts.add(hostname);
    return ALLOWED_HOSTS.test(hostname) && hostname === 'localhost' ? route.continue() : route.abort();
  });
  await page.goto('/index.html');
  // The app starts the default speech model download by itself; the network block makes it fail after the request is made.
  await expect.poll(() => page.workers().length, { timeout: 15000 }).toBe(4);
  await expect.poll(() => [...hosts].includes('huggingface.co'), { timeout: 20000 }).toBe(true);
  await page.waitForTimeout(2000);
  expect([...hosts].filter((host) => !ALLOWED_HOSTS.test(host)), 'hosts outside the policy').toEqual([]);
  expect(hosts.has('cdn.jsdelivr.net'), 'jsDelivr is no longer used').toBe(false);
  expect(problems, 'CSP violations or console errors').toEqual([]);
});
