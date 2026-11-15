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

test('the service worker is network first: a changed page wins over the cache, then serves offline', async ({ page, context }) => {
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('meta[name="sw-network-first"]')).toHaveCount(0);
  // The server now answers with a changed page. Routes added later run first.
  const changed = async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<head>', '<head><meta name="sw-network-first" content="changed">');
    await route.fulfill({ response, body });
  };
  await context.route('**/index.html', changed);
  await page.reload();
  await expect(page.locator('meta[name="sw-network-first"]')).toHaveCount(1); // fresh from the network, not the old cached copy
  await context.unroute('**/index.html', changed);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('meta[name="sw-network-first"]')).toHaveCount(1); // the fresh copy was cached for offline use
  await context.setOffline(false);
});
