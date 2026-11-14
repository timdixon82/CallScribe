import { test, expect, importSample, openPriorSessions } from './helpers.mjs';

test('skip links are the first tab stops and move focus to their target', async ({ page }) => {
  await page.goto('/index.html');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Skip to capture controls');
  await page.keyboard.press('Tab');
  const second = page.locator(':focus');
  await expect(second).toHaveText('Skip to transcript');
  await page.keyboard.press('Enter');
  await expect(page.locator('#transcript-panel')).toBeFocused();
});

test('tab order reaches record then new transcript, and every tab stop shows a focus indicator', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#start-session')).toBeEnabled({ timeout: 15000 });
  const seen = []; const unstyled = [];
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement; if (el === document.body) return null;
      const cs = getComputedStyle(el);
      const styled = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
      return { name: (el.getAttribute('aria-label') || el.textContent || el.id).trim().slice(0, 40), styled };
    });
    if (!stop) break;
    seen.push(stop.name); if (!stop.styled) unstyled.push(stop.name);
    if (/^＋?New transcript/.test(stop.name)) break;
  }
  expect(unstyled, 'tab stops with no outline or shadow').toEqual([]);
  const idx = (re) => seen.findIndex((s) => re.test(s));
  expect(idx(/Record/), seen.join(' > ')).toBeGreaterThan(-1);
  expect(idx(/New transcript/), seen.join(' > ')).toBeGreaterThan(idx(/Record/));
});

test('delete dialog traps focus, Escape closes it and focus returns to the trigger', async ({ page }) => {
  await page.goto('/index.html');
  await openPriorSessions(page);
  await importSample(page);
  const trigger = page.locator('#saved-session-list tr', { hasText: 'E2E sample' }).getByRole('button', { name: 'Delete' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('#delete-dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    // A native modal dialog may hand focus to the browser chrome (activeElement becomes body); it must never reach the page behind.
    expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#delete-dialog')), 'focus does not reach the page behind the dialog').toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#saved-session-list tr')).toHaveCount(1);
});

test('keyboard shortcuts dialog can be closed with Escape', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => document.getElementById('keyboard-shortcuts-dialog').showModal());
  await page.keyboard.press('Escape');
  await expect(page.locator('#keyboard-shortcuts-dialog')).toBeHidden();
});

test('settings tabs work with arrow keys', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('tab', { name: 'Controls' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeFocused();
});
