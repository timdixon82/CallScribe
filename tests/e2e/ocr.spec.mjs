import { test, expect } from './helpers.mjs';

// N1: run the real OCR path in the built app under the real page policy (no unsafe-eval).
// The OCR assets are the local copies in dist/models, so nothing leaves localhost.
// Synthetic data only: the picture is drawn in the page and holds a fixed made-up phrase.
const PHRASE = 'HELLO WORLD 2026';

// BLOCKED (N1): this fails today. The OCR library pulls in OpenCV.js, whose embind glue calls new Function, and the page
// policy has no unsafe-eval. Left as fixme until Tim decides how to resolve it. The same page reads the text correctly
// when the policy tag is removed, so the policy is the only cause. Do not fix this by adding unsafe-eval.
test.fixme('OCR enables and reads known text under the page policy', async ({ page }) => {
  test.setTimeout(150000);
  const violations = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP-VIOLATION ${event.violatedDirective} ${event.blockedURI}`));
  });
  page.on('console', (message) => { if (/CSP-VIOLATION|Content Security Policy|unsafe-eval/i.test(message.text())) violations.push(message.text()); });
  page.on('pageerror', (error) => { if (/Content Security Policy|unsafe-eval/i.test(error.message)) violations.push(error.message); });

  await page.goto('/index.html');
  await expect(page.locator('#start-session')).toBeVisible();
  // The OCR switch is only offered once screen capture is in use; reveal it directly to exercise the real enable path.
  await page.evaluate(() => {
    const toggle = document.getElementById('toggle-ocr');
    toggle.disabled = false;
    toggle.closest('label').hidden = false;
  });
  await page.locator('#toggle-ocr').evaluate((el) => el.click());
  await expect(page.locator('#ocr-status')).toContainText(/Local OCR is ready/, { timeout: 120000 });

  const text = await page.evaluate(async (phrase) => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\/assets\/ocr-[^/]*\.js$/.test(name));
    const { recogniseImage } = await import(url);
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 160;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, 640, 160);
    context.fillStyle = '#000'; context.font = 'bold 56px Arial, sans-serif'; context.textBaseline = 'middle';
    context.fillText(phrase, 24, 80);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return recogniseImage(blob);
  }, PHRASE);
  expect(text.replace(/\s+/g, ' ').toUpperCase()).toContain('HELLO WORLD');
  expect(violations).toEqual([]);
});
