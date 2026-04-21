const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const REGRESSION_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_regression_revenue.csv');
const CLASSIFICATION_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_classification_churn.csv');
const UNSUPERVISED_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_clustering_points.csv');
const TEXT_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_text_reviews.csv');

async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
}

async function openStructuredCreate(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start new work', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/new\?type=tabular$/);
}

async function readCurrentDashboard(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

async function openTaskEditor(page) {
  await page.locator('.header-actions .btn-primary').first().click();
  await expect(page.locator('.main-panel [data-testid="recommendation-summary-card"]').first()).toBeVisible();
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run structured recommendation tests.');
  }
});

test('structured regression recommendation explains the numeric target candidate', async ({ page }) => {
  await enterWorkspace(page);
  await openStructuredCreate(page);

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(REGRESSION_FIXTURE);

  const recommendationBox = page.getByTestId('structured-recommendation-box');
  await expect(recommendationBox).toBeVisible();
  await expect(recommendationBox).toContainText('Regression analysis');
  await expect(recommendationBox).toContainText('revenue looks like a continuous numeric outcome column');
  await expect(recommendationBox).toContainText('Linear baseline');

  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);

  const regressionCard = page.locator('.task-card').filter({ hasText: 'revenue looks like a continuous numeric outcome column' }).first();
  await expect(regressionCard).toBeVisible();
  await expect(regressionCard).toContainText('revenue looks like a continuous numeric outcome column');

  await openTaskEditor(page);
  const editorRecommendation = page.locator('.main-panel [data-testid="recommendation-summary-card"]').first();
  await expect(editorRecommendation).toContainText('Linear baseline');
  await expect(editorRecommendation).toContainText('Regression analysis');
});

test('structured classification recommendation explains the binary target candidate', async ({ page }) => {
  await enterWorkspace(page);
  await openStructuredCreate(page);

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(CLASSIFICATION_FIXTURE);

  const recommendationBox = page.getByTestId('structured-recommendation-box');
  await expect(recommendationBox).toBeVisible();
  await expect(recommendationBox).toContainText('Classification analysis');
  await expect(recommendationBox).toContainText('churn looks like a binary outcome column');
  await expect(recommendationBox).toContainText('Logistic baseline');

  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);

  const classificationCard = page.locator('.task-card').filter({ hasText: 'churn looks like a binary outcome column' }).first();
  await expect(classificationCard).toBeVisible();
  await expect(classificationCard).toContainText('churn looks like a binary outcome column');

  await openTaskEditor(page);
  const editorRecommendation = page.locator('.main-panel [data-testid="recommendation-summary-card"]').first();
  await expect(editorRecommendation).toContainText('Logistic baseline');
  await expect(editorRecommendation).toContainText('Classification analysis');
});

test('structured recommendation prefers pca and clustering when numeric data has no clear target', async ({ page }) => {
  await enterWorkspace(page);
  await openStructuredCreate(page);

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(UNSUPERVISED_FIXTURE);

  const recommendationBox = page.getByTestId('structured-recommendation-box');
  await expect(recommendationBox).toBeVisible();
  await expect(recommendationBox).toContainText('PCA view');
  await expect(recommendationBox).toContainText('Clustering analysis');
  await expect(recommendationBox).toContainText('no clear target stands out yet');
});

test('wizard recommendation action can prefill the first text task runtime', async ({ page }) => {
  await enterWorkspace(page);
  await page.goto('/dashboard/new?type=text');

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(TEXT_FIXTURE);

  const recommendationBox = page.getByTestId('structured-recommendation-box');
  const semanticItem = recommendationBox.locator('.recommendation-summary-card__item').filter({ hasText: 'Semantic text runtime' }).first();
  await expect(semanticItem).toBeVisible();
  await semanticItem.getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByTestId('wizard-recommendation-note')).toContainText('Semantic text runtime will prefill the first text task suggestion.');

  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);

  const dashboard = await readCurrentDashboard(page);
  const textTask = dashboard.tasks.find((task) => task.type === 'text-analysis');
  expect(textTask).toBeTruthy();
  expect(textTask.options?.textMethod).toBe('semantic');
});

test('task editor recommendation action can update the recommended model family', async ({ page }) => {
  await enterWorkspace(page);
  await openStructuredCreate(page);

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(REGRESSION_FIXTURE);
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);

  await openTaskEditor(page);

  const recommendationCard = page.locator('.main-panel [data-testid="recommendation-summary-card"]').first();
  const forestItem = recommendationCard.locator('.recommendation-summary-card__item').filter({ hasText: 'Random forest' }).first();
  await expect(forestItem).toBeVisible();
  await forestItem.getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByTestId('task-model-family-select')).toHaveValue('forest');
});
