import { test, expect, storedCounts } from './helpers.mjs';

// The transcriber worker is stubbed in helpers.mjs, so no model is downloaded.
test('fake microphone: record, pause, resume and stop saves a session', async ({ page }) => {
  await page.goto('/index.html');
  const start = page.locator('#start-session');
  // No branching on Start's state here: on a slow runner it is still disabled while the stubbed model loads.
  await expect(start).toBeEnabled({ timeout: 15000 });
  // The app connects the (fake) microphone by itself once permission is granted.
  await expect(page.locator('#microphone-status')).toContainText(/Microphone on/i, { timeout: 15000 });

  await start.click();
  await expect(page.locator('#session-status')).toContainText(/record|transcrib|active|started/i);
  await expect(page.locator('#pause-session')).toBeEnabled();
  await expect(page.locator('#stop-session')).toBeEnabled();

  await page.locator('#pause-session').click();
  await expect(page.locator('#session-status')).toContainText(/paused/i);
  await page.locator('#pause-session').click();
  await expect(page.locator('#session-status')).not.toContainText(/paused/i);

  await page.locator('#stop-session').click();
  await expect(start).toBeEnabled();
  expect((await storedCounts(page)).sessions).toBe(1);
  await page.goto('/index.html');
  expect((await storedCounts(page)).sessions).toBe(1);
});
