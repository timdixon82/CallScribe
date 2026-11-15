import { test, expect } from './helpers.mjs';

test('the page reloads offline from the service worker cache', async ({ page, context }) => {
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the worker now controls the page, so this load is cached
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('#model-select option')).toHaveCount(5);
  await context.setOffline(false);
});
