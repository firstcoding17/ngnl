const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();

const REGRESSION_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_regression_revenue.csv');
const CLASSIFICATION_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_classification_churn.csv');
const TEXT_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_text_reviews.csv');
const IMAGE_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_image_catalog.csv');
const JOIN_PRIMARY_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_join_profiles.csv');
const JOIN_LINKED_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_join_feedback.csv');
const UNSUPERVISED_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_clustering_points.csv');


async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
}

async function createDashboard(page, type, fixturePath, expectedSummaryText, previewText) {
  await page.goto(`/dashboard/new?type=${type}`);
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(fixturePath);
  await expect(page.getByText(expectedSummaryText)).toBeVisible();
  if (previewText) {
    await expect(page.locator('.preview-table')).toContainText(previewText);
  }
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
  await expect(page.locator('.dashboard-view')).toBeVisible();
}

async function createMultidatasetDashboard(page) {
  await page.goto('/dashboard/new?type=multimodal');
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(JOIN_PRIMARY_FIXTURE);
  await expect(page.getByText('demo_join_profiles / 3 cols / 4 rows')).toBeVisible();
  await expect(page.locator('.preview-table')).toContainText('customer_id');
  await page.getByTestId('dashboard-create-linked-file').setInputFiles(JOIN_LINKED_FIXTURE);
  await expect(page.getByText('demo_join_feedback')).toBeVisible();
  await page.getByLabel('Primary key').selectOption('customer_id');
  await page.getByLabel('Linked key').selectOption('customer_id');
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
  await expect(page.locator('.dashboard-view')).toBeVisible();
  await expect(page.getByText('Cross-dataset prepared source')).toBeVisible();
  await expect(page.getByText('joined 1/1 datasets')).toBeVisible();
}

async function readDashboardDoc(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

async function openTaskCreate(page, templateLabel) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: templateLabel }).first().click();
  return page.locator('.main-panel .form-grid').first();
}

async function createRegressionTask(page, title, description) {
  const form = await openTaskCreate(page, 'Regression analysis');
  await form.getByTestId('task-title-input').fill(title);
  await form.locator('textarea').first().fill(description);
  await form.locator('label').filter({ hasText: 'Target column' }).locator('select').selectOption('revenue');
  await form.locator('label').filter({ hasText: 'Feature columns' }).locator('select').selectOption(['visits', 'ad_spend', 'leads']);
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
}

async function createClassificationTask(page, title, description) {
  const form = await openTaskCreate(page, 'Classification analysis');
  await form.getByTestId('task-title-input').fill(title);
  await form.locator('textarea').first().fill(description);
  await form.locator('label').filter({ hasText: 'Target column' }).locator('select').selectOption('churn');
  await form.locator('label').filter({ hasText: 'Feature columns' }).locator('select').selectOption(['tenure_months', 'monthly_sessions', 'support_tickets']);
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
}

async function createBasicAnalysis(page, title, description, resultType, chartType = 'table') {
  await page.getByRole('button', { name: 'Add analysis' }).click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.locator('input[type="text"]').first().fill(title);
  await form.locator('textarea').first().fill(description);
  await form.locator('label').filter({ hasText: 'Result type' }).locator('input').fill(resultType);
  await form.locator('label').filter({ hasText: 'Chart type' }).locator('input').fill(chartType);
  await page.getByRole('button', { name: 'Add Analysis', exact: true }).click();
  await expect(page).toHaveURL(/analysisId=/);
}

async function openRightPanel(page) {
  if (await page.locator('.right-panel.open').count()) return;
  await page.locator('.detail-toggle').click();
  await expect(page.locator('.right-panel.open')).toBeVisible();
}

