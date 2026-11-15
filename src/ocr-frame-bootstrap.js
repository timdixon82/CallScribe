// The one inline script of the text recognition frame page. The service worker builds that page from this file
// (scripts/ocr-frame-page.mjs) and the page policy carries this script's SHA-256, so it must stay plain script code.
// It runs only in a sandboxed frame with an opaque origin. Anywhere else it does nothing at all.
// Tokens between double underscores are replaced at build time. Do not write a closing script tag in this file.
(() => {
  'use strict';
  const PROTOCOL_VERSION = __PROTOCOL_VERSION__;
  const BOOTSTRAP_VERSION = __BOOTSTRAP_VERSION__;
  const throws = (read) => { try { read(); return false; } catch { return true; } };
  // Three independent probes: an opaque origin, a parent window, and storage that the sandbox denies.
  if (self.origin !== 'null' || window.parent === window) return;
  if (!throws(() => localStorage.getItem('probe')) || !throws(() => document.cookie)) return;

  let used = false; // the first init message from the parent is the only one ever considered
  addEventListener('message', async (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || typeof data !== 'object' || data.type !== 'init' || used) return;
    used = true;
    const port = event.ports.length === 1 ? event.ports[0] : null;
    const fail = (message) => { try { port?.postMessage({ type: 'error', v: PROTOCOL_VERSION, id: 0, code: 'engine', message }); } catch { /* the page will time out */ } };
    const keys = Object.keys(data).sort().join();
    const buffers = ['core', 'glue', 'wasm', 'det', 'rec', 'dict'];
    if (!port || data.v !== PROTOCOL_VERSION || keys !== ['type', 'v', ...buffers].sort().join() || !buffers.every((name) => data[name] instanceof ArrayBuffer)) return fail('The text recognition frame received an invalid start message.');
    try {
      const module = await import(URL.createObjectURL(new Blob([data.core], { type: 'text/javascript' })));
      await module.start(port, { wasm: data.wasm, det: data.det, rec: data.rec, dict: data.dict }, URL.createObjectURL(new Blob([data.glue], { type: 'text/javascript' })));
    } catch (error) { fail('Text recognition could not start.'); }
  });
  // An opaque origin cannot be named as a target, and the hello holds only two version numbers.
  // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
  window.parent.postMessage({ type: 'hello', v: PROTOCOL_VERSION, bootstrap: BOOTSTRAP_VERSION }, '*');
})();
