# App-specific cache names (erase-all shared-cache risk)

Status: active
Tier: 2 (stored user data, erase behaviour, privacy)
Mockup mode: not applicable (no interface change)

## Summary

`src/cache-names.js` treats `transformers-cache`, `webllm/model`, `webllm/wasm` and `webllm/config` as this app's caches, and `eraseAllData` deletes them by exact name. These are the libraries' default names. A sibling site on the same origin using Transformers.js or WebLLM would share them: erase-all would wipe its models, and this app could read its files. Found by Sean in pull request 39 work.

## Questions for design

Can the libraries be configured to use app-specific cache names (for example a `callscribe-` prefix)? What happens to models already cached under the old names (re-download, migrate, or leave alone)? Can erase-all still guarantee removal of everything this app stored, including old-name entries it cannot prove are its own? What does the privacy page promise, and does it need to change?

## Out of scope

Splitting `src/main.js`, host allow-list changes, pull request 37.

## Risk and rollback

Risk: users re-download large models once; erase-all might miss old-name data. Rollback: revert the pull request; cached data under either name is harmless.

## Definition of done

Jacob's design and Jed's governance review agreed by Tim, then Sean builds with tests, Carol and Jed pass, Jacob confirms conformance, and Tim approves the merge.
