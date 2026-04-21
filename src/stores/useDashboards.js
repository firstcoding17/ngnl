import { makeId } from '@/utils/id';
import { buildStructuredTaskRecommendations } from '@/utils/datasetImport';
import { buildRecommendationSummary } from '@/utils/recommendationEngine';

const LEGACY_STORAGE_KEY = 'ngnl_dashboards_v1';
const DASHBOARD_INDEX_KEY = 'ngnl_dashboards_index_v2';
const DASHBOARD_DOC_PREFIX = 'ngnl_dashboard_doc_v2:';

const DATA_TYPE_OPTIONS = [
  {
    id: 'tabular',
    label: 'Structured data',
    shortLabel: 'Table',
    formats: ['CSV', 'Excel', 'JSON'],
    description: 'Best for row-and-column datasets used in distribution, regression, and classification workflows.',
  },
  {
    id: 'text',
    label: 'Text data',
    shortLabel: 'Text',
    formats: ['TXT', 'CSV text column', 'JSON'],
    description: 'Start with text length, sentiment, keyword, and embedding-centered workflows.',
  },
  {
    id: 'image',
    label: 'Image data',
    shortLabel: 'Image',
    formats: ['ZIP', 'Image + label CSV'],
    description: 'Use this for image preview, feature extraction, and classification or embedding preparation.',
  },
  {
    id: 'multimodal',
    label: 'Recommended / multimodal',
    shortLabel: 'Mixed',
    formats: ['Table + text', 'Table + image', 'Text + image'],
    description: 'Review the combined data shape first, then follow recommended preprocessing and task templates.',
  },
];

const TASK_TEMPLATE_CATALOG = [
  {
    type: 'distribution',
    label: 'Distribution analysis',
    appliesTo: ['tabular', 'multimodal'],
    description: 'Inspect how the data is distributed.',
    example: 'Example: age distribution, revenue spread',
    recommendedAnalyses: ['histogram', 'boxplot', 'kde'],
  },
  {
    type: 'regression',
    label: 'Regression analysis',
    appliesTo: ['tabular', 'multimodal'],
    description: 'Predict numeric targets.',
    example: 'Example: price forecasting, revenue forecasting',
    recommendedAnalyses: ['linear-regression', 'ridge', 'lasso'],
  },
  {
    type: 'classification',
    label: 'Classification analysis',
    appliesTo: ['tabular', 'multimodal'],
    description: 'Predict categorical outcomes.',
    example: 'Example: churn vs retained, pass vs fail',
    recommendedAnalyses: ['class-balance', 'baseline-model', 'confusion-matrix'],
  },
  {
    type: 'text-analysis',
    label: 'Text analysis',
    appliesTo: ['text', 'multimodal'],
    description: 'Turn text into scores or features.',
    example: 'Example: sentiment scoring, TF-IDF, keyword extraction',
    recommendedAnalyses: ['tfidf', 'sentiment', 'semantic', 'embedding-preview'],
  },
  {
    type: 'image-analysis',
    label: 'Image analysis',
    appliesTo: ['image', 'multimodal'],
    description: 'Extract features from images or prepare image classification.',
    example: 'Example: quality screening, object cues, OCR prep',
    recommendedAnalyses: ['thumbnail-review', 'ocr', 'classification-preview'],
  },
  {
    type: 'preprocessing',
    label: 'Preprocessing task',
    appliesTo: ['tabular', 'text', 'image', 'multimodal'],
    description: 'Clean and prepare data before deeper analysis.',
    example: 'Example: missing-value handling, date parts, text cleanup',
    recommendedAnalyses: ['missing-audit', 'type-check', 'quality-report'],
  },
];

const ANALYSIS_TEMPLATES = {
  distribution: [
    { id: 'histogram', label: 'Histogram', chartType: 'histogram', resultType: 'chart', description: 'Review numeric distributions with bars.' },
    { id: 'boxplot', label: 'Box plot', chartType: 'box', resultType: 'chart', description: 'Inspect quartiles and outliers quickly.' },
    { id: 'kde', label: 'KDE', chartType: 'line', resultType: 'chart', description: 'See a smoothed density curve.' },
  ],
  regression: [
    { id: 'linear-regression', label: 'Linear regression', chartType: 'scatter', resultType: 'metric-table', description: 'The simplest baseline for numeric prediction.' },
    { id: 'ridge', label: 'Ridge', chartType: 'line', resultType: 'metric-table', description: 'Regularized regression to reduce overfitting.' },
    { id: 'lasso', label: 'Lasso', chartType: 'line', resultType: 'metric-table', description: 'Combine feature selection with prediction.' },
  ],
  classification: [
    { id: 'baseline-model', label: 'Baseline classifier', chartType: 'bar', resultType: 'metric-table', description: 'Check baseline accuracy and class balance.' },
    { id: 'confusion-matrix', label: 'Confusion matrix', chartType: 'heatmap', resultType: 'table', description: 'Inspect prediction error patterns.' },
    { id: 'roc-pr', label: 'ROC / PR', chartType: 'line', resultType: 'chart', description: 'Compare performance across thresholds.' },
  ],
  'text-analysis': [
    { id: 'tfidf', label: 'TF-IDF', chartType: 'bar', resultType: 'table', description: 'Create keyword-weighted feature columns.' },
    { id: 'sentiment', label: 'Sentiment scoring', chartType: 'bar', resultType: 'score', description: 'Convert text into sentiment scores.' },
    { id: 'semantic', label: 'Semantic concept runtime', chartType: 'bar', resultType: 'vector', description: 'Project text into semantic concept features for downstream PCA or modeling.' },
    { id: 'embedding-preview', label: 'Embedding transform', chartType: 'scatter', resultType: 'vector', description: 'Convert text into embedding-style vectors.' },
  ],
  'image-analysis': [
    { id: 'thumbnail-review', label: 'Image preview', chartType: 'gallery', resultType: 'preview', description: 'Review image quality and labels first.' },
    { id: 'ocr', label: 'OCR text extraction', chartType: 'table', resultType: 'preview', description: 'Extract preview text from image references for downstream text analysis.' },
    { id: 'classification-preview', label: 'Image classification prep', chartType: 'bar', resultType: 'table', description: 'Check labels and class balance first.' },
    { id: 'embedding-preview', label: 'Image embedding', chartType: 'scatter', resultType: 'vector', description: 'Create feature vectors for similarity or classification.' },
  ],
  preprocessing: [
    { id: 'missing-audit', label: 'Missing-value audit', chartType: 'bar', resultType: 'report', description: 'Review missing patterns and rates first.' },
    { id: 'type-check', label: 'Type review', chartType: 'table', resultType: 'report', description: 'Inspect column types and conversion candidates.' },
    { id: 'quality-report', label: 'Quality report', chartType: 'table', resultType: 'report', description: 'Review duplicates, outliers, and quality summary in one place.' },
  ],
};

