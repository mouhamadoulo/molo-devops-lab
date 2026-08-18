import { defineConfig, devices } from '@playwright/test';

// Set PLAYWRIGHT_BASE_URL to run e2e tests beside another application using port 4200.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4200';
const serverURL = new URL(baseURL);

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm start -- --host ${serverURL.hostname} --port ${serverURL.port || '4200'}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI
  }
});
