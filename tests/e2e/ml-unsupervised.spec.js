const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'stats_multigroup.csv');


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
  await expect(page.getByText('stats_multigroup / 4 cols / 9 rows')).toBeVisible();
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
}

async function createTask(page, title) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').first().click();
  const taskForm = page.locator('.main-panel .form-grid').first();
  await taskForm.locator('input[type="text"]').first().fill(title);
  await taskForm.locator('textarea').first().fill('Validate unsupervised runtime wiring.');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
}

async function readDashboardDoc(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

async function runUnsupervised(page, nextTask, nextModel, featureValues) {
  await page.locator('.catalog-tabs').getByRole('button', { name: 'Model', exact: true }).click();
  await page.getByTestId('ml-task-select').selectOption(nextTask);
  await page.getByTestId('ml-model-select').selectOption(nextModel);
  await page.getByTestId('ml-feature-select').selectOption(featureValues);
  await expect(page.getByTestId('ml-train-button')).toBeEnabled();
  const responsePromise = page.waitForResponse((response) => response.url().includes('/ml/run'));
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="ml-train-button"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('ML train button not found');
    button.click();
  });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run unsupervised ML tests.');
  }
});


test('kmeans, dbscan, and pca runs are stored as unsupervised artifacts', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);
  await createTask(page, 'Unsupervised Runtime Check');

  await runUnsupervised(page, 'clustering', 'kmeans', ['score', 'spend']);
  await expect(page.locator('.ml-artifact-card').first()).toContainText('Saved unsupervised result');
  await expect(page.locator('.ml-artifact-card').first()).toContainText('Cluster sizes');
  await expect(page.locator('.right-panel')).toContainText('Saved unsupervised result');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Unsupervised Runtime Check');
    return task?.options?.mlArtifact?.kind === 'ml-unsupervised'
      && task?.options?.mlArtifact?.request?.task === 'clustering'
      && task?.options?.mlArtifact?.request?.model === 'kmeans';
  });

  await runUnsupervised(page, 'clustering', 'dbscan', ['score', 'spend']);
  await expect(page.locator('.ml-artifact-card').first()).toContainText('dbscan');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Unsupervised Runtime Check');
    return task?.options?.mlArtifact?.kind === 'ml-unsupervised'
      && task?.options?.mlArtifact?.request?.task === 'clustering'
      && task?.options?.mlArtifact?.request?.model === 'dbscan'
      && Array.isArray(task?.options?.mlArtifact?.result?.clusterSummary);
  });

  await runUnsupervised(page, 'dim_reduction', 'pca', ['score', 'spend']);
  await expect(page.locator('.ml-artifact-card').first()).toContainText('Projection preview');
  await expect(page.locator('.ml-artifact-card').first()).toContainText('components');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Unsupervised Runtime Check');
    return task?.options?.mlArtifact?.kind === 'ml-unsupervised'
      && task?.options?.mlArtifact?.request?.task === 'dim_reduction'
      && task?.options?.mlArtifact?.request?.model === 'pca'
      && Array.isArray(task?.options?.mlArtifact?.result?.projectionPreview)
      && !!task?.options?.mlArtifact?.result?.projectionMetadata;
  });

  const dashboard = await readDashboardDoc(page);
  const task = dashboard.tasks.find((item) => item.title === 'Unsupervised Runtime Check');
  expect(task.options.mlArtifact.kind).toBe('ml-unsupervised');
  expect(task.options.mlArtifact.availability).toBe('fallback');
  expect(task.options.mlArtifact.requestedModel).toBe('pca');
  expect(task.options.mlArtifact.effectiveModel).toBe('pca');
  expect(task.options.report?.type).toBe('pca');
  await expect(page.getByTestId('analysis-report-section')).toContainText('PCA');

  await page.getByRole('button', { name: 'Dashboard home' }).click();
  await expect(page.locator('.task-card').filter({ hasText: 'Unsupervised Runtime Check' })).toContainText('Projection ready via fallback runtime');
});