function getDashboardDocKey(id = '') {
  return `${DASHBOARD_DOC_PREFIX}${String(id || '').trim()}`;
}

function readLegacyDashboards() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readDashboardIndex() {
  try {
    const raw = localStorage.getItem(DASHBOARD_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function writeDashboardIndex(ids = []) {
  const normalized = [];
  const seen = new Set();
  for (const id of ids || []) {
    const nextId = String(id || '').trim();
    if (!nextId || seen.has(nextId)) continue;
    seen.add(nextId);
    normalized.push(nextId);
  }
  if (!normalized.length) {
    localStorage.removeItem(DASHBOARD_INDEX_KEY);
    return;
  }
  localStorage.setItem(DASHBOARD_INDEX_KEY, JSON.stringify(normalized));
}

function readDashboardDoc(id) {
  try {
    const raw = localStorage.getItem(getDashboardDocKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeDashboardDoc(doc) {
  if (!doc?.id) return;
  localStorage.setItem(getDashboardDocKey(doc.id), JSON.stringify(doc));
}

function removeDashboardDoc(id) {
  localStorage.removeItem(getDashboardDocKey(id));
}

function writeDashboards(items) {
  const nextItems = Array.isArray(items) ? items.filter((item) => item?.id) : [];
  const nextIds = nextItems.map((item) => String(item.id));
  const previousIds = readDashboardIndex();

  nextItems.forEach((item) => writeDashboardDoc(item));
  previousIds
    .filter((id) => !nextIds.includes(id))
    .forEach((id) => removeDashboardDoc(id));

  writeDashboardIndex(nextIds);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function ensureDashboardStoreMigrated() {
  const existingIds = readDashboardIndex();
  if (existingIds.length) return existingIds;

  const legacyItems = readLegacyDashboards();
  if (!legacyItems.length) return [];

  writeDashboards(legacyItems);
  return legacyItems
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean);
}

function readDashboards() {
  const ids = ensureDashboardStoreMigrated();
  if (!ids.length) return [];

  const items = [];
  let needsIndexRepair = false;

  ids.forEach((id) => {
    const doc = readDashboardDoc(id);
    if (!doc) {
      needsIndexRepair = true;
      return;
    }
    items.push(doc);
  });

  if (needsIndexRepair) {
    writeDashboardIndex(items.map((item) => item.id));
  }

  return items;
}

function normalizeAnalysis(analysis = {}) {
  const now = Date.now();
  return {
    id: analysis.id || makeId('analysis'),
    title: analysis.title || 'New analysis',
    method: analysis.method || 'analysis',
    description: analysis.description || '',
    chartType: analysis.chartType || 'chart',
    resultType: analysis.resultType || 'summary',
    status: analysis.status || 'draft',
    options: analysis.options || {},
    createdAt: Number(analysis.createdAt || now),
    updatedAt: Number(analysis.updatedAt || analysis.createdAt || now),
  };
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlain(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clonePlain(item)]));
  }
  return value;
}

function normalizeDatasetLinkRule(rule = {}, primaryDatasetId = '') {
  return {
    id: rule.id || makeId('dataset_link'),
    datasetId: String(rule.datasetId || ''),
    baseDatasetId: String(rule.baseDatasetId || primaryDatasetId || ''),
    baseKey: String(rule.baseKey || ''),
    joinKey: String(rule.joinKey || ''),
    joinType: String(rule.joinType || 'left'),
    prefix: String(rule.prefix || ''),
  };
}

function normalizeDatasetLinks(datasetLinks = {}, primaryDatasetId = '') {
  const nextPrimary = String(datasetLinks?.primaryDatasetId || primaryDatasetId || '');
  return {
    primaryDatasetId: nextPrimary,
    preparedDatasetId: String(datasetLinks?.preparedDatasetId || ''),
    artifact: datasetLinks?.artifact && typeof datasetLinks.artifact === 'object' ? clonePlain(datasetLinks.artifact) : null,
    links: Array.isArray(datasetLinks?.links)
      ? datasetLinks.links
        .map((rule) => normalizeDatasetLinkRule(rule, nextPrimary))
        .filter((rule) => rule.datasetId)
      : [],
  };
}

function normalizeTask(task = {}) {
  const now = Date.now();
  return {
    id: task.id || makeId('task'),
    type: task.type || 'distribution',
    title: task.title || 'New task',
    description: task.description || '',
    datasetIds: Array.isArray(task.datasetIds) ? task.datasetIds : [],
    preprocessingMode: task.preprocessingMode || 'reuse',
    previewChecks: Array.isArray(task.previewChecks) ? task.previewChecks : [],
    status: task.status || 'draft',
    options: task.options || {},
    createdAt: Number(task.createdAt || now),
    updatedAt: Number(task.updatedAt || task.createdAt || now),
    analyses: Array.isArray(task.analyses) ? task.analyses.map(normalizeAnalysis) : [],
  };
}

function normalizeDashboard(dashboard = {}) {
  const now = Date.now();
  const tasks = Array.isArray(dashboard.tasks) ? dashboard.tasks.map(normalizeTask) : [];
  const datasetIds = Array.isArray(dashboard.datasetIds) ? dashboard.datasetIds.filter(Boolean) : [];
  const primaryDatasetId = dashboard.sourceDatasetId || dashboard.activeDatasetId || datasetIds[0] || '';
  return {
    id: dashboard.id || makeId('dashboard'),
    title: dashboard.title || 'New dashboard',
    subtitle: dashboard.subtitle || '',
    description: dashboard.description || '',
    dataType: dashboard.dataType || 'tabular',
    datasetIds,
    activeDatasetId: dashboard.activeDatasetId || datasetIds[0] || '',
    sourceDatasetId: primaryDatasetId,
    datasetLinks: normalizeDatasetLinks(dashboard.datasetLinks, primaryDatasetId),
    datasetMeta: dashboard.datasetMeta && typeof dashboard.datasetMeta === 'object' ? { ...dashboard.datasetMeta } : {},
    preprocessingSelections: Array.isArray(dashboard.preprocessingSelections) ? dashboard.preprocessingSelections : [],
    preprocessingPlan: Array.isArray(dashboard.preprocessingPlan) ? dashboard.preprocessingPlan.map((item) => ({ ...item })) : [],
    previewSelections: Array.isArray(dashboard.previewSelections) ? dashboard.previewSelections : [],
    previewPlan: Array.isArray(dashboard.previewPlan) ? dashboard.previewPlan.map((item) => ({ ...item })) : [],
    recommendationSummary: dashboard.recommendationSummary && typeof dashboard.recommendationSummary === 'object'
      ? clonePlain(dashboard.recommendationSummary)
      : null,
    wizardResults: dashboard.wizardResults && typeof dashboard.wizardResults === 'object'
      ? {
        preprocessing: Array.isArray(dashboard.wizardResults.preprocessing)
          ? dashboard.wizardResults.preprocessing.map((item) => ({ ...item }))
          : [],
        preview: Array.isArray(dashboard.wizardResults.preview)
          ? dashboard.wizardResults.preview.map((item) => ({ ...item }))
          : [],
      }
      : { preprocessing: [], preview: [] },
    createdAt: Number(dashboard.createdAt || now),
    updatedAt: Number(dashboard.updatedAt || dashboard.createdAt || now),
    tasks,
  };
}

function upsertDashboardDoc(dashboard) {
  const nextDoc = normalizeDashboard({ ...dashboard, updatedAt: Date.now() });
  const currentIds = ensureDashboardStoreMigrated();
  writeDashboardDoc(nextDoc);
  writeDashboardIndex([nextDoc.id, ...currentIds.filter((id) => id !== nextDoc.id)]);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return nextDoc;
}

export function getDataTypeOptions() {
  return DATA_TYPE_OPTIONS.map((item) => ({ ...item }));
}

export function getTaskTemplates(dataType = 'tabular') {
  return TASK_TEMPLATE_CATALOG
    .filter((template) => template.appliesTo.includes(dataType) || template.appliesTo.includes('multimodal') && dataType === 'multimodal')
    .map((template) => ({ ...template, recommendedAnalyses: [...template.recommendedAnalyses] }));
}

export function getAnalysisTemplates(taskType = 'distribution') {
  return (ANALYSIS_TEMPLATES[taskType] || []).map((template) => ({ ...template }));
}

function summarizeMissingColumns(datasetMeta = {}) {
  return Object.entries(datasetMeta.missingByColumn || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([column, count]) => `${column} (${count})`)
    .join(', ');
}

function findPlanItem(plan = [], id) {
  return Array.isArray(plan) ? plan.find((item) => item?.id === id) || null : null;
}

function buildWizardResults(datasetMeta = {}, preprocessingPlan = [], previewPlan = []) {
  const rowCount = Number(datasetMeta.rowCount || 0);
  const colCount = Number(datasetMeta.colCount || 0);
  const missingCount = Number(datasetMeta.missingCount || 0);
  const numericCount = Array.isArray(datasetMeta.numericColumns) ? datasetMeta.numericColumns.length : 0;
  const categoricalCount = Array.isArray(datasetMeta.categoricalColumns) ? datasetMeta.categoricalColumns.length : 0;
  const textCount = Array.isArray(datasetMeta.textColumns) ? datasetMeta.textColumns.length : 0;
  const imageCount = Array.isArray(datasetMeta.imageColumns) ? datasetMeta.imageColumns.length : 0;

  const preprocessing = preprocessingPlan.map((item) => {
    const summaryMap = {
      'handle-missing': missingCount
        ? `${missingCount.toLocaleString()} missing values detected${summarizeMissingColumns(datasetMeta) ? ` across ${summarizeMissingColumns(datasetMeta)}` : ''}.`
        : 'No missing values were detected in the uploaded dataset.',
      'binary-mapping': `${Array.isArray(datasetMeta.binaryLikeColumns) ? datasetMeta.binaryLikeColumns.length : 0} binary-like columns are ready for 0/1 mapping.`,
      'categorical-encoding': `${categoricalCount} categorical columns are available for encoding.`,
      'date-features': `${Array.isArray(datasetMeta.dateColumns) ? datasetMeta.dateColumns.length : 0} date columns can be expanded into derived features.`,
      tfidf: `${textCount} text columns can be transformed into keyword-weight features.`,
      sentiment: `${textCount} text columns can be converted into sentiment scores.`,
      embedding: `${textCount} text columns can be converted into embeddings.`,
      'image-preview': `${imageCount} image reference columns are available for image preview and validation.`,
      'image-embedding': `${imageCount} image reference columns are available for image feature extraction.`,
    };
    return {
      id: item.id,
      label: item.label,
      reason: item.reason,
      group: item.group,
      recommended: !!item.recommended,
      summary: summaryMap[item.id] || `${rowCount.toLocaleString()} rows / ${colCount.toLocaleString()} cols are ready for this preparation step.`,
      status: 'ready',
    };
  });

  const preview = previewPlan.map((item) => {
    const summaryMap = {
      distribution: `${numericCount} numeric columns are ready for distribution previews.`,
      missingness: missingCount
        ? `${missingCount.toLocaleString()} missing values were detected before dashboard creation.`
        : 'Missing-value preview found no missing cells in the current dataset.',
      correlation: `${numericCount} numeric columns can be checked for pairwise correlation.`,
      'text-overview': `${textCount} text columns are available for length and frequency review.`,
      'class-balance': `${categoricalCount} categorical columns are available for class-balance checks.`,
    };
    return {
      id: item.id,
      label: item.label,
      reason: item.reason,
      recommended: !!item.recommended,
      summary: summaryMap[item.id] || `${rowCount.toLocaleString()} rows / ${colCount.toLocaleString()} cols were profiled in the setup flow.`,
      status: 'ready',
    };
  });

  return { preprocessing, preview };
}

function buildWizardSeedTasks(dataType = 'tabular', datasetMeta = {}, wizard = {}) {
  const previewSelections = Array.isArray(wizard.previewSelections) ? wizard.previewSelections : [];
  const preprocessingSelections = Array.isArray(wizard.preprocessingSelections) ? wizard.preprocessingSelections : [];
  const previewPlan = Array.isArray(wizard.previewPlan) ? wizard.previewPlan : [];
  const preprocessingPlan = Array.isArray(wizard.preprocessingPlan) ? wizard.preprocessingPlan : [];
  const structuredRecommendationByType = new Map(
    buildStructuredTaskRecommendations(datasetMeta, dataType).map((item) => [item.type, item])
  );
  const sourceDatasetId = String(
    wizard.datasetLinks?.primaryDatasetId
    || wizard.sourceDatasetId
    || ''
  );
  const wizardResults = buildWizardResults(datasetMeta, preprocessingPlan, previewPlan);
  const tasks = [];

  if (previewSelections.includes('distribution')) {
    const previewItem = findPlanItem(previewPlan, 'distribution');
    const executionSummary = wizardResults.preview.find((item) => item.id === 'distribution')?.summary || '';
    const recommendationReason = structuredRecommendationByType.get('distribution')?.reason || '';
    tasks.push(normalizeTask({
      type: 'distribution',
      title: previewItem?.label || 'Distribution preview',
      description: [recommendationReason, previewItem?.reason || 'Check the distribution of the uploaded data before building more detailed analyses.']
        .filter(Boolean)
        .join(' '),
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: ['distribution'],
      options: {
        wizardSource: 'preview',
        wizardResultId: 'distribution',
        sourceDatasetId,
        executionSummary,
        recommendationReason,
        panelPreset: {
          kind: 'graph',
          type: 'histogram',
          xHint: 'firstNumeric',
          options: { title: previewItem?.label || 'Distribution preview', agg: 'count' },
        },
      },
      analyses: [
        {
          method: 'histogram',
          title: 'Histogram preview',
          description: executionSummary,
          chartType: 'histogram',
          resultType: 'chart',
          status: 'ready',
          options: {
            executionSummary,
            panelPreset: {
              kind: 'graph',
              type: 'histogram',
              xHint: 'firstNumeric',
              options: { title: previewItem?.label || 'Distribution preview', agg: 'count' },
            },
          },
        },
      ],
    }));
  }

  if (previewSelections.includes('missingness') || preprocessingSelections.includes('handle-missing')) {
    const previewItem = findPlanItem(previewPlan, 'missingness');
    const prepItem = findPlanItem(preprocessingPlan, 'handle-missing');
    const executionSummary = wizardResults.preview.find((item) => item.id === 'missingness')?.summary
      || wizardResults.preprocessing.find((item) => item.id === 'handle-missing')?.summary
      || '';
    tasks.push(normalizeTask({
      type: 'preprocessing',
      title: previewItem?.label || prepItem?.label || 'Missing-value review',
      description: previewItem?.reason || prepItem?.reason || 'Review missing values before running downstream analysis.',
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: ['missingness'],
      options: {
        wizardSource: 'preprocessing',
        wizardResultId: 'handle-missing',
        sourceDatasetId,
        selectedPreparationIds: preprocessingSelections,
        executionSummary,
        panelPreset: {
          kind: 'stat',
          statPanel: 'report',
          autoRun: true,
          title: previewItem?.label || prepItem?.label || 'Missing-value review',
        },
      },
      analyses: [
        {
          method: 'missing-audit',
          title: 'Missing-value audit',
          description: executionSummary,
          chartType: 'bar',
          resultType: 'report',
          status: 'ready',
          options: {
            executionSummary,
            panelPreset: {
              kind: 'stat',
              statPanel: 'report',
              autoRun: true,
              title: previewItem?.label || prepItem?.label || 'Missing-value review',
            },
          },
        },
      ],
    }));
  }

  if (previewSelections.includes('correlation') && Array.isArray(datasetMeta.numericColumns) && datasetMeta.numericColumns.length >= 2) {
    const previewItem = findPlanItem(previewPlan, 'correlation');
    const executionSummary = wizardResults.preview.find((item) => item.id === 'correlation')?.summary || '';
    tasks.push(normalizeTask({
      type: 'preprocessing',
      title: previewItem?.label || 'Correlation preview',
      description: previewItem?.reason || 'Inspect numeric column relationships before building models.',
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: ['correlation'],
      options: {
        wizardSource: 'preview',
        wizardResultId: 'correlation',
        sourceDatasetId,
        executionSummary,
        panelPreset: {
          kind: 'stat',
          statPanel: 'corr',
          autoRun: true,
          title: previewItem?.label || 'Correlation preview',
        },
      },
      analyses: [
        {
          method: 'correlation-preview',
          title: 'Correlation review',
          description: executionSummary,
          chartType: 'heatmap',
          resultType: 'corr',
          status: 'ready',
          options: {
            executionSummary,
            panelPreset: {
              kind: 'stat',
              statPanel: 'corr',
              autoRun: true,
              title: previewItem?.label || 'Correlation preview',
            },
          },
        },
      ],
    }));
  }

  if (previewSelections.includes('text-overview') && Array.isArray(datasetMeta.textColumns) && datasetMeta.textColumns.length > 0) {
    const previewItem = findPlanItem(previewPlan, 'text-overview');
    const executionSummary = wizardResults.preview.find((item) => item.id === 'text-overview')?.summary || '';
    tasks.push(normalizeTask({
      type: 'text-analysis',
      title: previewItem?.label || 'Text overview',
      description: previewItem?.reason || 'Review text length, token frequency, and sample snippets before deeper text analysis.',
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: ['text-overview'],
      options: {
        wizardSource: 'preview',
        wizardResultId: 'text-overview',
        sourceDatasetId,
        executionSummary,
        panelPreset: {
          kind: 'file',
          title: previewItem?.label || 'Text overview',
        },
      },
      analyses: [
        {
          method: 'text-overview',
          title: 'Text preview artifact',
          description: executionSummary,
          chartType: 'table',
          resultType: 'preview',
          status: 'ready',
          options: {
            executionSummary,
            panelPreset: {
              kind: 'file',
              title: previewItem?.label || 'Text overview',
            },
          },
        },
      ],
    }));
  }

  const textRuntimeSelections = preprocessingSelections.filter((id) => ['tfidf', 'sentiment', 'embedding'].includes(id));
  if (textRuntimeSelections.length && Array.isArray(datasetMeta.textColumns) && datasetMeta.textColumns.length > 0) {
    const primaryMethod = textRuntimeSelections[0];
    const primaryItem = findPlanItem(preprocessingPlan, primaryMethod);
    const primarySummary = wizardResults.preprocessing.find((item) => item.id === primaryMethod)?.summary || '';
    tasks.push(normalizeTask({
      type: 'text-analysis',
      title: primaryItem?.label || 'Text feature runtime',
      description: primaryItem?.reason || 'Generate derived text features and reopen them in the dashboard workspace.',
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: [],
      options: {
        wizardSource: 'preprocessing',
        wizardResultId: primaryMethod,
        sourceDatasetId,
        textColumn: datasetMeta.textColumns[0] || '',
        textMethod: primaryMethod,
        executionSummary: primarySummary,
      },
      analyses: textRuntimeSelections.map((methodId) => {
        const planItem = findPlanItem(preprocessingPlan, methodId);
        const methodSummary = wizardResults.preprocessing.find((item) => item.id === methodId)?.summary || primarySummary;
        return {
          method: methodId,
          title: planItem?.label || methodId,
          description: methodSummary,
          chartType: methodId === 'sentiment' ? 'bar' : methodId === 'embedding' ? 'scatter' : 'table',
          resultType: methodId === 'embedding' ? 'vector' : 'table',
          status: 'ready',
          options: {
            executionSummary: methodSummary,
          },
        };
      }),
    }));
  }

  const imageRuntimeSelections = preprocessingSelections.filter((id) => ['image-preview', 'image-embedding'].includes(id));
  if (imageRuntimeSelections.length && Array.isArray(datasetMeta.imageColumns) && datasetMeta.imageColumns.length > 0) {
    const primaryMethod = imageRuntimeSelections[0];
    const primaryItem = findPlanItem(preprocessingPlan, primaryMethod);
    const primarySummary = wizardResults.preprocessing.find((item) => item.id === primaryMethod)?.summary || '';
    const imageColumn = datasetMeta.imageColumns[0] || '';
    const targetColumn = (datasetMeta.categoricalColumns || []).find((column) => column !== imageColumn) || '';
    tasks.push(normalizeTask({
      type: 'image-analysis',
      title: primaryItem?.label || 'Image feature runtime',
      description: primaryItem?.reason || 'Generate image preview cards and derived feature columns for downstream PCA or classification.',
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: [],
      options: {
        wizardSource: 'preprocessing',
        wizardResultId: primaryMethod,
        sourceDatasetId,
        imageColumn,
        executionSummary: primarySummary,
      },
      analyses: [
        ...imageRuntimeSelections.map((methodId) => {
          const planItem = findPlanItem(preprocessingPlan, methodId);
          const methodSummary = wizardResults.preprocessing.find((item) => item.id === methodId)?.summary || primarySummary;
          const method = methodId === 'image-preview' ? 'thumbnail-review' : 'embedding-preview';
          return {
            method,
            title: planItem?.label || method,
            description: methodSummary,
            chartType: methodId === 'image-preview' ? 'gallery' : 'scatter',
            resultType: methodId === 'image-preview' ? 'preview' : 'vector',
            status: 'ready',
            options: {
              imageColumn,
              executionSummary: methodSummary,
            },
          };
        }),
        ...(targetColumn
          ? [{
            method: 'classification-preview',
            title: 'Image classification preview',
            description: `${targetColumn} is available as an optional downstream label for the derived image feature table.`,
            chartType: 'bar',
            resultType: 'table',
            status: 'ready',
            options: {
              imageColumn,
              targetColumn,
              executionSummary: `${targetColumn} is available for downstream image classification.`,
            },
          }]
          : []),
      ],
    }));
  }

  if (previewSelections.includes('class-balance') && Array.isArray(datasetMeta.categoricalColumns) && datasetMeta.categoricalColumns.length > 0) {
    const previewItem = findPlanItem(previewPlan, 'class-balance');
    const executionSummary = wizardResults.preview.find((item) => item.id === 'class-balance')?.summary || '';
    const recommendationReason = structuredRecommendationByType.get('classification')?.reason || '';
    tasks.push(normalizeTask({
      type: 'classification',
      title: previewItem?.label || 'Class balance review',
      description: [recommendationReason, previewItem?.reason || 'Inspect categorical balance before choosing a classifier.']
        .filter(Boolean)
        .join(' '),
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: ['class-balance'],
      options: {
        wizardSource: 'preview',
        wizardResultId: 'class-balance',
        sourceDatasetId,
        executionSummary,
        recommendationReason,
        panelPreset: {
          kind: 'graph',
          type: 'bar',
          xHint: 'firstCategorical',
          yHint: '',
          options: { title: previewItem?.label || 'Class balance review', agg: 'count' },
        },
      },
      analyses: [
        {
          method: 'class-balance',
          title: 'Class balance chart',
          description: executionSummary,
          chartType: 'bar',
          resultType: 'chart',
          status: 'ready',
          options: {
            executionSummary,
            panelPreset: {
              kind: 'graph',
              type: 'bar',
              xHint: 'firstCategorical',
              yHint: '',
              options: { title: previewItem?.label || 'Class balance review', agg: 'count' },
            },
          },
        },
      ],
    }));
  }

  if (!tasks.some((task) => task.type === 'preprocessing') && preprocessingSelections.length) {
    const executionSummary = wizardResults.preprocessing.map((item) => item.summary).slice(0, 2).join(' ');
    tasks.push(normalizeTask({
      type: 'preprocessing',
      title: 'Preparation review',
      description: 'Carry the selected preprocessing recommendations into the dashboard workspace.',
      datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
      status: 'recommended',
      previewChecks: [],
      options: {
        wizardSource: 'preprocessing',
        wizardResultId: 'preparation-review',
        sourceDatasetId,
        executionSummary,
        selectedPreparationIds: preprocessingSelections,
        panelPreset: {
          kind: 'stat',
          statPanel: 'report',
          autoRun: true,
          title: 'Preparation review',
        },
      },
      analyses: [
        {
          method: 'quality-report',
          title: 'Preparation summary',
          description: executionSummary,
          chartType: 'table',
          resultType: 'report',
          status: 'ready',
          options: {
            executionSummary,
            panelPreset: {
              kind: 'stat',
              statPanel: 'report',
              autoRun: true,
              title: 'Preparation review',
            },
          },
        },
      ],
    }));
  }

  return tasks;
}

export function buildSuggestedTasks(dataType = 'tabular', datasetMeta = {}, wizard = {}) {
  const seeded = buildWizardSeedTasks(dataType, datasetMeta, wizard);
  const templates = getTaskTemplates(dataType);
  const templateMap = new Map(templates.map((template) => [template.type, template]));
  const structuredRecommendations = buildStructuredTaskRecommendations(datasetMeta, dataType);
  const recommendationSummary = buildRecommendationSummary({
    dataType,
    datasetSummary: datasetMeta,
    dashboard: {
      dataType,
      datasetLinks: wizard.datasetLinks || null,
    },
  });
  const suggestions = [];
  const sourceDatasetId = String(wizard.sourceDatasetId || '');
  const preferredTaskType = String(wizard.preferredTaskType || '').trim();
  const preferredModelFamily = String(wizard.preferredModelFamily || '').trim();
  const preferredTextMethod = String(wizard.preferredTextMethod || '').trim();
  const preferredImageMethod = String(wizard.preferredImageMethod || '').trim();
  const recommendationByType = new Map(structuredRecommendations.map((item) => [item.type, item]));
  const recommendedAnalysisTypes = Array.isArray(recommendationSummary?.categories?.analysis)
    ? recommendationSummary.categories.analysis
        .map((item) => {
          const value = String(item?.nextAction?.value || '').trim();
          if (!value) return '';
          const [type] = value.split(':');
          return type;
        })
        .filter(Boolean)
    : [];

  function pushSuggestedTemplate(type) {
    const template = templateMap.get(type);
    if (!template) return;
    if (suggestions.some((item) => item.type === type)) return;
    suggestions.push(template);
  }

  structuredRecommendations.forEach((item) => {
    if (item.type === 'distribution') {
      pushSuggestedTemplate('distribution');
      pushSuggestedTemplate('preprocessing');
      return;
    }
    pushSuggestedTemplate(item.type);
  });

  recommendedAnalysisTypes.forEach((type) => {
    pushSuggestedTemplate(type);
  });

  templates.forEach((template) => {
    if (suggestions.length >= 4) return;
    pushSuggestedTemplate(template.type);
  });

  if (datasetMeta.numericColumns?.length >= 2 && !suggestions.some((task) => task.type === 'regression')) {
    const regression = TASK_TEMPLATE_CATALOG.find((task) => task.type === 'regression');
    if (regression) suggestions.push(regression);
  }
  if (datasetMeta.textColumns?.length > 0 && !suggestions.some((task) => task.type === 'text-analysis')) {
    const textTask = TASK_TEMPLATE_CATALOG.find((task) => task.type === 'text-analysis');
    if (textTask) suggestions.push(textTask);
  }

  const fallback = suggestions.slice(0, 4).map((template) => normalizeTask({
    type: template.type,
    title: template.label,
    description: recommendationByType.has(template.type)
      ? `${recommendationByType.get(template.type).reason} ${template.example}`
      : `${template.description} ${template.example}`,
    datasetIds: sourceDatasetId ? [sourceDatasetId] : [],
    status: 'recommended',
    options: {
      sourceDatasetId,
      recommendationReason: recommendationByType.get(template.type)?.reason || '',
      recommendationTargetColumn: recommendationByType.get(template.type)?.targetColumn || '',
      recommendationConfidence: recommendationByType.get(template.type)?.confidence || '',
    },
    analyses: getAnalysisTemplates(template.type).slice(0, 2).map((analysis) => ({
      ...analysis,
      title: analysis.label,
      status: 'ready',
    })),
  }));

  const merged = [];
  const seenSeededKeys = new Set();
  const seenTypes = new Set();
  [...seeded, ...fallback].forEach((task) => {
    const wizardResultId = String(task?.options?.wizardResultId || '').trim();
    const seededKey = wizardResultId ? `${task.type}:${wizardResultId}` : '';
    if (seededKey) {
      if (seenSeededKeys.has(seededKey)) return;
      seenSeededKeys.add(seededKey);
      seenTypes.add(task.type);
      merged.push(normalizeTask(task));
      return;
    }
    if (seenTypes.has(task.type)) return;
    seenTypes.add(task.type);
    merged.push(normalizeTask(task));
  });

  const preferred = merged.map((task) => {
    if (task.type !== preferredTaskType) return task;
    const nextOptions = {
      ...(task.options || {}),
    };
    if (['regression', 'classification'].includes(task.type) && preferredModelFamily) {
      nextOptions.modelFamily = preferredModelFamily;
    }
    if (task.type === 'text-analysis' && preferredTextMethod) {
      nextOptions.textMethod = preferredTextMethod;
    }
    if (task.type === 'image-analysis' && preferredImageMethod) {
      nextOptions.imageMethod = preferredImageMethod;
    }
    return {
      ...task,
      options: nextOptions,
    };
  });

  preferred.sort((left, right) => {
    const leftPreferred = left.type === preferredTaskType ? 1 : 0;
    const rightPreferred = right.type === preferredTaskType ? 1 : 0;
    if (rightPreferred !== leftPreferred) return rightPreferred - leftPreferred;
    return 0;
  });

  return preferred.slice(0, 4);
}

export function listDashboards() {
  return readDashboards()
    .map(normalizeDashboard)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export function loadDashboard(id) {
  const dashboard = listDashboards().find((item) => item.id === id);
  if (!dashboard) throw new Error('Dashboard not found.');
  return dashboard;
}

export function createDashboard(input = {}) {
  const wizardResults = buildWizardResults(input.datasetMeta || {}, input.preprocessingPlan || [], input.previewPlan || []);
  const primaryDatasetId = input.datasetLinks?.primaryDatasetId || input.activeDatasetId || input.datasetIds?.[0] || '';
  const datasetLinks = normalizeDatasetLinks(input.datasetLinks, primaryDatasetId);
  const recommendationSummary = buildRecommendationSummary({
    dataType: input.dataType || 'tabular',
    datasetSummary: input.datasetMeta || {},
    dashboard: {
      dataType: input.dataType || 'tabular',
      datasetLinks,
    },
  });
  const suggestedTasks = Array.isArray(input.tasks) && input.tasks.length
    ? input.tasks
    : buildSuggestedTasks(input.dataType || 'tabular', input.datasetMeta || {}, {
      sourceDatasetId: primaryDatasetId,
      datasetLinks,
      preprocessingSelections: input.preprocessingSelections || [],
      preprocessingPlan: input.preprocessingPlan || [],
      previewSelections: input.previewSelections || [],
      previewPlan: input.previewPlan || [],
      preferredTaskType: input.preferredTaskType || '',
      preferredModelFamily: input.preferredModelFamily || '',
      preferredTextMethod: input.preferredTextMethod || '',
      preferredImageMethod: input.preferredImageMethod || '',
    });

  return upsertDashboardDoc({
    id: makeId('dashboard'),
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    dataType: input.dataType,
    datasetIds: input.datasetIds || [],
    activeDatasetId: input.activeDatasetId || input.datasetIds?.[0] || '',
    sourceDatasetId: primaryDatasetId,
    datasetLinks,
    datasetMeta: input.datasetMeta || {},
    preprocessingSelections: input.preprocessingSelections || [],
    preprocessingPlan: input.preprocessingPlan || [],
    previewSelections: input.previewSelections || [],
    previewPlan: input.previewPlan || [],
    wizardResults,
    recommendationSummary,
    tasks: suggestedTasks,
    createdAt: Date.now(),
  });
}

export function saveDashboard(dashboard) {
  return upsertDashboardDoc(dashboard);
}

export function deleteDashboard(id) {
  const currentIds = ensureDashboardStoreMigrated();
  removeDashboardDoc(id);
  writeDashboardIndex(currentIds.filter((itemId) => itemId !== id));
}

export function attachDatasetToDashboard(dashboardId, datasetId) {
  const dashboard = loadDashboard(dashboardId);
  const datasetIds = dashboard.datasetIds.includes(datasetId)
    ? dashboard.datasetIds
    : [datasetId, ...dashboard.datasetIds];
  return upsertDashboardDoc({
    ...dashboard,
    datasetIds,
    activeDatasetId: datasetId || dashboard.activeDatasetId,
  });
}

export function setDashboardActiveDataset(dashboardId, datasetId) {
  const dashboard = loadDashboard(dashboardId);
  return upsertDashboardDoc({
    ...dashboard,
    activeDatasetId: datasetId,
  });
}

export function createTask(dashboardId, taskInput = {}) {
  const dashboard = loadDashboard(dashboardId);
  const task = normalizeTask({
    ...taskInput,
    id: makeId('task'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const tasks = [task, ...dashboard.tasks];
  upsertDashboardDoc({ ...dashboard, tasks });
  return task;
}

export function updateTask(dashboardId, taskId, patch = {}) {
  const dashboard = loadDashboard(dashboardId);
  const tasks = dashboard.tasks.map((task) => (
    task.id === taskId
      ? normalizeTask({
        ...task,
        ...patch,
        id: task.id,
        analyses: patch.analyses || task.analyses,
        updatedAt: Date.now(),
      })
      : task
  ));
  const next = upsertDashboardDoc({ ...dashboard, tasks });
  return next.tasks.find((task) => task.id === taskId);
}

export function createAnalysis(dashboardId, taskId, analysisInput = {}) {
  const dashboard = loadDashboard(dashboardId);
  let created = null;
  const tasks = dashboard.tasks.map((task) => {
    if (task.id !== taskId) return task;
    created = normalizeAnalysis({
      ...analysisInput,
      id: makeId('analysis'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return normalizeTask({
      ...task,
      analyses: [created, ...(task.analyses || [])],
      updatedAt: Date.now(),
      status: task.status === 'recommended' ? 'active' : task.status,
    });
  });
  upsertDashboardDoc({ ...dashboard, tasks });
  return created;
}

export function updateAnalysis(dashboardId, taskId, analysisId, patch = {}) {
  const dashboard = loadDashboard(dashboardId);
  let updated = null;
  const tasks = dashboard.tasks.map((task) => {
    if (task.id !== taskId) return task;
    return normalizeTask({
      ...task,
      analyses: (task.analyses || []).map((analysis) => {
        if (analysis.id !== analysisId) return analysis;
        updated = normalizeAnalysis({
          ...analysis,
          ...patch,
          id: analysis.id,
          updatedAt: Date.now(),
        });
        return updated;
      }),
      updatedAt: Date.now(),
    });
  });
  upsertDashboardDoc({ ...dashboard, tasks });
  return updated;
}
