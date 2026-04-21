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
}

async function readDashboardDoc(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run ML availability tests.');
  }
});


test('task form and ML panel reflect runtime availability consistently', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);

  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').nth(1).click();

  const taskForm = page.locator('.main-panel .form-grid').first();
  const taskModelSelect = taskForm.locator('label').filter({ hasText: 'Model family' }).locator('select');
  await expect(taskModelSelect).toContainText('Random forest');
  await expect(taskModelSelect).not.toContainText('XGBoost');

  await taskForm.locator('input[type="text"]').first().fill('ML Availability Check');
  await taskForm.locator('textarea').first().fill('Check direct, fallback, and blocked availability states.');
  await taskForm.locator('select').nth(2).selectOption('value');
  await taskModelSelect.selectOption('forest');

  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.locator('.catalog-tabs').getByRole('button', { name: 'Model', exact: true }).click();

  const availability = page.getByTestId('ml-model-availability');
  await page.getByTestId('ml-model-select').selectOption('forest');
  await expect(availability).toContainText('fallback');
  await expect(availability).toContainText('requested');
  await expect(availability).toContainText('effective');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'ML Availability Check');
    return task?.options?.mlArtifact?.availability === 'fallback';
  });

  const dashboard = await readDashboardDoc(page);
  const task = dashboard.tasks.find((item) => item.title === 'ML Availability Check');
  expect(task.options.mlArtifact.availability).toBe('fallback');
  expect(task.options.mlArtifact.requestedModel).toBe('forest');
  expect(String(task.options.mlArtifact.effectiveModel || '')).toContain('linear');
  expect(String(task.options.mlArtifact.availabilityReason || '')).toContain('scikit-learn');
  expect(task.options.report?.type).toBe('regression');
  await expect(page.getByTestId('analysis-report-section')).toContainText('Regression');

  await page.getByTestId('ml-model-select').selectOption('xgboost');
  await expect(availability).toContainText('blocked');
  await expect(availability).toContainText('XGBoost');
  await expect(page.getByTestId('ml-train-button')).toBeDisabled();
});
