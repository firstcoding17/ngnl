const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'image_manifest.csv');


async function enterWorkspace(page) {
  await page.goto('/key');
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  expect((await verifyResponse).status()).toBe(200);
}

async function createImageDashboard(page) {
  await page.goto('/dashboard/new?type=image');
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(CSV_FIXTURE);
  await expect(page.getByText('image_manifest / 2 cols / 4 rows')).toBeVisible();
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
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run image runtime tests.');
  }
});


test('image runtime stores preview/features artifacts and connects PCA + classification outputs', async ({ page }) => {
  await enterWorkspace(page);
  await createImageDashboard(page);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    return Array.isArray(dashboard?.tasks)
      && dashboard.tasks.some((item) => item.options?.imageFeatureArtifact?.kind === 'image-features');
  });

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    return dashboard?.tasks?.some((item) =>
      item.options?.mlArtifact?.kind === 'ml-unsupervised'
      && item.options?.mlArtifact?.request?.task === 'dim_reduction'
    );
  });

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const imageTask = dashboard?.tasks?.find((item) => item.type === 'image-analysis');
    return imageTask?.analyses?.some((analysis) =>
      analysis.method === 'classification-preview'
      && analysis.options?.mlArtifact?.kind === 'ml-model'
      && analysis.options?.mlArtifact?.request?.task === 'classification'
    );
  });

  const dashboard = await readDashboardDoc(page);
  const imageTask = dashboard.tasks.find((item) => item.type === 'image-analysis');
  expect(imageTask.options.imageFeatureArtifact.kind).toBe('image-features');
  expect(['direct', 'fallback']).toContain(imageTask.options.imageFeatureArtifact.availability);
  expect(imageTask.options.imageFeatureArtifact.result.featureCount).toBeGreaterThan(0);
  expect(imageTask.options.report?.type).toBeTruthy();

  const classificationAnalysis = imageTask.analyses.find((analysis) => analysis.method === 'classification-preview');
  expect(classificationAnalysis).toBeTruthy();
  expect(classificationAnalysis.options.imageFeatureArtifact.kind).toBe('image-features');
  expect(classificationAnalysis.options.mlArtifact.kind).toBe('ml-model');
  expect(classificationAnalysis.options.report?.type).toBe('classification');

  await page.goto(`/dashboard/${dashboard.id}?mode=task-detail&taskId=${imageTask.id}`);
  await expect(page.getByTestId('image-feature-artifact').first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('report');
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved image runtime result' }).first()).toBeVisible();
  await expect(page.getByTestId('ml-task-select')).toBeVisible();

  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="image-feature-artifact"]').first()).toBeVisible();

  await page.goto(`/dashboard/${dashboard.id}?mode=task-detail&taskId=${imageTask.id}&analysisId=${classificationAnalysis.id}`);
  await expect(page.getByTestId('analysis-report-section')).toContainText('Classification');
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved training result' }).first()).toBeVisible();
  await expect(page.locator('.artifact-panel').filter({ hasText: 'Saved image runtime result' }).first()).toBeVisible();
});
