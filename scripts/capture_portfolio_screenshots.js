const fs = require('fs/promises');
const path = require('path');
const { chromium, request } = require('@playwright/test');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'artifacts', 'portfolio');
const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || 'local-staging-test-key').trim();
const BASE_URL = String(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:44180').replace(/\/+$/, '');
const API_BASE = String(process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:45180').replace(/\/+$/, '');
const VIEWPORT = { width: 1600, height: 900 };

const FIXTURES = {
  stats: path.resolve(__dirname, '..', 'tests', 'e2e', 'fixtures', 'stats_groups.csv'),
  text: path.resolve(__dirname, '..', 'tests', 'e2e', 'fixtures', 'text_feedback.csv'),
};

const SHOTS = [
  {
    name: 'portfolio-main.png',
    description: 'Main landing page with both new-work cards and recent dashboard cards visible.',
  },
  {
    name: 'portfolio-dashboard-create.png',
    description: 'Dashboard creation flow with data type selection, upload result, and preprocessing recommendations visible.',
  },
  {
    name: 'portfolio-dashboard-home.png',
    description: 'Dashboard home with the left dataset list, central task cards, and the right detail panel open.',
  },
  {
    name: 'portfolio-stat-result.png',
    description: 'Statistics result view showing the correlation artifact together with the Stat panel.',
  },
  {
    name: 'portfolio-ml-result.png',
    description: 'Model result view with a classification artifact and the ML panel visible together.',
  },
  {
    name: 'portfolio-text-runtime.png',
    description: 'Text runtime view with the embedding feature artifact and downstream PCA flow visible.',
  },
];

function ensure(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.console.push(`[console:error] ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(`[pageerror] ${error?.stack || error?.message || String(error)}`);
  });

  page.on('requestfailed', (req) => {
    const failure = String(req.failure()?.errorText || '').trim();
    if (/ERR_ABORTED/i.test(failure)) return;
    if (/favicon\.ico/i.test(req.url())) return;
    diagnostics.requestFailures.push(`${req.method()} ${req.url()} :: ${failure || 'request failed'}`);
  });

  page.on('response', (response) => {
    if (response.status() >= 400 && !/favicon\.ico/i.test(response.url())) {
      diagnostics.badResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
}

async function resetBackend(apiContext) {
  const response = await apiContext.post(`${API_BASE}/__e2e__/reset`);
  if (!response.ok()) {
    throw new Error(`Failed to reset staging backend: ${response.status()} ${response.statusText()}`);
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/key`, { waitUntil: 'networkidle' });
  await page.getByTestId('api-key-input').fill(API_KEY);
  const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
  await page.getByTestId('api-key-submit').click();
  const response = await verifyResponse;
  if (response.status() !== 200) {
    throw new Error(`Auth verify failed during screenshot capture: ${response.status()}`);
  }
  await page.waitForLoadState('networkidle');
}

async function createDashboard(page, type, fixturePath, previewLabel) {
  await page.goto(`${BASE_URL}/dashboard/new?type=${type}`, { waitUntil: 'networkidle' });
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(fixturePath);
  await page.getByText(previewLabel, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
}

async function submitDashboard(page) {
  await page.getByTestId('dashboard-create-submit').click();
  await page.waitForURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
}

async function readCurrentDashboard(page) {
  const dashboard = await page.evaluate(() => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
  return ensure(dashboard, 'Current dashboard document was not found in localStorage.');
}

async function openRightPanel(page) {
  const panel = page.locator('.right-panel.open');
  if (await panel.count()) return;
  await page.locator('.detail-toggle').click();
  await page.locator('.right-panel.open').waitFor({ state: 'visible', timeout: 10000 });
}

async function capture(page, fileName) {
  const targetPath = path.join(OUTPUT_DIR, fileName);
  await page.screenshot({
    path: targetPath,
    type: 'png',
    animations: 'disabled',
  });
  return targetPath;
}

async function createClassificationTask(page, title) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').nth(2).click();
  const form = page.locator('.main-panel .form-grid').first();
  await page.getByTestId('task-title-input').fill(title);
  await form.locator('textarea').first().fill('Portfolio capture classification task.');
  await form.locator('select').nth(2).selectOption('segment');
  await form.locator('select[multiple]').selectOption(['group', 'score', 'spend']);
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await page.waitForURL(/mode=task-detail/, { timeout: 20000 });
}

async function waitForClassificationArtifact(page, title) {
  await page.waitForFunction((taskTitle) => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
    return task?.options?.mlArtifact?.kind === 'ml-model'
      && task?.options?.mlArtifact?.request?.task === 'classification';
  }, title);
  const dashboard = await readCurrentDashboard(page);
  return ensure(
    dashboard.tasks.find((item) => item.title === title),
    `Classification task "${title}" was not created.`
  );
}

async function createTextEmbeddingTask(page, title) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').first().click();
  await page.getByTestId('task-title-input').fill(title);
  await page.locator('.main-panel .form-grid textarea').first().fill('Portfolio capture text embedding task.');
  await page.getByTestId('task-text-column-select').selectOption('review');
  await page.getByTestId('task-text-method-select').selectOption('embedding');
  await page.getByTestId('task-text-target-select').selectOption('');
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await page.waitForURL(/mode=task-detail/, { timeout: 20000 });
}

async function waitForTextEmbeddingArtifact(page, title) {
  await page.waitForFunction((taskTitle) => {
    const raw = localStorage.getItem('ngnl_dashboards_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
    return task?.options?.textFeatureArtifact?.kind === 'text-features'
      && task?.options?.textFeatureArtifact?.request?.method === 'embedding'
      && task?.options?.mlArtifact?.kind === 'ml-unsupervised';
  }, title);
  const dashboard = await readCurrentDashboard(page);
  return ensure(
    dashboard.tasks.find((item) => item.title === title),
    `Text embedding task "${title}" was not created.`
  );
}

async function writeManifest(saved) {
  const lines = saved.map((item) => `${item.fileName} | ${item.description} | ${item.path}`);
  await fs.writeFile(path.join(OUTPUT_DIR, 'portfolio-screenshots.txt'), `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const diagnostics = {
    console: [],
    pageErrors: [],
    requestFailures: [],
    badResponses: [],
  };

  const apiContext = await request.newContext();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  attachDiagnostics(page, diagnostics);

  const saved = [];

  try {
    await resetBackend(apiContext);
    await login(page);

    await createDashboard(page, 'tabular', FIXTURES.stats, 'stats_groups / 4 cols / 6 rows');
    saved.push({
      fileName: SHOTS[1].name,
      description: SHOTS[1].description,
      path: await capture(page, SHOTS[1].name),
    });
    await submitDashboard(page);

    const tabularDashboard = await readCurrentDashboard(page);
    await openRightPanel(page);
    saved.push({
      fileName: SHOTS[2].name,
      description: SHOTS[2].description,
      path: await capture(page, SHOTS[2].name),
    });

    await page.waitForFunction(() => {
      const raw = localStorage.getItem('ngnl_dashboards_v1');
      const dashboards = JSON.parse(raw || '[]');
      const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
      const dashboard = dashboards.find((item) => item.id === dashboardId);
      return Array.isArray(dashboard?.tasks)
        && dashboard.tasks.some((task) => task?.options?.statArtifact?.kind === 'stat-corr');
    });

    const refreshedTabularDashboard = await readCurrentDashboard(page);
    const corrTask = ensure(
      refreshedTabularDashboard.tasks.find((task) => task?.options?.statArtifact?.kind === 'stat-corr'),
      'Correlation task was not available for portfolio capture.'
    );
    await page.goto(`${BASE_URL}/dashboard/${refreshedTabularDashboard.id}?mode=task-detail&taskId=${corrTask.id}&tab=stat`, { waitUntil: 'networkidle' });
    await openRightPanel(page);
    saved.push({
      fileName: SHOTS[3].name,
      description: SHOTS[3].description,
      path: await capture(page, SHOTS[3].name),
    });

    const classificationTitle = 'Portfolio Classification Result';
    await createClassificationTask(page, classificationTitle);
    const classificationTask = await waitForClassificationArtifact(page, classificationTitle);
    await page.goto(`${BASE_URL}/dashboard/${refreshedTabularDashboard.id}?mode=task-detail&taskId=${classificationTask.id}&tab=model`, { waitUntil: 'networkidle' });
    await openRightPanel(page);
    saved.push({
      fileName: SHOTS[4].name,
      description: SHOTS[4].description,
      path: await capture(page, SHOTS[4].name),
    });

    await createDashboard(page, 'text', FIXTURES.text, 'text_feedback / 2 cols / 4 rows');
    await submitDashboard(page);
    const textDashboard = await readCurrentDashboard(page);
    const textEmbeddingTitle = 'Portfolio Text Embedding';
    await createTextEmbeddingTask(page, textEmbeddingTitle);
    const textTask = await waitForTextEmbeddingArtifact(page, textEmbeddingTitle);
    await page.goto(`${BASE_URL}/dashboard/${textDashboard.id}?mode=task-detail&taskId=${textTask.id}&tab=model`, { waitUntil: 'networkidle' });
    await openRightPanel(page);
    saved.push({
      fileName: SHOTS[5].name,
      description: SHOTS[5].description,
      path: await capture(page, SHOTS[5].name),
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    saved.push({
      fileName: SHOTS[0].name,
      description: SHOTS[0].description,
      path: await capture(page, SHOTS[0].name),
    });

    if (diagnostics.console.length || diagnostics.pageErrors.length || diagnostics.requestFailures.length || diagnostics.badResponses.length) {
      const details = [
        ...diagnostics.console,
        ...diagnostics.pageErrors,
        ...diagnostics.requestFailures,
        ...diagnostics.badResponses,
      ].join('\n');
      throw new Error(`Console/network diagnostics were not clean during capture:\n${details}`);
    }

    await writeManifest(saved);
    console.log(`Saved ${saved.length} screenshots to ${OUTPUT_DIR}`);
    saved.forEach((item) => {
      console.log(`${item.fileName}: ${item.description}`);
    });
  } finally {
    await context.close();
    await browser.close();
    await apiContext.dispose();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
