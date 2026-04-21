const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();

const REGRESSION_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_regression_revenue.csv');
const TEXT_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_text_reviews.csv');
const JOIN_PRIMARY_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_join_profiles.csv');
const JOIN_LINKED_FIXTURE = path.resolve(__dirname, 'fixtures', 'demo_join_feedback.csv');

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
  await page.getByTestId('dashboard-create-linked-file').setInputFiles(JOIN_LINKED_FIXTURE);
  await expect(page.locator('.linked-card').filter({ hasText: 'demo_join_feedback' }).first()).toContainText('3 cols / 4 rows');
  await page.getByLabel('Primary key').selectOption('customer_id');
  await page.getByLabel('Linked key').selectOption('customer_id');
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
  await expect(page.getByText('Cross-dataset prepared source')).toBeVisible();
}

async function openTaskCreate(page, templateLabel) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: templateLabel }).first().click();
  return page.locator('.main-panel .form-grid').first();
}

async function createRegressionTask(page) {
  const form = await openTaskCreate(page, 'Regression analysis');
  await form.getByTestId('task-title-input').fill('Deploy Preflight Regression');
  await form.locator('textarea').first().fill('Regression preflight task for the deploy check.');
  await form.locator('label').filter({ hasText: 'Target column' }).locator('select').selectOption('revenue');
  await form.locator('label').filter({ hasText: 'Feature columns' }).locator('select').selectOption(['visits', 'ad_spend', 'leads']);
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
}

async function createRegressionAnalysis(page) {
  await page.getByRole('button', { name: 'Add analysis' }).click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.locator('input[type="text"]').first().fill('Deploy Regression Analysis');
  await form.locator('textarea').first().fill('Deploy report check for regression.');
  await form.locator('label').filter({ hasText: 'Result type' }).locator('input').fill('metric-table');
  await form.locator('label').filter({ hasText: 'Chart type' }).locator('input').fill('scatter');
  await page.getByRole('button', { name: 'Add Analysis', exact: true }).click();
  await expect(page).toHaveURL(/analysisId=/);
}

async function createTextTask(page) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByTestId('task-title-input').fill('Deploy Text Runtime');
  await page.getByTestId('task-text-column-select').selectOption('review');
  await page.getByTestId('task-text-method-select').selectOption('semantic');
  await page.getByTestId('task-text-target-select').selectOption('segment');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
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
  if (expectedContextText) {
    await expect(page.getByTestId('assistant-context')).toContainText(expectedContextText);
  }
  await expect(page.getByTestId('assistant-runtime-status')).toContainText(/direct|fallback|warning|blocked/i);
  const responsePromise = page.waitForResponse((response) => response.url().includes('/mcp/chat'));
  await page.getByTestId('assistant-question-prompts').getByRole('button', { name: /Explain current result/i }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.locator('.message-card-title').filter({ hasText: 'Current selection' }).last()).toBeVisible();
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run the deploy preflight spec.');
  }
});

test('deploy preflight covers structured, text, and multi-dataset UI flows', async ({ page }) => {
  test.setTimeout(180000);

  await enterWorkspace(page);

  await createDashboard(page, 'tabular', REGRESSION_FIXTURE, 'demo_regression_revenue / 5 cols / 10 rows', 'channel');
  await createRegressionTask(page);
  await createRegressionAnalysis(page);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Deploy Preflight Regression');
    const analysis = task?.analyses?.find((item) => item.title === 'Deploy Regression Analysis');
    return task?.options?.taskReport?.type === 'task-summary'
      && analysis?.options?.mlArtifact?.kind === 'ml-model'
      && analysis?.options?.report?.type === 'regression';
  });
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Deploy Regression Analysis');
  await expect(page.locator('.artifact-panel [data-testid="runtime-status-block"]').first()).toBeVisible();
  await openRightPanel(page);
  await expect(page.locator('.right-panel .ml-artifact-card').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();
  await openChatAndExplain(page, 'Deploy Regression Analysis');

  await createDashboard(page, 'text', TEXT_FIXTURE, 'demo_text_reviews / 2 cols / 6 rows', 'Helpful support');
  await createTextTask(page);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Deploy Text Runtime');
    return task?.options?.textFeatureArtifact?.kind === 'text-features'
      && task?.options?.textFeatureArtifact?.request?.method === 'semantic'
      && task?.options?.mlArtifact?.kind === 'ml-model'
      && task?.options?.report?.type === 'classification';
  });
  await expect(page.getByTestId('text-feature-artifact').first()).toBeVisible();
  await expect(page.locator('.artifact-panel [data-testid="runtime-status-block"]').first()).toBeVisible();
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await openRightPanel(page);
  await expect(page.locator('.right-panel [data-testid="text-feature-artifact"]').first()).toBeVisible();
  await openChatAndExplain(page, 'Deploy Text Runtime');

  await createMultidatasetDashboard(page);
  await page.getByRole('button', { name: 'Stat' }).click();
  const statResponse = page.waitForResponse((response) => response.url().includes('/stat/run'));
  await page.getByRole('button', { name: 'Generate Report' }).click();
  expect((await statResponse).status()).toBe(200);
  await expect(page.getByText(/rows 4/i).first()).toBeVisible();
  await openRightPanel(page);
  await expect(page.locator('.right-panel.open')).toBeVisible();
  await openChatAndExplain(page, '');
});
