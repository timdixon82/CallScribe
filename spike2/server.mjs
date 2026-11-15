// SPIKE ONLY. Static server, no CORS headers, no caching, so only the service worker or Cache Storage can supply files offline.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const dir = process.argv[2]; const port = Number(process.argv[3]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.txt': 'text/plain' };
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try { const body = await readFile(join(dir, path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); }
  catch { res.writeHead(404); res.end('nf'); }
}).listen(port, '127.0.0.1');
