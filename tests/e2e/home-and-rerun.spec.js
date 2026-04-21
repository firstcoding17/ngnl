const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const ABB_FIXTURE = path.resolve(__dirname, 'fixtures', 'abb.csv');
const GROUPS_FIXTURE = path.resolve(__dirname, 'fixtures', 'stats_groups.csv');


async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
}

async function createDashboardFromHome(page, fixturePath, expectedDatasetText) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start new work', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/new\?type=tabular$/);
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(fixturePath);
  await expect(page.getByText(expectedDatasetText)).toBeVisible();
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

async function openTaskCreate(page, templateLabel) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: templateLabel }).first().click();
  return page.locator('.main-panel .form-grid').first();
}

async function createManagedTask(page, options) {
  const form = await openTaskCreate(page, options.templateLabel);
  await form.getByTestId('task-title-input').fill(options.title);
  await form.locator('textarea').first().fill(options.description);
  if (options.targetColumn) {
    await form.locator('label').filter({ hasText: 'Target column' }).locator('select').selectOption(options.targetColumn);
  }
  if (options.featureColumns?.length) {
    await form.locator('label').filter({ hasText: 'Feature columns' }).locator('select').selectOption(options.featureColumns);
  }
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
}

async function createAnalysis(page, title, description) {
  await page.getByRole('button', { name: 'Add analysis' }).click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.locator('input[type="text"]').first().fill(title);
  await form.locator('textarea').first().fill(description);
  await page.getByRole('button', { name: 'Add Analysis', exact: true }).click();
  await expect(page).toHaveURL(/analysisId=/);
}

async function updateTask(page, nextTitle, nextDescription) {
  await page.getByRole('button', { name: 'Edit task' }).click();
  const form = page.locator('.main-panel .form-grid').first();
  await form.getByTestId('task-title-input').fill(nextTitle);
  await form.locator('textarea').first().fill(nextDescription);
  await page.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);
}

async function waitForManagedAnalysis(page, taskTitle, analysisTitle, expectedTaskKind) {
  await page.waitForFunction(
    ({ taskTitle, analysisTitle, expectedTaskKind }) => {
      const raw = localStorage.getItem('ngnl_dashboards_v1');
      const dashboards = JSON.parse(raw || '[]');
      const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
      const dashboard = dashboards.find((item) => item.id === dashboardId);
      const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
      const analysis = task?.analyses?.find((item) => item.title === analysisTitle);
      if (!task || !analysis) return false;
      const artifact = analysis?.options?.mlArtifact;
      return task.options?.report?.type === expectedTaskKind
        && analysis.options?.report?.type === expectedTaskKind
        && artifact?.kind === 'ml-model'
        && typeof artifact.createdAt === 'number';
    },
    { taskTitle, analysisTitle, expectedTaskKind }
  );
}

async function readManagedAnalysis(page, taskTitle, analysisTitle) {
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

async function rerunFocusedAnalysis(page, taskTitle, analysisTitle, previousCreatedAt) {
  await page.locator('.analysis-card').filter({ hasText: analysisTitle }).getByRole('button', { name: 'Rerun' }).click();
  await page.waitForFunction(
    ({ taskTitle, analysisTitle, previousCreatedAt }) => {
      const raw = localStorage.getItem('ngnl_dashboards_v1');
      const dashboards = JSON.parse(raw || '[]');
      const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
      const dashboard = dashboards.find((item) => item.id === dashboardId);
      const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
      const analysis = task?.analyses?.find((item) => item.title === analysisTitle);
      const createdAt = Number(analysis?.options?.mlArtifact?.createdAt || 0);
      return createdAt > Number(previousCreatedAt || 0) && analysis?.status === 'ready';
    },
    { taskTitle, analysisTitle, previousCreatedAt }
  );
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run home/rerun stability tests.');
  }
});


test('main entry opens the guided create flow from home', async ({ page }) => {
  await enterWorkspace(page);
  await expect(page.locator('.home-view')).toBeVisible();
  await expect(page.getByText('Continue recent work or start a new dashboard from a guided flow.')).toBeVisible();

  await page.getByRole('button', { name: 'Start new work', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/new\?type=tabular$/);
  await expect(page.getByText('Choose a data type, upload the primary dataset, optionally link extra datasets, and seed the dashboard with one prepared source.')).toBeVisible();

  await page.getByTestId('dashboard-create-primary-file').setInputFiles(ABB_FIXTURE);
  await expect(page.getByText('abb / 2 cols / 4 rows')).toBeVisible();
  await page.getByTestId('dashboard-create-submit').click();
  await expect(page).toHaveURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/);
  await expect(page.locator('.dashboard-view')).toBeVisible();
});

