(() => {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  const tryEval = () => { try { return `ok ${new Function('return 6*7')()}`; } catch (e) { return `blocked ${String(e.message).slice(0, 120)}`; } };
  if (self.origin !== 'null' || parent === window) return;
  addEventListener('message', async (event) => {
    if (event.source !== parent || event.data?.type !== 'init') return;
    const port = event.ports[0];
    try {
      const mod = await import(URL.createObjectURL(new Blob([event.data.core], { type: 'text/javascript' })));
      await mod.start(event.data, port, URL.createObjectURL(new Blob([event.data.glue], { type: 'text/javascript' })));
    } catch (err) { port.postMessage({ type: 'init-error', error: `bootstrap ${err.name}: ${String(err.message).slice(0, 200)}`, violations }); }
  });
  setTimeout(() => parent.postMessage({ type: 'hello', v: 1, eval: tryEval(), violations }, '*'), 50);
})();
