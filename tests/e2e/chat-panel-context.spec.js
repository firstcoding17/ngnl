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
  return await page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
}

test.beforeAll(() => {
  if (!API_KEY) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run chat panel context tests.');
  }
});


test('chat panel shows dashboard/task/dataset context and live endpoint status', async ({ page }) => {
  await enterWorkspace(page);
  await createDashboard(page);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    return Array.isArray(dashboard?.tasks) && dashboard.tasks.length > 0;
  });

  const dashboard = await readDashboardDoc(page);
  const firstTask = dashboard.tasks[0];
  expect(firstTask).toBeTruthy();
  const firstAnalysis = firstTask.analyses?.[0] || null;

  const detailUrl = firstAnalysis
    ? `/dashboard/${dashboard.id}?mode=task-detail&taskId=${firstTask.id}&analysisId=${firstAnalysis.id}&tab=stat`
    : `/dashboard/${dashboard.id}?mode=task-detail&taskId=${firstTask.id}&tab=stat`;
  await page.goto(detailUrl);
  await page.locator('.detail-toggle').click();
  await page.getByTestId('assistant-chat-toggle').click();

  await expect(page.locator('.mcp-shell').getByText('Dashboard Chat Assistant', { exact: true })).toBeVisible();
  const context = page.getByTestId('assistant-context');
  await expect(context).toContainText(dashboard.title);
  await expect(context).toContainText(firstTask.title);
  await expect(context).toContainText('stats_groups');
  const summary = page.getByTestId('analysis-assistant-summary');
  await expect(summary).toContainText(firstTask.title);
  if (firstAnalysis) {
    await expect(summary).toContainText(firstAnalysis.title);
  }
  await expect(page.getByTestId('assistant-question-prompts').locator('button')).toHaveCount(6);
  await expect(page.getByTestId('assistant-runtime-status')).toBeVisible();

  const nextResponse = page.waitForResponse((response) => response.url().includes('/mcp/chat'));
  await page.getByTestId('assistant-question-prompts').getByRole('button', { name: /Recommend next analysis/i }).click();
  expect((await nextResponse).status()).toBe(200);
  await expect(page.locator('.message-card-title').filter({ hasText: 'Recommended next steps' }).last()).toBeVisible();
  await expect(page.locator('.message-card-title').filter({ hasText: 'Current selection' }).last()).toBeVisible();

  const runtimeResponse = page.waitForResponse((response) => response.url().includes('/mcp/chat'));
  await page.getByTestId('assistant-question-prompts').getByRole('button', { name: /Explain runtime status/i }).click();
  expect((await runtimeResponse).status()).toBe(200);

  await expect(page.getByTestId('assistant-runtime-status')).toContainText(/fallback|direct|warning|blocked/i);
  await expect(page.locator('.message-card-title').filter({ hasText: 'Runtime status' }).last()).toBeVisible();

  await page.getByTestId('assistant-chat-toggle').click();
  await expect(page.locator('.right-panel.open')).toHaveCount(0);
});
