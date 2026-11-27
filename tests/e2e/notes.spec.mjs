import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './helpers.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa', 'wcag22aaa'];

async function startRecording(page, { share = true } = {}) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => { const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; canvas.getContext('2d').fillRect(0, 0, 64, 64); return canvas.captureStream(5); };
  });
  await page.goto('/index.html');
  await expect(page.locator('#start-session')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#microphone-status')).toContainText(/Microphone on/i, { timeout: 15000 });
  if (share) { await page.getByRole('button', { name: 'Share screen and audio' }).first().click(); await expect(page.locator('#share-system-audio')).toBeChecked({ timeout: 15000 }); }
  await page.locator('#start-session').click();
  await expect(page.locator('#stop-session')).toBeEnabled();
}
async function exportAs(page, format) {
  await page.locator('#export-format').selectOption(format);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-transcript').click()]);
  return readFileSync(await download.path()).toString('utf8');
}

test('keyboard flow: open, type, add with Control+Enter, announce, and focus returns to Add note', async ({ page }) => {
  await startRecording(page);
  const open = page.locator('#note-open'); const text = page.locator('#note-text');
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Alt+Shift+N');
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(text).toBeFocused();
  await expect(page.locator('#note-status')).toHaveText('Note form open.');
  await text.fill('Decision: <b>ship</b> on Friday');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#note-status')).toContainText(/Note added at \d\d:\d\d\. Form closed/);
  await expect(open).toBeFocused();
  await expect(page.locator('#note-form')).toBeHidden();
  const item = page.locator('#transcript-list li.transcript-note');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Note');
  await expect(item.locator('.segment-text')).toHaveText('Decision: <b>ship</b> on Friday');
  await expect(item.locator('b')).toHaveCount(0);
});

test('empty note is refused, Escape discards, Keep open keeps the form', async ({ page }) => {
  await startRecording(page);
  await page.keyboard.press('Alt+Shift+N');
  await page.locator('#note-add').click();
  await expect(page.locator('#note-status')).toHaveText('Note is empty. Nothing added.');
  await expect(page.locator('#note-text')).toBeFocused();
  await page.locator('#note-text').fill('Throw away');
  await page.keyboard.press('Escape');
  await expect(page.locator('#note-status')).toContainText('Note cancelled.');
  await expect(page.locator('#note-open')).toBeFocused();
  await expect(page.locator('#transcript-list li.transcript-note')).toHaveCount(0);
  await page.keyboard.press('Alt+Shift+N');
  await page.locator('#note-keep').check();
  await page.locator('#note-text').fill('First');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#note-status')).toContainText('Form kept open.');
  await expect(page.locator('#note-text')).toBeFocused();
  await expect(page.locator('#note-text')).toHaveValue('');
  await expect(page.locator('#transcript-list li.transcript-note')).toHaveCount(1);
});

test('Screenshot with note captures at once, shows a removable thumbnail and saves it with the note', async ({ page }) => {
  await startRecording(page);
  await page.keyboard.press('Alt+Shift+S');
  await expect(page.locator('#note-text')).toBeFocused();
  await expect(page.locator('#note-status')).toHaveText(/Screenshot captured/);
  await expect(page.getByRole('img', { name: /Screenshot 1 of the shared screen, captured at/ })).toBeVisible();
  await page.getByRole('button', { name: 'Remove screenshot 1' }).click();
  await expect(page.locator('#note-thumbs li')).toHaveCount(0);
  await expect(page.locator('#note-text')).toBeFocused();
  await page.keyboard.press('Alt+Shift+S');
  await expect(page.locator('#note-thumbs li')).toHaveCount(1);
  await page.locator('#note-text').fill('Budget slide');
  await page.locator('#note-add').click();
  await expect(page.locator('#note-status')).toContainText('with 1 screenshot.');
  await expect(page.locator('#transcript-list li.transcript-note img')).toHaveCount(1);
  const text = await exportAs(page, 'txt');
  expect(text).toMatch(/^\[\d\d:\d\d\] Note: Budget slide$/m);
  expect(text).toMatch(/^\[\d\d:\d\d\] Screenshot 1 of 1 attached to note$/m);
});

test('notes appear in every export format', async ({ page }) => {
  await startRecording(page, { share: false });
  await page.keyboard.press('Alt+Shift+N');
  await page.locator('#note-text').fill('Action for Sam');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#transcript-list li.transcript-note')).toHaveCount(1);
  expect(await exportAs(page, 'txt')).toMatch(/^\[\d\d:\d\d\] Note: Action for Sam$/m);
  expect(await exportAs(page, 'markdown')).toMatch(/^\[\d\d:\d\d\] Note: Action for Sam$/m);
  expect(await exportAs(page, 'srt')).toContain('[Note] Action for Sam');
  expect(await exportAs(page, 'vtt')).toContain('[Note] Action for Sam');
  expect(JSON.parse(await exportAs(page, 'json')).segments.some((s) => s.source === 'note' && s.text === 'Action for Sam')).toBe(true);
});

test('with no screen shared the screenshot button explains why and says so when activated', async ({ page }) => {
  await startRecording(page, { share: false });
  const shot = page.locator('#note-screenshot');
  await expect(shot).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#note-screenshot-why')).toContainText('no screen is being shared');
  await expect(shot).toHaveAccessibleDescription(/no screen is being shared/);
  await page.keyboard.press('Alt+Shift+S');
  await expect(page.locator('#note-status')).toContainText('unavailable because no screen is being shared');
  await expect(page.locator('#note-form')).toBeHidden();
});

test('shortcuts work from Settings and bring back the transcript', async ({ page }) => {
  await startRecording(page);
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Capture Settings' }).click();
  await expect(page.locator('#note-area')).toBeHidden();
  await page.keyboard.press('Alt+Shift+N');
  await expect(page.locator('#note-text')).toBeFocused();
  await expect(page.locator('#note-text')).toBeVisible();
});

test('no axe violations with the note form open and a screenshot attached', async ({ page }) => {
  await startRecording(page);
  await page.keyboard.press('Alt+Shift+S');
  await expect(page.locator('#note-thumbs li')).toHaveCount(1);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`)).toEqual([]);
});
