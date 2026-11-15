import AxeBuilder from '@axe-core/playwright';
import { test, expect, importSample, openPriorSessions, storedCounts } from './helpers.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa', 'wcag22aaa'];

async function prepare(page) {
  await page.goto('/index.html');
  await expect(page.locator('#active-model')).toContainText(/ready/); // the app writes the model record once it is ready
  await openPriorSessions(page);
  await importSample(page);
  await expect(page.locator('#saved-session-list tr', { hasText: 'E2E sample' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await (await caches.open('synthetic-model-cache')).put('https://localhost/synthetic', new Response('x'));
    localStorage.setItem('localBrowserTranscriberTheme', 'dark');
  });
}
const remaining = (page) => page.evaluate(async () => ({
  caches: await caches.keys(),
  keys: Object.keys(localStorage).filter((key) => key.startsWith('localBrowserTranscriber')),
  workers: (await navigator.serviceWorker.getRegistrations()).length,
}));

test('cancel and Escape keep the data and return focus to the button', async ({ page }) => {
  await prepare(page);
  const button = page.getByRole('button', { name: 'Delete all my data' });
  await button.click();
  const dialog = page.locator('#erase-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Transcripts, screenshots and summaries');
  await expect(dialog).toContainText('Files you have already exported');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  expect((await storedCounts(page)).sessions).toBe(1);
  expect((await remaining(page)).caches).toContain('synthetic-model-cache');
  await expect(page.locator('#erase-all-status')).toHaveText('');
});

test('Escape after an earlier confirmed erase does not erase again', async ({ page }) => {
  await prepare(page);
  const button = page.getByRole('button', { name: 'Delete all my data' });
  await button.click();
  await page.locator('#confirm-erase').click();
  await expect(page.locator('#erase-all-status')).toContainText('All your data was deleted');
  await importSample(page);
  await expect(page.locator('#saved-session-list tr', { hasText: 'E2E sample' })).toBeVisible();
  await button.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#erase-dialog')).toBeHidden();
  expect((await storedCounts(page)).sessions).toBe(1);
});

test('confirming deletes everything, announces it and keeps focus on the button', async ({ page }) => {
  await prepare(page);
  const button = page.getByRole('button', { name: 'Delete all my data' });
  await button.click();
  await page.locator('#confirm-erase').click();
  await expect(page.locator('#erase-dialog')).toBeHidden();
  const status = page.locator('#erase-all-status');
  await expect(status).toContainText('All your data was deleted from this browser');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(button).toBeFocused();
  await expect(page.locator('#saved-session-list tr')).toHaveCount(0);
  const counts = await storedCounts(page);
  expect(Object.values(counts).every((n) => n === 0), JSON.stringify(counts)).toBe(true);
  expect(await remaining(page)).toEqual({ caches: [], keys: [], workers: 0 });
});