async function openChatAndExplain(page, expectedContextText) {
  await openRightPanel(page);
  await page.getByTestId('assistant-chat-toggle').click();
  await expect(page.locator('.mcp-shell').getByText('Dashboard Chat Assistant', { exact: true })).toBeVisible();
  await expect(page.getByTestId('assistant-context')).toContainText(expectedContextText);
  await expect(page.getByTestId('assistant-runtime-status')).toContainText(/direct|fallback|warning|blocked/i);
  const responsePromise = page.waitForResponse((response) => response.url().includes('/mcp/chat'));
  await page.getByTestId('assistant-question-prompts').getByRole('button', { name: /Explain current result/i }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.locator('.message-card-title').filter({ hasText: 'Current selection' }).last()).toBeVisible();
}

async function waitForTaskArtifact(page, predicate) {
  await page.waitForFunction(predicate);
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
  expect((await responsePromise).status()).toBe(200);
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run the example dataset sweep.');
  }
});


test('example dataset: tabular regression flow renders artifact, reports, right panel, and chat', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page, 'tabular', REGRESSION_FIXTURE, 'demo_regression_revenue / 5 cols / 10 rows', 'channel');

  await createRegressionTask(page, 'Revenue Forecast Demo', 'Estimate revenue from traffic and lead signals.');
  await createBasicAnalysis(page, 'Revenue Forecast Analysis', 'Regression report for the demo dataset.', 'metric-table', 'scatter');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Revenue Forecast Demo');
    const analysis = task?.analyses?.find((item) => item.title === 'Revenue Forecast Analysis');
    return task?.options?.taskReport?.type === 'task-summary'
      && analysis?.options?.mlArtifact?.kind === 'ml-model'
      && analysis?.options?.report?.type === 'regression';
  });

  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Revenue Forecast Analysis');
  await expect(page.getByTestId('task-summary-report-section')).toContainText('summary report');
  await openRightPanel(page);
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();
  await openChatAndExplain(page, 'Revenue Forecast Analysis');
});

test('example dataset: tabular classification flow renders artifact, reports, right panel, and chat', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page, 'tabular', CLASSIFICATION_FIXTURE, 'demo_classification_churn / 5 cols / 10 rows', 'plan');

  await createClassificationTask(page, 'Churn Classification Demo', 'Predict churn risk from behavior and support signals.');
  await createBasicAnalysis(page, 'Churn Classification Analysis', 'Classification report for the demo dataset.', 'metric-table', 'bar');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Churn Classification Demo');
    const analysis = task?.analyses?.find((item) => item.title === 'Churn Classification Analysis');
    return task?.options?.taskReport?.type === 'task-summary'
      && analysis?.options?.mlArtifact?.kind === 'ml-model'
      && analysis?.options?.report?.type === 'classification';
  });

  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Churn Classification Analysis');
  await openRightPanel(page);
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();
  await openChatAndExplain(page, 'Churn Classification Analysis');
});

test('example dataset: text runtime flow creates derived dataset and downstream classification output', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page, 'text', TEXT_FIXTURE, 'demo_text_reviews / 2 cols / 6 rows', 'Helpful support');

  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByRole('button', { name: 'Text analysis' }).click();
  await page.getByTestId('task-title-input').fill('Semantic Review Demo');
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
    const task = dashboard?.tasks?.find((item) => item.title === 'Semantic Review Demo');
    return task?.options?.textFeatureArtifact?.kind === 'text-features'
      && task?.options?.textFeatureArtifact?.request?.method === 'semantic'
      && task?.options?.textFeatureArtifact?.derivedDatasetId
      && task?.options?.mlArtifact?.kind === 'ml-model'
      && task?.options?.report?.type === 'classification';
  });

  await expect(page.getByTestId('text-feature-artifact').first()).toContainText('semantic');
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Classification');
  await openRightPanel(page);
  await expect(page.locator('.right-panel [data-testid="text-feature-artifact"]').first()).toBeVisible();
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
  await openChatAndExplain(page, 'Semantic Review Demo');
});

