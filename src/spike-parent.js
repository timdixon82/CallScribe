// SPIKE ONLY. Parent side of the sandboxed OCR frame prototype. Driven by tests/Playwright through window.spike.
const bytes = async (path) => (await fetch(path)).arrayBuffer();
let iframe; let port; let counter = 0; const pending = new Map(); let readyInfo;

if (new URLSearchParams(location.search).has('sw') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URLSearchParams(location.search).get('sw') || 'sw.js').then(() => document.getElementById('status').dataset.sw = 'registered');
}

window.spike = {
  async openFrame({ url = 'ocr-frame.html', sandbox = 'allow-scripts', withAssets = true } = {}) {
    iframe = document.createElement('iframe');
    if (sandbox) iframe.setAttribute('sandbox', sandbox);
    iframe.title = 'OCR frame';
    iframe.hidden = true;
    const hello = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hello within 8s')), 8000);
      window.addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow || event.data?.type !== 'hello') return;
        clearTimeout(timer); resolve({ origin: event.origin });
      });
    });
    iframe.src = url;
    document.body.append(iframe);
    const info = await hello;
    const channel = new MessageChannel();
    port = channel.port1;
    readyInfo = new Promise((resolve) => { port.onmessage = (e) => {
      if (e.data.type === 'ready' || e.data.type === 'init-error') resolve(e.data);
      else if (pending.has(e.data.id)) { pending.get(e.data.id)(e.data); pending.delete(e.data.id); }
    }; });
    const assets = withAssets ? {
      det: await bytes('models/ch_PP-OCRv4_det_infer.onnx'), rec: await bytes('models/ch_PP-OCRv4_rec_infer.onnx'),
      dict: await bytes('models/ppocr_keys_v1.txt'), wasm: await bytes('ort/ort-wasm-simd-threaded.jsep.wasm'),
    } : { det: new ArrayBuffer(0), rec: new ArrayBuffer(0), dict: new ArrayBuffer(0), wasm: new ArrayBuffer(0) };
    iframe.contentWindow.postMessage({ type: 'init', v: 1, assets }, '*', [channel.port2, ...Object.values(assets)]);
    return info;
  },
  ready: () => readyInfo,
  call(msg) { const id = ++counter; return new Promise((resolve) => { pending.set(id, resolve); port.postMessage({ id, msg }); }); },
  async recognise(phrase) {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 160;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 640, 160);
    c.fillStyle = '#000'; c.font = 'bold 56px Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText(phrase, 24, 80);
    const img = c.getImageData(0, 0, 640, 160);
    return this.call({ type: 'recognise', width: 640, height: 160, pixels: img.data.buffer });
  },
  // Frame without its own policy, and a srcdoc frame: do they get eval under the parent's strict policy?
  async probeFrame(url, { srcdoc = false } = {}) {
    if (srcdoc) { const html = await (await fetch(url)).text(); url = new URL(html.match(/src="([^"]+\.js)"/)[1], new URL(url, location.href)).href; }
    return new Promise((resolve) => {
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.hidden = true;
      const timer = setTimeout(() => resolve({ timeout: true }), 5000);
      window.addEventListener('message', function once(e) { if (e.source === f.contentWindow && e.data?.type === 'probe-eval') { clearTimeout(timer); window.removeEventListener('message', once); resolve(e.data); } });
      if (srcdoc) f.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval'"><script type="module" src="${new URL(url, location.href).href}"></script>`;
      else f.src = url;
      document.body.append(f);
    });
  },
  async seedDb() { await new Promise((res, rej) => { const r = indexedDB.open('spike-db'); r.onupgradeneeded = () => r.result.createObjectStore('secret'); r.onsuccess = () => res(r.result.close()); r.onerror = () => rej(r.error); }); localStorage.setItem('spike-key', 'secret'); await (await caches.open('spike-cache')).put('/x', new Response('x')); document.cookie = 'spike=1'; },
  printFrame() { const f = document.createElement('iframe'); f.hidden = true; document.body.append(f); f.srcdoc = '<!doctype html><title>p</title><p>print test</p>'; return new Promise((r) => f.addEventListener('load', () => r(f.contentDocument?.body?.textContent || 'loaded-no-access'))); },
};
