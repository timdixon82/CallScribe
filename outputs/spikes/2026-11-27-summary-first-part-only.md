# Spike: why the summary only covers the first part of the conversation

Date: 2026-11-27. Read-only investigation. No source files changed.

## Answer

The cause is a first-N cap applied in time order. It is hypotheses 1 and 2 together. Confidence: high (about 90 percent). I reproduced it with the real `chunkEvidence` and `consolidateExtractions` functions.

## How it happens

1. The whole transcript is gathered correctly. `startMinutesGeneration` in `src/main.js` (line 102) passes every spoken segment, sorted by start time. Nothing is truncated or filtered by time, so hypothesis 3 is false.
2. `chunkEvidence` splits it into parts of 450 words (300 for the 4B model in `src/minutes.worker.v2.js` line 20). A 1 hour call is often 30 to 40 parts.
3. Each part yields up to 3 topics. All parts are processed in order, with no skipping, so hypotheses 4 and 6 are not the cause.
4. `consolidateExtractions` (`src/minutes.js` line 134) joins all topics in time order and then keeps only the first N: `.slice(0, limits.discussion)`. Limits (line 128) are 6 concise, 12 standard, 24 detailed. The same pattern caps decisions, actions, questions and risks (lines 135 to 137). Every topic from later parts is thrown away.
5. The headline summary is worse. `summary()` in `src/minutes.worker.v2.js` line 18 and `src/minutes.webllm.worker.js` line 13 uses `discussion.slice(0, 3)`. That is only the first 3 topics, which come from the first part (roughly the first 450 words).
6. In the WebLLM worker, the 0.6B model with Standard detail is downgraded to concise (line 102), so the cap is 6 topics. That is the first 2 parts only.

## Reproduction

Synthetic transcript: 600 entries, 38 parts, 3 distinct topics per part. Result of `consolidateExtractions`:

- Concise: 6 topics, last from part 2 of 38.
- Standard: 12 topics, last from part 4 of 38.
- Detailed: 24 topics, last from part 8 of 38.

So a long call is summarised from its first 5 to 20 percent. The script is in the session scratchpad, not in the repo.

## Hypotheses ruled out or minor

- 3: false, see step 1.
- 4: `conservativeRecovery` only runs for a part with no usable output, and its output is subject to the same cap. It also takes `rows.slice(0, 3)`, so it adds early-bias inside a part only.
- 5: contributes. The 0.6B path asks for at most 3 bullets per part, `max_tokens` 700, and `plainDiscussion` drops lines under 20 characters. Thin per-part output, but the cap is the main loss. The `max_tokens` 120 is only the 4B topic selector. Its fallback `slice(0, maximum)` (line 67) is also first-N.
- 6: resume only skips parts already done, and is keyed on a fingerprint of the evidence. Not a cause.
- 7: live notes do not enter the evidence. `prepareMinutesEvidence` only uses speech segments and screenshots. Not a cause.

## Recommended fix

Size: small, about 30 lines plus tests, Tier 1.

1. Replace first-N with even coverage across time. In `consolidateExtractions`, after de-duplication, if there are more items than the limit, choose items evenly spread by chunk index. Simple version: tag each item with its chunk index and take round-robin by chunk, then re-sort chronologically.
2. Make `summary()` draw from the whole selected set: one top topic per time third (start, middle, end), not `slice(0, 3)`. Move it to a shared function in `src/minutes.js` so both workers use it.
3. Add a unit test in `tests/minutes.test.mjs` using a long synthetic transcript: assert the last topic comes from the final third of the parts.
4. Optional, later: raise the 0.6B per-part output or add a final merge pass. Not needed to fix the reported symptom.

Note: line 162 of `src/main.js` selects the WebLLM worker for any model with a `webllmModel`, which is both models. Worth confirming which worker Tim's run used. Both have the same cap.
