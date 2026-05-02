const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('@playwright/test');
const Papa = require('papaparse');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const DATASET_MANIFEST_PATH = path.join(FRONTEND_DIR, 'docs', 'user-guide', 'datasets', 'dataset_manifest.json');
const OUTPUT_DIR = process.env.NGNL_CAPTURE_OUTPUT_DIR
  ? path.resolve(process.env.NGNL_CAPTURE_OUTPUT_DIR)
  : path.join(FRONTEND_DIR, 'docs', 'user-guide', 'screenshots');
const RUN_LOG_PATH = process.env.NGNL_CAPTURE_RESULTS_PATH
  ? path.resolve(process.env.NGNL_CAPTURE_RESULTS_PATH)
  : path.join(FRONTEND_DIR, 'docs', 'user-guide', 'capture_results.json');

const BASE_URL = String(process.env.NGNL_CAPTURE_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://43.203.72.134').replace(/\/+$/, '');
const API_KEY = String(process.env.NGNL_CAPTURE_API_KEY || process.env.PLAYWRIGHT_TEST_API_KEY || '').trim();
const VIEWPORT = { width: 1600, height: 1200 };

const OIL_PROMPT = `?´ë? ?ìœ  ?´ìŠˆê°€ ê¸€ë¡œë²Œ ê²½ì œ?€ ?°ì—…??ë¯¸ì¹˜???Œê¸‰?¨ê³¼ë¥?ë³µí•©?ìœ¼ë¡?ë¶„ì„?´ì¤˜.

ë¶„ì„ ëª©ì :
? ë¢°???’ì? ê³µê°œ ?°ì´?°ì? ?œìž¥ ?°ì´?°ë? ê¸°ë°˜?¼ë¡œ, ?ìœ  ê°€ê²?ê¸‰ë“±/ê³µê¸‰ ì°¨ì§ˆ/?¸ë¥´ë¬´ì¦ˆ ?´í˜‘ ë¦¬ìŠ¤?¬ê? ?¸ê³„ ê²½ì œ?€ ?œêµ­ ê²½ì œ???´ë–¤ ?í–¥??ì¤????ˆëŠ”ì§€ ë¶„ì„?œë‹¤.

ë¶„ì„ ì¶?
1. Brent/WTI ê°€ê²?ì¶”ì„¸?€ ë³€?™ë¥ 
2. ?´ë? ?ìœ  ?˜ì¶œê³?ê³µê¸‰ ì°¨ì§ˆ
3. ?¸ë¥´ë¬´ì¦ˆ ?´í˜‘ ?µí–‰ ë¦¬ìŠ¤??4. OPEC+ ë°?ì£¼ìš” ?°ìœ êµ?ê³µê¸‰ ?€??5. ì¤‘êµ­, ?¸ë„, ë¯¸êµ­, ? ëŸ½???˜ìš” ë³€??6. ??³µ, ?´ìš´, ?•ìœ , ?ìœ ?”í•™, ?œì¡°???í–¥
7. ?¸í”Œ?ˆì´?? ?˜ìœ¨, ê¸ˆë¦¬, ê²½ê¸° ?”í™” ê°€?¥ì„±
8. ?´ìŠ¤ ?ìŠ¤??ê¸°ë°˜ ì£¼ìš” ?¤ì›Œ?œì? ?„í—˜ ? í˜¸
9. ?œêµ­ ê²½ì œ??ë¯¸ì¹  ???ˆëŠ” ?í–¥
10. ?žìœ¼ë¡?ê´€ì°°í•´????ì§€??
ê²°ê³¼ ?•ì‹:
- ?µì‹¬ ?”ì•½ 5ì¤?- ê°€ê²?ì¶”ì„¸ ê·¸ëž˜??- ê³µê¸‰ë§?ë¦¬ìŠ¤????- ?°ì—…ë³??í–¥ ??- ?œêµ­ ê²½ì œ ?í–¥ ?”ì•½
- ?œë‚˜ë¦¬ì˜¤ ë¶„ì„: ?„í™” / ?¥ê¸°??/ ?•ì „
- ê´€ì°?ì§€??checklist
- ?¬ìš©???°ì´??ì¶œì²˜?€ ? ë¢°??- ë¶„ì„???œê³„?€ ì¶”ê?ë¡??„ìš”???°ì´??;

const OIL_PROMPT_OVERRIDE = `Iran oil shock: analyze the global spillover effects across prices, supply risk, industry, and Korea.

Analysis goals:
- Use public market and macro data to explain how oil price spikes, export disruptions, and Hormuz Strait risk could affect the global and Korean economies.

Analysis axes:
1. Brent and WTI price trend and volatility
2. Iran oil exports and supply disruption risk
3. Hormuz Strait shipping risk
4. OPEC+ and major producer response
5. Demand shifts in China, India, the US, and Europe
6. Impact on aviation, shipping, refining, petrochemicals, and manufacturing
7. Inflation, FX, rates, and slowdown risk
8. News-text keywords and warning signals
9. Potential impact on Korea
10. What indicators to watch next

Output format:
- Five-line executive summary
- Price trend chart
- Supply-risk table
- Industry impact table
- Korea impact summary
- Scenario analysis: easing / prolonged / escalation
- Watchlist checklist
- Data sources and confidence
- Limits and additional data needed`;

function ensureValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function datasetSummary(meta, override = {}) {
  const rows = override.rows ?? meta?.rows ?? meta?.price_long_rows ?? meta?.price_rows ?? 0;
  const columns = override.columns ?? meta?.columns?.length ?? 0;
  const filePath =
    override.path
    || meta?.path
    || meta?.prices_long_path
    || meta?.prices_path
    || meta?.news_daily_path
    || meta?.sources_path
    || '';
  const base = path.basename(filePath, path.extname(filePath));
  return `${base} / ${columns} cols / ${rows} rows`;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'capture';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForNetworkIdle(page) {
  await page.waitForLoadState('networkidle');
}

async function readCsvShape(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = Papa.parse(raw, {
    header: true,
    skipEmptyLines: 'greedy',
  });
  const rows = Array.isArray(parsed.data) ? parsed.data.length : 0;
  const columns = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields.length : 0;
  return { rows, columns };
}

async function writeRunLog(runLog) {
  await fs.writeFile(RUN_LOG_PATH, `${JSON.stringify(runLog, null, 2)}\n`, 'utf8');
}

async function capturePage(page, fileName, runLog, meta = {}) {
  const targetPath = path.join(OUTPUT_DIR, fileName);
  await page.screenshot({
    path: targetPath,
    animations: 'disabled',
    caret: 'hide',
  });
  runLog.captured.push({
    fileName,
    path: targetPath,
    kind: 'page',
    ...meta,
  });
  await writeRunLog(runLog);
  return targetPath;
}

async function captureLocator(page, locator, fileName, runLog, meta = {}) {
  const targetPath = path.join(OUTPUT_DIR, fileName);
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({
    path: targetPath,
    animations: 'disabled',
    caret: 'hide',
  });
  runLog.captured.push({
    fileName,
    path: targetPath,
    kind: 'locator',
    ...meta,
  });
  await writeRunLog(runLog);
  return targetPath;
}

async function captureFailure(page, stage, error, runLog) {
  const fileName = `error_${slugify(stage)}.png`;
  const targetPath = path.join(OUTPUT_DIR, fileName);
  try {
    await page.screenshot({
      path: targetPath,
      animations: 'disabled',
      caret: 'hide',
    });
  } catch {
    // Ignore follow-up screenshot errors; the original failure is the one we care about.
  }
  runLog.failures.push({
    stage,
    fileName,
    path: targetPath,
    error: String(error?.stack || error?.message || error),
  });
  await writeRunLog(runLog);
}

async function createContext(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      // We capture failures explicitly; console noise alone should not stop the run.
    }
  });
  return { context, page };
}

async function login(page, runLog, { captureCommonKey = false } = {}) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await page.goto(`${BASE_URL}/key`, { waitUntil: 'networkidle', timeout: 60_000 });
    if (captureCommonKey && attempt === 1) {
      await captureLocator(page, page.locator('.key-card'), 'common_01_api_key.png', runLog, {
        scenario: 'common',
        purpose: 'API key gate before entry',
        note: 'API key value intentionally omitted from the stored screenshot.',
      });
    }
    await page.getByTestId('api-key-input').fill(API_KEY);
    const verifyResponse = page.waitForResponse((response) => response.url().includes('/auth/verify'));
    await page.getByTestId('api-key-submit').click();
    const response = await verifyResponse;
    if (response.status() === 200) {
      await waitForNetworkIdle(page);
      return;
    }
    if (response.status() === 409 && attempt < 6) {
      await page.waitForTimeout(60_000);
      continue;
    }
    throw new Error(`API key verification failed with status ${response.status()}`);
  }
}

async function logout(page) {
  const button = page.getByRole('button', { name: 'Logout', exact: true });
  if (!await button.isVisible().catch(() => false)) {
    return;
  }
  const responsePromise = page.waitForResponse((response) => response.url().includes('/auth/logout')).catch(() => null);
  await button.click();
  await responsePromise;
  await page.waitForURL(/\/key(?:[/?#]|$)/, { timeout: 20_000 }).catch(() => {});
}

function dashboardIdFromUrl(page) {
  const match = page.url().match(/\/dashboard\/([^/?#]+)/);
  return ensureValue(match?.[1], `Dashboard id could not be read from URL: ${page.url()}`);
}

async function readCurrentDashboard(page) {
  const dashboard = await page.evaluate(() => {
    const raw = localStorage.getItem('[REDACTED]_v1');
    const dashboards = JSON.parse(raw || '[]');
    const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
    return dashboards.find((item) => item.id === dashboardId) || null;
  });
  return ensureValue(dashboard, 'Current dashboard document was not found in localStorage.');
}

async function createDashboard(page, options) {
  const {
    type,
    filePath,
    summaryText,
    captureBeforeSubmit,
    linkedFilePath,
    linkedSummaryText,
    primaryKey,
    linkedKey,
    attachDashboardId,
  } = options;
  const params = new URLSearchParams({ type });
  if (attachDashboardId) {
    params.set('dashboardId', attachDashboardId);
  }
  await page.goto(`${BASE_URL}/dashboard/new?${params.toString()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.getByTestId('dashboard-create-primary-file').waitFor({ state: 'attached', timeout: 30_000 });
  await page.getByTestId('dashboard-create-primary-file').setInputFiles(filePath);
  await page.getByText(summaryText, { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });

  if (linkedFilePath) {
    await page.getByTestId('dashboard-create-linked-file').setInputFiles(linkedFilePath);
    if (linkedSummaryText) {
      await page.getByText(linkedSummaryText, { exact: false }).waitFor({ state: 'visible', timeout: 30_000 });
    }
    if (primaryKey) {
      await page.getByLabel('Primary key').selectOption(primaryKey);
    }
    if (linkedKey) {
      await page.getByLabel('Linked key').selectOption(linkedKey);
    }
  }

  if (captureBeforeSubmit) {
    await captureBeforeSubmit();
  }

  await page.getByTestId('dashboard-create-submit').click();
  await page.waitForURL(/\/dashboard\/(?!new(?:[/?#]|$))[^/?#]+(?:\?.*)?$/, { timeout: 30_000 });
  await waitForNetworkIdle(page);
  return dashboardIdFromUrl(page);
}

async function attachDataset(page, dashboardId, type, filePath, summaryText) {
  await createDashboard(page, {
    type,
    filePath,
    summaryText,
    attachDashboardId: dashboardId,
  });
}

async function activateTab(page, label) {
  const button = page.locator('.catalog-tabs').getByRole('button', { name: label, exact: true });
  await button.click();
  await waitForNetworkIdle(page);
}

async function waitForPlotly(graphPanel) {
  await graphPanel.locator('.js-plotly-plot').waitFor({ state: 'visible', timeout: 20_000 });
}

async function findGraphPanel(page) {
  const titleInput = page.locator('.main-panel input[placeholder="Title"]').first();
  await titleInput.waitFor({ state: 'visible', timeout: 30_000 });
  return titleInput.locator('xpath=ancestor::div[contains(@class, "space-y-3")]').first();
}

async function configureGraphPanel(graphPanel, options) {
  const {
    category,
    type,
    x,
    y,
    hue = '',
    palette = 'default',
    agg = '',
  } = options;
  const selects = graphPanel.locator('select');
  if (category) await selects.nth(0).selectOption(category);
  if (type) await selects.nth(1).selectOption(type);
  if (x !== undefined) await selects.nth(2).selectOption(x);
  if (y !== undefined) await selects.nth(3).selectOption(y);
  if (hue !== undefined) await selects.nth(4).selectOption(hue);
  const count = await selects.count();
  for (let index = 0; index < count; index += 1) {
    const optionValues = await selects.nth(index).locator('option').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value') || ''));
    if (optionValues.includes('default') && optionValues.includes('pastel') && optionValues.includes('vivid')) {
      await selects.nth(index).selectOption(palette);
      break;
    }
  }
  if (agg) {
    for (let index = 0; index < count; index += 1) {
      const optionValues = await selects.nth(index).locator('option').allTextContents();
      if (optionValues.includes('count') && optionValues.includes('sum') && optionValues.includes('mean')) {
        await selects.nth(index).selectOption(agg);
        break;
      }
    }
  }
  await waitForPlotly(graphPanel);
}

async function runTitanicStats(page) {
  const statPanels = page.locator('.stat-panels');
  await statPanels.scrollIntoViewIfNeeded();
  const responsePromise = page.waitForResponse((response) => response.url().includes('/stat/run'));
  await statPanels.getByRole('button', { name: 'Generate Report', exact: true }).first().click();
  await responsePromise;
  await statPanels.locator('table').first().waitFor({ state: 'visible', timeout: 30_000 });
  return statPanels;
}

async function runMlPanel(page, options) {
  const {
    task = 'classification',
    model = '',
    target,
    features,
  } = options;
  const mlPanel = page.locator('.main-panel .panel-card').last();
  await mlPanel.getByTestId('ml-task-select').selectOption(task);
  if (model) {
    await mlPanel.getByTestId('ml-model-select').selectOption(model);
  }
  const targetSelect = mlPanel.locator('label').filter({ hasText: 'Target' }).locator('select').first();
  await targetSelect.selectOption(target);
  await mlPanel.getByTestId('ml-feature-select').selectOption(features);
  await mlPanel.getByTestId('ml-train-button').click();
  await Promise.race([
    mlPanel.locator('.metric-grid').waitFor({ state: 'visible', timeout: 60_000 }),
    (async () => {
      const errorBlock = mlPanel.locator('.state.error').first();
      await errorBlock.waitFor({ state: 'visible', timeout: 60_000 });
      throw new Error(`ML panel error: ${String(await errorBlock.textContent() || 'unknown error').trim()}`);
    })(),
  ]);
  return mlPanel;
}

async function openTaskCreate(page, templateLabel) {
  await page.locator('.header-actions .btn-primary').first().click();
  await page.locator('.template-grid .template-card').filter({ hasText: templateLabel }).first().click();
  await page.locator('.main-panel .form-grid').first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function openRightPanel(page) {
  const panel = page.locator('.right-panel.open');
  if (await panel.count()) {
    return panel;
  }
  await page.locator('.detail-toggle').click();
  await page.locator('.right-panel.open').waitFor({ state: 'visible', timeout: 10_000 });
  return page.locator('.right-panel.open');
}

async function waitForTaskArtifact(page, title, predicateBody) {
  await page.waitForFunction(
    ({ taskTitle, predicateBodyText }) => {
      const predicate = new Function('task', predicateBodyText);
      const raw = localStorage.getItem('[REDACTED]_v1');
      const dashboards = JSON.parse(raw || '[]');
      const dashboardId = window.location.pathname.split('/').filter(Boolean).pop();
      const dashboard = dashboards.find((item) => item.id === dashboardId);
      const task = dashboard?.tasks?.find((item) => item.title === taskTitle);
      return !!task && predicate(task);
    },
    { taskTitle: title, predicateBodyText: predicateBody },
    { timeout: 60_000 }
  );
}

async function waitForCurrentTaskImageArtifact(page, title) {
  const artifact = page.getByTestId('image-feature-artifact').first();
  await artifact.waitFor({ state: 'visible', timeout: 90_000 });
}

async function waitForCurrentTaskTextArtifact(page, title, method, { expectMl = false } = {}) {
  const artifact = page.getByTestId('text-feature-artifact').first();
  await artifact.waitFor({ state: 'visible', timeout: 90_000 });
  if (!expectMl) {
    return;
  }
  await page.locator('.ml-artifact-card').first().waitFor({ state: 'visible', timeout: 90_000 });
}

async function createTextTask(page, config) {
  const {
    title,
    datasetLabel,
    preprocessingMode = 'reuse',
    textColumn,
    method,
    targetColumn = '',
    captureColumnSelect = null,
    captureRuntimeSelect = null,
  } = config;

  await openTaskCreate(page, 'Text analysis');
  await page.getByTestId('task-title-input').fill(title);
  await page.getByTestId('task-preprocessing-select').selectOption(preprocessingMode);
  if (datasetLabel) {
    await page.getByTestId('task-dataset-select').selectOption({ label: datasetLabel });
  }
  await page.getByTestId('task-text-column-select').selectOption(textColumn);
  if (captureColumnSelect) {
    await captureColumnSelect();
  }
  await page.getByTestId('task-text-method-select').selectOption(method);
  await page.getByTestId('task-text-target-select').selectOption(targetColumn);
  if (captureRuntimeSelect) {
    await captureRuntimeSelect();
  }
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await page.waitForURL(/mode=task-detail/, { timeout: 30_000 });
  await waitForNetworkIdle(page);
}

async function createImageTask(page, config) {
  const {
    title,
    datasetLabel,
    preprocessingMode = 'reuse',
    imageColumn,
    method,
    targetColumn = '',
    captureSetting = null,
  } = config;

  await openTaskCreate(page, 'Image analysis');
  await page.getByTestId('task-title-input').fill(title);
  await page.getByTestId('task-preprocessing-select').selectOption(preprocessingMode);
  if (datasetLabel) {
    await page.getByTestId('task-dataset-select').selectOption({ label: datasetLabel });
  }
  await page.getByTestId('task-image-column-select').selectOption(imageColumn);
  await page.getByTestId('task-image-method-select').selectOption(method);
  await page.getByTestId('task-image-target-select').selectOption(targetColumn);
  if (captureSetting) {
    await captureSetting();
  }
  await page.locator('.main-panel').getByRole('button', { name: 'Create Task', exact: true }).click();
  await page.waitForURL(/mode=task-detail/, { timeout: 30_000 });
  await waitForNetworkIdle(page);
}

async function switchDataset(page, datasetName) {
  const datasetButton = page.locator('.left-panel .resource-item').filter({
    has: page.locator('strong', { hasText: new RegExp(`^${escapeRegex(datasetName)}$`) }),
  }).first();
  await datasetButton.click();
  await waitForNetworkIdle(page);
}

async function captureOptionalMlArtifact(page, fileName, runLog, meta = {}) {
  const mlCard = page.locator('.ml-artifact-card').first();
  try {
    await mlCard.waitFor({ state: 'visible', timeout: 30_000 });
    await captureLocator(page, mlCard, fileName, runLog, meta);
    return true;
  } catch {
    return false;
  }
}

async function sendMcpPrompt(page, prompt) {
  const panel = await openRightPanel(page);
  await panel.getByTestId('assistant-mcp-toggle').click();
  const mcpShell = page.locator('.mcp-shell');
  await mcpShell.waitFor({ state: 'visible', timeout: 10_000 });
  const composer = mcpShell.locator('.composer textarea');
  await composer.fill(prompt);
  return { panel, mcpShell, composer };
}

async function submitMcpPrompt(page) {
  const mcpShell = page.locator('.mcp-shell');
  const responsePromise = page.waitForResponse((response) => response.url().includes('/mcp/chat'));
  await mcpShell.locator('.composer button').click();
  await responsePromise;
  await mcpShell.locator('.chat-log .message.assistant').last().waitFor({ state: 'visible', timeout: 60_000 });
  return mcpShell;
}

async function titanicScenario(page, manifest, runLog) {
  try {
    const titanicMeta = manifest.datasets.titanic;
    const titanicFile = titanicMeta.path;
    const titanicSummary = datasetSummary(titanicMeta);
    const rawDatasetName = path.basename(titanicFile, path.extname(titanicFile));
    const preparedDatasetName = `${rawDatasetName} - prepared`;

    await createDashboard(page, {
      type: 'tabular',
      filePath: titanicFile,
      summaryText: titanicSummary,
      captureBeforeSubmit: async () => {
        await capturePage(page, 'titanic_01_upload.png', runLog, {
          scenario: 'titanic',
          purpose: 'Upload wizard with Titanic subset selected',
        });
      },
    });

    await activateTab(page, 'File');
    await capturePage(page, 'common_02_main_screen.png', runLog, {
      scenario: 'common',
      purpose: 'Authenticated workspace with main analysis tabs',
      note: 'Current deployed UI uses a dashboard workspace instead of a separate home menu.',
    });
    await switchDataset(page, rawDatasetName);
    await captureLocator(page, page.locator('.main-panel .panel-card').last(), 'titanic_02_table_preview.png', runLog, {
      scenario: 'titanic',
      purpose: 'Titanic table preview in File tab',
    });

    await switchDataset(page, rawDatasetName);
    await activateTab(page, 'Graph');
    const graphPanel = await findGraphPanel(page);
    await configureGraphPanel(graphPanel, {
      category: 'comparison',
      type: 'bar',
      x: 'Sex',
      y: 'Survived',
      hue: '',
      palette: 'default',
      agg: 'mean',
    });
    await captureLocator(page, graphPanel, 'titanic_03_graph_setting.png', runLog, {
      scenario: 'titanic',
      purpose: 'Graph controls configured for mean survival by sex',
      note: 'The current Graph tab updates automatically and does not use a separate Generate button.',
    });
    await captureLocator(page, graphPanel.locator('.js-plotly-plot'), 'titanic_04_graph_result.png', runLog, {
      scenario: 'titanic',
      purpose: 'Rendered survival-rate bar chart by sex',
    });

    await switchDataset(page, rawDatasetName);
    await activateTab(page, 'Stat');
    const testsPanel = await runTitanicStats(page);
    await captureLocator(page, testsPanel, 'titanic_05_stat_result.png', runLog, {
      scenario: 'titanic',
      purpose: 'Summary statistics report generated from the Titanic subset',
      note: 'The current deployed UI surfaced descriptive statistics more reliably than the requested chi-square preset.',
    });

    try {
      await switchDataset(page, preparedDatasetName);
      await activateTab(page, 'Model');
      const mlPanel = await runMlPanel(page, {
        task: 'classification',
        target: 'Survived',
        features: ['Pclass', 'Age', 'Fare', 'Embarked__S', 'Embarked__Q', 'Embarked__C'],
      });
      await captureLocator(page, mlPanel, 'titanic_06_ml_result.png', runLog, {
        scenario: 'titanic',
        purpose: 'Classification model result for Survived target',
      });
    } catch (error) {
      await captureFailure(page, 'titanic_ml_optional', error, runLog);
    }
  } catch (error) {
    await captureFailure(page, 'titanic_scenario', error, runLog);
  }
}

async function imdbScenario(page, manifest, runLog) {
  try {
    const imdbMeta = manifest.datasets.imdb;
    const imdbDatasetName = path.basename(imdbMeta.path, path.extname(imdbMeta.path));
    await createDashboard(page, {
      type: 'text',
      filePath: imdbMeta.path,
      summaryText: datasetSummary(imdbMeta),
    });

    await activateTab(page, 'File');
    await captureLocator(page, page.locator('.main-panel .panel-card').last(), 'imdb_01_table_preview.png', runLog, {
      scenario: 'imdb',
      purpose: 'IMDb text dataset preview',
    });

    const taskTitle = 'IMDb Sentiment Runtime';
    await createTextTask(page, {
      title: taskTitle,
      datasetLabel: imdbDatasetName,
      preprocessingMode: 'source',
      textColumn: 'review_text',
      method: 'semantic',
      targetColumn: 'label',
      captureColumnSelect: async () => {
        await captureLocator(page, page.locator('.main-panel .panel-card').first(), 'imdb_02_text_column_select.png', runLog, {
          scenario: 'imdb',
          purpose: 'Text task editor with review_text selected',
        });
      },
      captureRuntimeSelect: async () => {
        await captureLocator(page, page.locator('.main-panel .panel-card').first(), 'imdb_03_text_runtime.png', runLog, {
          scenario: 'imdb',
          purpose: 'Text runtime method selected before task creation',
        });
      },
    });
    await waitForCurrentTaskTextArtifact(page, taskTitle, 'semantic', { expectMl: true });
    await captureLocator(page, page.getByTestId('text-feature-artifact').first(), 'imdb_04_text_result.png', runLog, {
      scenario: 'imdb',
      purpose: 'Saved semantic text feature artifact',
    });
    await captureLocator(page, page.locator('.dashboard-view'), 'imdb_05_classification_result.png', runLog, {
      scenario: 'imdb',
      purpose: 'Downstream text classification result with the saved feature artifact and classification report',
    });
  } catch (error) {
    await captureFailure(page, 'imdb_scenario', error, runLog);
  }
}

async function catsDogsScenario(page, manifest, runLog) {
  try {
    const imageMeta = manifest.datasets.cats_dogs;
    const imageDatasetName = path.basename(imageMeta.path, path.extname(imageMeta.path));
    await createDashboard(page, {
      type: 'image',
      filePath: imageMeta.path,
      summaryText: datasetSummary(imageMeta),
      captureBeforeSubmit: async () => {
        await capturePage(page, 'catsdogs_01_upload.png', runLog, {
          scenario: 'catsdogs',
          purpose: 'Image manifest upload screen with selected subset',
        });
      },
    });

    const taskTitle = 'Cats vs Dogs Image Runtime';
    await createImageTask(page, {
      title: taskTitle,
      datasetLabel: imageDatasetName,
      preprocessingMode: 'source',
      imageColumn: 'image_path',
      method: 'features',
      targetColumn: 'label',
      captureSetting: async () => {
        await captureLocator(page, page.locator('.main-panel .panel-card').first(), 'catsdogs_03_analysis_setting.png', runLog, {
          scenario: 'catsdogs',
          purpose: 'Image task editor with image column and label selected',
        });
      },
    });

    await waitForCurrentTaskImageArtifact(page, taskTitle);
    const imageArtifact = page.getByTestId('image-feature-artifact').first();
    const imageArtifactText = String(await imageArtifact.textContent().catch(() => '') || '');

    await captureLocator(page, imageArtifact, 'catsdogs_02_preview.png', runLog, {
      scenario: 'catsdogs',
      purpose: 'Image preview thumbnails and label summary',
    });

    if (/blocked|failed/i.test(imageArtifactText)) {
      await capturePage(page, 'catsdogs_05_limitations.png', runLog, {
        scenario: 'catsdogs',
        purpose: 'Blocked image runtime or limitations message',
      });
      return;
    }

    const hasMlArtifact = await captureOptionalMlArtifact(page, 'catsdogs_04_result.png', runLog, {
      scenario: 'catsdogs',
      purpose: 'Image-derived classification result',
    });

    if (!hasMlArtifact) {
      await capturePage(page, 'catsdogs_05_limitations.png', runLog, {
        scenario: 'catsdogs',
        purpose: 'Image feature runtime completed, but no downstream classifier result was produced in the deployed UI.',
      });
    }
  } catch (error) {
    await captureFailure(page, 'catsdogs_scenario', error, runLog);
  }
}

async function ecommerceScenario(page, manifest, runLog) {
  try {
    const womensMeta = manifest.datasets.womens;
    const womensDatasetName = path.basename(womensMeta.path, path.extname(womensMeta.path));
    await createDashboard(page, {
      type: 'multimodal',
      filePath: womensMeta.path,
      summaryText: datasetSummary(womensMeta),
    });

    await activateTab(page, 'File');
    await captureLocator(page, page.locator('.main-panel .panel-card').last(), 'ecommerce_01_table_preview.png', runLog, {
      scenario: 'ecommerce',
      purpose: 'Mixed structured/text clothing review dataset preview',
    });

    await activateTab(page, 'Graph');
    const graphPanel = await findGraphPanel(page);
    await configureGraphPanel(graphPanel, {
      category: 'comparison',
      type: 'bar',
      x: 'Department Name',
      y: 'Rating',
      hue: '',
      palette: 'default',
      agg: 'mean',
    });
    await captureLocator(page, graphPanel, 'ecommerce_02_structured_graph.png', runLog, {
      scenario: 'ecommerce',
      purpose: 'Structured graph for mean rating by department',
    });

    const taskTitle = 'E-Commerce Review Sentiment';
    await createTextTask(page, {
      title: taskTitle,
      datasetLabel: womensDatasetName,
      preprocessingMode: 'source',
      textColumn: 'Review Text',
      method: 'tfidf',
      targetColumn: '',
      captureRuntimeSelect: async () => {
        await captureLocator(page, page.locator('.main-panel .panel-card').first(), 'ecommerce_03_text_analysis_setting.png', runLog, {
          scenario: 'ecommerce',
          purpose: 'Text analysis settings for Review Text and recommendation target',
        });
      },
    });
    await waitForCurrentTaskTextArtifact(page, taskTitle, 'tfidf', { expectMl: false });
    await capturePage(page, 'ecommerce_04_mixed_result.png', runLog, {
      scenario: 'ecommerce',
      purpose: 'Task detail combining text features, report, and recommendation-oriented model result',
    });
  } catch (error) {
    await captureFailure(page, 'ecommerce_scenario', error, runLog);
  }
}

async function oilScenario(page, manifest, runLog) {
  try {
    const oilMeta = manifest.datasets.oil;

    const dashboardId = await createDashboard(page, {
      type: 'multimodal',
      filePath: oilMeta.prices_long_path,
      summaryText: datasetSummary({ path: oilMeta.prices_long_path }, { rows: oilMeta.price_long_rows, columns: 3 }),
    });

    await attachDataset(
      page,
      dashboardId,
      'multimodal',
      oilMeta.news_daily_path,
      datasetSummary(
        { path: oilMeta.news_daily_path },
        await readCsvShape(oilMeta.news_daily_path)
      )
    );
    await attachDataset(
      page,
      dashboardId,
      'multimodal',
      oilMeta.sources_path,
      datasetSummary(
        { path: oilMeta.sources_path },
        await readCsvShape(oilMeta.sources_path)
      )
    );

    await switchDataset(page, path.basename(oilMeta.prices_long_path, path.extname(oilMeta.prices_long_path)));
    await activateTab(page, 'Graph');
    const graphPanel = await findGraphPanel(page);
    await configureGraphPanel(graphPanel, {
      category: 'trend',
      type: 'line',
      x: 'date',
      y: 'price',
      hue: 'benchmark',
      palette: 'default',
    });
    await captureLocator(page, graphPanel, 'oil_03_price_chart.png', runLog, {
      scenario: 'oil',
      purpose: 'Brent and WTI price trend line chart',
    });

    const newsDailyName = path.basename(oilMeta.news_daily_path, path.extname(oilMeta.news_daily_path));
    await switchDataset(page, newsDailyName);
    await activateTab(page, 'File');
    await captureLocator(page, page.locator('.main-panel .panel-card').last(), 'oil_04_supply_risk.png', runLog, {
      scenario: 'oil',
      purpose: 'Daily supply-risk keyword counts and headline bundle preview',
    });

    const { mcpShell } = await sendMcpPrompt(page, OIL_PROMPT_OVERRIDE);
    await captureLocator(page, mcpShell, 'oil_01_mcp_prompt.png', runLog, {
      scenario: 'oil',
      purpose: 'MCP prompt entered before submission',
      note: 'Prompt is shown on the actual deployed MCP panel.',
    });
    await submitMcpPrompt(page);
    await captureLocator(page, mcpShell, 'oil_02_analysis_plan.png', runLog, {
      scenario: 'oil',
      purpose: 'Initial MCP response / analysis plan section',
    });

    const oilTaskTitle = 'Iran Oil News Sentiment';
    await createTextTask(page, {
      title: oilTaskTitle,
      datasetLabel: newsDailyName,
      textColumn: 'headline_text',
      method: 'sentiment',
      targetColumn: '',
    });
    await waitForCurrentTaskTextArtifact(page, oilTaskTitle, 'sentiment', { expectMl: false });
    await captureLocator(page, page.getByTestId('text-feature-artifact').first(), 'oil_05_news_event_analysis.png', runLog, {
      scenario: 'oil',
      purpose: 'Headline sentiment / text feature artifact for recent oil-risk news',
    });

    const rightPanel = await openRightPanel(page);
    await rightPanel.getByTestId('assistant-mcp-toggle').click();
    const mcpAfterTask = page.locator('.mcp-shell');
    await mcpAfterTask.locator('.composer textarea').fill('Summarize the current oil dashboard as a short final report with price, supply risk, and Korea watchpoints.');
    await submitMcpPrompt(page);
    await captureLocator(page, mcpAfterTask, 'oil_06_final_report.png', runLog, {
      scenario: 'oil',
      purpose: 'Follow-up MCP summary treated as the final report view',
    });

    const sourcesName = path.basename(oilMeta.sources_path, path.extname(oilMeta.sources_path));
    await switchDataset(page, sourcesName);
    await activateTab(page, 'File');
    await captureLocator(page, page.locator('.main-panel .panel-card').last(), 'oil_07_sources_confidence.png', runLog, {
      scenario: 'oil',
      purpose: 'Public source catalog with URL, update cadence, and trust notes',
      note: 'Current deployed UI shows provenance as a dataset table rather than an auto-generated provenance card.',
    });
  } catch (error) {
    await captureFailure(page, 'oil_scenario', error, runLog);
  }
}

async function main() {
  ensureValue(API_KEY, 'NGNL_CAPTURE_API_KEY or PLAYWRIGHT_TEST_API_KEY is required.');

  const manifest = JSON.parse(await fs.readFile(DATASET_MANIFEST_PATH, 'utf8'));
  const runLog = {
    baseUrl: BASE_URL,
    startedAt: new Date().toISOString(),
    captured: [],
    failures: [],
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await writeRunLog(runLog);

  const browser = await chromium.launch({ headless: true });
  const { context, page } = await createContext(browser);
  try {
    await login(page, runLog, { captureCommonKey: true });
    await titanicScenario(page, manifest, runLog);
    await imdbScenario(page, manifest, runLog);
    await catsDogsScenario(page, manifest, runLog);
    await ecommerceScenario(page, manifest, runLog);
    await oilScenario(page, manifest, runLog);
    await logout(page);
  } finally {
    await context.close();
    await browser.close();
  }

  runLog.finishedAt = new Date().toISOString();
  await writeRunLog(runLog);
  console.log(`Captured ${runLog.captured.length} screenshot(s). Failures: ${runLog.failures.length}.`);
}

main().catch(async (error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
