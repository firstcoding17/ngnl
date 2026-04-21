const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'text_feedback.csv');

async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
}

async function createTextDashboard(page) {
  await page.goto('/dashboard/new?type=text');
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(CSV_FIXTURE);
  await expect(page.getByText('text_feedback / 2 cols / 4 rows')).toBeVisible();
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
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run semantic text runtime tests.');
  }
});

test('semantic text runtime stores semantic artifact metadata and connects classification output', async ({ page }) => {
  await enterWorkspace(page);
  await createTextDashboard(page);

  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByRole('button', { name: 'Text analysis' }).click();
  await page.getByTestId('task-title-input').fill('Semantic Text Runtime');
  await page.getByTestId('task-text-column-select').selectOption('review');
  await page.getByTestId('task-text-method-select').selectOption('semantic');
  await page.getByTestId('task-text-target-select').selectOption('segment');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Semantic Text Runtime');
    return task?.options?.textFeatureArtifact?.kind === 'text-features'
      && task?.options?.textFeatureArtifact?.request?.method === 'semantic'
      && task?.options?.textFeatureArtifact?.result?.runtimeClass === 'semantic'
      && task?.options?.textFeatureArtifact?.result?.semanticRuntime === 'concept-lexicon'
      && task?.options?.mlArtifact?.kind === 'ml-model'
      && task?.options?.mlArtifact?.request?.task === 'classification';
  });

  const dashboard = await readDashboardDoc(page);
  const task = dashboard.tasks.find((item) => item.title === 'Semantic Text Runtime');
  expect(task).toBeTruthy();
  expect(task.options.textFeatureArtifact.kind).toBe('text-features');
  expect(task.options.textFeatureArtifact.request.method).toBe('semantic');
  expect(task.options.textFeatureArtifact.result.runtimeClass).toBe('semantic');
  expect(task.options.textFeatureArtifact.result.semanticRuntime).toBe('concept-lexicon');
  expect(task.options.textFeatureArtifact.result.semanticDims).toBeGreaterThan(0);
  expect(task.options.textFeatureArtifact.result.topConcepts.length).toBeGreaterThan(0);
  expect(task.options.mlArtifact.kind).toBe('ml-model');
  expect(task.options.report.type).toBe('classification');

  await expect(page.getByTestId('text-feature-artifact').first()).toBeVisible();
  await expect(page.getByTestId('text-feature-artifact').first()).toContainText('semantic');
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Classification');

  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="text-feature-artifact"]').first()).toBeVisible();
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
});
