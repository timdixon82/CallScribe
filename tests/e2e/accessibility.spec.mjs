import AxeBuilder from '@axe-core/playwright';
import { test, expect, importSample, openPriorSessions } from './helpers.mjs';

// WCAG 2.2 A, AA and AAA tags. axe has AAA rules under wcag2aaa only; wcag22aaa is listed so
// any rule axe adds under it is picked up. Any violation fails the test.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa', 'wcag22aaa'];
async function scan(page, state) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`);
  expect(summary, `axe violations in state: ${state}`).toEqual([]);
}

test.beforeEach(async ({ page }) => { await page.goto('/index.html'); await expect(page.locator('#start-session')).toBeVisible(); });

test('landing page', async ({ page }) => { await scan(page, 'landing'); });

test('settings open', async ({ page }) => {
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Transcription Settings' }).click();
  await expect(page.locator('#workspace-settings')).toBeVisible();
  await scan(page, 'transcription settings');
  await page.getByRole('button', { name: 'Back to transcript' }).first().click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Capture Settings' }).click();
  await scan(page, 'capture settings');
});

test('import status and saved transcript list', async ({ page }) => {
  await openPriorSessions(page);
  await importSample(page);
  await expect(page.locator('#import-transcript-status')).toContainText(/imported/i);
  await scan(page, 'import status and session list');
});

test('saved transcript view and export menu', async ({ page }) => {
  await openPriorSessions(page);
  await importSample(page);
  await page.locator('#saved-session-list tr', { hasText: 'E2E sample' }).getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('#transcript-list')).toContainText('Hello from the sample file');
  await scan(page, 'saved transcript view');
  await page.locator('#export-format').focus();
  await scan(page, 'export controls');
});

test('delete dialog', async ({ page }) => {
  await openPriorSessions(page);
  await importSample(page);
  await page.locator('#saved-session-list tr', { hasText: 'E2E sample' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#delete-dialog')).toBeVisible();
  await scan(page, 'delete dialog');
});
