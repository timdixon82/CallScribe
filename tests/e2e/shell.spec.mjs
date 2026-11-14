import { readFile } from 'node:fs/promises';
import { test, expect, importSample, openPriorSessions } from './helpers.mjs';

// Behavioural replacements for source-string checks that used to live in tests/models.test.mjs.
test('model picker lists the five catalogue models, including multilingual ones', async ({ page }) => {
  await page.goto('/index.html');
  const options = await page.locator('#model-select option').allTextContents();
  expect(options).toHaveLength(5);
  expect(options.join(' ')).toMatch(/Multilingual/);
});

test('footer shows the release version from package.json', async ({ page }) => {
  await page.goto('/index.html');
  const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  await expect(page.locator('[data-app-version]').first()).toContainText(version);
});

test('exporting an imported transcript as Markdown downloads the same text', async ({ page }) => {
  await page.goto('/index.html');
  await openPriorSessions(page);
  await importSample(page);
  const row = page.locator('#saved-session-list tr', { hasText: 'E2E sample' });
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Export Markdown' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const text = await readFile(await download.path(), 'utf8');
  expect(text).toContain('Hello from the sample file');
  expect(text).toContain('Reply from the other side');
});
