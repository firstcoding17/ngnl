const fs = require('fs/promises');
const path = require('path');
const { chromium, request } = require('@playwright/test');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'artifacts', 'portfolio');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'portfolio-data-graph.png');
const API_KEY = String(process.env.PLAYWRIGHT_TEST_API_KEY || 'local-staging-test-key').trim();
const BASE_URL = String(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:44180').replace(/\/+$/, '');
const API_BASE = String(process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:45180').replace(/\/+$/, '');
const VIEWPORT = { width: 1600, height: 900 };
const CSV_FIXTURE = path.resolve(__dirname, '..', 'tests', 'e2e', 'fixtures', 'abb.csv');

function ensure(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.console.push(message.text());
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error?.stack || error?.message || String(error));
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
    throw new Error(`Auth verify failed during graph capture: ${response.status()}`);
  }
  await page.waitForLoadState('networkidle');
}

async function uploadFixture(page) {
  await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'networkidle' });
  await page.getByTestId('workspace-file-input').setInputFiles(CSV_FIXTURE);
  await page.getByTestId('workspace-log').getByText('Dataset loaded (file): 4 rows, 2 cols.').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('workspace-row-count').getByText('Rows 4').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('workspace-col-count').getByText('Cols 2').waitFor({ state: 'visible', timeout: 15000 });
}

async function renderServerGraph(page) {
  await page.getByText('Use server aggregation').scrollIntoViewIfNeeded();
  await ensure(page.locator('.js-plotly-plot').first(), 'Plotly chart container was not found.');
  const aggregateResponse = page.waitForResponse((response) => response.url().includes('/viz/aggregate'));
  await page.getByLabel('Use server aggregation').check();
  const response = await aggregateResponse;
  if (response.status() !== 200) {
    throw new Error(`Server aggregation failed during graph capture: ${response.status()}`);
  }
  await page.locator('.js-plotly-plot').first().waitFor({ state: 'visible', timeout: 15000 });
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

  try {
    await resetBackend(apiContext);
    await login(page);
    await uploadFixture(page);
    await renderServerGraph(page);
    await page.screenshot({
      path: OUTPUT_FILE,
      type: 'png',
      animations: 'disabled',
    });

    if (diagnostics.console.length || diagnostics.pageErrors.length || diagnostics.requestFailures.length || diagnostics.badResponses.length) {
      const details = [
        ...diagnostics.console,
        ...diagnostics.pageErrors,
        ...diagnostics.requestFailures,
        ...diagnostics.badResponses,
      ].join('\n');
      throw new Error(`Console/network diagnostics were not clean during graph capture:\n${details}`);
    }

    console.log(`Saved graph screenshot to ${OUTPUT_FILE}`);
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
