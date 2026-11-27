# Carol test report: pull request 40, app-specific cache names

Commit tested: bad4dea on fix/app-specific-cache-names (detached worktree, now removed). Tier 2.

## Verdict

Pass, with one test-suite flake and one process gap noted. Nothing blocks the merge gate.

## Automated results

- Lint (`npm run lint`): clean.
- Unit tests (`npm test`): 180 tests, 178 pass, 0 fail, 2 skipped.
- Playwright (`npm run test:e2e`): 37 pass, 1 skipped, 1 fail. The failure is the OCR test "a job that never finishes cannot freeze the page" (page timer ticks 9, expected at least 12). It is timing-sensitive under full-suite load. Rerun alone with the accessibility and erase-all specs: 17 of 17 pass. The branch changes no OCR file.
- axe-core AAA specs (`accessibility.spec.mjs`, WCAG 2.2 A, AA and AAA tags): pass, including the delete dialog and the erase-all dialog checks.

## Browser exercise (Chromium, built app, hugging face requests faked with cors responses)

1. Seeded old caches: `transformers-cache` with a pinned whisper-tiny file, a foreign file and a near-miss `whisper-tiny-foo` file; `webllm/model` with a pinned Qwen3 0.6B file and a foreign file. Cleared the migration flag and loaded the app.
   - Result: the pinned entries moved to `callscribe-transformers-v1` and `callscribe-webllm-model-v1` and left the old caches. The foreign and near-miss entries stayed under the old names. Flag set to 1.
2. Single-model removal (Whisper Base, legacy and new copies seeded): both copies removed. Whisper Tiny legacy copy, near-miss and foreign entries untouched.
3. Delete all my data: pinned legacy entry removed, `callscribe-` caches removed, flag cleared. Foreign legacy entries, the legacy caches themselves and an unrelated `other-site-cache` survived. Status text: "All your data was deleted. Reload the page to start fresh. Exported files are not affected."
4. Privacy page (`public/docs/privacy.html`): reads correctly. New storage paragraph and "web address" wording match design.md. One H1, H2s in order. axe-core with AAA tags: zero violations in default, light and dark colour schemes.

## Not tested

- A real WebLLM or Transformers.js model download (needs WebGPU and large files). The WebLLM wrapper, fail-closed check and bundle pin are covered by unit tests only. The manual check in the design (download the 0.6B model, confirm only `callscribe-` names) is still open for Sean or Tim.

## Gap noted

`docs/patterns/accessibility-regression-suite.md` does not exist. `.claude/agents/sean.md` refers to it. The folder holds only `dependency-graph-enabled.md`. Not caused by this pull request.

<!-- TASK -->
- [ ] Create docs/patterns/accessibility-regression-suite.md or remove the reference in .claude/agents/sean.md `priority:low` `owner:sean` `from:carol-pr40`
- [ ] Stabilise the OCR "never finishes" timer test (fails under full-suite load, passes alone) `priority:low` `owner:sean` `from:carol-pr40`
<!-- /TASK -->
