import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  // Image/video workers are CPU-heavy; avoid saturating the interactive dev machine.
  workers: process.env.CI ? 1 : 2,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1100 },
    browserName: (process.env.PLAYWRIGHT_BROWSER ?? 'chromium') as
      'chromium' | 'firefox' | 'webkit',
    channel:
      process.env.PLAYWRIGHT_BROWSER && process.env.PLAYWRIGHT_BROWSER !== 'chromium'
        ? undefined
        : process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PORT,
  },
});
