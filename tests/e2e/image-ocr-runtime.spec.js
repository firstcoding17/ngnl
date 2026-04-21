const path = require('path');
const { test, expect } = require('./fixtures/test');

const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const CSV_FIXTURE = path.resolve(__dirname, 'fixtures', 'image_ocr_manifest.csv');

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
  await expect(page.getByText('image_ocr_manifest / 2 cols / 4 rows')).toBeVisible();
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
    throw new Error('PLAYWRIGHT_TEST_API_KEY is required to run OCR runtime tests.');
  }
});

test('image OCR runtime stores a dedicated artifact and feeds a follow-up text task', async ({ page }) => {
  await enterWorkspace(page);
  await createImageDashboard(page);

  const seededDashboard = await readDashboardDoc(page);
  const sourceDatasetId = seededDashboard?.datasetIds?.[0] || '';
  expect(sourceDatasetId).toBeTruthy();

  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByRole('button', { name: 'Image analysis' }).click();
  await page.getByTestId('task-title-input').fill('OCR Intake Review');
  await page.getByTestId('task-dataset-select').selectOption(sourceDatasetId);
  await page.getByTestId('task-preprocessing-select').selectOption('source');
  await page.getByTestId('task-image-column-select').selectOption('image_path');
  await page.getByTestId('task-image-method-select').selectOption('ocr');
  await page.getByTestId('task-image-target-select').selectOption('label');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'OCR Intake Review');
    return task?.options?.imageOcrArtifact?.kind === 'image-ocr'
      && task?.options?.imageOcrArtifact?.request?.textColumn === 'image_path_ocr_text'
      && task?.options?.report?.type === 'image-ocr';
  });

  await expect(page.getByTestId('image-ocr-artifact').first()).toBeVisible();
  await expect(page.getByTestId('analysis-report-section')).toContainText('OCR');

  const dashboard = await readDashboardDoc(page);
  const ocrTask = dashboard.tasks.find((item) => item.title === 'OCR Intake Review');
  expect(ocrTask).toBeTruthy();
  expect(ocrTask.options.imageOcrArtifact.kind).toBe('image-ocr');
  expect(ocrTask.options.imageOcrArtifact.availability).toBe('fallback');
  expect(ocrTask.options.imageOcrArtifact.derivedDatasetId).toBeTruthy();
  expect(ocrTask.options.report.type).toBe('image-ocr');

  if (await page.locator('.right-panel.open').count() === 0) {
    await page.locator('.detail-toggle').click();
  }
  await expect(page.locator('.right-panel [data-testid="image-ocr-artifact"]').first()).toBeVisible();
  await expect(page.locator('.right-panel [data-testid="analysis-report-card"]').first()).toBeVisible();

  await page.locator('.header-actions .btn-primary').first().click();
  await page.getByRole('button', { name: 'Text analysis' }).click();
  await page.getByTestId('task-title-input').fill('OCR Text Follow-up');
  await page.getByTestId('task-dataset-select').selectOption(ocrTask.options.imageOcrArtifact.derivedDatasetId);
  await page.getByTestId('task-text-column-select').selectOption('image_path_ocr_text');
  await page.getByTestId('task-text-method-select').selectOption('tfidf');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/mode=task-detail/);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === 'OCR Text Follow-up');
    return task?.options?.textFeatureArtifact?.kind === 'text-features'
      && task?.options?.textFeatureArtifact?.request?.textColumn === 'image_path_ocr_text';
  });

  await expect(page.getByTestId('text-feature-artifact').first()).toBeVisible();

  const nextDashboard = await readDashboardDoc(page);
  const textTask = nextDashboard.tasks.find((item) => item.title === 'OCR Text Follow-up');
  expect(textTask).toBeTruthy();
  expect(textTask.options.textFeatureArtifact.kind).toBe('text-features');
  expect(textTask.options.textFeatureArtifact.request.textColumn).toBe('image_path_ocr_text');
  expect(['text-features', 'pca', 'classification', 'regression']).toContain(textTask.options.report.type);
});
