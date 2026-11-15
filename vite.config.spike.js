import { defineConfig } from 'vite';
import base from './vite.config.js';
const resolved = base;
export default defineConfig({
  ...resolved,
  preview: { cors: true },
  build: { rollupOptions: { input: { main: 'index.html', ocrFrame: 'ocr-frame.html', spikeParent: 'spike-parent.html', noPolicy: 'ocr-frame-nopolicy.html' } } },
});
