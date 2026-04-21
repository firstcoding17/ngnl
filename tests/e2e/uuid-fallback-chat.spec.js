const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'abb.csv');


async function disableRandomUuid(page) {
  await page.addInitScript(() => {
    try {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'randomUUID', {
          configurable: true,
          writable: true,
          value: undefined,
        });
      }
    } catch {
      if (globalThis.crypto) globalThis.crypto.randomUUID = undefined;
    }
  });
}

async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
}

async function createDashboard(page) {
  await page.goto('/dashboard/new?type=tabular');
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(CSV_FIXTURE);
  await expect(page.getByText('abb / 2 cols / 4 rows')).toBeVisible();
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run UUID fallback chat tests.');
  }
});


test('chat panel still works when randomUUID is unavailable', async ({ page }) => {
  await disableRandomUuid(page);
  await enterWorkspace(page);
  await createDashboard(page);

  await page.locator('.detail-toggle').click();
  await page.locator('.right-panel.open').getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.locator('.mcp-shell').getByText('Dashboard Chat Assistant', { exact: true })).toBeVisible();
  await expect(page.getByText('Dataset context is attached.')).toBeVisible();

  const chatResponse = page.waitForResponse((response) => response.url().includes('/mcp/chat'));
  await page.getByPlaceholder('Ask how to analyze this dataset, what looks suspicious, or what to chart next.').fill('Summarize this dataset');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await chatResponse).status()).toBe(200);
  await expect(page.getByText('Assistant').last()).toBeVisible();
  await expect(page.locator('.message-card, .message-suggestion').first()).toBeVisible();
});
