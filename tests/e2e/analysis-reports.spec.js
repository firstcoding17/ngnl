const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'stats_groups.csv');


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
  await expect(page.getByText('stats_groups / 4 cols / 6 rows')).toBeVisible();
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

async function createTask(page, templateLabel, title, description) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: templateLabel }).first().click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.locator('input[type="text"]').first().fill(title);
  await form.locator('textarea').first().fill(description);
  return form;
}

async function createAnalysis(page, title, description, resultType, chartType = 'table') {
  await page.getByRole('button', { name: 'Add analysis' }).click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.locator('input[type="text"]').first().fill(title);
  await form.locator('textarea').first().fill(description);
  await form.locator('label').filter({ hasText: 'Result type' }).locator('input').fill(resultType);
  await form.locator('label').filter({ hasText: 'Chart type' }).locator('input').fill(chartType);
  await page.getByRole('button', { name: 'Add Analysis', exact: true }).click();
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run analysis report tests.');
  }
});


test('analysis reports are stored and rendered for corr, tests, and regression flows', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await enterWorkspace(page);
  await createDashboard(page);

  await createTask(page, 'Preprocessing task', 'Stat Report Task', 'Create stat reports from saved artifacts.');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await createAnalysis(page, 'Correlation Report Analysis', 'Create a correlation report.', 'corr', 'heatmap');
  await expect(page).toHaveURL(/analysisId=/);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Stat Report Task');
    const analysis = task?.analyses?.find((item) => item.title === 'Correlation Report Analysis');
    return analysis?.options?.report?.type === 'correlation'
      && task?.options?.taskReport?.type === 'task-summary'
      && analysis?.options?.report?.status
      && analysis?.options?.statArtifact?.kind === 'stat-corr';
  });
  await expect(page.getByTestId('task-summary-report-section')).toContainText('Composite task report');
  await expect(page.getByTestId('analysis-report-section')).toContainText('Correlation Report Analysis');
  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toContainText('summary report');
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').nth(1)).toContainText('Correlation Report Analysis');

  await createAnalysis(page, 'Stat Test Report Analysis', 'Create a statistical test report.', 'tests', 'table');
  await expect(page).toHaveURL(/analysisId=/);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Stat Report Task');
    const analysis = task?.analyses?.find((item) => item.title === 'Stat Test Report Analysis');
    return analysis?.options?.report?.type === 'stat-tests'
      && analysis?.options?.report?.sections?.results?.['Test type']
      && analysis?.options?.statArtifact?.kind === 'stat-tests';
  });
  await expect(page.getByTestId('analysis-report-section')).toContainText('Stat Test Report Analysis');

  const dashboard = await readDashboardDoc(page);
  const dashboardId = dashboard.id;

  const regressionForm = await createTask(page, 'Regression analysis', 'Regression Report Task', 'Create an ML report from the saved model artifact.');
  await regressionForm.locator('label').filter({ hasText: 'Target column' }).locator('select').selectOption('spend');
  await regressionForm.locator('label').filter({ hasText: 'Feature columns' }).locator('select').selectOption(['score']);
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
  await createAnalysis(page, 'Regression Report Analysis', 'Create a regression report.', 'metric-table', 'scatter');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Regression Report Task');
    const analysis = task?.analyses?.find((item) => item.title === 'Regression Report Analysis');
    return analysis?.options?.report?.type === 'regression'
      && task?.options?.taskReport?.type === 'task-summary'
      && analysis?.options?.report?.sections?.results?.['R^2'] !== undefined
      && analysis?.options?.mlArtifact?.kind === 'ml-model';
  });

  const nextDashboard = await readDashboardDoc(page);
  const regressionTask = nextDashboard.tasks.find((item) => item.title === 'Regression Report Task');
  const regressionAnalysis = regressionTask.analyses.find((item) => item.title === 'Regression Report Analysis');
  await page.goto(`/dashboard/${dashboardId}?mode=task-detail&taskId=${regressionTask.id}&analysisId=${regressionAnalysis.id}`);
  await expect(page.getByTestId('task-summary-report-section')).toContainText('summary report');
  await expect(page.getByTestId('analysis-report-section')).toContainText('Regression Report Analysis');
  await expect(page.getByTestId('task-summary-report-section').getByTestId('analysis-report-copy')).toBeVisible();
  await expect(page.getByTestId('task-summary-report-section').getByTestId('analysis-report-download-md')).toBeVisible();
  await page.getByTestId('analysis-report-section').getByTestId('analysis-report-copy').click();
  await expect(page.getByTestId('analysis-report-section').getByTestId('analysis-report-action-status')).toContainText('Copied report');
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('# Analysis Report');
  expect(clipboardText).toContain('Regression Report Analysis');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('analysis-report-section').getByTestId('analysis-report-download-md').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ngnl-regression-regression-report-analysis-\d{8}-\d{6}\.md$/);
  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toContainText('summary report');
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').nth(1)).toContainText('Regression Report Analysis');
  await expect(page.locator('.right-panel [data-testid="analysis-report-copy"]').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="analysis-report-download-md"]').first()).toBeVisible();
});
