# Questions: full review follow-up

## Q-LCT1: Which fixes first?

- A. Data fixes first: cascade delete, atomic delete, import validation, with store tests (Tier 2). Recommended.
- B. Security hardening first: Content Security Policy, pinned model downloads.
- C. Test infrastructure first: Playwright suite and accessibility states.
- D. Report only, no fixes yet.

## Q-LCT2: Content Security Policy and model pinning

- A. Dispatch Jacob to design the policy and download pinning, then Sean builds. Recommended.
- B. Skip for now.

## Q-LCT3: Print export is probably broken (Jed M4)

- A. Fix in the first batch. Recommended.
- B. Leave for later.

## Q-LCT4: Diarizer model source

- A. Pin by commit now, fork later. Recommended.
- B. Fork now.

## Q-LCT5: ONNX Runtime wasm

- A. Serve locally. Recommended.
- B. Keep jsDelivr and disclose it.

## Q-LCT6: Header proxy for the custom domain

- A. Not yet, ship the meta tag. Recommended.
- B. Use a proxy for real security headers.

## Q-LCT7: Allow unsafe-eval in the policy

- A. Only if a test shows WebLLM needs it. Recommended.
- B. Never.

## Q-LCT14: OCR is blocked by the policy

- A. Accept the limit and hide the OCR switch.
- B. Run OCR in a sandboxed frame with its own policy and no network. Jacob designs first. Recommended.
- C. Patch or replace the OpenCV usage.
- D. Allow unsafe-eval for the whole page (weakest).
