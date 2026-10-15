import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  // Image/video workers are CPU-heavy; avoid saturating the interactive dev machine.
  workers: process.env.CI ? 1 : 2,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1100 },
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
