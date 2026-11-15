# Jed security review: PR 35 (head c8b93f5)

Verdict: pass, with one medium advisory (not blocking).

Checks run: npm test 92 pass, lint clean, build ok. Built dist/sw.js has the stamped cache name and no placeholder left. CSP is byte-identical on index.html and the five docs pages (6 of 6). No font or manifest use found in index.html, src or CSS, so removing font-src and manifest-src loses nothing; default-src none still blocks both. PR text holds no personal data.

## Service worker (public/sw.js, vite.config.js)
- Scope: same-origin GET only (line 7). Cross-origin model files and Hugging Face requests are never intercepted or cached. Opaque responses cannot occur for same-origin requests, and only response.ok is stored.
- Navigations are network-first, so a changed page and CSP reach returning users. Offline falls back to the cached page, then the shell. If neither exists the request fails normally.
- Old caches: activate deletes only callscribe-shell- caches other than the current one. Model caches (Transformers.js, WebLLM) use other names and are untouched.
- Plugin: replaces one placeholder in dist/sw.js after build; a missing file fails the build loudly. Not applied in dev, and main.js unregisters workers in dev.
- Low: non-navigation assets are cache-first. Vite assets are content-hashed, so stale risk is limited to unhashed public files (print.css, audio-worklet.js, ort); these refresh on each new build because the cache name changes. Cache poisoning needs same-origin control, which is out of scope.
- Low: a 206 partial response would pass response.ok and cache.put would reject it, leaving an unhandled rejection in the worker. Harmless. Optional: add a catch in keep (sw.js line 3).

## Transcriber loading
src/transcriber-load.js adds no host, no eval, no new network call. The model repo and revision still come from the model manifest passed in. The fallback only switches device and dtype (wasm q8) with the same pinned revision. Device is now strictly webgpu or wasm, which is tighter than before.

## Import image measure (src/call-markdown-import.js lines 63-68, 87)
- Medium advisory (A04 insecure design, denial of service, self-inflicted): createImageBitmap fully decodes. A small PNG can declare a huge size (for example 30000 by 30000 pixels is about 3.6 GB decoded), which may stall or crash the tab. The 50 MB file limit and 200 screenshot cap do not bound decoded size. Decodes are sequential and each bitmap is closed, so memory does not accumulate, but 200 large decodes can still take a long time. Failure is caught and returns zeros, so a browser that refuses is handled. No quadratic path added. Only the user's own chosen file is affected; nothing leaves the device.
- Suggested fix: read width and height from the PNG or JPEG header and skip the decode above a pixel cap (for example 100 million), or cap total measured pixels. Not tested with a live browser; assessed from code.

## Before merge
Nothing blocking. Optional follow-up for the decode cap.

## Re-check at head d8bf5a3 (Jed, second pass)

Verdict: pass.

- Truncated PNG, JPEG, WebP VP8, VP8L and VP8X headers at every length: no throws, null returned.
- Extreme sizes (PNG 0 and 4294967295, VP8X 16777216 squared, JPEG 65535 squared, VP8 and VP8L at maximum): zero sizes returned unread, or tooLarge set. Product overflow is harmless because it only grows past the cap. Boundary checked: 6324 squared decodes, 6325 squared is refused.
- The decode function was called 0 times for every oversize, zero-dimension, truncated, bad-signature, GIF and empty input. It was called once for each valid small PNG, JPEG (baseline and progressive), VP8, VP8L and VP8X.
- MIME type is ignored; bytes decide. A lying MIME type cannot bypass the cap.
- JPEG floods of 50 MB (all FF, FF01 pairs, zero-length segments, length-2 and length-3 segments, late SOF): 9 to 17 ms each through measureImage (header read is capped at 1 MB); direct parser on 50 MB: 94 ms. Loop terminates and is linear.
- Minor, not blocking: a JPEG whose SOF lies beyond the first 1 MB is treated as unknown (fails closed, size recorded as zero).
- sw.js: errors from cache.put are caught, only status 200 is cached, navigation is network first with cache fallback. Safe. Build stamps dist/sw.js (cache name callscribe-shell-mwh1zn4b), and throws if the placeholder is missing.
- npm test: 96 of 96 pass. npm run lint: clean.
