import { defineConfig, devices } from '@playwright/test';

// Runs against a production build: `npm run build`, a migrated database, then `npm run e2e`.
// PLAYWRIGHT_CHROMIUM_PATH lets environments with a preinstalled Chromium use it instead of downloading.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1400, height: 950 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 950 } } }],
  webServer: { command: 'npx next start -p 3100', url: 'http://localhost:3100/login', reuseExistingServer: true },
});
