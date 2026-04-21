const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'abb.csv');


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
  await expect(page.locator('.header-actions .btn-primary')).toBeVisible({ timeout: 20000 });
}

async function readDashboardDoc(page) {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run task runtime option tests.');
  }
});


test('task form options drive runtime dataset selection and ML preset request', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);

  const dashboardBefore = await readDashboardDoc(page);
  const preparedDatasetId = dashboardBefore.activeDatasetId;

  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: 'Regression' }).first().click();

  const taskForm = page.locator('.main-panel .form-grid').first();
  await taskForm.locator('input[type="text"]').first().fill('Runtime Connected Regression');
  await taskForm.locator('textarea').first().fill('Verify source dataset selection and model runtime request.');
  await taskForm.locator('select').nth(0).selectOption('source');
  await taskForm.locator('select').nth(2).selectOption('value');
  await taskForm.locator('select[multiple]').selectOption(['name']);
  await taskForm.locator('select').last().selectOption('forest');

  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Runtime Connected Regression');
    return !!task?.options?.mlArtifact?.request?.model;
  });

  const dashboardAfter = await readDashboardDoc(page);
  const task = dashboardAfter.tasks.find((item) => item.title === 'Runtime Connected Regression');
  expect(task).toBeTruthy();
  expect(task.preprocessingMode).toBe('source');
  expect(task.datasetIds[0]).not.toBe(preparedDatasetId);
  expect(task.options.sourceDatasetId).toBe(task.datasetIds[0]);
  expect(task.options.modelFamily).toBe('forest');
  expect(task.options.targetColumn).toBe('value');
  expect(task.options.featureColumns).toEqual(['name']);
  expect(task.options.mlArtifact.request.model).toBe('forest');
  expect(task.options.mlArtifact.request.args.target).toBe('value');
  expect(task.options.mlArtifact.request.args.features).toEqual(['name']);
});
