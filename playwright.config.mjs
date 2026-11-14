import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the built app (dist/), served by vite preview.
// No model is ever downloaded: tests replace the transcriber worker with a stub.
const port = 4173;
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      permissions: ['microphone'],
      launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    },
  }],
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
