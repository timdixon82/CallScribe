// Tiny probe: reports whether new Function works and which origin the document sees.
let evalOk; let evalError = '';
try { evalOk = new Function('return 1')() === 1; } catch (error) { evalOk = false; evalError = String(error.message || error); }
parent.postMessage({ type: 'probe-eval', evalOk, evalError, origin: self.origin, href: location.href }, '*');
