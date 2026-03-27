const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const frontendPort = Number(process.env.PLAYWRIGHT_FRONTEND_PORT || 4173);
const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT || 5100);
const frontendBaseUrl = String(process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${frontendPort}`).replace(/\/+$/, '');
const backendBaseUrl = String(process.env.PLAYWRIGHT_API_BASE || `http://127.0.0.1:${backendPort}`).replace(/\/+$/, '');
const skipWebServer = ['1', 'true', 'yes', 'on'].includes(String(process.env.PLAYWRIGHT_SKIP_WEBSERVER || '').trim().toLowerCase());

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }],
  ],
  use: {
    baseURL: frontendBaseUrl,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: 'npm run start:e2e',
          cwd: path.resolve(__dirname, '..', 'swwseos_server'),
          url: `${backendBaseUrl}/healthz`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            E2E_TEST_MODE: '1',
            PORT: String(backendPort),
          },
        },
        {
          command: 'npm run serve:e2e',
          cwd: __dirname,
          url: frontendBaseUrl,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            HOST: '127.0.0.1',
            PORT: String(frontendPort),
            DISABLE_ESLINT_PLUGIN: 'true',
            VUE_APP_API_BASE: backendBaseUrl,
          },
        },
      ],
});