test('main entry can reopen an existing dashboard from the home screen', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboardFromHome(page, ABB_FIXTURE, 'abb / 2 cols / 4 rows');
  const dashboard = await readDashboardDoc(page);
  expect(dashboard?.title).toBeTruthy();

  await page.goto('/');
  const card = page.locator('.dashboard-card').filter({ hasText: dashboard.title }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboard.id}`));
  await expect(page.locator('.dashboard-view')).toBeVisible();
  await expect(page.locator('.title-input')).toHaveValue(dashboard.title);
});

test('regression task can be created, edited, and rerun in place', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboardFromHome(page, GROUPS_FIXTURE, 'stats_groups / 4 cols / 6 rows');

  await createManagedTask(page, {
    templateLabel: 'Regression analysis',
    title: 'Regression Stability Task',
    description: 'Initial regression task for stability verification.',
    targetColumn: 'spend',
    featureColumns: ['score'],
  });
  await createAnalysis(page, 'Regression Stability Analysis', 'Created to verify rerun stability.');
  await waitForManagedAnalysis(page, 'Regression Stability Task', 'Regression Stability Analysis', 'regression');

  await updateTask(page, 'Regression Stability Task Updated', 'Regression edit flow keeps the same entity.');
  const afterEdit = await readManagedAnalysis(page, 'Regression Stability Task Updated', 'Regression Stability Analysis');
  expect(afterEdit.task?.title).toBe('Regression Stability Task Updated');
  const initialCreatedAt = Number(afterEdit.analysis?.options?.mlArtifact?.createdAt || 0);
  expect(initialCreatedAt).toBeGreaterThan(0);

  await rerunFocusedAnalysis(page, 'Regression Stability Task Updated', 'Regression Stability Analysis', initialCreatedAt);

  const afterRerun = await readManagedAnalysis(page, 'Regression Stability Task Updated', 'Regression Stability Analysis');
  expect(afterRerun.analysis?.options?.report?.type).toBe('regression');
  expect(Number(afterRerun.analysis?.options?.mlArtifact?.createdAt || 0)).toBeGreaterThan(initialCreatedAt);
  await expect(page.getByTestId('analysis-report-section')).toContainText('Regression');
});

test('classification task can be created, edited, and rerun in place', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboardFromHome(page, GROUPS_FIXTURE, 'stats_groups / 4 cols / 6 rows');

  await createManagedTask(page, {
    templateLabel: 'Classification analysis',
    title: 'Classification Stability Task',
    description: 'Initial classification task for stability verification.',
    targetColumn: 'segment',
    featureColumns: ['score', 'spend'],
  });
  await createAnalysis(page, 'Classification Stability Analysis', 'Created to verify rerun stability.');
  await waitForManagedAnalysis(page, 'Classification Stability Task', 'Classification Stability Analysis', 'classification');

  await updateTask(page, 'Classification Stability Task Updated', 'Classification edit flow keeps the same entity.');
  const afterEdit = await readManagedAnalysis(page, 'Classification Stability Task Updated', 'Classification Stability Analysis');
  expect(afterEdit.task?.title).toBe('Classification Stability Task Updated');
  const initialCreatedAt = Number(afterEdit.analysis?.options?.mlArtifact?.createdAt || 0);
  expect(initialCreatedAt).toBeGreaterThan(0);

  await rerunFocusedAnalysis(page, 'Classification Stability Task Updated', 'Classification Stability Analysis', initialCreatedAt);

  const afterRerun = await readManagedAnalysis(page, 'Classification Stability Task Updated', 'Classification Stability Analysis');
  expect(afterRerun.analysis?.options?.report?.type).toBe('classification');
  expect(Number(afterRerun.analysis?.options?.mlArtifact?.createdAt || 0)).toBeGreaterThan(initialCreatedAt);
  await expect(page.getByTestId('analysis-report-section')).toContainText('Classification');
});
