import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/dashboard.spec.mjs',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true, launchOptions: { executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' }, viewport: { width: 1440, height: 900 } },
  reporter: 'list'
});