test('example dataset: image runtime flow creates derived features and downstream classification output', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page, 'image', IMAGE_FIXTURE, 'demo_image_catalog / 2 cols / 4 rows', 'image_path');

  const dashboard = await readDashboardDoc(page);
  const sourceDatasetId = dashboard?.datasetIds?.[0] || '';
  expect(sourceDatasetId).toBeTruthy();

  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByRole('button', { name: 'Image analysis' }).click();
  await page.getByTestId('task-title-input').fill('Image Feature Demo');
  await page.getByTestId('task-dataset-select').selectOption(sourceDatasetId);
  await page.getByTestId('task-preprocessing-select').selectOption('source');
  await page.getByTestId('task-image-column-select').selectOption('image_path');
  await page.getByTestId('task-image-method-select').selectOption('features');
  await page.getByTestId('task-image-target-select').selectOption('label');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Image Feature Demo');
    return task?.options?.imageFeatureArtifact?.kind === 'image-features'
      && task?.options?.imageFeatureArtifact?.derivedDatasetId
      && task?.options?.mlArtifact?.kind === 'ml-model'
      && task?.options?.report?.type === 'classification';
  });

  await expect(page.getByTestId('image-feature-artifact').first()).toBeVisible();
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Classification');
  await openRightPanel(page);
  await expect(page.locator('.right-panel [data-testid="image-feature-artifact"]').first()).toBeVisible();
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
  await openChatAndExplain(page, 'Image Feature Demo');
});

test('example dataset: multi-dataset join flow creates linked prepared dataset, stat artifact, report, and chat response', async ({ page }) => {
  await enterWorkspace(page);
  await createMultidatasetDashboard(page);

  await openTaskCreate(page, 'Preprocessing task');
  await page.getByTestId('task-title-input').fill('Joined Dataset Stat Demo');
  await page.locator('.main-panel .form-grid').first().locator('textarea').first().fill('Inspect correlation on the joined prepared source.');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
  await createBasicAnalysis(page, 'Joined Correlation Analysis', 'Correlation analysis on the joined prepared dataset.', 'corr', 'heatmap');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    return dashboard?.datasetLinks?.artifact?.status === 'ready'
      && dashboard?.datasetLinks?.preparedDatasetId
      && dashboard?.tasks?.some((task) => task.title === 'Joined Dataset Stat Demo'
        && task.options?.taskReport?.type === 'task-summary'
        && task.analyses?.some((analysis) =>
          analysis.title === 'Joined Correlation Analysis'
          && analysis.options?.statArtifact?.kind === 'stat-corr'
          && analysis.options?.report?.type === 'correlation'));
  });

  await expect(page.getByTestId('analysis-report-section')).toContainText('Joined Correlation Analysis');
  await expect(page.locator('.stat-artifact-card').first()).toBeVisible();
  await openRightPanel(page);
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();
  await openChatAndExplain(page, 'Joined Correlation Analysis');
});

test('example dataset: unsupervised flow runs clustering and PCA with artifact, report, right panel, and chat', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page, 'tabular', UNSUPERVISED_FIXTURE, 'demo_clustering_points / 3 cols / 9 rows', 'intensity');

  const form = await openTaskCreate(page, 'Preprocessing task');
  await form.getByTestId('task-title-input').fill('Cluster Structure Demo');
  await form.locator('textarea').first().fill('Run clustering and PCA on the sample point cloud.');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await runUnsupervised(page, 'clustering', 'kmeans', ['x', 'y', 'intensity']);
  await expect(page.locator('.ml-artifact-card').first()).toContainText('Saved unsupervised result');
  await runUnsupervised(page, 'dim_reduction', 'pca', ['x', 'y', 'intensity']);
  await expect(page.locator('.ml-artifact-card').first()).toContainText('Projection preview');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Cluster Structure Demo');
    return task?.options?.mlArtifact?.kind === 'ml-unsupervised'
      && task?.options?.mlArtifact?.request?.task === 'dim_reduction'
      && task?.options?.report?.type === 'pca';
  });

  await expect(page.getByTestId('analysis-report-section')).toContainText('PCA');
  await openRightPanel(page);
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();
  await openChatAndExplain(page, 'Cluster Structure Demo');
});
