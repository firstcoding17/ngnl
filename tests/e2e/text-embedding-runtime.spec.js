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

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run text embedding runtime tests.');
  }
});


test('text embedding runtime builds derived features and feeds PCA preset', async ({ page }) => {
  await enterWorkspace(page);
  await createTextDashboard(page);

  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByTestId('task-title-input').fill('Text Embedding Runtime');
  await page.getByTestId('task-text-column-select').selectOption('review');
  await page.getByTestId('task-text-method-select').selectOption('embedding');
  await page.getByTestId('task-text-target-select').selectOption('');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Text Embedding Runtime');
    return task?.options?.textFeatureArtifact?.kind === 'text-features'
      && task?.options?.textFeatureArtifact?.request?.method === 'embedding'
      && task?.options?.textFeatureArtifact?.result?.embeddingDims >= 4
      && task?.options?.mlArtifact?.kind === 'ml-unsupervised'
      && task?.options?.mlArtifact?.request?.task === 'dim_reduction'
      && task?.options?.mlArtifact?.request?.model === 'pca';
  });

  await expect(page.getByTestId('text-feature-artifact').first()).toContainText('embedding');
  await expect(page.getByTestId('text-feature-artifact').first()).toContainText('Embedding dims');
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved text runtime result' }).first()).toBeVisible();
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();

  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="text-feature-artifact"]').first()).toBeVisible();
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
});
