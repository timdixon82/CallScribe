// SPIKE ONLY (T-O0b). Parent page: holds assets in Cache Storage, builds or loads the frame, supplies everything over a port.
const ASSETS = { core: 'frame-core.js', glue: 'ort/ort-wasm-simd-threaded.jsep.mjs', det: 'models/ch_PP-OCRv4_det_infer.onnx', rec: 'models/ch_PP-OCRv4_rec_infer.onnx', dict: 'models/ppocr_keys_v1.txt', wasm: 'ort/ort-wasm-simd-threaded.jsep.wasm', page: 'frame2.html' };
let iframe; let port; let counter = 0; const pending = new Map(); let readyInfo;
const status = document.getElementById('status');

navigator.serviceWorker?.register('sw2.js').then(() => { status.dataset.sw = 'registered'; });

window.p2 = {
  // Online step: copy OCR assets into the parent's own Cache Storage, as the app's enableOcr does.
  async enable() {
    const cache = await caches.open('ocr-assets');
    for (const path of Object.values(ASSETS)) await cache.put(path, await fetch(path));
    return Object.keys(ASSETS).length;
  },
  async openFrame({ mode = 'blob', sandbox = 'allow-scripts', url = 'frame2.html' } = {}) {
    const cache = await caches.open('ocr-assets');
    const get = async (key) => (await cache.match(ASSETS[key])).arrayBuffer();
    iframe = document.createElement('iframe');
    if (sandbox) iframe.setAttribute('sandbox', sandbox);
    iframe.title = 'OCR frame'; iframe.hidden = true;
    const hello = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hello within 8s')), 8000);
      addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow || event.data?.type !== 'hello') return;
        clearTimeout(timer); resolve({ origin: event.origin, ...event.data });
      });
    });
    if (mode === 'blob') {
      const html = await (await cache.match(ASSETS.page)).text();
      iframe.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    } else if (mode === 'srcdoc') iframe.srcdoc = await (await cache.match(ASSETS.page)).text();
    else iframe.src = url; // mode 'url': the frame page comes from the network or the service worker
    document.body.append(iframe);
    const info = await hello;
    const channel = new MessageChannel();
    port = channel.port1;
    readyInfo = new Promise((resolve) => { port.onmessage = (e) => {
      if (e.data.type === 'ready' || e.data.type === 'init-error') resolve(e.data);
      else if (pending.has(e.data.id)) { pending.get(e.data.id)(e.data); pending.delete(e.data.id); }
    }; });
    const assets = { det: await get('det'), rec: await get('rec'), dict: await get('dict'), wasm: await get('wasm') };
    const core = new TextDecoder().decode(await get('core'));
    const glue = new TextDecoder().decode(await get('glue'));
    iframe.contentWindow.postMessage({ type: 'init', v: 1, core, glue, assets, base: location.href }, '*', [channel.port2, ...Object.values(assets)]);
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
  async seedDb() { await new Promise((res, rej) => { const r = indexedDB.open('spike-db'); r.onupgradeneeded = () => r.result.createObjectStore('secret'); r.onsuccess = () => res(r.result.close()); r.onerror = () => rej(r.error); }); localStorage.setItem('spike-key', 'secret'); await (await caches.open('spike-cache')).put('/x', new Response('x')); document.cookie = 'spike=1'; },
  async swSeen() { return (await (await caches.open('sw2-log')).match('log'))?.json() ?? []; },
};
