const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'abb.csv');


async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  return verifyResponse;
}

async function uploadFixture(page) {
  await page.locator('nav a[href="/workspace"]').first().click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.getByTestId('workspace-file-input').setInputFiles(CSV_FIXTURE);
  await expect(page.getByTestId('workspace-log')).toContainText('File selected: abb.csv');
  await expect(page.getByTestId('workspace-log')).toContainText('Parsing success: 4 rows / 2 cols');
  await expect(page.getByTestId('workspace-log')).toContainText('Dataset loaded (file): 4 rows, 2 cols.');
  await expect(page.getByTestId('workspace-row-count')).toContainText('Rows 4');
  await expect(page.getByTestId('workspace-col-count')).toContainText('Cols 2');
  await expect(page.getByTestId('preview-table')).toContainText('alpha');
  await expect(page.locator('[data-testid="workspace-grid"] .ag-center-cols-container')).toContainText('alpha');
}

function trackDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error?.stack || error?.message || String(error));
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'request failed'}`
    );
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      const url = response.url();
      if (url.includes('/favicon.ico')) return;
      badResponses.push(`${response.status()} ${response.request().method()} ${url}`);
    }
  });

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    badResponses,
  };
}

async function expectNoCriticalBrowserIssues(diag) {
  expect(
    diag.consoleErrors.filter((entry) => entry && !entry.includes('favicon'))
  ).toEqual([]);
  expect(diag.pageErrors).toEqual([]);
  expect(
    diag.failedRequests.filter((entry) => !entry.includes('favicon') && !entry.includes('/auth/logout'))
  ).toEqual([]);
  expect(diag.badResponses.filter((entry) => !entry.includes('favicon'))).toEqual([]);
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run staging verification.');
  }
});


test('staging verification: routes, upload, grid, graph, stats, auth, diagnostics', async ({ page }) => {
  const diag = trackDiagnostics(page);

  const verifyResponse = await enterWorkspace(page);
  expect((await verifyResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.home-view')).toBeVisible();
  await expect(page.getByText('NGNL Studio')).toBeVisible();

  await page.goto('/legacy/file');
  await expect(page).toHaveURL(/\/legacy\/file$/);
  await expect(page.getByRole('heading', { name: 'File Management' })).toBeVisible();

  await page.goto('/legacy/graph');
  await expect(page).toHaveURL(/\/legacy\/graph$/);
  await expect(page.getByRole('heading', { name: 'Legacy Graph View' })).toBeVisible();

  await page.goto('/legacy/stat');
  await expect(page).toHaveURL(/\/legacy\/stat$/);
  await expect(page.getByRole('heading', { name: 'Legacy Statistics View' })).toBeVisible();
  await expect(page.locator('text=Stat:')).toBeVisible();

  await uploadFixture(page);

  await page.getByText('Use server aggregation').scrollIntoViewIfNeeded();
  await expect(page.locator('.js-plotly-plot').first()).toBeVisible();

  const serverAgg = page.getByLabel('Use server aggregation');
  const aggregateResponse = page.waitForResponse((response) => response.url().includes('/viz/aggregate'));
  await serverAgg.check();
  expect((await aggregateResponse).status()).toBe(200);
  await expect(page.locator('.js-plotly-plot').first()).toBeVisible();

  await page.getByRole('button', { name: 'Generate Report' }).scrollIntoViewIfNeeded();
  const statResponse = page.waitForResponse((response) => response.url().includes('/stat/run'));
  await page.getByRole('button', { name: 'Generate Report' }).click();
  expect((await statResponse).status()).toBe(200);
  await expect(page.locator('text=rows 4 / cols 2')).toBeVisible();

  await expectNoCriticalBrowserIssues(diag);
});
