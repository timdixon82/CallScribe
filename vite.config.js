import { defineConfig } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

// Stamps the service worker cache name with the build time so a changed page never needs a manual version bump.
const stampServiceWorker = () => ({
  name: 'stamp-service-worker',
  apply: 'build',
  async closeBundle() {
    const file = new URL('./dist/sw.js', import.meta.url);
    await writeFile(file, (await readFile(file, 'utf8')).replace('__BUILD_ID__', Date.now().toString(36)));
  },
});

// A relative base lets the static build work from this GitHub Pages project path
// and from any other static host subdirectory.
export default defineConfig({ base: './', plugins: [stampServiceWorker()] });
