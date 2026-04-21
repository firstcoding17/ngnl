const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const PROFILES_FIXTURE = path.resolve(__dirname, 'fixtures', 'profiles.csv');
const FEEDBACK_FIXTURE = path.resolve(__dirname, 'fixtures', 'feedback_join.csv');


async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run Playwright E2E tests.');
  }
});


test('multidataset wizard creates a linked prepared dataset and stat panel reads it', async ({ page }) => {
  await enterWorkspace(page);
  await page.goto('/dashboard/new?type=multimodal');

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(PROFILES_FIXTURE);
  await expect(page.getByText('profiles / 3 cols / 4 rows')).toBeVisible();

  await page.getByTestId('dashboard-create-linked-file').setInputFiles(FEEDBACK_FIXTURE);
  await expect(page.locator('.linked-card').filter({ hasText: 'feedback_join' }).first()).toContainText('3 cols / 4 rows');

  await page.getByLabel('Primary key').selectOption('customer_id');
  await page.getByLabel('Linked key').selectOption('customer_id');

  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\//);
  await expect(page.getByText('Cross-dataset prepared source')).toBeVisible();
  await expect(page.getByText('joined 1/1 datasets')).toBeVisible();

  await page.getByRole('button', { name: 'Stat' }).click();
  const statResponse = page.waitForResponse((response) => response.url().includes('/stat/run'));
  await page.getByRole('button', { name: 'Generate Report' }).click();
  expect((await statResponse).status()).toBe(200);
  await expect(page.locator('text=rows 4 / cols 10')).toBeVisible();
});
