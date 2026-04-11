import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const harnessDir = process.env.PLAYWRIGHT_HARNESS_DIR;
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME !== 'false';

export default defineConfig({
  testDir: './playwright',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    channel: useSystemChrome ? 'chrome' : undefined,
  },
  outputDir: 'test-results',
  webServer: harnessDir
    ? {
        command: 'yarn start',
        cwd: harnessDir,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
});
