const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const GROUPS_FIXTURE = path.resolve(__dirname, 'fixtures', 'stats_groups.csv');


async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
}

async function createDashboard(page) {
  await page.goto('/dashboard/new?type=tabular');
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(GROUPS_FIXTURE);
  await expect(page.getByText('stats_groups / 4 cols / 6 rows')).toBeVisible();
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
  await expect(page.locator('.dashboard-view')).toBeVisible();
}

async function readDashboardDoc(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

async function createRegressionTask(page, taskTitle = 'Regression Stale Task', analysisTitle = 'Regression Stale Analysis') {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: 'Regression analysis' }).first().click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.getByTestId('task-title-input').fill(taskTitle);
  await form.locator('textarea').first().fill('Regression task for stale report regression checks.');
  await form.locator('label').filter({ hasText: 'Target column' }).locator('select').selectOption('spend');
  await form.locator('label').filter({ hasText: 'Feature columns' }).locator('select').selectOption(['score']);
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.getByRole('button', { name: 'Add analysis' }).click();
  const analysisForm = page.locator('.main-panel .form-grid').first();
  await analysisForm.locator('input[type="text"]').first().fill(analysisTitle);
  await analysisForm.locator('textarea').first().fill('Regression analysis for stale report checks.');
  await page.getByRole('button', { name: 'Add Analysis', exact: true }).click();
  await expect(page).toHaveURL(/analysisId=/);

  await page.waitForFunction(({ taskTitle, analysisTitle }) => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
    const analysis = task?.analyses?.find((item) => item.title === analysisTitle);
    return analysis?.options?.report?.type === 'regression'
      && analysis?.options?.mlArtifact?.kind === 'ml-model'
      && task?.options?.taskReport?.type === 'task-summary';
  }, { taskTitle, analysisTitle });
}

async function readTaskAndAnalysis(page, taskTitle, analysisTitle) {
  return page.evaluate(({ taskTitle, analysisTitle }) => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
    const analysis = task?.analyses?.find((item) => item.title === analysisTitle);
    return { task, analysis };
  }, { taskTitle, analysisTitle });
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run stale report regression tests.');
  }
});


test('duplicate analysis does not carry stale report or artifact into the copy', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);
  await createRegressionTask(page);

  await page.locator('.analysis-card').filter({ hasText: 'Regression Stale Analysis' }).getByRole('button', { name: 'Duplicate' }).click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    return dashboard?.tasks?.some((task) => task.title === 'Regression Stale Task' && task.analyses?.some((analysis) => analysis.title === 'Regression Stale Analysis Copy'));
  });

  const duplicated = await readTaskAndAnalysis(page, 'Regression Stale Task', 'Regression Stale Analysis Copy');
  expect(duplicated.analysis).toBeTruthy();
  expect(duplicated.analysis?.options?.report || null).toBeNull();
  expect(duplicated.analysis?.options?.mlArtifact || null).toBeNull();
  expect(String(duplicated.analysis?.options?.executionSummary || '').trim()).toBe('');
  await expect(page).toHaveURL(new RegExp(`analysisId=${duplicated.analysis.id}`));

  if (await page.getByTestId('analysis-report-section').count()) {
    await expect(page.getByTestId('analysis-report-section')).not.toContainText('Regression Stale Analysis report');
  }
  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  const rightPanelReportTexts = await page.locator('.right-panel [data-testid="analysis-report-card"]').allTextContents();
  expect(rightPanelReportTexts.join(' | ')).not.toContain('Regression Stale Analysis report');
});

test('rerun clears stale analysis report while pending and restores a fresh report when done', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);
  await createRegressionTask(page, 'Regression Rerun Task', 'Regression Rerun Analysis');

  const beforeRerun = await readTaskAndAnalysis(page, 'Regression Rerun Task', 'Regression Rerun Analysis');
  const previousCreatedAt = Number(beforeRerun.analysis?.options?.mlArtifact?.createdAt || 0);
  expect(previousCreatedAt).toBeGreaterThan(0);

  await page.locator('.analysis-card').filter({ hasText: 'Regression Rerun Analysis' }).getByRole('button', { name: 'Rerun' }).click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Regression Rerun Task');
    const analysis = task?.analyses?.find((item) => item.title === 'Regression Rerun Analysis');
    return analysis?.status === 'rerun requested'
      && !analysis?.options?.report
      && !analysis?.options?.mlArtifact
      && !task?.options?.taskReport;
  });

  await page.waitForFunction(({ previousCreatedAt }) => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Regression Rerun Task');
    const analysis = task?.analyses?.find((item) => item.title === 'Regression Rerun Analysis');
    return analysis?.status === 'ready'
      && Number(analysis?.options?.mlArtifact?.createdAt || 0) > Number(previousCreatedAt || 0)
      && analysis?.options?.report?.type === 'regression'
      && task?.options?.taskReport?.type === 'task-summary';
  }, { previousCreatedAt });

  await expect(page.getByTestId('analysis-report-section')).toContainText('Regression Rerun Analysis');
  await expect(page.getByTestId('task-summary-report-section')).toContainText('summary report');
});

test('open report focus switches the visible report without leaving the previous analysis report behind', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);

  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: 'Preprocessing task' }).first().click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.getByTestId('task-title-input').fill('Stat Focus Task');
  await form.locator('textarea').first().fill('Task for report focus regression checks.');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  const addAnalysis = async (title, resultType) => {
    await page.getByRole('button', { name: 'Add analysis' }).click();
    const analysisForm = page.locator('.main-panel .form-grid').first();
    await analysisForm.locator('input[type="text"]').first().fill(title);
    await analysisForm.locator('textarea').first().fill(`${title} description.`);
    await analysisForm.locator('label').filter({ hasText: 'Result type' }).locator('input').fill(resultType);
    await analysisForm.locator('label').filter({ hasText: 'Chart type' }).locator('input').fill(resultType === 'corr' ? 'heatmap' : 'table');
    await page.getByRole('button', { name: 'Add Analysis', exact: true }).click();
    await expect(page).toHaveURL(/analysisId=/);
  };

  await addAnalysis('Correlation Focus Analysis', 'corr');
  await addAnalysis('Tests Focus Analysis', 'tests');

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'Stat Focus Task');
    const corr = task?.analyses?.find((item) => item.title === 'Correlation Focus Analysis');
    const tests = task?.analyses?.find((item) => item.title === 'Tests Focus Analysis');
    return corr?.options?.report?.type === 'correlation' && tests?.options?.report?.type === 'stat-tests';
  });

  const corrCard = page.locator('.analysis-card').filter({ hasText: 'Correlation Focus Analysis' });
  const testsCard = page.locator('.analysis-card').filter({ hasText: 'Tests Focus Analysis' });

  await corrCard.getByRole('button', { name: 'Open report' }).click();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Correlation Focus Analysis');
  await expect(page.getByTestId('analysis-report-section')).not.toContainText('Tests Focus Analysis');

  await testsCard.getByRole('button', { name: 'Open report' }).click();
  await expect(page.getByTestId('analysis-report-section')).toContainText('Tests Focus Analysis');
  await expect(page.getByTestId('analysis-report-section')).not.toContainText('Correlation Focus Analysis');
  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').nth(1)).toContainText('Tests Focus Analysis');
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').nth(1)).not.toContainText('Correlation Focus Analysis');
});
