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
  await expect(page.locator('.dashboard-view')).toBeVisible();
  await expect(page.locator('.header-actions .btn-primary')).toBeVisible({ timeout: 20000 });
}

async function readDashboardDoc(page) {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run Playwright edit flow tests.');
  }
});


test('task edit and analysis edit update the same entity instead of creating a new one', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);

  const beforeTaskCreate = await readDashboardDoc(page);
  const initialTaskCount = beforeTaskCreate?.tasks?.length || 0;

  await page.locator('.header-actions .btn-primary').first().click();
  const taskForm = page.locator('.main-panel .form-grid').first();
  await taskForm.locator('input[type="text"]').first().fill('Edit Flow Task');
  await taskForm.locator('textarea').first().fill('Task created for edit verification.');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  const afterTaskCreate = await readDashboardDoc(page);
  expect(afterTaskCreate.tasks).toHaveLength(initialTaskCount + 1);
  const createdTask = afterTaskCreate.tasks.find((task) => task.title === 'Edit Flow Task');
  expect(createdTask).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`taskId=${createdTask.id}`));

  await page.locator('.panel-actions button').first().click();
  await taskForm.locator('input[type="text"]').first().fill('Edit Flow Task Updated');
  await taskForm.locator('textarea').first().fill('Task updated in place.');
  await page.getByRole('button', { name: 'Save Task' }).click();
  await expect(page).toHaveURL(new RegExp(`mode=task-detail.*taskId=${createdTask.id}|taskId=${createdTask.id}.*mode=task-detail`));

  const afterTaskEdit = await readDashboardDoc(page);
  expect(afterTaskEdit.tasks).toHaveLength(initialTaskCount + 1);
  const updatedTask = afterTaskEdit.tasks.find((task) => task.id === createdTask.id);
  expect(updatedTask?.title).toBe('Edit Flow Task Updated');
  expect(updatedTask?.description).toContain('updated in place');

  await page.locator('.panel-actions button').nth(1).click();
  const analysisForm = page.locator('.main-panel .form-grid').first();
  await analysisForm.locator('input[type="text"]').first().fill('Edit Flow Analysis');
  await analysisForm.locator('textarea').first().fill('Analysis created for edit verification.');
  await page.getByRole('button', { name: 'Add Analysis' }).click();
  await expect(page).toHaveURL(/analysisId=/);

  const afterAnalysisCreate = await readDashboardDoc(page);
  const createdTaskAfterAnalysis = afterAnalysisCreate.tasks.find((task) => task.id === createdTask.id);
  expect(createdTaskAfterAnalysis?.analyses || []).toHaveLength(1);
  const createdAnalysis = createdTaskAfterAnalysis.analyses.find((analysis) => analysis.title === 'Edit Flow Analysis');
  expect(createdAnalysis).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`analysisId=${createdAnalysis.id}`));

  await page.locator('.analysis-card__actions').getByRole('button', { name: 'Edit', exact: true }).click();
  await analysisForm.locator('input[type="text"]').first().fill('Edit Flow Analysis Updated');
  await analysisForm.locator('textarea').first().fill('Analysis updated in place.');
  await page.getByRole('button', { name: 'Save Analysis' }).click();
  await expect(page).toHaveURL(new RegExp(`analysisId=${createdAnalysis.id}`));

  const afterAnalysisEdit = await readDashboardDoc(page);
  const updatedTaskAfterAnalysis = afterAnalysisEdit.tasks.find((task) => task.id === createdTask.id);
  expect(updatedTaskAfterAnalysis?.analyses || []).toHaveLength(1);
  const updatedAnalysis = updatedTaskAfterAnalysis.analyses.find((analysis) => analysis.id === createdAnalysis.id);
  expect(updatedAnalysis?.title).toBe('Edit Flow Analysis Updated');
  expect(updatedAnalysis?.description).toContain('updated in place');
});
