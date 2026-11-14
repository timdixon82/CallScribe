import { test, expect, importSample, openPriorSessions, storedCounts } from './helpers.mjs';

test('import a Markdown file, see it listed, delete it, storage is empty', async ({ page }) => {
  await page.goto('/index.html');
  await openPriorSessions(page);
  await importSample(page);
  await expect(page.locator('#import-transcript-status')).toContainText(/imported/i);
  const row = page.locator('#saved-session-list tr', { hasText: 'E2E sample' });
  await expect(row).toBeVisible();
  const before = await storedCounts(page);
  expect(before.sessions).toBe(1);
  expect(before.segments).toBe(2);

  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#delete-dialog')).toBeVisible();
  await page.locator('#confirm-delete').click();
  await expect(page.locator('#saved-session-list tr')).toHaveCount(0);

  await page.reload();
  await openPriorSessions(page);
  await expect(page.locator('#saved-session-list tr')).toHaveCount(0);
  const after = await storedCounts(page);
  expect(after.sessions).toBe(0);
  expect(after.segments).toBe(0);
  expect(after.screenshots ?? 0).toBe(0);
});
