# Jed review: pull request 33 (Playwright end-to-end and accessibility tests)

Verdict: pass, with two low findings that need not block merge.

## Checks that passed

- Trigger is pull_request only. No pull_request_target. No secrets used. Permissions are contents: read. Actions are SHA-pinned (checkout, setup-node, upload-artifact).
- playwright.config.mjs: no sandbox-disabling flags. Browser args are only the two fake-media flags. Server is vite preview on localhost, strict port. reuseExistingServer is off in CI.
- External requests: helpers.mjs aborts every non-localhost request in the context and fails the test if any occurred. Worker is stubbed, so no model download. The block is real, though it does not cover WebSocket or service worker traffic.
- Dependencies: four new dev packages (playwright, playwright-core, @playwright/test, @axe-core/playwright, axe-core), all from registry.npmjs.org, all with sha512 integrity, no install scripts. npm ci then npm audit: 0 vulnerabilities.
- Browser download comes from Playwright's own CDN via npx playwright install.
- Tests use synthetic data only (a sample Markdown string, fake microphone). No personal data or tokens in the code or PR text.
- npm test: 71 pass, 0 fail. npm run lint: clean.

## Findings

1. Low (A05 security misconfiguration, availability). .github/workflows/playwright.yml: the job has no timeout-minutes. A hung browser or server would run to the 6 hour default. Add timeout-minutes: 15.
2. Low (A09/A02 information exposure). playwright.yml upload step: test-results/ holds traces (trace: retain-on-failure in playwright.config.mjs line 12), which record page content and network. Today all content is synthetic, so no personal data. If real data is ever used in tests, this uploads it for 7 days. Retention is already short; add a comment warning against real data.
3. Info. ci.yml line 84 now also runs playwright install --with-deps because the config file exists. Extra time only, no security effect. ci.yml itself is not changed by this PR.
4. Info. Playwright install --with-deps uses sudo apt on the runner. Normal and acceptable on GitHub-hosted runners.

## Before merge

Nothing mandatory. Recommended: add timeout-minutes to the playwright job.

## Re-check at head 85d571b

Verdict: pass.

- timeout-minutes: 15 sits on the playwright job, at job level. Correct.
- index.html and src/main.js: the label is now a button with type="button", and a hidden file input with aria-label. The click handler is attached with addEventListener. No inline handler, no inline script, no injected markup. This is compatible with a strict Content Security Policy.
- Import handling itself (parsing, size caps, storage) is unchanged. Only the trigger changed.
- playwright.config.mjs comment states tests must use synthetic data. Test sample data is synthetic.
- The new commits contain no personal data or secrets.
- No blockers.
