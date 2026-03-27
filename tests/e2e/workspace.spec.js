const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const API_BASE = String(process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:5100').replace(/\/+$/, '');
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'abb.csv');

async function resetBackend(request) {
  const response = await request.post(`${API_BASE}/__e2e__/reset`);
  expect(response.ok()).toBeTruthy();
}

async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  return verifyResponse;
}

async function uploadFixture(page) {
  await page.getByTestId('workspace-file-input').setInputFiles(CSV_FIXTURE);
  await expect(page.getByTestId('workspace-log')).toContainText('File selected: abb.csv');
  await expect(page.getByTestId('workspace-log')).toContainText('Parsing success: 4 rows / 2 cols');
  await expect(page.getByTestId('workspace-log')).toContainText('Dataset loaded (file): 4 rows, 2 cols.');
  await expect(page.getByTestId('workspace-row-count')).toContainText('Rows 4');
  await expect(page.getByTestId('workspace-col-count')).toContainText('Cols 2');
}

async function expectGridVisible(page) {
  await page.getByTestId('workspace-grid').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('workspace-preview')).toBeVisible();
  await expect(page.getByTestId('preview-table')).toContainText('alpha');
  await expect(page.getByTestId('preview-table')).toContainText('delta');
  await expect(page.locator('[data-testid="workspace-grid"] .ag-header-cell-text')).toContainText(['name', 'value']);
  await expect(page.locator('[data-testid="workspace-grid"] .ag-center-cols-container')).toContainText('alpha');
  await expect(page.locator('[data-testid="workspace-grid"] .ag-center-cols-container')).toContainText('10');
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run Playwright E2E tests.');
  }
});

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

test('scenario 1: key entry verifies and enters workspace', async ({ page }) => {
  const response = await enterWorkspace(page);
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data Workspace' })).toBeVisible();
});

test('scenario 2: csv upload shows logs, preview, and data grid', async ({ page }) => {
  await enterWorkspace(page);
  await uploadFixture(page);
  await expectGridVisible(page);
});

test('scenario 3: refresh restores workspace draft', async ({ page }) => {
  await enterWorkspace(page);
  await uploadFixture(page);
  await page.reload();
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  await expect(page.getByTestId('workspace-log')).toContainText('Workspace restored: 1 tab(s).');
  await expect(page.getByTestId('workspace-row-count')).toContainText('Rows 4');
  await expect(page.getByTestId('workspace-col-count')).toContainText('Cols 2');
  await expectGridVisible(page);
});

test('scenario 4: duplicate access is blocked for another browser context', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    const firstResponse = await enterWorkspace(firstPage);
    expect((await firstResponse).status()).toBe(200);
    await expect(firstPage.getByTestId('workspace-shell')).toBeVisible();

    await secondPage.goto('/key');
    await secondPage.getByTestId('api-key-input').fill(API_KEY);
    const blockedResponse = secondPage.waitForResponse((response) => response.url().includes('/auth/verify'));
    await secondPage.getByTestId('api-key-submit').click();
    expect((await blockedResponse).status()).toBe(409);
    await expect(secondPage.getByTestId('api-key-error')).toContainText('already being used by another client');
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('scenario 5: workspace log updates, save is enabled, and recent datasets render', async ({ page }) => {
  await enterWorkspace(page);
  await uploadFixture(page);

  const saveButton = page.getByTestId('save-current-dataset');
  await expect(saveButton).toBeEnabled();
  await expect(page.getByTestId('workspace-log')).not.toContainText('No actions yet.');
  await expect(page.getByTestId('recent-datasets')).toBeVisible();

  await saveButton.click();
  await expect(page.getByTestId('workspace-log')).toContainText('Save requested: abb.csv');
  await expect(page.getByTestId('workspace-log')).toContainText('Saved to IndexedDB.');
  await expect(page.getByTestId('recent-datasets')).toContainText('abb.csv');
});
