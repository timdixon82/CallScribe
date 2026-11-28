# Test hardening batch (follow-ups from the 2026-11-14 full review)

Status: active
Tier: 1 (tests and test helpers only; no production behaviour change)
Mockup mode: not applicable

## Summary

Add missing automated tests found in the full review. Sean works on a new branch from main named `test/review-followups`.

## Tasks

1. Double-Space test: pressing Space twice quickly on the OCR switch while OCR starts up must not break state or focus.
2. Network-first service worker end-to-end test (the unit test is `tests/sw.test.mjs`; the e2e lives with the Playwright tests).
3. Lean `ALLOWED_HOSTS` policy test and docs policy test: see `scripts/check-pins.mjs`, `.claude/work/2026-11-14-full-review/hosts.md` and `design-csp-pinning.md`. Tests must fail if a host is added to the allow list or to the content security policy without being documented.
4. Investigate only (no code change): does erase-all clear the generic `transformers-cache` and `webllm/*` caches in a way a sibling site on the same origin could share? Report the finding in the pull request body.

## Out of scope

Changes to `src/` production code (if a test needs one, stop and report), splitting `src/main.js`, WebLLM generation, manual keyboard, Firefox and Safari checks, pull request 37.

## Risk and rollback

Test-only change. Rollback is reverting the pull request.

## Definition of done

`npm run lint` and `npm run test` pass, the Playwright suite passes locally, a pull request is open (not merged), and the handoff envelope lists each task as done, blocked or not feasible.
