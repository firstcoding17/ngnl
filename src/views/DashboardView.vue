<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TextOverviewArtifact from '@/components/TextOverviewArtifact.vue';
import {
  runImageFeatureRuntime,
  runImageOcrRuntime,
} from '@/services/imageRuntimeApi';
import {
  getMlCapabilities,
  runMlTrain,
} from '@/services/mlApi';
import {
  runStatAnova,
  runStatChiSq,
  runStatCorr,
  runStatDescribe,
  runStatNormality,
  runStatTTest,
} from '@/services/statApi';
import { loadDataset, saveDataset } from '@/stores/useDatasets';
import {
  attachDatasetToDashboard,
  createAnalysis,
  createTask,
  getAnalysisTemplates,
  getTaskTemplates,
  loadDashboard,
  saveDashboard,
  setDashboardActiveDataset,
  updateAnalysis,
  updateTask,
} from '@/stores/useDashboards';
import {
  buildCorrArtifact,
  buildStatArtifactSignature,
  buildTestsArtifact,
} from '@/utils/statArtifacts';
import { runLocalLevene } from '@/utils/statLocalTests';
import {
  buildMlArtifact,
  buildMlArtifactSignature,
  buildMlBlockedArtifact,
  getMlExecutionPlan,
} from '@/utils/mlArtifacts';
import {
  buildImageBlockedArtifact,
  buildImageFeatureArtifact,
  buildImageFeatureDatasetName,
  buildImageFeatureRequest,
  buildImageFeatureSignature,
} from '@/utils/imageFeatureArtifacts';
import {
  buildImageOcrArtifact,
  buildImageOcrBlockedArtifact,
  buildImageOcrDatasetName,
  buildImageOcrRequest,
  buildImageOcrSignature,
  normalizeImageTaskMethod,
} from '@/utils/imageOcrArtifacts';
import {
  buildTextFeatureArtifact,
  buildTextFeatureRecipe,
  buildTextFeatureRequest,
  buildTextFeatureSignature,
  normalizeTextFeatureMethod,
} from '@/utils/textFeatureArtifacts';
import {
  buildTextPreviewArtifact,
  buildTextPreviewSignature,
} from '@/utils/textPreviewArtifacts';
import { buildAnalysisReport, buildTaskSummaryReport, buildTaskSummaryReportSourceSignature } from '@/utils/analysisReports';
import {
  buildRecommendationSummary,
  summarizeRecommendationHeadline,
} from '@/utils/recommendationEngine';
import {
  buildDatasetLinksSignature,
  buildLinkedDataset,
  buildLinkedDatasetName,
} from '@/utils/datasetLinks';
import {
  buildTransformArtifact,
  buildTransformExecutionSummary,
  buildWizardTransformPlan,
  runTransformRecipe,
} from '@/utils/wizardTransforms';

const route = useRoute();
const router = useRouter();

const AnalysisReportCard = defineAsyncComponent(() => import('@/components/AnalysisReportCard.vue'));
const GraphPanel = defineAsyncComponent(() => import('@/components/GraphPanel.vue'));
const ImageFeatureArtifact = defineAsyncComponent(() => import('@/components/ImageFeatureArtifact.vue'));
const ImageOcrArtifact = defineAsyncComponent(() => import('@/components/ImageOcrArtifact.vue'));
const McpPanel = defineAsyncComponent(() => import('@/components/McpPanel.vue'));
const MlArtifactCard = defineAsyncComponent(() => import('@/components/MlArtifactCard.vue'));
const MlPanel = defineAsyncComponent(() => import('@/components/MlPanel.vue'));
const RecentDatasets = defineAsyncComponent(() => import('@/components/RecentDatasets.vue'));
const RecommendationSummaryCard = defineAsyncComponent(() => import('@/components/RecommendationSummaryCard.vue'));
const StatArtifactCard = defineAsyncComponent(() => import('@/components/StatArtifactCard.vue'));
const StatTestsPanel = defineAsyncComponent(() => import('@/components/StatTestsPanel.vue'));
const StatsCorrPanel = defineAsyncComponent(() => import('@/components/StatsCorrPanel.vue'));
const StatsReportPanel = defineAsyncComponent(() => import('@/components/StatsReportPanel.vue'));
const TextFeatureArtifact = defineAsyncComponent(() => import('@/components/TextFeatureArtifact.vue'));

const dashboard = ref(null);
const datasets = ref([]);
const loading = ref(false);
const loadError = ref('');
const detailOpen = ref(false);
const assistantMode = ref('');
const selectedCatalogId = ref('');
const graphPreset = ref(null);
const graphOverrideRows = ref(null);
const graphOverrideColumns = ref(null);
const statPreset = ref(null);
const mlPreset = ref(null);
const hydratedTaskEditId = ref('');
const hydratedAnalysisEditId = ref('');

const taskDraft = ref({
  type: 'distribution',
  title: '',
  description: '',
  datasetIds: [],
  preprocessingMode: 'reuse',
  previewChecks: [],
  targetColumn: '',
  featureColumns: [],
  imageColumn: '',
  imageMethod: 'features',
  textColumn: '',
  textMethod: 'tfidf',
  modelFamily: '',
});

const analysisDraft = ref({
  method: '',
  title: '',
  description: '',
  chartType: 'chart',
  resultType: 'summary',
});

const tabOptions = [
  { id: 'file', label: 'File' },
  { id: 'graph', label: 'Graph' },
  { id: 'stat', label: 'Stat' },
  { id: 'model', label: 'Model' },
];

const activeTab = computed(() => {
  const value = String(route.query.tab || 'file');
  return tabOptions.some((item) => item.id === value) ? value : 'file';
});

const mode = computed(() => {
  const value = String(route.query.mode || 'home');
  return ['home', 'task-create', 'task-edit', 'task-detail', 'analysis-create', 'analysis-edit'].includes(value) ? value : 'home';
});
const isTaskEditorMode = computed(() => ['task-create', 'task-edit'].includes(mode.value));
const isTaskEditMode = computed(() => mode.value === 'task-edit');
const isAnalysisEditorMode = computed(() => ['analysis-create', 'analysis-edit'].includes(mode.value));
const isAnalysisEditMode = computed(() => mode.value === 'analysis-edit');
const taskSubmitLabel = computed(() => (isTaskEditMode.value ? 'Save Task' : 'Create Task'));
const analysisSubmitLabel = computed(() => (isAnalysisEditMode.value ? 'Save Analysis' : 'Add Analysis'));

const selectedTaskId = computed(() => String(route.query.taskId || ''));
const selectedAnalysisId = computed(() => String(route.query.analysisId || ''));
const activeDatasetId = computed(() => dashboard.value?.activeDatasetId || dashboard.value?.datasetIds?.[0] || '');
const activeDataset = computed(() => datasets.value.find((dataset) => dataset.id === activeDatasetId.value) || datasets.value[0] || null);
const taskFormDataset = computed(() => {
  const draftDatasetId = String(taskDraft.value.datasetIds?.[0] || '');
  return resolveTaskRuntimeDatasetDoc(draftDatasetId, taskDraft.value.preprocessingMode);
});
const modelDataset = computed(() => (
  selectedTask.value ? preferredDatasetForTask(selectedTask.value, selectedAnalysis.value || null) : null
) || activeDataset.value || null);
const assistantDataset = computed(() => (
  selectedTask.value ? preferredDatasetForTask(selectedTask.value, selectedAnalysis.value || null) : null
) || activeDataset.value || null);
const previewColumns = computed(() => activeDataset.value?.columns?.slice(0, 7) || []);
const previewRows = computed(() => activeDataset.value?.rows?.slice(0, 6) || []);
const selectedTask = computed(() => dashboard.value?.tasks?.find((task) => task.id === selectedTaskId.value) || null);
const selectedAnalysis = computed(() =>
  selectedTask.value?.analyses?.find((analysis) => analysis.id === selectedAnalysisId.value) || null
);
const selectedStatArtifact = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.statArtifact || null
    : selectedTask.value?.options?.statArtifact || null
));
const selectedTextOverviewArtifact = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.previewArtifact || null
    : selectedTask.value?.options?.previewArtifact || null
));
const selectedTextFeatureArtifact = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.textFeatureArtifact || null
    : selectedTask.value?.options?.textFeatureArtifact || null
));
const selectedImageFeatureArtifact = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.imageFeatureArtifact || null
    : selectedTask.value?.options?.imageFeatureArtifact || null
));
const selectedImageOcrArtifact = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.imageOcrArtifact || null
    : selectedTask.value?.options?.imageOcrArtifact || null
));
const selectedMlArtifact = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.mlArtifact || null
    : selectedTask.value?.options?.mlArtifact || null
));
const selectedReport = computed(() => (
  selectedAnalysis.value
    ? selectedAnalysis.value?.options?.report || null
    : selectedTask.value?.options?.report || null
));
const selectedTaskSummaryReport = computed(() => selectedTask.value?.options?.taskReport || null);
const recommendationDataset = computed(() => (
  selectedTask.value ? preferredDatasetForTask(selectedTask.value, selectedAnalysis.value || null) : activeDataset.value
) || activeDataset.value || null);
const currentRecommendationSummary = computed(() => buildRecommendationSummary({
  dataType: dashboard.value?.dataType || 'tabular',
  dataset: recommendationDataset.value,
  dashboard: dashboard.value || {},
  task: selectedTask.value || null,
  analysis: selectedAnalysis.value || null,
  artifacts: {
    stat: selectedStatArtifact.value || null,
    ml: selectedMlArtifact.value || null,
    textFeature: selectedTextFeatureArtifact.value || null,
    imageFeature: selectedImageFeatureArtifact.value || null,
    imageOcr: selectedImageOcrArtifact.value || null,
    textOverview: selectedTextOverviewArtifact.value || null,
  },
  primaryArtifact: selectedStatArtifact.value
    || selectedMlArtifact.value
    || selectedTextFeatureArtifact.value
    || selectedImageFeatureArtifact.value
    || selectedImageOcrArtifact.value
    || selectedTextOverviewArtifact.value
    || null,
  primaryReport: selectedReport.value || selectedTaskSummaryReport.value || null,
  datasetLinkArtifact: datasetLinkArtifact.value || null,
}));
const dashboardRecommendationSummary = computed(() => (
  dashboard.value?.recommendationSummary
  || buildRecommendationSummary({
    dataType: dashboard.value?.dataType || 'tabular',
    dataset: activeDataset.value,
    dashboard: dashboard.value || {},
    datasetLinkArtifact: datasetLinkArtifact.value || null,
  })
));
const taskEditorRecommendationSummary = computed(() => buildRecommendationSummary({
  dataType: dashboard.value?.dataType || 'tabular',
  dataset: taskFormDataset.value || activeDataset.value || null,
  dashboard: dashboard.value || {},
  task: {
    type: taskDraft.value.type,
    options: {
      targetColumn: taskDraft.value.targetColumn,
      featureColumns: Array.isArray(taskDraft.value.featureColumns) ? taskDraft.value.featureColumns.slice() : [],
      modelFamily: taskDraft.value.modelFamily,
      textColumn: taskDraft.value.textColumn,
      textMethod: taskDraft.value.textMethod,
      imageColumn: taskDraft.value.imageColumn,
      imageMethod: taskDraft.value.imageMethod,
    },
  },
  datasetLinkArtifact: datasetLinkArtifact.value || null,
}));
const currentRecommendationHeadline = computed(() => summarizeRecommendationHeadline(
  currentRecommendationSummary.value,
  selectedTask.value?.analyses?.length ? 'Rerun or duplicate an existing analysis' : 'Add the first analysis'
));
const analysisAssistantContext = computed(() => ({
  dashboard: {
    id: dashboard.value?.id || '',
    title: dashboard.value?.title || '',
    type: dashboard.value?.dataType || '',
  },
  task: selectedTask.value
    ? {
        id: selectedTask.value.id,
        title: selectedTask.value.title || '',
        type: selectedTask.value.type || '',
        executionSummary: selectedTask.value?.options?.executionSummary || '',
        report: selectedTask.value?.options?.report || null,
        taskReport: selectedTaskSummaryReport.value || null,
      }
    : null,
  analysis: selectedAnalysis.value
    ? {
        id: selectedAnalysis.value.id,
        title: selectedAnalysis.value.title || '',
        method: selectedAnalysis.value.method || '',
        resultType: selectedAnalysis.value.resultType || '',
        executionSummary: selectedAnalysis.value?.options?.executionSummary || '',
        report: selectedAnalysis.value?.options?.report || null,
      }
    : null,
  dataset: assistantDataset.value
    ? {
        id: assistantDataset.value.id,
        name: assistantDataset.value.name || 'untitled',
        rowCount: assistantDataset.value.meta?.rowCount ?? assistantDataset.value.rows?.length ?? 0,
        columnCount: assistantDataset.value.meta?.colCount ?? assistantDataset.value.columns?.length ?? 0,
      }
    : null,
  artifacts: {
    stat: selectedStatArtifact.value || null,
    ml: selectedMlArtifact.value || null,
    textFeature: selectedTextFeatureArtifact.value || null,
    imageFeature: selectedImageFeatureArtifact.value || null,
    imageOcr: selectedImageOcrArtifact.value || null,
    textOverview: selectedTextOverviewArtifact.value || null,
  },
  recommendationSummary: currentRecommendationSummary.value,
}));
const analysisTemplates = computed(() => {
  const templates = getAnalysisTemplates(selectedTask.value?.type || taskDraft.value.type);
  const selectedImageMethod = normalizeImageTaskMethod(selectedTask.value?.options?.imageMethod || '');
  if (selectedTask.value?.type === 'image-analysis' && selectedImageMethod === 'ocr') {
    return templates.filter((template) => template.id === 'ocr');
  }
  return templates;
});
const taskTemplates = computed(() => {
  const dataType = dashboard.value?.dataType || 'tabular';
  const templates = getTaskTemplates(dataType);
  const hasTextReadyDataset = datasets.value.some((dataset) => {
    const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
    const metaTextColumns = Array.isArray(dataset?.meta?.textColumns)
      ? dataset.meta.textColumns.filter((column) => columns.includes(column))
      : [];
    if (metaTextColumns.length) return true;
    return columns.some((column) => String(column || '').endsWith('_ocr_text'));
  });
  if (!hasTextReadyDataset || templates.some((template) => template.type === 'text-analysis')) {
    return templates;
  }
  const textTemplate = getTaskTemplates('text').find((template) => template.type === 'text-analysis');
  return textTemplate ? [...templates, textTemplate] : templates;
});
const dashboardWizardResults = computed(() => dashboard.value?.wizardResults || { preprocessing: [], preview: [] });
const datasetLinkArtifact = computed(() => dashboard.value?.datasetLinks?.artifact || null);
const taskModelOptions = computed(() => getTaskModelOptions(taskDraft.value.type));
const showTaskModelFamily = computed(() => taskModelOptions.value.length > 0);
const datasetSummaries = computed(() =>
  datasets.value.map((dataset) => ({
    tabId: dataset.id,
    datasetId: dataset.id,
    name: dataset.name,
    rowCount: dataset.meta?.rowCount ?? dataset.rows?.length ?? 0,
    columnCount: dataset.meta?.colCount ?? dataset.columns?.length ?? 0,
    columns: dataset.columns || [],
    sampleRows: Array.isArray(dataset.rows) ? dataset.rows.slice(0, 120) : [],
    active: dataset.id === activeDatasetId.value,
    dirty: false,
  }))
);

function buildDatasetWarnings(dataset) {
  if (!dataset) return [];
  const warnings = [];
  const rowCount = dataset.meta?.rowCount ?? dataset.rows?.length ?? 0;
  const colCount = dataset.meta?.colCount ?? dataset.columns?.length ?? 0;
  if (!rowCount) warnings.push('This dataset is empty. Upload or attach data before opening a task.');
  if (colCount > 20) warnings.push('There are many columns. Start with a smaller set of priority fields.');
  if ((dataset.meta?.missingCount || 0) > 0) warnings.push('Missing values are present. A preprocessing or cleanup task is recommended first.');
  return warnings;
}

const profileSummary = computed(() => ({
  loading: false,
  error: '',
  sampleCount: Math.min(activeDataset.value?.rows?.length || 0, 200),
  duplicates: 0,
  warnings: buildDatasetWarnings(activeDataset.value),
  topCorrCount: 0,
  topAnovaCount: 0,
}));

const helperCatalog = computed(() => {
  const map = {
    file: [
      { id: 'dataset-overview', label: 'Dataset Overview', description: 'Review the connected datasets and current summary.' },
      { id: 'data-preview', label: 'Data Preview', description: 'Inspect a small sample before opening a task.' },
      { id: 'preprocess-guide', label: 'Prep Guide', description: 'See the next cleanup steps suggested for this dataset.' },
    ],
    graph: [
      { id: 'graph-recommend', label: 'Recommended Graphs', description: 'Start with charts that fit the current columns.' },
      { id: 'comparison-graphs', label: 'Comparison Graphs', description: 'Compare categories and distributions side by side.' },
      { id: 'relationship-graphs', label: 'Relationship Graphs', description: 'Inspect correlation, trend, and interaction patterns.' },
    ],
    stat: [
      { id: 'stat-summary', label: 'Summary Stats', description: 'Open describe-style tables first to understand the data.' },
      { id: 'stat-corr', label: 'Correlation', description: 'Review pairwise numeric relationships quickly.' },
      { id: 'stat-tests', label: 'Stat Tests', description: 'Run t-test, ANOVA, chi-square, and related checks.' },
    ],
    model: [
      { id: 'model-regression', label: 'Regression / Classification', description: 'Prepare the quickest baseline model for the current target.' },
      { id: 'model-prep', label: 'Model Inputs', description: 'Check target and feature column choices before training.' },
      { id: 'model-recommend', label: 'Model Recommendation', description: 'Review the next modeling direction that best fits the dataset.' },
    ],
  };
  return map[activeTab.value];
});

const detailContext = computed(() => {
  if (assistantMode.value) {
    const scope = selectedAnalysis.value
      ? `Analysis: ${selectedAnalysis.value.title}`
      : selectedTask.value
        ? `Task: ${selectedTask.value.title}`
        : `Dashboard: ${dashboard.value?.title || 'Untitled dashboard'}`;
    const datasetSummary = activeDataset.value
      ? `${activeDataset.value.name} · ${activeDataset.value.meta?.rowCount ?? activeDataset.value.rows?.length ?? 0} rows / ${activeDataset.value.meta?.colCount ?? activeDataset.value.columns?.length ?? 0} cols`
      : 'No dataset connected yet.';
    return {
      title: assistantMode.value === 'chat' ? 'Dashboard Chat Assistant' : 'MCP Automation Assistant',
      subtitle: `${scope}. ${datasetSummary}`,
    };
  }
  if (mode.value === 'task-detail' && selectedTask.value) {
    return {
      title: selectedTask.value.title,
      subtitle: selectedTask.value.description || 'No task description yet.',
    };
  }
  return {
    title: activeDataset.value?.name || 'Dashboard details',
    subtitle: activeDataset.value
      ? `${activeDataset.value.meta?.rowCount ?? activeDataset.value.rows?.length ?? 0} rows / ${activeDataset.value.meta?.colCount ?? activeDataset.value.columns?.length ?? 0} cols`
      : 'No dataset connected yet.',
  };
});

function makePresetKey(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function inferDatasetShape(dataset) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const numeric = columns.filter((column) => rows.some((row) => Number.isFinite(Number(row?.[column]))));
  const categorical = columns.filter((column) => !numeric.includes(column));
  const metaTextColumns = Array.isArray(dataset?.meta?.textColumns)
    ? dataset.meta.textColumns.filter((column) => categorical.includes(column))
    : [];
  const inferredText = categorical.filter((column) =>
    rows.some((row) => String(row?.[column] ?? '').trim().length >= 18)
  );
  const text = Array.from(new Set([...metaTextColumns, ...inferredText]));
  return { columns, numeric, categorical, text };
}

function resolveColumnHint(shape, hint, fallback = '') {
  if (!hint) return fallback;
  if (shape.columns.includes(hint)) return hint;
  const hintMap = {
    firstColumn: shape.columns[0] || fallback,
    firstNumeric: shape.numeric[0] || fallback,
    secondNumeric: shape.numeric[1] || shape.numeric[0] || fallback,
    firstCategorical: shape.categorical[0] || shape.columns[0] || fallback,
    firstText: shape.text[0] || shape.categorical[0] || shape.columns[0] || fallback,
  };
  return hintMap[hint] || fallback;
}

function resolveFeatureHints(shape, hints = [], target = '') {
  const rawHints = Array.isArray(hints) && hints.length ? hints : ['firstCategorical', 'firstNumeric'];
  const resolved = rawHints
    .map((hint) => resolveColumnHint(shape, hint, ''))
    .filter((column) => column && column !== target);
  return Array.from(new Set(resolved));
}

function findStoredPanelPreset(task, analysis = null) {
  return analysis?.options?.panelPreset || task?.options?.panelPreset || null;
}

function collectOptionDatasetIds(options = {}) {
  const ids = [
    options?.sourceDatasetId,
    options?.derivedDatasetId,
    options?.transformArtifact?.derivedDatasetId,
    options?.textFeatureArtifact?.derivedDatasetId,
    options?.imageFeatureArtifact?.derivedDatasetId,
    options?.imageOcrArtifact?.derivedDatasetId,
    options?.statArtifact?.derivedDatasetId,
    options?.mlArtifact?.derivedDatasetId,
  ];
  return ids.map((value) => String(value || '').trim()).filter(Boolean);
}

const TEXT_METHOD_OPTIONS = [
  { value: 'tfidf', label: 'TF-IDF feature table' },
  { value: 'sentiment', label: 'Sentiment feature table' },
  { value: 'semantic', label: 'Semantic concept feature table' },
  { value: 'embedding', label: 'Embedding feature table' },
];

const IMAGE_RUNTIME_OPTIONS = [
  { value: 'features', label: 'Feature extraction' },
  { value: 'ocr', label: 'OCR text extraction' },
];

const ML_MODEL_OPTIONS = {
  regression: [
    { value: 'linear', label: 'Linear baseline' },
    { value: 'elasticnet', label: 'ElasticNet' },
    { value: 'tree', label: 'Decision tree' },
    { value: 'forest', label: 'Random forest' },
    { value: 'extra_trees', label: 'Extra trees' },
    { value: 'adaboost', label: 'AdaBoost' },
    { value: 'svm', label: 'SVM' },
    { value: 'voting', label: 'Voting ensemble' },
    { value: 'hgb', label: 'Hist gradient boosting' },
    { value: 'nn', label: 'Neural network' },
  ],
  classification: [
    { value: 'linear', label: 'Logistic baseline' },
    { value: 'tree', label: 'Decision tree' },
    { value: 'forest', label: 'Random forest' },
    { value: 'extra_trees', label: 'Extra trees' },
    { value: 'adaboost', label: 'AdaBoost' },
    { value: 'svm', label: 'SVM' },
    { value: 'calibrated', label: 'Calibrated forest' },
    { value: 'voting', label: 'Voting ensemble' },
    { value: 'hgb', label: 'Hist gradient boosting' },
    { value: 'nb', label: 'Naive Bayes' },
    { value: 'knn', label: 'KNN' },
    { value: 'nn', label: 'Neural network' },
  ],
};

function normalizeTaskPreprocessingMode(mode = 'reuse') {
  return String(mode || '').toLowerCase() === 'reuse' ? 'reuse' : 'source';
}

function formatTaskPreprocessingMode(mode = 'reuse') {
  return normalizeTaskPreprocessingMode(mode) === 'reuse' ? 'Reuse prepared dataset' : 'Use source dataset';
}

function getTaskModelOptions(taskType = '') {
  return ML_MODEL_OPTIONS[String(taskType || '').toLowerCase()] || [];
}

function getDefaultTaskModelFamily(taskType = '') {
  return String(taskType || '').toLowerCase() === 'classification' ? 'forest' : String(taskType || '').toLowerCase() === 'regression' ? 'linear' : '';
}

function getDefaultTextMethod() {
  return 'tfidf';
}

function getDefaultImageMethod() {
  return 'features';
}

function normalizeTextTaskMethod(value = '') {
  return normalizeTextFeatureMethod(value) || getDefaultTextMethod();
}

function normalizeTaskModelFamily(taskType = '', value = '') {
  const options = getTaskModelOptions(taskType);
  if (!options.length) return '';
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return getDefaultTaskModelFamily(taskType);
  const aliases = {
    logit: 'linear',
    logistic: 'linear',
    random_forest: 'forest',
    rf: 'forest',
    extratrees: 'extra_trees',
    extraTrees: 'extra_trees',
    gradient_boosting: 'hgb',
    hist_gb: 'hgb',
    neural: 'nn',
    mlp: 'nn',
  };
  const candidate = aliases[normalizedValue] || normalizedValue;
  return options.some((option) => option.value === candidate) ? candidate : getDefaultTaskModelFamily(taskType);
}

function resolveTaskRuntimeDatasetDoc(datasetId = '', preprocessingMode = 'reuse') {
  const selectedDataset = datasets.value.find((dataset) => dataset.id === datasetId) || activeDataset.value || null;
  if (!selectedDataset) return null;
  if (normalizeTaskPreprocessingMode(preprocessingMode) === 'reuse') return selectedDataset;
  const parentDatasetId = selectedDataset.meta?.parentDatasetId || '';
  return datasets.value.find((dataset) => dataset.id === parentDatasetId) || selectedDataset;
}

function buildTaskDatasetSelection(datasetId = '', preprocessingMode = 'reuse') {
  const selectedDataset = datasets.value.find((dataset) => dataset.id === datasetId) || activeDataset.value || null;
  const runtimeDataset = resolveTaskRuntimeDatasetDoc(datasetId, preprocessingMode);
  return {
    selectedDataset,
    runtimeDataset,
    runtimeDatasetId: runtimeDataset?.id || selectedDataset?.id || '',
    preprocessingMode: normalizeTaskPreprocessingMode(preprocessingMode),
  };
}

function preferredDatasetForTask(task, analysis = null) {
  const primaryId = String(
    analysis?.options?.derivedDatasetId
    || analysis?.options?.imageOcrArtifact?.derivedDatasetId
    || analysis?.options?.imageFeatureArtifact?.derivedDatasetId
    || analysis?.options?.textFeatureArtifact?.derivedDatasetId
    || task?.options?.imageOcrArtifact?.derivedDatasetId
    || task?.options?.imageFeatureArtifact?.derivedDatasetId
    || task?.options?.derivedDatasetId
    || task?.options?.textFeatureArtifact?.derivedDatasetId
    || (Array.isArray(task?.datasetIds) ? task.datasetIds[0] : '')
    || dashboard.value?.datasetLinks?.preparedDatasetId
    || ''
  );
  return datasets.value.find((dataset) => dataset.id === primaryId) || activeDataset.value || null;
}

function resolveDatasetFromDocs(docs, task, analysis = null, fallbackDashboard = null) {
  const candidates = [
    analysis?.options?.derivedDatasetId,
    analysis?.options?.imageOcrArtifact?.derivedDatasetId,
    analysis?.options?.imageFeatureArtifact?.derivedDatasetId,
    analysis?.options?.textFeatureArtifact?.derivedDatasetId,
    task?.options?.imageOcrArtifact?.derivedDatasetId,
    task?.options?.imageFeatureArtifact?.derivedDatasetId,
    task?.options?.derivedDatasetId,
    task?.options?.textFeatureArtifact?.derivedDatasetId,
    ...(Array.isArray(analysis?.datasetIds) ? analysis.datasetIds : []),
    ...(Array.isArray(task?.datasetIds) ? task.datasetIds : []),
    task?.options?.sourceDatasetId,
    fallbackDashboard?.datasetLinks?.preparedDatasetId,
    fallbackDashboard?.activeDatasetId,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const datasetId of candidates) {
    const match = (Array.isArray(docs) ? docs : []).find((dataset) => dataset.id === datasetId);
    if (match) return match;
  }
  return (Array.isArray(docs) ? docs[0] : null) || activeDataset.value || null;
}

function buildGraphPreset(task, dataset, analysis = null) {
  const storedPreset = findStoredPanelPreset(task, analysis);
  const shape = inferDatasetShape(dataset);
  if (storedPreset?.kind === 'graph') {
    const defaultX = shape.categorical[0] || shape.numeric[0] || shape.columns[0] || '';
    const defaultY = shape.numeric[0] || shape.columns[1] || '';
    const type = storedPreset.type || analysis?.chartType || 'bar';
    return {
      key: makePresetKey('graph'),
      type,
      x: resolveColumnHint(shape, storedPreset.xHint || storedPreset.x, defaultX),
      y: type === 'histogram' ? '' : resolveColumnHint(shape, storedPreset.yHint || storedPreset.y, defaultY),
      hue: resolveColumnHint(shape, storedPreset.hueHint || storedPreset.hue, ''),
      size: resolveColumnHint(shape, storedPreset.sizeHint || storedPreset.size, ''),
      options: {
        title: storedPreset.title || analysis?.title || task?.title || 'Graph preset',
        ...(storedPreset.options || {}),
      },
    };
  }
  const categoryColumn = shape.categorical[0] || shape.columns[0] || '';
  const numericColumn = shape.numeric[0] || shape.columns[1] || shape.columns[0] || '';
  const method = String(analysis?.method || task?.type || '').toLowerCase();
  const typeMap = {
    histogram: 'histogram',
    boxplot: 'box',
    kde: 'line',
    violin: 'violin',
  };
  const chartType = typeMap[method] || (task?.type === 'distribution' ? 'histogram' : 'bar');
  return {
    key: makePresetKey('graph'),
    type: chartType,
    x: chartType === 'histogram' ? (numericColumn || categoryColumn) : categoryColumn,
    y: chartType === 'histogram' ? '' : numericColumn,
    options: {
      title: analysis?.title || task?.title || 'Graph preset',
      xLabel: chartType === 'histogram' ? (numericColumn || categoryColumn) : categoryColumn,
      yLabel: chartType === 'histogram' ? 'count' : numericColumn,
      agg: chartType === 'bar' ? 'mean' : 'count',
    },
  };
}

function buildStatPreset(task, analysis = null) {
  const storedPreset = findStoredPanelPreset(task, analysis);
  if (storedPreset?.kind === 'stat') {
    return {
      key: makePresetKey('stat'),
      statPanel: storedPreset.statPanel || 'report',
      title: storedPreset.title || analysis?.title || `${task?.title || 'Task'} report`,
      autoRun: storedPreset.autoRun !== false,
      op: storedPreset.op || '',
      args: storedPreset.args || {},
    };
  }
  const resultType = String(analysis?.resultType || '').toLowerCase();
  const method = String(analysis?.method || '').toLowerCase();
  const statPanel = resultType === 'corr' || method.includes('correlation')
    ? 'corr'
    : resultType === 'tests'
      ? 'tests'
      : 'report';
  return {
    key: makePresetKey('stat'),
    statPanel,
    title: analysis?.title || `${task?.title || 'Task'} report`,
    autoRun: true,
  };
}

function buildMlPreset(task, dataset, analysis = null) {
  const storedPreset = findStoredPanelPreset(task, analysis);
  const shape = inferDatasetShape(dataset);
  const taskOptions = task?.options || {};
  if (storedPreset?.kind === 'ml') {
    const target = resolveColumnHint(
      shape,
      storedPreset.targetHint || storedPreset.request?.args?.target || taskOptions.targetColumn || '',
      ''
    );
    const features = resolveFeatureHints(
      shape,
      storedPreset.featureHints || storedPreset.request?.args?.features || taskOptions.featureColumns || [],
      target
    );
    return {
      key: makePresetKey('ml'),
      panel: 'ml',
      title: storedPreset.title || analysis?.title || `${task?.title || 'Task'} model preset`,
      autoRun: storedPreset.autoRun !== false,
      request: {
        task: storedPreset.request?.task || 'regression',
        model: storedPreset.request?.model || normalizeTaskModelFamily(task?.type, taskOptions.modelFamily),
        args: {
          target,
          features,
        },
        options: {
          preset: 'balanced',
          ...(storedPreset.request?.options || {}),
        },
      },
    };
  }
  const firstNumeric = shape.numeric[0] || '';
  const firstCategory = shape.categorical[0] || '';
  const numericFeatures = shape.numeric.filter((column) => column !== firstNumeric).slice(0, 5);
  let panelTask = 'regression';
  let model = normalizeTaskModelFamily(task?.type, taskOptions.modelFamily);
  let target = resolveColumnHint(shape, taskOptions.targetColumn || '', firstNumeric);
  let features = [];
  let autoRun = !!(target && features.length);

  if (task?.type === 'classification') {
    panelTask = 'classification';
    model = normalizeTaskModelFamily('classification', taskOptions.modelFamily);
    target = resolveColumnHint(shape, taskOptions.targetColumn || '', firstCategory || shape.columns[0] || '');
    features = resolveFeatureHints(shape, taskOptions.featureColumns || [], target);
    if (!features.length) features = shape.columns.filter((column) => column !== target).slice(0, 5);
    autoRun = !!(target && features.length);
  } else if (task?.type === 'text-analysis') {
    const textArtifact = analysis?.options?.textFeatureArtifact || taskOptions.textFeatureArtifact || null;
    const textFeatureColumns = Array.isArray(textArtifact?.result?.featureColumns)
      ? textArtifact.result.featureColumns.filter((column) => shape.columns.includes(column))
      : [];
    const requestedTarget = resolveColumnHint(shape, taskOptions.targetColumn || '', '');
    if (requestedTarget) {
      panelTask = shape.numeric.includes(requestedTarget) ? 'regression' : 'classification';
      model = panelTask === 'classification' ? 'forest' : 'linear';
      target = requestedTarget;
      features = textFeatureColumns.length
        ? textFeatureColumns.filter((column) => column !== target)
        : shape.columns.filter((column) => column !== target).slice(0, 6);
      autoRun = !!(target && features.length);
    } else {
      panelTask = 'dim_reduction';
      model = 'pca';
      target = '';
      features = textFeatureColumns.length ? textFeatureColumns : (shape.numeric.length ? shape.numeric.slice(0, 6) : shape.columns.slice(0, 6));
      autoRun = features.length > 0;
    }
  } else if (task?.type === 'image-analysis') {
    panelTask = 'clustering';
    model = 'kmeans';
    target = '';
    features = shape.numeric.slice(0, 5);
    autoRun = shape.numeric.length > 0;
  }

  if (analysis?.method === 'ridge' || analysis?.method === 'lasso') {
    panelTask = 'regression';
    model = analysis.method === 'lasso' ? 'elasticnet' : 'linear';
    target = resolveColumnHint(shape, taskOptions.targetColumn || '', firstNumeric);
  }

  if (panelTask === 'regression') {
    features = resolveFeatureHints(shape, taskOptions.featureColumns || [], target);
    if (!features.length) {
      features = numericFeatures.length
        ? numericFeatures
        : shape.columns.filter((column) => column !== target).slice(0, 5);
    }
    autoRun = !!(target && features.length);
  }

  return {
    key: makePresetKey('ml'),
    panel: 'ml',
    title: analysis?.title || `${task?.title || 'Task'} model preset`,
    autoRun,
    request: {
      task: panelTask,
      model,
      args: {
        target,
        features,
      },
      options: {
        preset: 'balanced',
        cv: panelTask === 'regression' || panelTask === 'classification' ? 3 : 0,
        scoring: panelTask === 'classification' ? 'accuracy' : panelTask === 'regression' ? 'r2' : '',
      },
    },
  };
}

function resolveMlArtifactRequest(task, analysis = null, dataset = null) {
  const storedPreset = findStoredPanelPreset(task, analysis);
  if (storedPreset && storedPreset.kind && storedPreset.kind !== 'ml') return null;
  const datasetDoc = dataset || preferredDatasetForTask(task);
  if (!datasetDoc) return null;
  const preset = buildMlPreset(task, datasetDoc, analysis);
  const request = preset?.request && typeof preset.request === 'object' ? preset.request : null;
  const mlTask = String(request?.task || '').toLowerCase();
  if (['regression', 'classification'].includes(mlTask)) {
    if (!request?.args?.target || !Array.isArray(request?.args?.features) || !request.args.features.length) return null;
    return request;
  }
  if (['clustering', 'dim_reduction'].includes(mlTask)) {
    if (!Array.isArray(request?.args?.features) || !request.args.features.length) return null;
    return request;
  }
  return request;
}

function resolveLinkedPanel(task, analysis = null) {
  const storedPreset = findStoredPanelPreset(task, analysis);
  if (storedPreset?.kind === 'file' || storedPreset?.kind === 'graph' || storedPreset?.kind === 'stat' || storedPreset?.kind === 'ml') {
    return storedPreset.kind;
  }
  const method = String(analysis?.method || '').toLowerCase();
  const resultType = String(analysis?.resultType || '').toLowerCase();
  if (['histogram', 'boxplot', 'kde', 'violin'].includes(method) || task?.type === 'distribution') return 'graph';
  if (['report', 'corr', 'tests'].includes(resultType) || task?.type === 'preprocessing') return 'stat';
  return 'ml';
}

function applyLinkedPanel(task, analysis = null) {
  const dataset = preferredDatasetForTask(task, analysis);
  if (!dataset) return;
  const panel = resolveLinkedPanel(task, analysis);

  graphPreset.value = null;
  statPreset.value = null;
  mlPreset.value = null;
  graphOverrideRows.value = null;
  graphOverrideColumns.value = null;

  if (panel === 'file') {
    setTab('file');
    return;
  }
  if (panel === 'graph') {
    graphPreset.value = buildGraphPreset(task, dataset, analysis);
    setTab('graph');
    return;
  }
  if (panel === 'stat') {
    statPreset.value = buildStatPreset(task, analysis);
    setTab('stat');
    return;
  }
  mlPreset.value = buildMlPreset(task, dataset, analysis);
  setTab('model');
}

function formatRelativeTime(timestamp) {
  const delta = Date.now() - Number(timestamp || 0);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function isEqualJson(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function patchQuery(patch) {
  const next = { ...route.query, ...patch };
  Object.keys(next).forEach((key) => {
    const value = next[key];
    if (value === null || value === undefined || value === '') delete next[key];
  });
  router.replace({ name: 'dashboard', params: { dashboardId: route.params.dashboardId }, query: next }).catch(() => {});
}

function setTab(tabId) {
  patchQuery({ tab: tabId });
}

function openTaskCreate() {
  detailOpen.value = true;
  assistantMode.value = '';
  taskDraft.value = buildTaskDraft(taskDraft.value.type || '', activeDataset.value?.id || '');
  patchQuery({ mode: 'task-create', taskId: null, analysisId: null });
}

function openTaskEdit(taskId) {
  const task = dashboard.value?.tasks?.find((item) => item.id === taskId) || null;
  if (!task) return;
  detailOpen.value = true;
  assistantMode.value = '';
  hydrateTaskDraft(task);
  patchQuery({ mode: 'task-edit', taskId, analysisId: null });
}

function openTaskDetail(taskId, analysisId = null) {
  detailOpen.value = true;
  assistantMode.value = '';
  patchQuery({ mode: 'task-detail', taskId, analysisId });
}

function openAnalysisCreate(taskId) {
  detailOpen.value = true;
  assistantMode.value = '';
  analysisDraft.value = buildAnalysisDraft(dashboard.value?.tasks?.find((item) => item.id === taskId)?.type || '');
  patchQuery({ mode: 'analysis-create', taskId, analysisId: null });
}

function openAnalysisEdit(taskId, analysisId) {
  const task = dashboard.value?.tasks?.find((item) => item.id === taskId) || null;
  const analysis = task?.analyses?.find((item) => item.id === analysisId) || null;
  if (!task || !analysis) return;
  detailOpen.value = true;
  assistantMode.value = '';
  hydrateAnalysisDraft(analysis);
  patchQuery({ mode: 'analysis-edit', taskId, analysisId });
}

function closeEditor() {
  patchQuery({ mode: null, taskId: null, analysisId: null });
}

async function loadDashboardDatasets(dashboardDoc) {
  const datasetIds = Array.from(new Set([
    ...(dashboardDoc?.datasetIds || []),
    dashboardDoc?.datasetLinks?.primaryDatasetId,
    dashboardDoc?.datasetLinks?.preparedDatasetId,
    ...(dashboardDoc?.tasks || []).flatMap((task) => [
      ...(Array.isArray(task?.datasetIds) ? task.datasetIds : []),
      ...collectOptionDatasetIds(task?.options || {}),
      ...((task?.analyses || []).flatMap((analysis) => [
        ...(Array.isArray(analysis?.datasetIds) ? analysis.datasetIds : []),
        ...collectOptionDatasetIds(analysis?.options || {}),
      ])),
    ]),
  ].map((value) => String(value || '').trim()).filter(Boolean)));

  const docs = await Promise.all(
    datasetIds.map(async (datasetId) => {
      try {
        return await loadDataset(datasetId);
      } catch {
        return null;
      }
    })
  );
  return docs.filter(Boolean);
}

function isTransformManagedTask(task) {
  if (!task || task.type !== 'preprocessing') return false;
  if (task.options?.wizardSource === 'preprocessing') return true;
  if (task.options?.wizardResultId === 'handle-missing') return true;
  return Array.isArray(task.options?.selectedPreparationIds) && task.options.selectedPreparationIds.length > 0;
}

function isTextOverviewManagedTask(task) {
  if (!task) return false;
  if (task.options?.wizardResultId === 'text-overview') return true;
  return Array.isArray(task.analyses) && task.analyses.some((analysis) => String(analysis?.method || '') === 'text-overview');
}

function isTextFeatureManagedTask(task) {
  if (!task || task.type !== 'text-analysis') return false;
  return !isTextOverviewManagedTask(task);
}

function resolveTextFeatureArtifactRequest(task, analysis = null, dataset = null) {
  if (!isTextFeatureManagedTask(task)) return null;
  return buildTextFeatureRequest(task, analysis, dataset);
}

function buildTextFeaturePanelPreset(task, artifact, dataset, analysis = null) {
  const featureColumns = Array.isArray(artifact?.result?.featureColumns) ? artifact.result.featureColumns.filter(Boolean) : [];
  const targetColumn = String(artifact?.request?.targetColumn || '').trim();
  const shape = inferDatasetShape(dataset);
  const hasTarget = targetColumn && shape.columns.includes(targetColumn);
  if (hasTarget) {
    const targetIsNumeric = shape.numeric.includes(targetColumn);
    return {
      kind: 'ml',
      autoRun: true,
      title: analysis?.title || task?.title || 'Text model preset',
      request: {
        task: targetIsNumeric ? 'regression' : 'classification',
        model: targetIsNumeric ? 'linear' : 'forest',
        args: {
          target: targetColumn,
          features: featureColumns,
        },
        options: {
          preset: 'balanced',
          cv: 3,
          scoring: targetIsNumeric ? 'r2' : 'accuracy',
        },
      },
    };
  }
  if (featureColumns.length) {
    return {
      kind: 'ml',
      autoRun: true,
      title: analysis?.title || task?.title || 'Text feature projection',
      request: {
        task: 'dim_reduction',
        model: 'pca',
        args: {
          features: featureColumns,
        },
        options: {
          preset: 'balanced',
          cv: 0,
          scoring: '',
        },
      },
    };
  }
  return {
    kind: 'file',
    title: analysis?.title || task?.title || 'Text feature preview',
  };
}

function isImageFeatureManagedTask(task) {
  return !!task && task.type === 'image-analysis';
}

function resolveImageFeatureArtifactRequest(task, analysis = null, dataset = null) {
  if (!isImageFeatureManagedTask(task)) return null;
  if (analysis && String(analysis?.method || '').trim().toLowerCase() === 'ocr') return null;
  if (!analysis && normalizeImageTaskMethod(task?.options?.imageMethod || '') === 'ocr') return null;
  return buildImageFeatureRequest(task, analysis, dataset);
}

function buildImageFeaturePanelPreset(task, artifact, dataset, analysis = null) {
  const featureColumns = Array.isArray(artifact?.result?.featureColumns)
    ? artifact.result.featureColumns.filter((column) => Array.isArray(dataset?.columns) && dataset.columns.includes(column))
    : [];
  const targetColumn = String(artifact?.request?.targetColumn || '').trim();
  const shape = inferDatasetShape(dataset);
  const numericFeatureColumns = featureColumns.filter((column) => shape.numeric.includes(column));
  const hasTarget = targetColumn && shape.columns.includes(targetColumn);
  if (hasTarget && numericFeatureColumns.length) {
    const targetIsNumeric = shape.numeric.includes(targetColumn);
    return {
      kind: 'ml',
      autoRun: true,
      title: analysis?.title || task?.title || 'Image model preset',
      request: {
        task: targetIsNumeric ? 'regression' : 'classification',
        model: targetIsNumeric ? 'linear' : 'forest',
        args: {
          target: targetColumn,
          features: numericFeatureColumns,
        },
        options: {
          preset: 'balanced',
          cv: 3,
          scoring: targetIsNumeric ? 'r2' : 'accuracy',
        },
      },
    };
  }
  if (numericFeatureColumns.length) {
    return {
      kind: 'ml',
      autoRun: true,
      title: analysis?.title || task?.title || 'Image feature projection',
      request: {
        task: 'dim_reduction',
        model: 'pca',
        args: {
          features: numericFeatureColumns,
        },
        options: {
          preset: 'balanced',
          cv: 0,
          scoring: '',
        },
      },
    };
  }
  return {
    kind: 'file',
    title: analysis?.title || task?.title || 'Image preview',
  };
}

function resolveImageOcrArtifactRequest(task, analysis = null, dataset = null) {
  if (!isImageFeatureManagedTask(task)) return null;
  return buildImageOcrRequest(task, analysis, dataset);
}

function buildImageOcrPanelPreset(task, artifact, _dataset, analysis = null) {
  return {
    kind: 'file',
    title: analysis?.title || task?.title || 'OCR text preview',
    request: {
      task: 'ocr',
      textColumn: String(artifact?.request?.textColumn || ''),
    },
  };
}

function buildTransformSignature(sourceDataset, planResult) {
  return JSON.stringify({
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    appliedIds: Array.isArray(planResult?.appliedSteps) ? planResult.appliedSteps.map((step) => step.id) : [],
    skippedIds: Array.isArray(planResult?.skippedSteps) ? planResult.skippedSteps.map((step) => step.id) : [],
    recipe: planResult?.recipe || {},
  });
}

function compactReportArtifact(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    generatedAt: Date.now(),
    meta: result.meta || {},
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    summary: result.summary || {},
    tableNames: Array.isArray(result.tables) ? result.tables.map((table) => table?.name).filter(Boolean) : [],
  };
}

function buildPreparedDatasetName(sourceDataset) {
  const baseName = String(sourceDataset?.name || 'dataset').trim() || 'dataset';
  return `${baseName} - prepared`;
}

function buildTextFeatureDatasetName(sourceDataset, method = 'tfidf') {
  const baseName = String(sourceDataset?.name || 'dataset').trim() || 'dataset';
  return `${baseName} - ${method} features`;
}

function shouldRetargetTaskToSource(task, sourceIds = new Set()) {
  const derivedDatasetId = task?.options?.derivedDatasetId || '';
  if (derivedDatasetId) return false;
  const taskDatasetId = Array.isArray(task?.datasetIds) ? task.datasetIds[0] : '';
  if (!taskDatasetId) return true;
  return sourceIds.has(taskDatasetId);
}

function retargetTaskToDataset(task, datasetId, artifact, sourceIds = new Set()) {
  if (!shouldRetargetTaskToSource(task, sourceIds)) return task;
  return {
    ...task,
    datasetIds: [datasetId],
    options: {
      ...(task.options || {}),
      sourceDatasetId: datasetId,
      datasetLinkArtifact: artifact,
    },
    analyses: Array.isArray(task.analyses)
      ? task.analyses.map((analysis) => ({
        ...analysis,
        options: {
          ...(analysis.options || {}),
          sourceDatasetId: datasetId,
          datasetLinkArtifact: artifact,
        },
      }))
      : [],
  };
}

function updateWizardPreprocessingResults(wizardResults, planResult, executionSummary) {
  const appliedIds = new Set((planResult?.appliedSteps || []).map((step) => step.id));
  const skippedMap = new Map((planResult?.skippedSteps || []).map((step) => [step.id, step.reason]));
  return {
    ...(wizardResults || {}),
    preprocessing: Array.isArray(wizardResults?.preprocessing)
      ? wizardResults.preprocessing.map((item) => {
        if (appliedIds.has(item.id)) {
          return {
            ...item,
            status: 'applied',
            summary: executionSummary,
          };
        }
        if (skippedMap.has(item.id)) {
          return {
            ...item,
            status: 'pending-manual',
            summary: skippedMap.get(item.id),
          };
        }
        return item;
      })
      : [],
  };
}

function updateWizardPreviewResults(wizardResults, previewId, executionSummary, status = 'ready') {
  return {
    ...(wizardResults || {}),
    preview: Array.isArray(wizardResults?.preview)
      ? wizardResults.preview.map((item) => (
        item.id === previewId
          ? {
            ...item,
            status,
            summary: executionSummary || item.summary,
          }
          : item
      ))
      : [],
  };
}

function uniqueValuesForColumn(rows = [], column, limit = 6) {
  const values = [];
  const seen = new Set();
  for (const row of rows) {
    const raw = String(row?.[column] ?? '').trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    values.push(raw);
    if (values.length >= limit) break;
  }
  return values;
}

function numericColumnsForDataset(dataset) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const metaColumns = Array.isArray(dataset?.meta?.numericColumns)
    ? dataset.meta.numericColumns.filter((column) => columns.includes(column))
    : [];
  if (metaColumns.length) return metaColumns;
  return inferDatasetShape(dataset).numeric;
}

function categoricalColumnsForDataset(dataset) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const metaColumns = Array.isArray(dataset?.meta?.categoricalColumns)
    ? dataset.meta.categoricalColumns.filter((column) => columns.includes(column))
    : [];
  if (metaColumns.length) return metaColumns;
  return inferDatasetShape(dataset).categorical;
}

function imageColumnsForDataset(dataset) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const metaColumns = Array.isArray(dataset?.meta?.imageColumns)
    ? dataset.meta.imageColumns.filter((column) => columns.includes(column))
    : [];
  return metaColumns;
}

function categoricalLevelCounts(dataset) {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const categorical = categoricalColumnsForDataset(dataset);
  return categorical.map((column) => ({
    column,
    levels: uniqueValuesForColumn(rows, column, 12).length,
  }));
}

function buildTestsRequestForOp(dataset, op, storedPreset = {}) {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const numeric = numericColumnsForDataset(dataset);
  const categorical = categoricalColumnsForDataset(dataset);
  const groups = categoricalLevelCounts(dataset);
  const binaryGroup = groups.find((item) => item.levels === 2)?.column || '';
  const multiGroup = groups.find((item) => item.levels >= 3)?.column || '';
  const firstNumeric = numeric[0] || '';

  if (op === 'ttest' && firstNumeric && (storedPreset.args?.group || binaryGroup)) {
    return {
      kind: 'stat',
      statPanel: 'tests',
      op: 'ttest',
      title: storedPreset.title || `${storedPreset.args?.group || binaryGroup} group t-test`,
      autoRun: true,
      args: {
        value: storedPreset.args?.value || firstNumeric,
        group: storedPreset.args?.group || binaryGroup,
      },
    };
  }

  if (op === 'anova' && firstNumeric && (storedPreset.args?.group || multiGroup)) {
    return {
      kind: 'stat',
      statPanel: 'tests',
      op: 'anova',
      title: storedPreset.title || `${storedPreset.args?.group || multiGroup} group ANOVA`,
      autoRun: true,
      args: {
        value: storedPreset.args?.value || firstNumeric,
        group: storedPreset.args?.group || multiGroup,
      },
    };
  }

  if (op === 'normality' && (storedPreset.args?.column || firstNumeric)) {
    return {
      kind: 'stat',
      statPanel: 'tests',
      op: 'normality',
      title: storedPreset.title || `${storedPreset.args?.column || firstNumeric} normality check`,
      autoRun: true,
      args: {
        column: storedPreset.args?.column || firstNumeric,
      },
    };
  }

  if (op === 'levene' && firstNumeric && (storedPreset.args?.group || multiGroup || binaryGroup)) {
    return {
      kind: 'stat',
      statPanel: 'tests',
      op: 'levene',
      title: storedPreset.title || `${storedPreset.args?.group || multiGroup || binaryGroup} variance homogeneity`,
      autoRun: true,
      args: {
        column: storedPreset.args?.column || firstNumeric,
        group: storedPreset.args?.group || multiGroup || binaryGroup,
      },
    };
  }

  if (op === 'chisq' && (storedPreset.args?.a || categorical[0]) && (storedPreset.args?.b || categorical[1])) {
    return {
      kind: 'stat',
      statPanel: 'tests',
      op: 'chisq',
      title: storedPreset.title || `${storedPreset.args?.a || categorical[0]} x ${storedPreset.args?.b || categorical[1]} chi-square`,
      autoRun: true,
      args: {
        a: storedPreset.args?.a || categorical[0],
        b: storedPreset.args?.b || categorical[1],
      },
    };
  }

  return null;
}

function inferExplicitTestOp(task, analysis = null) {
  const source = [
    analysis?.method,
    analysis?.title,
    task?.type,
    task?.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (source.includes('normality') || source.includes('jarque')) return 'normality';
  if (source.includes('levene') || source.includes('homogeneity') || source.includes('variance')) return 'levene';
  if (source.includes('anova')) return 'anova';
  if (source.includes('chi') || source.includes('chisq')) return 'chisq';
  if (source.includes('t-test') || source.includes('ttest')) return 'ttest';
  return '';
}

function inferTestsRequest(dataset, storedPreset = {}, preferredOp = '') {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const numeric = numericColumnsForDataset(dataset);
  const categorical = categoricalColumnsForDataset(dataset);
  const groups = categoricalLevelCounts(dataset);
  const binaryGroup = groups.find((item) => item.levels === 2)?.column || '';
  const multiGroup = groups.find((item) => item.levels >= 3)?.column || '';
  const firstNumeric = numeric[0] || '';

  if (preferredOp) return buildTestsRequestForOp(dataset, preferredOp, storedPreset);
  if (firstNumeric && multiGroup) return buildTestsRequestForOp(dataset, 'anova', storedPreset);
  if (firstNumeric && binaryGroup) return buildTestsRequestForOp(dataset, 'ttest', storedPreset);
  if (categorical.length >= 2) return buildTestsRequestForOp(dataset, 'chisq', storedPreset);
  if (firstNumeric && rows.length >= 8 && !categorical.length) return buildTestsRequestForOp(dataset, 'normality', storedPreset);
  return null;
}

function resolveStatArtifactRequest(task, analysis, dataset) {
  const storedPreset = findStoredPanelPreset(task, analysis);
  if (storedPreset?.kind === 'stat') {
    if (storedPreset.statPanel === 'corr') {
      return {
        kind: 'stat',
        statPanel: 'corr',
        op: 'corr',
        title: storedPreset.title || analysis?.title || task?.title || 'Correlation review',
        autoRun: storedPreset.autoRun !== false,
        args: storedPreset.args || {},
        options: {
          topNPairs: 20,
          ...(storedPreset.options || {}),
        },
      };
    }
    if (storedPreset.statPanel === 'tests') {
      return buildTestsRequestForOp(dataset, String(storedPreset.op || '').toLowerCase(), {
        ...storedPreset,
        title: storedPreset.title || analysis?.title || task?.title || 'Statistical test review',
      }) || inferTestsRequest(dataset, storedPreset, inferExplicitTestOp(task, analysis));
    }
  }

  const resultType = String(analysis?.resultType || task?.resultType || '').toLowerCase();
  const method = String(analysis?.method || '').toLowerCase();
  if (resultType === 'corr' || method.includes('correlation')) {
    return {
      kind: 'stat',
      statPanel: 'corr',
      op: 'corr',
      title: analysis?.title || task?.title || 'Correlation review',
      autoRun: true,
      args: {},
      options: { topNPairs: 20 },
    };
  }
  if (resultType === 'tests') {
    return inferTestsRequest(dataset, storedPreset || {}, inferExplicitTestOp(task, analysis));
  }
  return null;
}

async function buildStatArtifactFromRequest(dataset, request) {
  if (!dataset || !Array.isArray(dataset.rows) || !request) return null;
  if (request.statPanel === 'corr') {
    const result = await runStatCorr(dataset.rows, request.options);
    return buildCorrArtifact(dataset, request, result);
  }
  if (request.statPanel === 'tests' && request.op === 'ttest' && request.args?.value && request.args?.group) {
    const result = await runStatTTest(dataset.rows, request.args.value, request.args.group);
    return buildTestsArtifact(dataset, request, result);
  }
  if (request.statPanel === 'tests' && request.op === 'anova' && request.args?.value && request.args?.group) {
    const result = await runStatAnova(dataset.rows, request.args.value, request.args.group);
    return buildTestsArtifact(dataset, request, result);
  }
  if (request.statPanel === 'tests' && request.op === 'normality' && request.args?.column) {
    const result = await runStatNormality(dataset.rows, request.args.column);
    return buildTestsArtifact(dataset, request, result);
  }
  if (request.statPanel === 'tests' && request.op === 'levene' && request.args?.column && request.args?.group) {
    const result = await runLocalLevene(dataset.rows, request.args.column, request.args.group);
    return buildTestsArtifact(dataset, request, result);
  }
  if (request.statPanel === 'tests' && request.op === 'chisq' && request.args?.a && request.args?.b) {
    const result = await runStatChiSq(dataset.rows, request.args.a, request.args.b);
    return buildTestsArtifact(dataset, request, result);
  }
  return null;
}

async function ensureDashboardLinkedDataset(nextDashboard, docs) {
  const linkState = nextDashboard?.datasetLinks;
  const rules = Array.isArray(linkState?.links) ? linkState.links.filter((rule) => rule?.datasetId) : [];
  if (!nextDashboard || !rules.length) return false;

  const datasetDocs = Object.fromEntries((docs || []).map((dataset) => [dataset.id, dataset]));
  const primaryDatasetId = linkState?.primaryDatasetId || nextDashboard.sourceDatasetId || nextDashboard.activeDatasetId || nextDashboard.datasetIds?.[0] || '';
  const primaryDataset = datasetDocs[primaryDatasetId] || docs.find((dataset) => dataset.id === primaryDatasetId) || docs[0] || null;
  if (!primaryDataset) return false;

  const signature = buildDatasetLinksSignature(primaryDataset, linkState, datasetDocs);
  const existingArtifact = linkState?.artifact || null;
  const previousSourceIds = new Set([
    primaryDataset.id,
    nextDashboard.sourceDatasetId,
    linkState?.preparedDatasetId,
  ].filter(Boolean));

  const samePreparedDatasetAvailable = !!(
    linkState?.preparedDatasetId
    && nextDashboard.datasetIds?.includes(linkState.preparedDatasetId)
    && existingArtifact?.signature === signature
  );

  if (samePreparedDatasetAvailable) {
    const tasks = (nextDashboard.tasks || []).map((task) =>
      retargetTaskToDataset(task, linkState.preparedDatasetId, existingArtifact, previousSourceIds)
    );
    const needsPatch = (
      nextDashboard.activeDatasetId !== linkState.preparedDatasetId
      || nextDashboard.sourceDatasetId !== linkState.preparedDatasetId
      || JSON.stringify(tasks) !== JSON.stringify(nextDashboard.tasks || [])
    );
    if (!needsPatch) return false;
    saveDashboard({
      ...nextDashboard,
      activeDatasetId: linkState.preparedDatasetId,
      sourceDatasetId: linkState.preparedDatasetId,
      tasks,
    });
    return true;
  }

  const linked = buildLinkedDataset(linkState, primaryDataset, datasetDocs);
  const artifact = {
    ...(linked.artifact || {}),
    signature,
  };

  if (artifact.status === 'error') {
    if (
      existingArtifact?.signature === artifact.signature
      && existingArtifact?.summary === artifact.summary
      && JSON.stringify(existingArtifact?.errors || []) === JSON.stringify(artifact.errors || [])
    ) {
      return false;
    }
    saveDashboard({
      ...nextDashboard,
      datasetLinks: {
        ...(linkState || {}),
        primaryDatasetId: primaryDataset.id,
        preparedDatasetId: '',
        artifact,
      },
    });
    return true;
  }

  const preparedDatasetId = await saveDataset(
    buildLinkedDatasetName(primaryDataset, artifact),
    linked.columns,
    linked.rows,
    linkState?.preparedDatasetId || undefined,
    {
      meta: {
        source: 'dashboard-dataset-link',
        dataType: nextDashboard.dataType || '',
        dashboardId: nextDashboard.id,
        parentDatasetId: primaryDataset.id,
        linkedDatasetIds: artifact.linkedDatasetIds || [],
        linkSignature: signature,
      },
    }
  );

  const nextArtifact = {
    ...artifact,
    preparedDatasetId,
  };
  const tasks = (nextDashboard.tasks || []).map((task) =>
    retargetTaskToDataset(task, preparedDatasetId, nextArtifact, previousSourceIds)
  );
  const datasetIds = nextDashboard.datasetIds.includes(preparedDatasetId)
    ? nextDashboard.datasetIds
    : [preparedDatasetId, ...nextDashboard.datasetIds];

  saveDashboard({
    ...nextDashboard,
    datasetIds,
    activeDatasetId: preparedDatasetId,
    sourceDatasetId: preparedDatasetId,
    datasetLinks: {
      ...(linkState || {}),
      primaryDatasetId: primaryDataset.id,
      preparedDatasetId,
      artifact: nextArtifact,
    },
    tasks,
  });
  return true;
}

async function ensureDashboardTransformArtifacts(nextDashboard, docs) {
  const preprocessingPlan = Array.isArray(nextDashboard?.preprocessingPlan) ? nextDashboard.preprocessingPlan : [];
  if (!nextDashboard || !preprocessingPlan.length) return false;

  const transformTasks = (nextDashboard.tasks || []).filter(isTransformManagedTask);
  if (!transformTasks.length) return false;

  const sourceDatasetId = nextDashboard.sourceDatasetId || nextDashboard.activeDatasetId || nextDashboard.datasetIds?.[0] || '';
  const sourceDataset = docs.find((dataset) => dataset.id === sourceDatasetId) || docs[0] || null;
  if (!sourceDataset || !Array.isArray(sourceDataset.rows) || !sourceDataset.rows.length) return false;
  const transformSourceDataset = {
    ...sourceDataset,
    meta: {
      ...(sourceDataset.meta || {}),
      ...(nextDashboard.datasetMeta || {}),
    },
  };

  const planResult = buildWizardTransformPlan(transformSourceDataset, preprocessingPlan);
  if (!planResult.hasRecipe && !planResult.skippedSteps.length) return false;

  const transformSignature = buildTransformSignature(transformSourceDataset, planResult);
  const existingArtifact = transformTasks
    .map((task) => task?.options?.transformArtifact)
    .find((artifact) => artifact?.signature);

  if (
    existingArtifact?.signature === transformSignature
    && existingArtifact?.derivedDatasetId
    && nextDashboard.datasetIds.includes(existingArtifact.derivedDatasetId)
  ) {
    return false;
  }

  if (!planResult.hasRecipe) {
    const nextWizardResults = updateWizardPreprocessingResults(nextDashboard.wizardResults, planResult, '');
    if (JSON.stringify(nextWizardResults.preprocessing || []) === JSON.stringify(nextDashboard.wizardResults?.preprocessing || [])) {
      return false;
    }
    const dashboardPatch = {
      ...nextDashboard,
      wizardResults: nextWizardResults,
    };
    saveDashboard(dashboardPatch);
    return true;
  }

  const transformed = await runTransformRecipe(sourceDataset.rows, planResult.recipe);
  const derivedDatasetId = await saveDataset(
    buildPreparedDatasetName(sourceDataset),
    transformed.columns,
    transformed.rows,
    existingArtifact?.derivedDatasetId,
    {
      meta: {
        source: 'dashboard-wizard-transform',
        dataType: nextDashboard.dataType || transformSourceDataset.meta?.dataType || '',
        parentDatasetId: sourceDataset.id,
        sourceDatasetName: sourceDataset.name,
        sourceRowCount: Array.isArray(sourceDataset.rows) ? sourceDataset.rows.length : 0,
        sourceColCount: Array.isArray(sourceDataset.columns) ? sourceDataset.columns.length : 0,
        dashboardId: nextDashboard.id,
        transformPlanIds: preprocessingPlan.map((item) => item.id),
      },
    }
  );

  let reportArtifact = null;
  try {
    const report = await runStatDescribe(transformed.rows, transformed.columns, { topNCat: 10 });
    reportArtifact = compactReportArtifact(report);
  } catch {
    reportArtifact = null;
  }

  const transformArtifact = {
    ...buildTransformArtifact({
      sourceDataset: transformSourceDataset,
      transformedRows: transformed.rows,
      transformedColumns: transformed.columns,
      planResult,
      reportArtifact,
    }),
    signature: transformSignature,
    derivedDatasetId,
  };
  const executionSummary = buildTransformExecutionSummary(transformArtifact);

  const tasks = (nextDashboard.tasks || []).map((task) => {
    if (!isTransformManagedTask(task)) return task;
    return {
      ...task,
      datasetIds: [derivedDatasetId],
      status: 'ready',
      options: {
        ...(task.options || {}),
        sourceDatasetId: sourceDataset.id,
        derivedDatasetId,
        transformArtifact,
        reportArtifact,
        executionSummary,
      },
      analyses: Array.isArray(task.analyses)
        ? task.analyses.map((analysis) => ({
          ...analysis,
          status: 'ready',
          description: analysis.description || executionSummary,
          options: {
            ...(analysis.options || {}),
            sourceDatasetId: sourceDataset.id,
            derivedDatasetId,
            transformArtifact,
            reportArtifact,
            executionSummary,
          },
        }))
        : [],
    };
  });

  const datasetIds = nextDashboard.datasetIds.includes(derivedDatasetId)
    ? nextDashboard.datasetIds
    : [derivedDatasetId, ...nextDashboard.datasetIds];

  saveDashboard({
    ...nextDashboard,
    datasetIds,
    activeDatasetId: nextDashboard.activeDatasetId === sourceDataset.id || !nextDashboard.activeDatasetId
      ? derivedDatasetId
      : nextDashboard.activeDatasetId,
    tasks,
    wizardResults: updateWizardPreprocessingResults(nextDashboard.wizardResults, planResult, executionSummary),
  });

  return true;
}

async function ensureDashboardTextPreviewArtifacts(nextDashboard, docs) {
  const textOverviewTasks = (nextDashboard?.tasks || []).filter(isTextOverviewManagedTask);
  if (!nextDashboard || !textOverviewTasks.length) return false;

  let didChange = false;
  let previewSummary = nextDashboard?.wizardResults?.preview?.find((item) => item.id === 'text-overview')?.summary || '';

  const tasks = (nextDashboard.tasks || []).map((task) => {
    if (!isTextOverviewManagedTask(task)) return task;

    const sourceDatasetId = task?.options?.sourceDatasetId || nextDashboard.sourceDatasetId || task?.datasetIds?.[0] || '';
    const sourceDataset = docs.find((dataset) => dataset.id === sourceDatasetId)
      || docs.find((dataset) => dataset.id === task?.datasetIds?.[0])
      || docs[0]
      || null;

    if (!sourceDataset) return task;

    const artifactSource = {
      ...sourceDataset,
      meta: {
        ...(sourceDataset.meta || {}),
        ...(nextDashboard.datasetMeta || {}),
      },
    };
    const signature = buildTextPreviewSignature(artifactSource);
    const existingArtifact = task?.options?.previewArtifact;
    const previewArtifact = existingArtifact?.signature === signature
      ? existingArtifact
      : {
        ...buildTextPreviewArtifact(artifactSource),
        signature,
      };
    const executionSummary = previewArtifact.summary || task?.options?.executionSummary || '';
    previewSummary = executionSummary || previewSummary;

    if (existingArtifact?.signature === signature && task?.options?.executionSummary === executionSummary) {
      return task;
    }

    didChange = true;
    return {
      ...task,
      status: 'ready',
      options: {
        ...(task.options || {}),
        sourceDatasetId: sourceDataset.id,
        previewArtifact,
        executionSummary,
      },
      analyses: Array.isArray(task.analyses)
        ? task.analyses.map((analysis) => (
          String(analysis?.method || '') === 'text-overview'
            ? {
              ...analysis,
              status: 'ready',
              description: analysis.description || executionSummary,
              options: {
                ...(analysis.options || {}),
                sourceDatasetId: sourceDataset.id,
                previewArtifact,
                executionSummary,
              },
            }
            : analysis
        ))
        : [],
    };
  });

  const nextWizardResults = updateWizardPreviewResults(
    nextDashboard.wizardResults,
    'text-overview',
    previewSummary,
    previewSummary ? 'previewed' : 'ready'
  );
  const wizardChanged = JSON.stringify(nextWizardResults.preview || []) !== JSON.stringify(nextDashboard?.wizardResults?.preview || []);
  if (!didChange && !wizardChanged) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
    wizardResults: nextWizardResults,
  });

  return true;
}

async function ensureDashboardTextFeatureArtifacts(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.some(isTextFeatureManagedTask)) {
    return false;
  }

  const artifactCache = new Map();
  let didChange = false;

  async function resolveArtifact(sourceDataset, request, existingArtifact = null) {
    const signature = buildTextFeatureSignature(sourceDataset, request);
    if (existingArtifact?.signature === signature) return existingArtifact;
    if (artifactCache.has(signature)) return artifactCache.get(signature);

    const recipe = buildTextFeatureRecipe(request);
    if (!recipe) {
      artifactCache.set(signature, null);
      return null;
    }

    const transformed = await runTransformRecipe(sourceDataset.rows, recipe);
    const derivedDatasetId = await saveDataset(
      buildTextFeatureDatasetName(sourceDataset, request.method),
      transformed.columns,
      transformed.rows,
      existingArtifact?.derivedDatasetId,
      {
        meta: {
          source: 'dashboard-text-runtime',
          dataType: nextDashboard.dataType || sourceDataset.meta?.dataType || '',
          parentDatasetId: sourceDataset.id,
          sourceDatasetName: sourceDataset.name,
          dashboardId: nextDashboard.id,
          textColumn: request.textColumn,
          textMethod: request.method,
          targetColumn: request.targetColumn || '',
        },
      }
    );
    const derivedDataset = await loadDataset(derivedDatasetId).catch(() => null);
    if (derivedDataset) {
      const existingIndex = docs.findIndex((dataset) => dataset.id === derivedDataset.id);
      if (existingIndex >= 0) docs.splice(existingIndex, 1, derivedDataset);
      else docs.push(derivedDataset);
    }
    const artifact = {
      ...buildTextFeatureArtifact({
        sourceDataset,
        derivedDataset,
        request,
        transformedRows: transformed.rows,
        transformedColumns: transformed.columns,
      }),
      signature,
    };
    artifactCache.set(signature, artifact);
    return artifact;
  }

  const tasks = [];
  for (const task of nextDashboard.tasks || []) {
    if (!isTextFeatureManagedTask(task)) {
      tasks.push(task);
      continue;
    }

    const sourceDatasetId = task?.options?.sourceDatasetId || task?.datasetIds?.[0] || nextDashboard.sourceDatasetId || nextDashboard.activeDatasetId || '';
    const sourceDataset = docs.find((dataset) => dataset.id === sourceDatasetId)
      || docs.find((dataset) => dataset.id === task?.datasetIds?.[0])
      || docs[0]
      || null;
    if (!sourceDataset) {
      tasks.push(task);
      continue;
    }

    let nextTask = task;
    let taskChanged = false;
    let taskArtifact = task?.options?.textFeatureArtifact || null;
    const taskRequest = resolveTextFeatureArtifactRequest(task, null, sourceDataset);

    if (taskRequest) {
      taskArtifact = await resolveArtifact(sourceDataset, taskRequest, taskArtifact);
      if (taskArtifact?.kind) {
        const derivedDataset = docs.find((dataset) => dataset.id === taskArtifact.derivedDatasetId) || sourceDataset;
        const panelPreset = buildTextFeaturePanelPreset(task, taskArtifact, derivedDataset);
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task,
          artifact: taskArtifact,
          sourceDataset,
          derivedDataset,
        });
        if (
          task?.options?.textFeatureArtifact?.signature !== taskArtifact.signature
          || task?.options?.executionSummary !== taskArtifact.summary
          || task?.options?.derivedDatasetId !== taskArtifact.derivedDatasetId
          || JSON.stringify(task?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
          || !isEqualJson(task?.options?.report, report)
        ) {
          nextTask = {
            ...nextTask,
            status: 'ready',
            options: {
              ...(nextTask.options || {}),
              sourceDatasetId: sourceDataset.id,
              derivedDatasetId: taskArtifact.derivedDatasetId,
              textColumn: taskRequest.textColumn,
              textMethod: taskRequest.method,
              targetColumn: taskRequest.targetColumn,
              textFeatureArtifact: taskArtifact,
              executionSummary: taskArtifact.summary,
              panelPreset,
              report,
            },
          };
          taskChanged = true;
        }
      }
    }

    const nextAnalyses = [];
    for (const analysis of task.analyses || []) {
      const request = resolveTextFeatureArtifactRequest(nextTask, analysis, sourceDataset);
      if (!request) {
        nextAnalyses.push(analysis);
        continue;
      }

      const artifact = await resolveArtifact(sourceDataset, request, analysis?.options?.textFeatureArtifact || null);
      if (!artifact?.kind) {
        nextAnalyses.push(analysis);
        continue;
      }

      const derivedDataset = docs.find((dataset) => dataset.id === artifact.derivedDatasetId) || sourceDataset;
      const panelPreset = buildTextFeaturePanelPreset(nextTask, artifact, derivedDataset, analysis);
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        analysis,
        artifact,
        sourceDataset,
        derivedDataset,
      });
      const nextAnalysis = {
        ...analysis,
        status: 'ready',
        description: analysis.description || artifact.summary,
        options: {
          ...(analysis.options || {}),
          sourceDatasetId: sourceDataset.id,
          derivedDatasetId: artifact.derivedDatasetId,
          textFeatureArtifact: artifact,
          executionSummary: artifact.summary,
          panelPreset,
          report,
        },
      };
      nextAnalyses.push(nextAnalysis);
      if (
        analysis?.options?.textFeatureArtifact?.signature !== artifact.signature
        || analysis?.options?.executionSummary !== artifact.summary
        || analysis?.options?.derivedDatasetId !== artifact.derivedDatasetId
        || JSON.stringify(analysis?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
        || !isEqualJson(analysis?.options?.report, report)
      ) {
        taskChanged = true;
      }
      if (!taskArtifact || request.method === taskRequest?.method) taskArtifact = artifact;
    }

    if (taskArtifact?.kind) {
      const derivedDataset = docs.find((dataset) => dataset.id === taskArtifact.derivedDatasetId) || sourceDataset;
      const panelPreset = buildTextFeaturePanelPreset(nextTask, taskArtifact, derivedDataset);
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        artifact: taskArtifact,
        sourceDataset,
        derivedDataset,
      });
      if (
        nextTask?.options?.textFeatureArtifact?.signature !== taskArtifact.signature
        || nextTask?.options?.executionSummary !== taskArtifact.summary
        || nextTask?.options?.derivedDatasetId !== taskArtifact.derivedDatasetId
        || JSON.stringify(nextTask?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
        || !isEqualJson(nextTask?.options?.report, report)
      ) {
        nextTask = {
          ...nextTask,
          status: 'ready',
          options: {
            ...(nextTask.options || {}),
            sourceDatasetId: sourceDataset.id,
            derivedDatasetId: taskArtifact.derivedDatasetId,
            textFeatureArtifact: taskArtifact,
            executionSummary: taskArtifact.summary,
            panelPreset,
            report,
          },
        };
        taskChanged = true;
      }
    }

    if (taskChanged) {
      didChange = true;
      tasks.push({
        ...nextTask,
        analyses: nextAnalyses,
      });
    } else {
      tasks.push(task);
    }
  }

  if (!didChange) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
  });
  return true;
}

async function ensureDashboardImageFeatureArtifacts(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.some(isImageFeatureManagedTask)) {
    return false;
  }

  const artifactCache = new Map();
  let didChange = false;

  async function resolveArtifact(sourceDataset, request, existingArtifact = null) {
    const signature = buildImageFeatureSignature(sourceDataset, request);
    if (existingArtifact?.signature === signature) return existingArtifact;
    if (artifactCache.has(signature)) return artifactCache.get(signature);

    try {
      const response = await runImageFeatureRuntime({
        rows: sourceDataset.rows,
        imageColumn: request.imageColumn,
        targetColumn: request.targetColumn || '',
      });
      const runtimeData = response?.data || {};
      let artifact = null;
      if (runtimeData?.availability === 'blocked' || !Array.isArray(runtimeData?.rows) || !runtimeData.rows.length) {
        artifact = {
          ...buildImageBlockedArtifact({
            sourceDataset,
            request,
            runtimeData,
          }),
          signature,
        };
      } else {
        const derivedDatasetId = await saveDataset(
          buildImageFeatureDatasetName(sourceDataset, request),
          runtimeData.columns || [],
          runtimeData.rows || [],
          existingArtifact?.derivedDatasetId || undefined,
          {
            meta: {
              source: 'dashboard-image-runtime',
              dataType: nextDashboard.dataType || sourceDataset.meta?.dataType || '',
              parentDatasetId: sourceDataset.id,
              sourceDatasetName: sourceDataset.name,
              dashboardId: nextDashboard.id,
              imageColumn: request.imageColumn,
              targetColumn: request.targetColumn || '',
              imageRuntimeAvailability: runtimeData.availability || 'fallback',
              imageRuntime: runtimeData.effectiveRuntime || 'manifest-fallback',
              imageColumns: [request.imageColumn],
            },
          }
        );
        const derivedDataset = await loadDataset(derivedDatasetId).catch(() => null);
        if (derivedDataset) {
          const existingIndex = docs.findIndex((dataset) => dataset.id === derivedDataset.id);
          if (existingIndex >= 0) docs.splice(existingIndex, 1, derivedDataset);
          else docs.push(derivedDataset);
        }
        artifact = {
          ...buildImageFeatureArtifact({
            sourceDataset,
            derivedDataset,
            request,
            runtimeData,
          }),
          signature,
        };
      }
      artifactCache.set(signature, artifact);
      return artifact;
    } catch (error) {
      const artifact = {
        ...buildImageBlockedArtifact({
          sourceDataset,
          request,
          runtimeData: {
            availabilityReason: String(error?.message || error),
            requirements: ['Install opencv-python on the backend to enable pixel-level image feature extraction.'],
          },
        }),
        signature,
      };
      artifactCache.set(signature, artifact);
      return artifact;
    }
  }

  const tasks = [];
  for (const task of nextDashboard.tasks || []) {
    if (!isImageFeatureManagedTask(task)) {
      tasks.push(task);
      continue;
    }

    const sourceDatasetId = task?.options?.sourceDatasetId || task?.datasetIds?.[0] || nextDashboard.sourceDatasetId || nextDashboard.activeDatasetId || '';
    const sourceDataset = docs.find((dataset) => dataset.id === sourceDatasetId)
      || docs.find((dataset) => dataset.id === task?.datasetIds?.[0])
      || docs[0]
      || null;
    if (!sourceDataset) {
      tasks.push(task);
      continue;
    }

    let nextTask = task;
    let taskChanged = false;
    let taskArtifact = task?.options?.imageFeatureArtifact || null;
    const taskRequest = resolveImageFeatureArtifactRequest(task, null, sourceDataset);

    if (taskRequest) {
      taskArtifact = await resolveArtifact(sourceDataset, taskRequest, taskArtifact);
      if (taskArtifact?.kind) {
        const derivedDataset = docs.find((dataset) => dataset.id === taskArtifact.derivedDatasetId) || sourceDataset;
        const panelPreset = buildImageFeaturePanelPreset(task, taskArtifact, derivedDataset);
        const nextStatus = taskArtifact.status === 'blocked' ? 'blocked' : 'ready';
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task,
          artifact: taskArtifact,
          sourceDataset,
          derivedDataset,
        });
        if (
          task?.options?.imageFeatureArtifact?.signature !== taskArtifact.signature
          || task?.options?.executionSummary !== taskArtifact.summary
          || task?.options?.derivedDatasetId !== taskArtifact.derivedDatasetId
          || JSON.stringify(task?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
          || task?.status !== nextStatus
          || !isEqualJson(task?.options?.report, report)
        ) {
          nextTask = {
            ...nextTask,
            status: nextStatus,
            options: {
              ...(nextTask.options || {}),
              sourceDatasetId: sourceDataset.id,
              derivedDatasetId: taskArtifact.derivedDatasetId || '',
              imageColumn: taskRequest.imageColumn,
              targetColumn: taskRequest.targetColumn || '',
              imageFeatureArtifact: taskArtifact,
              executionSummary: taskArtifact.summary,
              panelPreset,
              report,
            },
          };
          taskChanged = true;
        }
      }
    }

    const nextAnalyses = [];
    for (const analysis of task.analyses || []) {
      const request = resolveImageFeatureArtifactRequest(nextTask, analysis, sourceDataset);
      if (!request) {
        nextAnalyses.push(analysis);
        continue;
      }

      const artifact = await resolveArtifact(sourceDataset, request, analysis?.options?.imageFeatureArtifact || null);
      if (!artifact?.kind) {
        nextAnalyses.push(analysis);
        continue;
      }

      const derivedDataset = docs.find((dataset) => dataset.id === artifact.derivedDatasetId) || sourceDataset;
      const panelPreset = buildImageFeaturePanelPreset(nextTask, artifact, derivedDataset, analysis);
      const nextStatus = artifact.status === 'blocked' ? 'blocked' : 'ready';
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        analysis,
        artifact,
        sourceDataset,
        derivedDataset,
      });
      const nextAnalysis = {
        ...analysis,
        status: nextStatus,
        description: analysis.description || artifact.summary,
        options: {
          ...(analysis.options || {}),
          sourceDatasetId: sourceDataset.id,
          derivedDatasetId: artifact.derivedDatasetId || '',
          imageColumn: request.imageColumn,
          targetColumn: request.targetColumn || '',
          imageFeatureArtifact: artifact,
          executionSummary: artifact.summary,
          panelPreset,
          report,
        },
      };
      nextAnalyses.push(nextAnalysis);
      if (
        analysis?.options?.imageFeatureArtifact?.signature !== artifact.signature
        || analysis?.options?.executionSummary !== artifact.summary
        || analysis?.options?.derivedDatasetId !== artifact.derivedDatasetId
        || JSON.stringify(analysis?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
        || analysis?.status !== nextStatus
        || !isEqualJson(analysis?.options?.report, report)
      ) {
        taskChanged = true;
      }
      if (!taskArtifact || (
        request.imageColumn === taskRequest?.imageColumn
        && String(request.targetColumn || '') === String(taskRequest?.targetColumn || '')
      )) {
        taskArtifact = artifact;
      }
    }

    if (taskArtifact?.kind) {
      const derivedDataset = docs.find((dataset) => dataset.id === taskArtifact.derivedDatasetId) || sourceDataset;
      const panelPreset = buildImageFeaturePanelPreset(nextTask, taskArtifact, derivedDataset);
      const nextStatus = taskArtifact.status === 'blocked' ? 'blocked' : 'ready';
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        artifact: taskArtifact,
        sourceDataset,
        derivedDataset,
      });
      if (
        nextTask?.options?.imageFeatureArtifact?.signature !== taskArtifact.signature
        || nextTask?.options?.executionSummary !== taskArtifact.summary
        || nextTask?.options?.derivedDatasetId !== taskArtifact.derivedDatasetId
        || JSON.stringify(nextTask?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
        || nextTask?.status !== nextStatus
        || !isEqualJson(nextTask?.options?.report, report)
      ) {
        nextTask = {
          ...nextTask,
          status: nextStatus,
          options: {
            ...(nextTask.options || {}),
            sourceDatasetId: sourceDataset.id,
            derivedDatasetId: taskArtifact.derivedDatasetId || '',
            imageFeatureArtifact: taskArtifact,
            executionSummary: taskArtifact.summary,
            panelPreset,
            report,
          },
        };
        taskChanged = true;
      }
    }

    if (taskChanged) {
      didChange = true;
      tasks.push({
        ...nextTask,
        analyses: nextAnalyses,
      });
    } else {
      tasks.push(task);
    }
  }

  if (!didChange) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
  });
  return true;
}

async function ensureDashboardImageOcrArtifacts(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.some(isImageFeatureManagedTask)) {
    return false;
  }

  const artifactCache = new Map();
  let didChange = false;

  async function resolveArtifact(sourceDataset, request, existingArtifact = null) {
    const signature = buildImageOcrSignature(sourceDataset, request);
    if (existingArtifact?.signature === signature) return existingArtifact;
    if (artifactCache.has(signature)) return artifactCache.get(signature);

    try {
      const response = await runImageOcrRuntime({
        rows: sourceDataset.rows,
        imageColumn: request.imageColumn,
        targetColumn: request.targetColumn || '',
        textColumn: request.textColumn,
      });
      const runtimeData = response?.data || {};
      let artifact = null;
      if (runtimeData?.availability === 'blocked' || !Array.isArray(runtimeData?.rows) || !runtimeData.rows.length) {
        artifact = {
          ...buildImageOcrBlockedArtifact({
            sourceDataset,
            request,
            runtimeData,
          }),
          signature,
        };
      } else {
        const derivedDatasetId = await saveDataset(
          buildImageOcrDatasetName(sourceDataset, request),
          runtimeData.columns || [],
          runtimeData.rows || [],
          existingArtifact?.derivedDatasetId || undefined,
          {
            meta: {
              source: 'dashboard-image-ocr',
              dataType: nextDashboard.dataType || sourceDataset.meta?.dataType || '',
              parentDatasetId: sourceDataset.id,
              sourceDatasetName: sourceDataset.name,
              dashboardId: nextDashboard.id,
              imageColumn: request.imageColumn,
              textColumns: [request.textColumn],
              imageColumns: [request.imageColumn],
              targetColumn: request.targetColumn || '',
              imageRuntimeAvailability: runtimeData.availability || 'fallback',
              imageRuntime: runtimeData.effectiveRuntime || 'reference-fallback',
              ocrRuntimeAvailability: runtimeData.availability || 'fallback',
              ocrRuntime: runtimeData.effectiveRuntime || 'reference-fallback',
            },
          }
        );
        const derivedDataset = await loadDataset(derivedDatasetId).catch(() => null);
        if (derivedDataset) {
          const existingIndex = docs.findIndex((dataset) => dataset.id === derivedDataset.id);
          if (existingIndex >= 0) docs.splice(existingIndex, 1, derivedDataset);
          else docs.push(derivedDataset);
        }
        artifact = {
          ...buildImageOcrArtifact({
            sourceDataset,
            derivedDataset,
            request,
            runtimeData,
          }),
          signature,
        };
      }
      artifactCache.set(signature, artifact);
      return artifact;
    } catch (error) {
      const artifact = {
        ...buildImageOcrBlockedArtifact({
          sourceDataset,
          request,
          runtimeData: {
            availabilityReason: String(error?.message || error),
            requirements: ['Install pytesseract and the Tesseract OCR binary on the backend to enable direct OCR.'],
          },
        }),
        signature,
      };
      artifactCache.set(signature, artifact);
      return artifact;
    }
  }

  const tasks = [];
  for (const task of nextDashboard.tasks || []) {
    if (!isImageFeatureManagedTask(task)) {
      tasks.push(task);
      continue;
    }

    const sourceDatasetId = task?.options?.sourceDatasetId || task?.datasetIds?.[0] || nextDashboard.sourceDatasetId || nextDashboard.activeDatasetId || '';
    const sourceDataset = docs.find((dataset) => dataset.id === sourceDatasetId)
      || docs.find((dataset) => dataset.id === task?.datasetIds?.[0])
      || docs[0]
      || null;
    if (!sourceDataset) {
      tasks.push(task);
      continue;
    }

    let nextTask = task;
    let taskChanged = false;
    let taskArtifact = task?.options?.imageOcrArtifact || null;
    const taskRequest = resolveImageOcrArtifactRequest(task, null, sourceDataset);

    if (taskRequest) {
      taskArtifact = await resolveArtifact(sourceDataset, taskRequest, taskArtifact);
      if (taskArtifact?.kind) {
        const derivedDataset = docs.find((dataset) => dataset.id === taskArtifact.derivedDatasetId) || sourceDataset;
        const panelPreset = buildImageOcrPanelPreset(task, taskArtifact, derivedDataset);
        const nextStatus = taskArtifact.status === 'blocked' ? 'blocked' : 'ready';
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task,
          artifact: taskArtifact,
          sourceDataset,
          derivedDataset,
        });
        if (
          task?.options?.imageOcrArtifact?.signature !== taskArtifact.signature
          || task?.options?.executionSummary !== taskArtifact.summary
          || task?.options?.derivedDatasetId !== taskArtifact.derivedDatasetId
          || JSON.stringify(task?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
          || task?.status !== nextStatus
          || !isEqualJson(task?.options?.report, report)
        ) {
          nextTask = {
            ...nextTask,
            status: nextStatus,
            options: {
              ...(nextTask.options || {}),
              sourceDatasetId: sourceDataset.id,
              derivedDatasetId: taskArtifact.derivedDatasetId || '',
              imageColumn: taskRequest.imageColumn,
              imageMethod: 'ocr',
              targetColumn: taskRequest.targetColumn || '',
              textColumn: taskRequest.textColumn,
              imageOcrArtifact: taskArtifact,
              executionSummary: taskArtifact.summary,
              panelPreset,
              report,
            },
          };
          taskChanged = true;
        }
      }
    }

    const nextAnalyses = [];
    for (const analysis of task.analyses || []) {
      const request = resolveImageOcrArtifactRequest(nextTask, analysis, sourceDataset);
      if (!request) {
        nextAnalyses.push(analysis);
        continue;
      }

      const artifact = await resolveArtifact(sourceDataset, request, analysis?.options?.imageOcrArtifact || null);
      if (!artifact?.kind) {
        nextAnalyses.push(analysis);
        continue;
      }

      const derivedDataset = docs.find((dataset) => dataset.id === artifact.derivedDatasetId) || sourceDataset;
      const panelPreset = buildImageOcrPanelPreset(nextTask, artifact, derivedDataset, analysis);
      const nextStatus = artifact.status === 'blocked' ? 'blocked' : 'ready';
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        analysis,
        artifact,
        sourceDataset,
        derivedDataset,
      });
      const nextAnalysis = {
        ...analysis,
        status: nextStatus,
        description: analysis.description || artifact.summary,
        options: {
          ...(analysis.options || {}),
          sourceDatasetId: sourceDataset.id,
          derivedDatasetId: artifact.derivedDatasetId || '',
          imageColumn: request.imageColumn,
          textColumn: request.textColumn,
          targetColumn: request.targetColumn || '',
          imageOcrArtifact: artifact,
          executionSummary: artifact.summary,
          panelPreset,
          report,
        },
      };
      nextAnalyses.push(nextAnalysis);
      if (
        analysis?.options?.imageOcrArtifact?.signature !== artifact.signature
        || analysis?.options?.executionSummary !== artifact.summary
        || analysis?.options?.derivedDatasetId !== artifact.derivedDatasetId
        || JSON.stringify(analysis?.options?.panelPreset || null) !== JSON.stringify(panelPreset)
        || analysis?.status !== nextStatus
        || !isEqualJson(analysis?.options?.report, report)
      ) {
        taskChanged = true;
      }
      if (!taskArtifact) taskArtifact = artifact;
    }

    if (taskChanged) {
      didChange = true;
      tasks.push({
        ...nextTask,
        analyses: nextAnalyses,
      });
    } else {
      tasks.push(task);
    }
  }

  if (!didChange) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
  });
  return true;
}

async function ensureDashboardStatArtifacts(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.length) return false;
  if (!dashboardHasStatRuntimeTargets(nextDashboard, docs)) return false;

  const artifactCache = new Map();
  let didChange = false;
  let correlationSummary = nextDashboard?.wizardResults?.preview?.find((item) => item.id === 'correlation')?.summary || '';

  const tasks = [];
  for (const task of nextDashboard.tasks || []) {
    const sourceDatasetId = task?.options?.derivedDatasetId || task?.options?.sourceDatasetId || task?.datasetIds?.[0] || nextDashboard.activeDatasetId || '';
    const sourceDataset = docs.find((dataset) => dataset.id === sourceDatasetId)
      || docs.find((dataset) => dataset.id === task?.datasetIds?.[0])
      || docs[0]
      || null;
    if (!sourceDataset) {
      tasks.push(task);
      continue;
    }

    let nextTask = task;
    let taskChanged = false;
    let taskArtifact = task?.options?.statArtifact || null;

    const taskRequest = resolveStatArtifactRequest(task, null, sourceDataset);
    if (taskRequest) {
      const taskSignature = buildStatArtifactSignature(sourceDataset, taskRequest);
      if (taskArtifact?.signature !== taskSignature) {
        if (!artifactCache.has(taskSignature)) {
          try {
            artifactCache.set(taskSignature, await buildStatArtifactFromRequest(sourceDataset, taskRequest));
          } catch {
            artifactCache.set(taskSignature, null);
          }
        }
        taskArtifact = artifactCache.get(taskSignature) || taskArtifact;
      }
      if (taskArtifact?.kind) {
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task,
          artifact: taskArtifact,
          sourceDataset,
          derivedDataset: sourceDataset,
        });
        if (
          task?.options?.statArtifact?.signature !== taskArtifact.signature
          || task?.options?.executionSummary !== taskArtifact.summary
          || !isEqualJson(task?.options?.report, report)
        ) {
          nextTask = {
            ...nextTask,
            status: 'ready',
            options: {
              ...(nextTask.options || {}),
              sourceDatasetId: sourceDataset.id,
              statArtifact: taskArtifact,
              executionSummary: taskArtifact.summary,
              report,
            },
          };
          taskChanged = true;
          if (nextTask.options?.wizardResultId === 'correlation') correlationSummary = taskArtifact.summary;
        }
      }
    }

    const nextAnalyses = [];
    for (const analysis of task.analyses || []) {
      const request = resolveStatArtifactRequest(nextTask, analysis, sourceDataset);
      if (!request) {
        nextAnalyses.push(analysis);
        continue;
      }
      const signature = buildStatArtifactSignature(sourceDataset, request);
      let artifact = analysis?.options?.statArtifact || null;
      if (artifact?.signature !== signature) {
        if (!artifactCache.has(signature)) {
          try {
            artifactCache.set(signature, await buildStatArtifactFromRequest(sourceDataset, request));
          } catch {
            artifactCache.set(signature, null);
          }
        }
        artifact = artifactCache.get(signature) || artifact;
      }

      if (artifact?.kind) {
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task: nextTask,
          analysis,
          artifact,
          sourceDataset,
          derivedDataset: sourceDataset,
        });
        const nextAnalysis = {
          ...analysis,
          status: 'ready',
          description: analysis.description || artifact.summary,
          options: {
            ...(analysis.options || {}),
            sourceDatasetId: sourceDataset.id,
            panelPreset: analysis.options?.panelPreset || request,
            statArtifact: artifact,
            executionSummary: artifact.summary,
            report,
          },
        };
        nextAnalyses.push(nextAnalysis);
        if (
          analysis?.options?.statArtifact?.signature !== artifact.signature
          || analysis?.options?.executionSummary !== artifact.summary
          || !isEqualJson(analysis?.options?.report, report)
        ) {
          taskChanged = true;
        }
        if (!taskArtifact || (task?.options?.wizardResultId === 'correlation' && artifact.kind === 'stat-corr')) {
          taskArtifact = artifact;
        }
      } else {
        nextAnalyses.push(analysis);
      }
    }

    if (taskArtifact?.kind) {
      const currentTaskSummary = nextTask?.options?.executionSummary;
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        artifact: taskArtifact,
        sourceDataset,
        derivedDataset: sourceDataset,
      });
      if (
        !currentTaskSummary
        || currentTaskSummary !== taskArtifact.summary
        || nextTask?.options?.statArtifact?.signature !== taskArtifact.signature
        || !isEqualJson(nextTask?.options?.report, report)
      ) {
        nextTask = {
          ...nextTask,
          status: 'ready',
          options: {
            ...(nextTask.options || {}),
            sourceDatasetId: sourceDataset.id,
            statArtifact: taskArtifact,
            executionSummary: taskArtifact.summary,
            report,
          },
        };
        taskChanged = true;
      }
      if (nextTask.options?.wizardResultId === 'correlation' && taskArtifact.kind === 'stat-corr') {
        correlationSummary = taskArtifact.summary;
      }
    }

    if (taskChanged) {
      didChange = true;
      tasks.push({
        ...nextTask,
        analyses: nextAnalyses,
      });
    } else {
      tasks.push(task);
    }
  }

  const nextWizardResults = correlationSummary
    ? updateWizardPreviewResults(nextDashboard.wizardResults, 'correlation', correlationSummary, 'profiled')
    : nextDashboard.wizardResults;
  const wizardChanged = JSON.stringify(nextWizardResults?.preview || []) !== JSON.stringify(nextDashboard?.wizardResults?.preview || []);

  if (!didChange && !wizardChanged) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
    wizardResults: nextWizardResults,
  });

  return true;
}

function dashboardHasStatRuntimeTargets(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.length) return false;

  return nextDashboard.tasks.some((task) => {
    const taskDataset = resolveDatasetFromDocs(docs, task, null, nextDashboard);
    if (taskDataset && resolveStatArtifactRequest(task, null, taskDataset)) return true;
    return (task.analyses || []).some((analysis) => {
      const analysisDataset = resolveDatasetFromDocs(docs, task, analysis, nextDashboard) || taskDataset;
      return !!(analysisDataset && resolveStatArtifactRequest(task, analysis, analysisDataset));
    });
  });
}

function dashboardHasMlRuntimeTargets(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.length) return false;

  return nextDashboard.tasks.some((task) => {
    const taskDataset = resolveDatasetFromDocs(docs, task, null, nextDashboard);
    if (taskDataset && resolveMlArtifactRequest(task, null, taskDataset)) return true;
    return (task.analyses || []).some((analysis) => {
      const analysisDataset = resolveDatasetFromDocs(docs, task, analysis, nextDashboard) || taskDataset;
      return !!(analysisDataset && resolveMlArtifactRequest(task, analysis, analysisDataset));
    });
  });
}

async function ensureDashboardMlArtifacts(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.length) return false;
  if (!dashboardHasMlRuntimeTargets(nextDashboard, docs)) return false;

  let capabilities = {};
  let capabilityError = '';
  try {
    const response = await getMlCapabilities();
    capabilities = response?.data || {};
  } catch (error) {
    capabilityError = String(error?.message || error);
    capabilities = {};
  }

  const artifactCache = new Map();
  let didChange = false;
  const tasks = [];

  for (const task of nextDashboard.tasks || []) {
    const sourceDataset = resolveDatasetFromDocs(docs, task, null, nextDashboard);
    if (!sourceDataset) {
      tasks.push(task);
      continue;
    }

    let nextTask = task;
    let taskChanged = false;
    let taskArtifact = task?.options?.mlArtifact || null;

    const taskRequest = resolveMlArtifactRequest(task, null, sourceDataset);
    if (taskRequest) {
      const taskPlan = getMlExecutionPlan(taskRequest, capabilities, capabilityError);
      const taskSignature = buildMlArtifactSignature(sourceDataset, taskRequest, capabilities, taskPlan);
      if (taskArtifact?.signature !== taskSignature) {
        if (!artifactCache.has(taskSignature)) {
          if (!taskPlan.runnable) {
            artifactCache.set(taskSignature, buildMlBlockedArtifact(sourceDataset, taskRequest, capabilities, taskPlan.reason, taskPlan.requirements, taskPlan));
          } else {
            try {
              const response = await runMlTrain({
                ...taskPlan.normalizedRequest,
                rows: sourceDataset.rows,
              });
              artifactCache.set(taskSignature, buildMlArtifact(sourceDataset, taskRequest, response?.data || {}, capabilities, taskPlan));
            } catch (error) {
              artifactCache.set(
                taskSignature,
                buildMlBlockedArtifact(
                  sourceDataset,
                  taskRequest,
                  capabilities,
                  String(error?.message || error),
                  taskPlan.requirements,
                  taskPlan
                )
              );
            }
          }
        }
        taskArtifact = artifactCache.get(taskSignature) || taskArtifact;
      }

      if (taskArtifact?.kind) {
        const nextStatus = taskArtifact.status === 'blocked' ? 'blocked' : 'ready';
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task,
          artifact: taskArtifact,
          sourceDataset,
          derivedDataset: sourceDataset,
        });
        if (
          task?.options?.mlArtifact?.signature !== taskArtifact.signature
          || task?.options?.executionSummary !== taskArtifact.summary
          || task?.status !== nextStatus
          || !isEqualJson(task?.options?.report, report)
        ) {
          nextTask = {
            ...nextTask,
            status: nextStatus,
            options: {
              ...(nextTask.options || {}),
              sourceDatasetId: sourceDataset.id,
              mlArtifact: taskArtifact,
              executionSummary: taskArtifact.summary,
              report,
            },
          };
          taskChanged = true;
        }
      }
    }

    const nextAnalyses = [];
    for (const analysis of task.analyses || []) {
      const analysisDataset = resolveDatasetFromDocs(docs, nextTask, analysis, nextDashboard) || sourceDataset;
      const request = resolveMlArtifactRequest(nextTask, analysis, analysisDataset);
      if (!request) {
        nextAnalyses.push(analysis);
        continue;
      }

      const plan = getMlExecutionPlan(request, capabilities, capabilityError);
      const signature = buildMlArtifactSignature(analysisDataset, request, capabilities, plan);
      let artifact = analysis?.options?.mlArtifact || null;
      const forceRefresh = analysis?.status === 'rerun requested';
      if (forceRefresh || artifact?.signature !== signature) {
        if (!artifactCache.has(signature)) {
          if (!plan.runnable) {
            artifactCache.set(signature, buildMlBlockedArtifact(analysisDataset, request, capabilities, plan.reason, plan.requirements, plan));
          } else {
            try {
              const response = await runMlTrain({
                ...plan.normalizedRequest,
                rows: analysisDataset.rows,
              });
              artifactCache.set(signature, buildMlArtifact(analysisDataset, request, response?.data || {}, capabilities, plan));
            } catch (error) {
              artifactCache.set(
                signature,
                buildMlBlockedArtifact(
                  analysisDataset,
                  request,
                  capabilities,
                  String(error?.message || error),
                  plan.requirements,
                  plan
                )
              );
            }
          }
        }
        artifact = artifactCache.get(signature) || artifact;
      }

      if (artifact?.kind) {
        const report = buildAnalysisReport({
          dashboard: nextDashboard,
          task: nextTask,
          analysis,
          artifact,
          sourceDataset: analysisDataset,
          derivedDataset: analysisDataset,
        });
        const nextAnalysis = {
          ...analysis,
          status: artifact.status === 'blocked' ? 'blocked' : 'ready',
          description: analysis.description || artifact.summary,
          options: {
            ...(analysis.options || {}),
            sourceDatasetId: analysisDataset.id,
            panelPreset: analysis.options?.panelPreset || {
              kind: 'ml',
              autoRun: true,
              title: analysis.title || task.title || 'Model preset',
              request: plan.normalizedRequest,
            },
            mlArtifact: artifact,
            executionSummary: artifact.summary,
            report,
          },
        };
        nextAnalyses.push(nextAnalysis);
        if (
          analysis?.options?.mlArtifact?.signature !== artifact.signature
          || analysis?.options?.executionSummary !== artifact.summary
          || analysis?.status !== nextAnalysis.status
          || !isEqualJson(analysis?.options?.report, report)
        ) {
          taskChanged = true;
        }
        if (!taskArtifact) taskArtifact = artifact;
      } else {
        nextAnalyses.push(analysis);
      }
    }

    if (taskArtifact?.kind) {
      const nextStatus = taskArtifact.status === 'blocked' ? 'blocked' : 'ready';
      const report = buildAnalysisReport({
        dashboard: nextDashboard,
        task: nextTask,
        artifact: taskArtifact,
        sourceDataset,
        derivedDataset: sourceDataset,
      });
      if (
        nextTask?.options?.mlArtifact?.signature !== taskArtifact.signature
        || nextTask?.options?.executionSummary !== taskArtifact.summary
        || nextTask?.status !== nextStatus
        || !isEqualJson(nextTask?.options?.report, report)
      ) {
        nextTask = {
          ...nextTask,
          status: nextStatus,
          options: {
            ...(nextTask.options || {}),
            sourceDatasetId: sourceDataset.id,
            mlArtifact: taskArtifact,
            executionSummary: taskArtifact.summary,
            report,
          },
        };
        taskChanged = true;
      }
    }

    if (taskChanged) {
      didChange = true;
      tasks.push({
        ...nextTask,
        analyses: nextAnalyses,
      });
    } else {
      tasks.push(task);
    }
  }

  if (!didChange) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
  });

  return true;
}

async function ensureDashboardTaskReports(nextDashboard, docs) {
  if (!nextDashboard || !Array.isArray(nextDashboard.tasks) || !nextDashboard.tasks.length) return false;

  let didChange = false;
  const tasks = (nextDashboard.tasks || []).map((task) => {
    const currentTaskReport = task?.options?.taskReport || null;
    const nextSourceSignature = buildTaskSummaryReportSourceSignature(task);
    const hasReportSources = !!(
      task?.options?.executionSummary
      || task?.options?.report
      || (task?.analyses || []).some((analysis) => analysis?.options?.report || analysis?.options?.executionSummary)
    );

    if (!hasReportSources) {
      if (!currentTaskReport) return task;
      didChange = true;
      const nextOptions = {
        ...(task.options || {}),
      };
      delete nextOptions.taskReport;
      return {
        ...task,
        options: nextOptions,
      };
    }

    if (currentTaskReport?.sourceSignature === nextSourceSignature) {
      return task;
    }

    const sourceDataset = resolveDatasetFromDocs(docs, task, null, nextDashboard) || null;
    const derivedDatasetId = String(task?.options?.derivedDatasetId || '').trim();
    const derivedDataset = derivedDatasetId
      ? docs.find((dataset) => dataset.id === derivedDatasetId) || sourceDataset
      : sourceDataset;
    const taskReport = buildTaskSummaryReport({
      dashboard: nextDashboard,
      task,
      sourceDataset,
      derivedDataset,
    });

    if (isEqualJson(task?.options?.taskReport, taskReport)) {
      return task;
    }

    didChange = true;
    const nextOptions = {
      ...(task.options || {}),
    };
    if (taskReport) nextOptions.taskReport = taskReport;
    else delete nextOptions.taskReport;

    return {
      ...task,
      options: nextOptions,
    };
  });

  if (!didChange) return false;

  saveDashboard({
    ...nextDashboard,
    tasks,
  });
  return true;
}

function ensureDashboardRecommendationSummary(nextDashboard, docs) {
  if (!nextDashboard) return false;
  const activeDoc = resolveDatasetFromDocs(docs, null, null, nextDashboard)
    || docs?.find((dataset) => dataset.id === nextDashboard.activeDatasetId)
    || docs?.[0]
    || null;
  const recommendationSummary = buildRecommendationSummary({
    dataType: nextDashboard.dataType || 'tabular',
    dataset: activeDoc,
    dashboard: nextDashboard,
    datasetLinkArtifact: nextDashboard?.datasetLinks?.artifact || null,
  });
  if (isEqualJson(nextDashboard?.recommendationSummary, recommendationSummary)) return false;
  saveDashboard({
    ...nextDashboard,
    recommendationSummary,
  });
  return true;
}

async function refreshDashboard() {
  loading.value = true;
  loadError.value = '';
  try {
    let nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
    let docs = await loadDashboardDatasets(nextDashboard);
    const linked = await ensureDashboardLinkedDataset(nextDashboard, docs);
    if (linked) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const transformed = await ensureDashboardTransformArtifacts(nextDashboard, docs);
    if (transformed) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const textFeaturesReady = await ensureDashboardTextFeatureArtifacts(nextDashboard, docs);
    if (textFeaturesReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const imageFeaturesReady = await ensureDashboardImageFeatureArtifacts(nextDashboard, docs);
    if (imageFeaturesReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const imageOcrReady = await ensureDashboardImageOcrArtifacts(nextDashboard, docs);
    if (imageOcrReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const statArtifactsReady = await ensureDashboardStatArtifacts(nextDashboard, docs);
    if (statArtifactsReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const textPreviewed = await ensureDashboardTextPreviewArtifacts(nextDashboard, docs);
    if (textPreviewed) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const mlArtifactsReady = await ensureDashboardMlArtifacts(nextDashboard, docs);
    if (mlArtifactsReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const taskReportsReady = await ensureDashboardTaskReports(nextDashboard, docs);
    if (taskReportsReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    const recommendationsReady = ensureDashboardRecommendationSummary(nextDashboard, docs);
    if (recommendationsReady) {
      nextDashboard = loadDashboard(String(route.params.dashboardId || ''));
      docs = await loadDashboardDatasets(nextDashboard);
    }
    dashboard.value = nextDashboard;
    datasets.value = docs;
  } catch (error) {
    loadError.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
}

function onSelectDataset(datasetId) {
  if (!dashboard.value) return;
  setDashboardActiveDataset(dashboard.value.id, datasetId);
  detailOpen.value = true;
  assistantMode.value = '';
  refreshDashboard();
}

function onOpenRecentDataset(payload) {
  if (!dashboard.value || !payload?.id) return;
  attachDatasetToDashboard(dashboard.value.id, payload.id);
  onSelectDataset(payload.id);
}

function onOpenChart(payload = {}) {
  graphPreset.value = payload.spec || null;
  graphOverrideRows.value = Array.isArray(payload.rows) ? payload.rows : null;
  graphOverrideColumns.value = Array.isArray(payload.columns) ? payload.columns : null;
  setTab('graph');
}

function onOpenStat(payload = {}) {
  statPreset.value = payload;
  detailOpen.value = true;
  assistantMode.value = '';
  setTab('stat');
}

function onFocusPanel(payload = {}) {
  if (payload?.tab && tabOptions.some((item) => item.id === payload.tab)) setTab(payload.tab);
}

async function onMlArtifactReady(payload = {}) {
  if (!dashboard.value || !selectedTask.value) return;
  const dataset = preferredDatasetForTask(selectedTask.value, selectedAnalysis.value || null) || activeDataset.value;
  if (!dataset || !payload?.request) return;

  const plan = payload.plan || getMlExecutionPlan(payload.request, payload.capabilities || {});
  const panelPreset = {
    kind: 'ml',
    autoRun: true,
    title: selectedAnalysis.value?.title || selectedTask.value?.title || 'Model preset',
    request: plan.normalizedRequest,
  };
  const artifact = payload?.result
    ? buildMlArtifact(dataset, payload.request, payload.result, payload.capabilities || {}, plan)
    : buildMlBlockedArtifact(
      dataset,
      payload.request,
      payload.capabilities || {},
      String(payload?.error || 'ML run is unavailable in this environment.'),
      plan.requirements,
      plan
    );
  const analysisReport = selectedAnalysis.value
    ? buildAnalysisReport({
      dashboard: dashboard.value,
      task: selectedTask.value,
      analysis: selectedAnalysis.value,
      artifact,
      sourceDataset: dataset,
      derivedDataset: dataset,
    })
    : null;
  const taskReport = buildAnalysisReport({
    dashboard: dashboard.value,
    task: selectedTask.value,
    artifact,
    sourceDataset: dataset,
    derivedDataset: dataset,
  });

  const tasks = (dashboard.value.tasks || []).map((task) => {
    if (task.id !== selectedTask.value.id) return task;
    if (selectedAnalysis.value) {
      return {
        ...task,
        status: artifact.status === 'blocked' ? 'blocked' : 'ready',
        options: {
          ...(task.options || {}),
          sourceDatasetId: dataset.id,
          panelPreset,
          mlArtifact: artifact,
          executionSummary: artifact.summary,
          report: taskReport,
        },
        analyses: (task.analyses || []).map((analysis) => (
          analysis.id !== selectedAnalysis.value.id
            ? analysis
            : {
              ...analysis,
              status: artifact.status === 'blocked' ? 'blocked' : 'ready',
              options: {
                ...(analysis.options || {}),
                sourceDatasetId: dataset.id,
                panelPreset,
                mlArtifact: artifact,
                executionSummary: artifact.summary,
                report: analysisReport,
              },
            }
        )),
      };
    }
    return {
      ...task,
      status: artifact.status === 'blocked' ? 'blocked' : 'ready',
      options: {
        ...(task.options || {}),
        sourceDatasetId: dataset.id,
        panelPreset,
        mlArtifact: artifact,
        executionSummary: artifact.summary,
        report: taskReport,
      },
    };
  });

  saveDashboard({
    ...dashboard.value,
    tasks,
  });
  await refreshDashboard();
}

function listsEqual(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => String(value || '') === String(right[index] || ''));
}

function buildTaskDraftDefaults(taskType, datasetDoc = null) {
  const shape = inferDatasetShape(datasetDoc || activeDataset.value);
  const imageColumn = taskType === 'image-analysis' ? (imageColumnsForDataset(datasetDoc || activeDataset.value)[0] || '') : '';
  const textColumn = taskType === 'text-analysis' ? (shape.text[0] || shape.categorical[0] || shape.columns[0] || '') : '';
  const targetColumn = taskType === 'regression'
    ? (shape.numeric[0] || '')
    : taskType === 'classification'
      ? (shape.categorical[0] || shape.columns[0] || '')
      : '';
  const featureColumns = ['regression', 'classification'].includes(taskType)
    ? shape.columns.filter((column) => column !== targetColumn).slice(0, 5)
    : [];
  return {
    previewChecks: Array.isArray(dashboard.value?.previewSelections) ? dashboard.value.previewSelections.slice(0, 4) : [],
    targetColumn,
    featureColumns,
    imageColumn,
    imageMethod: getDefaultImageMethod(),
    textColumn,
    textMethod: getDefaultTextMethod(),
  };
}

function buildTaskDraft(taskType = '', datasetId = '') {
  const templates = Array.isArray(taskTemplates.value) && taskTemplates.value.length
    ? taskTemplates.value
    : getTaskTemplates(dashboard.value?.dataType || 'tabular');
  const fallbackTemplate = templates[0] || { type: 'distribution', label: 'New task', description: '', example: '' };
  const template = templates.find((item) => item.type === taskType) || fallbackTemplate;
  const datasetDoc = datasets.value.find((dataset) => dataset.id === datasetId) || activeDataset.value || null;
  const defaults = buildTaskDraftDefaults(template.type, datasetDoc);
  return {
    type: template.type,
    title: template.label,
    description: `${template.description} ${template.example}`.trim(),
    datasetIds: datasetDoc?.id ? [datasetDoc.id] : [],
    preprocessingMode: 'reuse',
    previewChecks: defaults.previewChecks,
    targetColumn: defaults.targetColumn,
    featureColumns: defaults.featureColumns,
    imageColumn: defaults.imageColumn,
    imageMethod: defaults.imageMethod,
    textColumn: defaults.textColumn,
    textMethod: defaults.textMethod,
    modelFamily: getDefaultTaskModelFamily(template.type),
  };
}

function buildAnalysisDraft(taskType = '') {
  const template = getAnalysisTemplates(taskType || selectedTask.value?.type || taskDraft.value.type)[0] || {
    id: 'analysis',
    label: 'New analysis',
    description: '',
    chartType: 'chart',
    resultType: 'summary',
  };
  return {
    method: template.id,
    title: template.label,
    description: template.description,
    chartType: template.chartType,
    resultType: template.resultType,
  };
}

function hydrateTaskDraft(task) {
  if (!task) return;
  const datasetId = task?.datasetIds?.[0] || activeDataset.value?.id || '';
  const datasetDoc = datasets.value.find((dataset) => dataset.id === datasetId) || preferredDatasetForTask(task) || activeDataset.value || null;
  const defaults = buildTaskDraftDefaults(task.type, datasetDoc);
  taskDraft.value = {
    type: task.type || 'distribution',
    title: task.title || '',
    description: task.description || '',
    datasetIds: Array.isArray(task.datasetIds) && task.datasetIds.length ? task.datasetIds.slice() : datasetId ? [datasetId] : [],
    preprocessingMode: normalizeTaskPreprocessingMode(task.preprocessingMode || 'reuse'),
    previewChecks: Array.isArray(task.previewChecks) && task.previewChecks.length ? task.previewChecks.slice() : defaults.previewChecks,
    targetColumn: task.options?.targetColumn || defaults.targetColumn,
    featureColumns: Array.isArray(task.options?.featureColumns) ? task.options.featureColumns.slice() : defaults.featureColumns,
    imageColumn: task.options?.imageColumn || defaults.imageColumn,
    imageMethod: normalizeImageTaskMethod(task.options?.imageMethod || defaults.imageMethod),
    textColumn: task.options?.textColumn || defaults.textColumn,
    textMethod: normalizeTextTaskMethod(task.options?.textMethod || defaults.textMethod),
    modelFamily: normalizeTaskModelFamily(task.type, task.options?.modelFamily || ''),
  };
}

function hydrateAnalysisDraft(analysis) {
  if (!analysis) return;
  analysisDraft.value = {
    method: analysis.method || 'analysis',
    title: analysis.title || '',
    description: analysis.description || '',
    chartType: analysis.chartType || 'chart',
    resultType: analysis.resultType || 'summary',
  };
}

function applyTaskTemplate(template) {
  const datasetId = String(taskDraft.value.datasetIds?.[0] || activeDataset.value?.id || '');
  const nextDraft = buildTaskDraft(template.type, datasetId);
  taskDraft.value = {
    ...nextDraft,
    title: template.label,
    description: `${template.description} ${template.example}`.trim(),
  };
}

function applyAnalysisTemplate(template) {
  analysisDraft.value = {
    method: template.id,
    title: template.label,
    description: template.description,
    chartType: template.chartType,
    resultType: template.resultType,
  };
}

function buildRecommendedTaskDraft(taskType = '', overrides = {}) {
  const datasetId = String(
    taskDraft.value.datasetIds?.[0]
    || selectedTask.value?.datasetIds?.[0]
    || activeDataset.value?.id
    || ''
  );
  const nextDraft = buildTaskDraft(taskType || taskDraft.value.type || 'distribution', datasetId);
  return {
    ...nextDraft,
    ...overrides,
    datasetIds: Array.isArray(overrides.datasetIds) && overrides.datasetIds.length
      ? overrides.datasetIds
      : nextDraft.datasetIds,
    featureColumns: Array.isArray(overrides.featureColumns)
      ? overrides.featureColumns.slice()
      : nextDraft.featureColumns,
    previewChecks: Array.isArray(overrides.previewChecks)
      ? overrides.previewChecks.slice()
      : nextDraft.previewChecks,
  };
}

function openRecommendationTaskEditor(taskType = '', overrides = {}) {
  detailOpen.value = true;
  assistantMode.value = '';
  const normalizedType = String(taskType || '').trim();
  const canReuseSelectedTask = selectedTask.value && normalizedType && String(selectedTask.value.type || '') === normalizedType;
  if (canReuseSelectedTask) {
    openTaskEdit(selectedTask.value.id);
    taskDraft.value = buildRecommendedTaskDraft(normalizedType, {
      ...taskDraft.value,
      ...overrides,
      datasetIds: Array.isArray(taskDraft.value.datasetIds) && taskDraft.value.datasetIds.length
        ? taskDraft.value.datasetIds
        : overrides.datasetIds,
    });
    return;
  }
  taskDraft.value = buildRecommendedTaskDraft(normalizedType || taskDraft.value.type || 'distribution', overrides);
  patchQuery({ mode: 'task-create', taskId: null, analysisId: null });
}

function applyRecommendationPanelAction(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return;
  if (normalized === 'model') {
    setTab('model');
    return;
  }
  if (normalized === 'graph+stat' || normalized === 'stat+graph' || normalized === 'stat:report') {
    statPreset.value = {
      key: makePresetKey('stat'),
      statPanel: 'report',
      title: 'Recommended statistical review',
      autoRun: true,
    };
    setTab('stat');
    return;
  }
  if (normalized === 'stat:tests') {
    statPreset.value = {
      key: makePresetKey('stat'),
      statPanel: 'tests',
      title: 'Recommended statistical tests',
      autoRun: true,
    };
    setTab('stat');
    return;
  }
  if (normalized.startsWith('graph')) {
    setTab('graph');
    return;
  }
  if (normalized.startsWith('stat')) {
    setTab('stat');
    return;
  }
  if (normalized === 'file') {
    setTab('file');
  }
}

function applyRecommendationMlAction(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  const dataset = recommendationDataset.value || activeDataset.value || null;
  if (!dataset) {
    setTab('file');
    return;
  }
  const shape = inferDatasetShape(dataset);
  const features = shape.numeric.slice(0, Math.max(2, Math.min(6, shape.numeric.length))).filter(Boolean);
  if (!normalized || !features.length) {
    setTab('file');
    return;
  }
  const [taskName, modelName] = normalized.split(':');
  mlPreset.value = {
    key: makePresetKey('ml'),
    panel: 'ml',
    title: modelName === 'pca' ? 'Recommended PCA view' : 'Recommended clustering run',
    autoRun: true,
    request: {
      task: taskName,
      model: modelName,
      args: {
        target: '',
        features,
      },
      options: {
        preset: 'balanced',
        cv: 0,
        scoring: '',
      },
    },
  };
  setTab('model');
}

function applyTaskEditorRecommendation(item) {
  const actionType = String(item?.nextAction?.type || '').trim().toLowerCase();
  const actionValue = String(item?.nextAction?.value || '').trim();
  if (!actionType || !actionValue) return;

  if (actionType === 'task-template') {
    openRecommendationTaskEditor(actionValue);
    return;
  }

  if (actionType === 'model') {
    const [taskType, modelFamily] = actionValue.split(':');
    openRecommendationTaskEditor(taskType || taskDraft.value.type || 'regression', {
      modelFamily: modelFamily || '',
    });
    return;
  }

  if (actionType === 'runtime') {
    const [runtimeType, runtimeMethod] = actionValue.split(':');
    if (runtimeType === 'text') {
      openRecommendationTaskEditor('text-analysis', { textMethod: runtimeMethod || '' });
      return;
    }
    if (runtimeType === 'image') {
      openRecommendationTaskEditor('image-analysis', { imageMethod: runtimeMethod || '' });
      return;
    }
    taskDraft.value.preprocessingMode = 'reuse';
    return;
  }

  if (actionType === 'preprocessing') {
    taskDraft.value.preprocessingMode = 'reuse';
    return;
  }

  if (actionType === 'panel') {
    applyRecommendationPanelAction(actionValue);
    return;
  }

  if (actionType === 'ml-task') {
    applyRecommendationMlAction(actionValue);
  }
}

function applyContextRecommendation(item) {
  const actionType = String(item?.nextAction?.type || '').trim().toLowerCase();
  const actionValue = String(item?.nextAction?.value || '').trim();
  if (!actionType || !actionValue) return;

  if (actionType === 'task-template') {
    openRecommendationTaskEditor(actionValue);
    return;
  }

  if (actionType === 'model') {
    const [taskType, modelFamily] = actionValue.split(':');
    openRecommendationTaskEditor(taskType || 'regression', {
      modelFamily: modelFamily || '',
    });
    return;
  }

  if (actionType === 'runtime') {
    const [runtimeType, runtimeMethod] = actionValue.split(':');
    if (runtimeType === 'text') {
      openRecommendationTaskEditor('text-analysis', { textMethod: runtimeMethod || '' });
      return;
    }
    if (runtimeType === 'image') {
      openRecommendationTaskEditor('image-analysis', { imageMethod: runtimeMethod || '' });
      return;
    }
    applyRecommendationPanelAction('stat:report');
    return;
  }

  if (actionType === 'preprocessing') {
    openRecommendationTaskEditor(selectedTask.value?.type || 'preprocessing', {
      preprocessingMode: 'reuse',
    });
    return;
  }

  if (actionType === 'panel' || actionType === 'dataset-link') {
    applyRecommendationPanelAction(actionType === 'dataset-link' ? 'file' : actionValue);
    return;
  }

  if (actionType === 'ml-task') {
    applyRecommendationMlAction(actionValue);
  }
}

function buildTaskUpdateOptions(task, nextDatasetIds) {
  const existingOptions = { ...(task?.options || {}) };
  const normalizedMode = normalizeTaskPreprocessingMode(taskDraft.value.preprocessingMode || 'reuse');
  const isMlTask = ['regression', 'classification'].includes(String(taskDraft.value.type || '').toLowerCase());
  const isImageTask = String(taskDraft.value.type || '').toLowerCase() === 'image-analysis';
  const isTextTask = String(taskDraft.value.type || '').toLowerCase() === 'text-analysis';
  const structureChanged = (
    String(task?.type || '') !== String(taskDraft.value.type || '')
    || !listsEqual(task?.datasetIds || [], nextDatasetIds)
    || normalizeTaskPreprocessingMode(task?.preprocessingMode || 'reuse') !== normalizedMode
    || !listsEqual(task?.previewChecks || [], taskDraft.value.previewChecks || [])
    || (isMlTask && String(existingOptions.targetColumn || '') !== String(taskDraft.value.targetColumn || ''))
    || (isMlTask && !listsEqual(existingOptions.featureColumns || [], taskDraft.value.featureColumns || []))
    || (isMlTask && normalizeTaskModelFamily(taskDraft.value.type, existingOptions.modelFamily || '') !== normalizeTaskModelFamily(taskDraft.value.type, taskDraft.value.modelFamily || ''))
    || (isImageTask && String(existingOptions.imageColumn || '') !== String(taskDraft.value.imageColumn || ''))
    || (isImageTask && normalizeImageTaskMethod(existingOptions.imageMethod || '') !== normalizeImageTaskMethod(taskDraft.value.imageMethod || ''))
    || (isImageTask && String(existingOptions.targetColumn || '') !== String(taskDraft.value.targetColumn || ''))
    || (isTextTask && String(existingOptions.textColumn || '') !== String(taskDraft.value.textColumn || ''))
    || (isTextTask && normalizeTextTaskMethod(existingOptions.textMethod || '') !== normalizeTextTaskMethod(taskDraft.value.textMethod || ''))
    || (isTextTask && String(existingOptions.targetColumn || '') !== String(taskDraft.value.targetColumn || ''))
  );
  const nextOptions = {
    ...existingOptions,
    sourceDatasetId: nextDatasetIds[0] || existingOptions.sourceDatasetId || '',
  };
  if (isMlTask) {
    nextOptions.targetColumn = taskDraft.value.targetColumn;
    nextOptions.featureColumns = Array.isArray(taskDraft.value.featureColumns) ? taskDraft.value.featureColumns.slice() : [];
    nextOptions.modelFamily = normalizeTaskModelFamily(taskDraft.value.type, taskDraft.value.modelFamily || '');
    delete nextOptions.imageColumn;
    delete nextOptions.textColumn;
    delete nextOptions.textMethod;
  } else if (isImageTask) {
    nextOptions.imageColumn = taskDraft.value.imageColumn || '';
    nextOptions.imageMethod = normalizeImageTaskMethod(taskDraft.value.imageMethod || '');
    nextOptions.targetColumn = taskDraft.value.targetColumn || '';
    delete nextOptions.featureColumns;
    delete nextOptions.modelFamily;
    delete nextOptions.textColumn;
    delete nextOptions.textMethod;
  } else if (isTextTask) {
    nextOptions.textColumn = taskDraft.value.textColumn;
    nextOptions.textMethod = normalizeTextTaskMethod(taskDraft.value.textMethod || '');
    nextOptions.targetColumn = taskDraft.value.targetColumn || '';
    delete nextOptions.featureColumns;
    delete nextOptions.modelFamily;
    delete nextOptions.imageColumn;
  } else {
    delete nextOptions.targetColumn;
    delete nextOptions.featureColumns;
    delete nextOptions.imageColumn;
    delete nextOptions.textColumn;
    delete nextOptions.textMethod;
    delete nextOptions.modelFamily;
  }
  if (nextOptions.panelPreset && typeof nextOptions.panelPreset === 'object') {
    nextOptions.panelPreset = {
      ...nextOptions.panelPreset,
      title: taskDraft.value.title || task?.title || nextOptions.panelPreset.title,
    };
  }
  if (structureChanged) {
    delete nextOptions.panelPreset;
    delete nextOptions.executionSummary;
    delete nextOptions.report;
    delete nextOptions.taskReport;
    delete nextOptions.previewArtifact;
    delete nextOptions.imageOcrArtifact;
    delete nextOptions.imageFeatureArtifact;
    delete nextOptions.textFeatureArtifact;
    delete nextOptions.statArtifact;
    delete nextOptions.mlArtifact;
    delete nextOptions.transformArtifact;
    delete nextOptions.reportArtifact;
    delete nextOptions.derivedDatasetId;
  }
  return { nextOptions, structureChanged };
}

function buildAnalysisUpdateOptions(analysis) {
  const existingOptions = { ...(analysis?.options || {}) };
  const structureChanged = (
    String(analysis?.method || '') !== String(analysisDraft.value.method || '')
    || String(analysis?.resultType || '') !== String(analysisDraft.value.resultType || '')
    || String(analysis?.chartType || '') !== String(analysisDraft.value.chartType || '')
  );
  const nextOptions = {
    ...existingOptions,
    sourceDatasetId: preferredDatasetForTask(selectedTask.value)?.id || existingOptions.sourceDatasetId || '',
  };
  if (nextOptions.panelPreset && typeof nextOptions.panelPreset === 'object') {
    nextOptions.panelPreset = {
      ...nextOptions.panelPreset,
      title: analysisDraft.value.title || analysis?.title || nextOptions.panelPreset.title,
    };
  }
  if (structureChanged) {
    delete nextOptions.panelPreset;
    delete nextOptions.executionSummary;
    delete nextOptions.report;
    delete nextOptions.taskReport;
    delete nextOptions.previewArtifact;
    delete nextOptions.imageOcrArtifact;
    delete nextOptions.imageFeatureArtifact;
    delete nextOptions.textFeatureArtifact;
    delete nextOptions.statArtifact;
    delete nextOptions.mlArtifact;
    delete nextOptions.derivedDatasetId;
  }
  return { nextOptions, structureChanged };
}

function clearRuntimeOutputOptions(options = {}) {
  const nextOptions = {
    ...(options || {}),
  };
  delete nextOptions.executionSummary;
  delete nextOptions.report;
  delete nextOptions.taskReport;
  delete nextOptions.previewArtifact;
  delete nextOptions.imageOcrArtifact;
  delete nextOptions.imageFeatureArtifact;
  delete nextOptions.textFeatureArtifact;
  delete nextOptions.statArtifact;
  delete nextOptions.mlArtifact;
  delete nextOptions.transformArtifact;
  delete nextOptions.reportArtifact;
  delete nextOptions.derivedDatasetId;
  return nextOptions;
}

async function submitTaskCreate() {
  if (!dashboard.value) return;
  const template = taskTemplates.value.find((item) => item.type === taskDraft.value.type);
  const selection = buildTaskDatasetSelection(
    taskDraft.value.datasetIds.length ? taskDraft.value.datasetIds[0] : activeDataset.value?.id || '',
    taskDraft.value.preprocessingMode
  );
  const nextDatasetIds = selection.runtimeDatasetId ? [selection.runtimeDatasetId] : [];
  const isMlTask = ['regression', 'classification'].includes(String(taskDraft.value.type || '').toLowerCase());
  const isImageTask = String(taskDraft.value.type || '').toLowerCase() === 'image-analysis';
  const isTextTask = String(taskDraft.value.type || '').toLowerCase() === 'text-analysis';
  const task = createTask(dashboard.value.id, {
    type: taskDraft.value.type,
    title: taskDraft.value.title || template?.label || 'New task',
    description: taskDraft.value.description || template?.description || '',
    datasetIds: nextDatasetIds,
    preprocessingMode: selection.preprocessingMode,
    previewChecks: Array.isArray(taskDraft.value.previewChecks) ? taskDraft.value.previewChecks.slice() : [],
    status: 'active',
    options: {
      sourceDatasetId: selection.runtimeDatasetId || selection.selectedDataset?.id || '',
      ...(isMlTask
        ? {
            targetColumn: taskDraft.value.targetColumn,
            featureColumns: Array.isArray(taskDraft.value.featureColumns) ? taskDraft.value.featureColumns.slice() : [],
            modelFamily: normalizeTaskModelFamily(taskDraft.value.type, taskDraft.value.modelFamily || ''),
          }
        : isImageTask
          ? {
              imageColumn: taskDraft.value.imageColumn || '',
              imageMethod: normalizeImageTaskMethod(taskDraft.value.imageMethod || ''),
              targetColumn: taskDraft.value.targetColumn || '',
            }
        : isTextTask
          ? {
              textColumn: taskDraft.value.textColumn,
              textMethod: normalizeTextTaskMethod(taskDraft.value.textMethod || ''),
              targetColumn: taskDraft.value.targetColumn || '',
            }
        : {}),
    },
  });
  applyLinkedPanel(task);
  await refreshDashboard();
  openTaskDetail(task.id);
}

async function submitAnalysisCreate() {
  if (!dashboard.value || !selectedTask.value) return;
  const template = analysisTemplates.value.find((item) => item.id === analysisDraft.value.method);
  const taskId = selectedTask.value.id;
  const created = createAnalysis(dashboard.value.id, taskId, {
    method: analysisDraft.value.method || template?.id || 'analysis',
    title: analysisDraft.value.title || template?.label || 'New analysis',
    description: analysisDraft.value.description || template?.description || '',
    chartType: analysisDraft.value.chartType || template?.chartType || 'chart',
    resultType: analysisDraft.value.resultType || template?.resultType || 'summary',
    status: 'configured',
  });
  applyLinkedPanel(selectedTask.value, created);
  await refreshDashboard();
  openTaskDetail(taskId, created?.id || null);
}

async function submitTaskEditor() {
  if (!isTaskEditMode.value) {
    await submitTaskCreate();
    return;
  }
  if (!dashboard.value || !selectedTask.value) return;
  const template = taskTemplates.value.find((item) => item.type === taskDraft.value.type);
  const selection = buildTaskDatasetSelection(
    taskDraft.value.datasetIds.length ? taskDraft.value.datasetIds[0] : activeDataset.value?.id || '',
    taskDraft.value.preprocessingMode
  );
  const nextDatasetIds = selection.runtimeDatasetId ? [selection.runtimeDatasetId] : [];
  const { nextOptions, structureChanged } = buildTaskUpdateOptions(selectedTask.value, nextDatasetIds);
  updateTask(dashboard.value.id, selectedTask.value.id, {
    type: taskDraft.value.type,
    title: taskDraft.value.title || template?.label || 'New task',
    description: taskDraft.value.description || template?.description || '',
    datasetIds: nextDatasetIds,
    preprocessingMode: selection.preprocessingMode,
    previewChecks: Array.isArray(taskDraft.value.previewChecks) ? taskDraft.value.previewChecks.slice() : [],
    status: structureChanged ? 'active' : selectedTask.value.status,
    options: nextOptions,
  });
  await refreshDashboard();
  openTaskDetail(selectedTask.value.id);
}

async function submitAnalysisEditor() {
  if (!isAnalysisEditMode.value) {
    await submitAnalysisCreate();
    return;
  }
  if (!dashboard.value || !selectedTask.value || !selectedAnalysis.value) return;
  const template = analysisTemplates.value.find((item) => item.id === analysisDraft.value.method);
  const taskId = selectedTask.value.id;
  const analysisId = selectedAnalysis.value.id;
  const { nextOptions, structureChanged } = buildAnalysisUpdateOptions(selectedAnalysis.value);
  updateAnalysis(dashboard.value.id, taskId, analysisId, {
    method: analysisDraft.value.method || template?.id || 'analysis',
    title: analysisDraft.value.title || template?.label || 'New analysis',
    description: analysisDraft.value.description || template?.description || '',
    chartType: analysisDraft.value.chartType || template?.chartType || 'chart',
    resultType: analysisDraft.value.resultType || template?.resultType || 'summary',
    status: structureChanged ? 'configured' : selectedAnalysis.value.status,
    options: nextOptions,
  });
  await refreshDashboard();
  openTaskDetail(taskId, analysisId);
}

async function duplicateAnalysisItem(analysis) {
  if (!dashboard.value || !selectedTask.value) return;
  const taskId = selectedTask.value.id;
  const duplicated = createAnalysis(dashboard.value.id, taskId, {
    method: analysis.method,
    title: `${analysis.title} Copy`,
    description: analysis.description,
    chartType: analysis.chartType,
    resultType: analysis.resultType,
    status: 'draft',
    options: clearRuntimeOutputOptions(analysis?.options || {}),
  });
  updateTask(dashboard.value.id, taskId, {
    options: clearRuntimeOutputOptions(selectedTask.value?.options || {}),
  });
  applyLinkedPanel(selectedTask.value, duplicated);
  await refreshDashboard();
  openTaskDetail(taskId, duplicated?.id || null);
}

async function rerunAnalysisItem(analysis) {
  if (!dashboard.value || !selectedTask.value) return;
  updateAnalysis(dashboard.value.id, selectedTask.value.id, analysis.id, {
    status: 'rerun requested',
    description: analysis.description,
    options: clearRuntimeOutputOptions(analysis?.options || {}),
  });
  updateTask(dashboard.value.id, selectedTask.value.id, {
    options: clearRuntimeOutputOptions(selectedTask.value?.options || {}),
  });
  openTaskDetail(selectedTask.value.id, analysis.id);
  await refreshDashboard();
}

function toggleAssistant(kind) {
  assistantMode.value = assistantMode.value === kind ? '' : kind;
  detailOpen.value = assistantMode.value !== '';
}

function saveDashboardMeta() {
  if (!dashboard.value) return;
  saveDashboard(dashboard.value);
  refreshDashboard();
}

watch(
  helperCatalog,
  (items) => {
    if (!items?.length) {
      selectedCatalogId.value = '';
      return;
    }
    if (!items.some((item) => item.id === selectedCatalogId.value)) selectedCatalogId.value = items[0].id;
  },
  { immediate: true }
);

watch(
  () => dashboard.value,
  (nextDashboard) => {
    if (!nextDashboard || taskDraft.value.title) return;
    const template = getTaskTemplates(nextDashboard.dataType || 'tabular')[0];
    if (template) applyTaskTemplate(template);
  },
  { immediate: true, deep: true }
);

watch(
  () => selectedTask.value,
  (task) => {
    if (!task || analysisDraft.value.method) return;
    const template = getAnalysisTemplates(task.type)[0];
    if (template) applyAnalysisTemplate(template);
  },
  { immediate: true }
);

watch(
  () => [mode.value, selectedTask.value?.id, selectedAnalysis.value?.id],
  ([nextMode, nextTaskId, nextAnalysisId]) => {
    if (nextMode === 'task-edit' && selectedTask.value && nextTaskId && hydratedTaskEditId.value !== nextTaskId) {
      hydrateTaskDraft(selectedTask.value);
      hydratedTaskEditId.value = nextTaskId;
    }
    if (nextMode !== 'task-edit') hydratedTaskEditId.value = '';

    if (nextMode === 'analysis-edit' && selectedAnalysis.value && nextAnalysisId && hydratedAnalysisEditId.value !== nextAnalysisId) {
      hydrateAnalysisDraft(selectedAnalysis.value);
      hydratedAnalysisEditId.value = nextAnalysisId;
    }
    if (nextMode !== 'analysis-edit') hydratedAnalysisEditId.value = '';
  },
  { immediate: true }
);

watch(
  () => [mode.value, selectedTask.value?.id, selectedAnalysis.value?.id, activeDataset.value?.id, datasets.value.length],
  ([nextMode]) => {
    if (nextMode !== 'task-detail' || !selectedTask.value) return;
    applyLinkedPanel(selectedTask.value, selectedAnalysis.value || null);
  },
  { immediate: true }
);

watch(
  () => route.params.dashboardId,
  () => {
    refreshDashboard();
  },
  { immediate: true }
);

watch(activeDataset, (dataset) => {
  if (!dataset || taskDraft.value.datasetIds.length) return;
  taskDraft.value.datasetIds = [dataset.id];
});

onMounted(refreshDashboard);
</script>

<template>
  <div class="dashboard-view">
    <div v-if="loadError" class="dashboard-error">
      <h2>Dashboard could not be loaded.</h2>
      <p>{{ loadError }}</p>
      <router-link to="/">Back to home</router-link>
    </div>

    <template v-else-if="dashboard">
      <section class="dashboard-header">
        <div>
          <p class="kicker">Dashboard</p>
          <div class="dashboard-title-row">
            <input v-model="dashboard.title" class="title-input" type="text" />
            <button type="button" @click="saveDashboardMeta">Save</button>
          </div>
          <input v-model="dashboard.subtitle" class="subtitle-input" type="text" placeholder="Dashboard subtitle" />
          <textarea v-model="dashboard.description" class="description-input" rows="2" placeholder="Describe the current data and analysis goal." />
          <div class="header-meta">
            <span>{{ dashboard.dataType }}</span>
            <span>Datasets {{ dashboard.datasetIds.length }}</span>
            <span>Tasks {{ dashboard.tasks.length }}</span>
            <span>Last updated {{ formatRelativeTime(dashboard.updatedAt) }}</span>
          </div>
        </div>

        <div class="header-actions">
          <button type="button" @click="$router.push({ name: 'dashboard-new', query: { type: dashboard.dataType, dashboardId: dashboard.id } })">Add dataset</button>
          <button class="btn-primary" type="button" @click="openTaskCreate">Create task</button>
          <button type="button" @click="$router.push('/workspace')">Classic workspace</button>
        </div>
      </section>

      <section class="catalog-tabs">
        <button
          v-for="tab in tabOptions"
          :key="tab.id"
          type="button"
          :class="['catalog-tab', { active: activeTab === tab.id }]"
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </section>

      <section class="dashboard-layout">
        <aside class="left-panel">
          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Catalog helper</p>
                <h3>{{ activeTab.toUpperCase() }}</h3>
              </div>
            </div>
            <button
              v-for="item in helperCatalog"
              :key="item.id"
              type="button"
              :class="['helper-item', { active: selectedCatalogId === item.id }]"
              @click="selectedCatalogId = item.id"
            >
              <strong>{{ item.label }}</strong>
              <span>{{ item.description }}</span>
            </button>
          </article>

          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Connected Datasets</p>
                <h3>Datasets</h3>
              </div>
            </div>
            <button
              v-for="dataset in datasets"
              :key="dataset.id"
              type="button"
              :class="['resource-item', { active: dataset.id === activeDatasetId }]"
              @click="onSelectDataset(dataset.id)"
            >
              <div>
                <strong>{{ dataset.name }}</strong>
                <span>{{ dataset.meta?.rowCount ?? dataset.rows?.length ?? 0 }} rows / {{ dataset.meta?.colCount ?? dataset.columns?.length ?? 0 }} cols</span>
              </div>
            </button>
            <div v-if="!datasets.length" class="empty-note">No datasets are connected yet. Add a dataset first to start exploring.</div>
          </article>

          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Task list</p>
                <h3>Tasks</h3>
              </div>
              <button type="button" @click="openTaskCreate">+ Add task</button>
            </div>
            <button
              v-for="task in dashboard.tasks"
              :key="task.id"
              type="button"
              :class="['resource-item', { active: selectedTaskId === task.id }]"
              @click="openTaskDetail(task.id)"
            >
              <div>
                <strong>{{ task.title }}</strong>
                <span>{{ task.analyses?.length || 0 }} analyses / {{ task.status }}</span>
              </div>
            </button>
            <div v-if="!dashboard.tasks.length" class="empty-note">No tasks yet. Add the first task to turn this dashboard into a working flow.</div>
          </article>
        </aside>

        <main class="main-panel">
          <section v-if="mode === 'home'" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Dashboard</p>
                <h2>Review the current data state and continue the active tasks from one place.</h2>
              </div>
            </div>
            <div class="overview-strip">
              <div class="overview-card">
                <span>Active Dataset</span>
                <strong>{{ activeDataset?.name || "Not selected" }}</strong>
              </div>
              <div class="overview-card">
                <span>Recommended next step</span>
                <strong>{{ helperCatalog.find((item) => item.id === selectedCatalogId)?.label || helperCatalog[0]?.label }}</strong>
              </div>
              <div class="overview-card">
                <span>Last updated</span>
                <strong>{{ formatRelativeTime(dashboard.updatedAt) }}</strong>
              </div>
            </div>

            <div v-if="datasetLinkArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Linked Dataset</p>
                  <h3>Cross-dataset prepared source</h3>
                  <p>{{ datasetLinkArtifact.summary }}</p>
                </div>
              </div>
              <div class="overview-strip">
                <div class="overview-card">
                  <span>Status</span>
                  <strong>{{ datasetLinkArtifact.status }}</strong>
                </div>
                <div class="overview-card">
                  <span>Rows</span>
                  <strong>{{ datasetLinkArtifact.sourceRows }} -> {{ datasetLinkArtifact.joinedRows }}</strong>
                </div>
                <div class="overview-card">
                  <span>Columns</span>
                  <strong>{{ datasetLinkArtifact.sourceColumns }} -> {{ datasetLinkArtifact.joinedColumns }}</strong>
                </div>
              </div>
              <ul v-if="datasetLinkArtifact.errors?.length || datasetLinkArtifact.warnings?.length" class="warning-list">
                <li v-for="entry in [...(datasetLinkArtifact.errors || []), ...(datasetLinkArtifact.warnings || [])]" :key="entry">{{ entry }}</li>
              </ul>
            </div>

            <div v-if="dashboardWizardResults.preview.length || dashboardWizardResults.preprocessing.length" class="task-card-grid">
              <article
                v-for="item in [...dashboardWizardResults.preview, ...dashboardWizardResults.preprocessing].slice(0, 4)"
                :key="`wizard-${item.id}`"
                class="task-card"
              >
                <div class="task-card__head">
                  <div>
                    <span>{{ item.id }}</span>
                    <h3>{{ item.label }}</h3>
                  </div>
                  <b>{{ item.status }}</b>
                </div>
                <p>{{ item.reason }}</p>
                <p class="context-note">{{ item.summary }}</p>
              </article>
            </div>

            <div class="task-card-grid">
              <article v-for="task in dashboard.tasks" :key="task.id" class="task-card">
                <div class="task-card__head">
                  <div>
                    <span>{{ task.type }}</span>
                    <h3>{{ task.title }}</h3>
                  </div>
                  <b>{{ task.status }}</b>
                </div>
                <p>{{ task.description || 'No task description yet.' }}</p>
                <p v-if="task.options?.executionSummary" class="context-note">{{ task.options.executionSummary }}</p>
                <div class="task-card__meta">
                  <span>Analyses {{ task.analyses?.length || 0 }}</span>
                  <span>Last updated {{ formatRelativeTime(task.updatedAt) }}</span>
                </div>
                <div class="task-card__actions">
                  <button class="btn-primary" type="button" @click="openTaskDetail(task.id)">View details</button>
                  <button type="button" @click="openAnalysisCreate(task.id)">Add analysis</button>
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="isTaskEditorMode" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Task editor</p>
                <h2>Choose the main topic first, then decide which data and runtime options this task should use.</h2>
              </div>
              <button type="button" @click="closeEditor">Close</button>
            </div>

            <div class="template-grid">
              <button
                v-for="template in taskTemplates"
                :key="template.type"
                type="button"
                :class="['template-card', { active: taskDraft.type === template.type }]"
                @click="applyTaskTemplate(template)"
              >
                <strong>{{ template.label }}</strong>
                <p>{{ template.description }}</p>
                <span>{{ template.example }}</span>
              </button>
            </div>

            <div class="form-grid">
              <label>
                Task title
                <input v-model="taskDraft.title" type="text" data-testid="task-title-input" />
              </label>
              <label>
                Description
                <textarea v-model="taskDraft.description" rows="3" />
              </label>
              <label>
                Preprocessing mode
                <select v-model="taskDraft.preprocessingMode" data-testid="task-preprocessing-select">
                  <option value="reuse">Reuse prepared dataset</option>
                  <option value="source">Use source dataset</option>
                </select>
              </label>
              <label>
                Dataset
                <select v-model="taskDraft.datasetIds[0]" data-testid="task-dataset-select">
                  <option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id">{{ dataset.name }}</option>
                </select>
              </label>
              <label v-if="taskDraft.type === 'text-analysis'">
                Text column
                <select v-model="taskDraft.textColumn" data-testid="task-text-column-select">
                  <option value="">Select</option>
                  <option v-for="column in taskFormDataset?.columns || []" :key="column" :value="column">{{ column }}</option>
                </select>
              </label>
              <label v-if="taskDraft.type === 'text-analysis'">
                Text runtime
                <select v-model="taskDraft.textMethod" data-testid="task-text-method-select">
                  <option v-for="option in TEXT_METHOD_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <small class="form-hint">These options now run the actual text transform pipeline and save a derived feature table.</small>
              </label>
              <label v-if="taskDraft.type === 'text-analysis'">
                Downstream target (optional)
                <select v-model="taskDraft.targetColumn" data-testid="task-text-target-select">
                  <option value="">No target - open PCA feature view</option>
                  <option
                    v-for="column in (taskFormDataset?.columns || []).filter((column) => column !== taskDraft.textColumn)"
                    :key="column"
                    :value="column"
                  >
                    {{ column }}
                  </option>
                </select>
                <small class="form-hint">Choose a label or numeric target only if you want the text feature table to feed classification or regression.</small>
              </label>
              <label v-if="taskDraft.type === 'image-analysis'">
                Image column
                <select v-model="taskDraft.imageColumn" data-testid="task-image-column-select">
                  <option value="">Select</option>
                  <option
                    v-for="column in imageColumnsForDataset(taskFormDataset) || []"
                    :key="column"
                    :value="column"
                  >
                    {{ column }}
                  </option>
                </select>
              </label>
              <label v-if="taskDraft.type === 'image-analysis'">
                Image runtime
                <select v-model="taskDraft.imageMethod" data-testid="task-image-method-select">
                  <option v-for="option in IMAGE_RUNTIME_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <small class="form-hint">Feature extraction keeps the current image feature flow. OCR text extraction saves a derived text table so we can preview it or hand it off to text analysis.</small>
              </label>
              <label v-if="taskDraft.type === 'image-analysis'">
                Downstream target (optional)
                <select v-model="taskDraft.targetColumn" data-testid="task-image-target-select">
                  <option value="">No target - open PCA feature view</option>
                  <option
                    v-for="column in (taskFormDataset?.columns || []).filter((column) => column !== taskDraft.imageColumn)"
                    :key="column"
                    :value="column"
                  >
                    {{ column }}
                  </option>
                </select>
                <small class="form-hint">{{ taskDraft.imageMethod === 'ocr' ? 'OCR keeps the selected target alongside the extracted text table so a follow-up text task can reuse it.' : 'This runtime saves image preview metadata and OpenCV features when available, then reuses the derived table for PCA or downstream classification.' }}</small>
              </label>
              <label v-if="['regression', 'classification'].includes(taskDraft.type)">
                Target column
                <select v-model="taskDraft.targetColumn">
                  <option value="">Select</option>
                  <option v-for="column in taskFormDataset?.columns || []" :key="column" :value="column">{{ column }}</option>
                </select>
              </label>
              <label v-if="['regression', 'classification'].includes(taskDraft.type)">
                Feature columns
                <select v-model="taskDraft.featureColumns" multiple size="5">
                  <option v-for="column in (taskFormDataset?.columns || []).filter((column) => column !== taskDraft.targetColumn)" :key="column" :value="column">{{ column }}</option>
                </select>
              </label>
              <label v-if="showTaskModelFamily">
                Model family
                <select v-model="taskDraft.modelFamily" data-testid="task-model-family-select">
                  <option v-for="option in taskModelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <small class="form-hint">Task forms only show models that are wired into the current runtime. Optional models stay in the ML panel with direct, fallback, or blocked status.</small>
              </label>
            </div>

            <RecommendationSummaryCard
              v-if="taskEditorRecommendationSummary?.top?.length"
              :summary="taskEditorRecommendationSummary"
              title="Recommended options for this task"
              :limit="5"
              actionable
              @select="applyTaskEditorRecommendation"
            />

            <div class="editor-actions">
              <button class="btn-primary" type="button" @click="submitTaskEditor">{{ taskSubmitLabel }}</button>
            </div>
          </section>

          <section v-else-if="isAnalysisEditorMode && selectedTask" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Analysis editor</p>
                <h2>Add a new analysis under {{ selectedTask.title }}.</h2>
              </div>
              <button type="button" @click="openTaskDetail(selectedTask.id)">Back to task</button>
            </div>

            <div class="template-grid">
              <button
                v-for="template in analysisTemplates"
                :key="template.id"
                type="button"
                :class="['template-card', { active: analysisDraft.method === template.id }]"
                @click="applyAnalysisTemplate(template)"
              >
                <strong>{{ template.label }}</strong>
                <p>{{ template.description }}</p>
                <span>{{ template.resultType }} / {{ template.chartType }}</span>
              </button>
            </div>

            <div class="form-grid">
              <label>
                Analysis title
                <input v-model="analysisDraft.title" type="text" />
              </label>
              <label>
                Description
                <textarea v-model="analysisDraft.description" rows="3" />
              </label>
              <label>
                Result type
                <input v-model="analysisDraft.resultType" type="text" />
              </label>
              <label>
                Chart type
                <input v-model="analysisDraft.chartType" type="text" />
              </label>
            </div>

            <div class="editor-actions">
              <button class="btn-primary" type="button" @click="submitAnalysisEditor">{{ analysisSubmitLabel }}</button>
            </div>
          </section>

          <section v-else-if="mode === 'task-detail' && selectedTask" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Task details</p>
                <h2>{{ selectedTask.title }}</h2>
                <p>{{ selectedTask.description || 'No task description yet.' }}</p>
              </div>
              <div class="panel-actions">
                <button type="button" @click="openTaskEdit(selectedTask.id)">Edit task</button>
                <button type="button" @click="openAnalysisCreate(selectedTask.id)">Add analysis</button>
                <button type="button" @click="closeEditor">Dashboard home</button>
              </div>
            </div>

            <div class="task-meta-grid">
              <div class="overview-card">
                <span>Datasets</span>
                <strong>{{ selectedTask.datasetIds.join(", ") || "Not selected" }}</strong>
              </div>
              <div class="overview-card">
                <span>Preparation</span>
                <strong>{{ formatTaskPreprocessingMode(selectedTask.preprocessingMode) }}</strong>
              </div>
              <div class="overview-card">
                <span>Status</span>
                <strong>{{ selectedTask.status }}</strong>
              </div>
              <div class="overview-card" v-if="selectedTask.options?.executionSummary">
                <span>Prepared From</span>
                <strong>{{ selectedTask.options.executionSummary }}</strong>
              </div>
            </div>

            <div v-if="selectedTextOverviewArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Text Overview</p>
                  <h3>Preview artifact</h3>
                  <p>Wizard preview results are stored with this task and can be revisited without rebuilding the dataset.</p>
                </div>
              </div>
              <TextOverviewArtifact :artifact="selectedTextOverviewArtifact" />
            </div>

            <div v-if="selectedTextFeatureArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Text Features</p>
                  <h3>Saved text runtime result</h3>
                  <p>Derived text features are stored with the task so downstream ML and review panels can reopen the same feature table.</p>
                </div>
              </div>
              <TextFeatureArtifact :artifact="selectedTextFeatureArtifact" />
            </div>

            <div v-if="selectedImageFeatureArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Image Features</p>
                  <h3>Saved image runtime result</h3>
                  <p>Image preview metadata and feature columns are stored with the task so downstream PCA or classification can reopen the same derived table.</p>
                </div>
              </div>
              <ImageFeatureArtifact :artifact="selectedImageFeatureArtifact" />
            </div>

            <div v-if="selectedImageOcrArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">OCR Runtime</p>
                  <h3>Saved OCR runtime result</h3>
                  <p>OCR output is stored separately from image features so we can reopen extracted text and hand it off to text analysis later.</p>
                </div>
              </div>
              <ImageOcrArtifact :artifact="selectedImageOcrArtifact" />
            </div>

            <div v-if="selectedStatArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Stat Artifact</p>
                  <h3>Saved statistical result</h3>
                  <p>Correlation and test results are saved with the task so the dashboard can reopen the same evidence later.</p>
                </div>
              </div>
              <StatArtifactCard :artifact="selectedStatArtifact" />
            </div>

            <div v-if="selectedMlArtifact" class="artifact-panel">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Model Artifact</p>
                  <h3>Saved training result</h3>
                  <p>Regression and classification runs are stored with the task so the dashboard can reopen the latest model evidence.</p>
                </div>
              </div>
              <MlArtifactCard :artifact="selectedMlArtifact" />
            </div>

            <div v-if="currentRecommendationSummary?.top?.length" class="artifact-panel" data-testid="task-recommendation-section">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Recommendations</p>
                  <h3>Recommended next actions</h3>
                  <p>The recommendation engine reuses the current dataset profile, runtime state, artifact, and report context to suggest the safest next moves.</p>
                </div>
              </div>
              <RecommendationSummaryCard
                :summary="currentRecommendationSummary"
                title="Current recommendation summary"
                :limit="5"
                actionable
                @select="applyContextRecommendation"
              />
            </div>

            <div v-if="selectedTaskSummaryReport" class="artifact-panel" data-testid="task-summary-report-section">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Task Summary</p>
                  <h3>Composite task report</h3>
                  <p>This report rolls the latest analysis reports into one task-level summary so we can review findings, risks, and next steps in one place.</p>
                </div>
              </div>
              <AnalysisReportCard :report="selectedTaskSummaryReport" />
            </div>

            <div v-if="selectedReport" class="artifact-panel" data-testid="analysis-report-section">
              <div class="panel-head artifact-panel__head">
                <div>
                  <p class="panel-kicker">Analysis Report</p>
                  <h3>Templated runtime report</h3>
                  <p>Each saved runtime now keeps a reusable summary report so the task can reopen the same findings and next steps later.</p>
                </div>
              </div>
              <AnalysisReportCard :report="selectedReport" />
            </div>

            <div class="analysis-list">
              <article v-for="analysis in selectedTask.analyses" :key="analysis.id" class="analysis-card">
                <div class="analysis-card__head">
                  <div>
                    <span>{{ analysis.method }}</span>
                    <h3>{{ analysis.title }}</h3>
                  </div>
                  <b>{{ analysis.status }}</b>
                </div>
                <p>{{ analysis.description || 'No analysis description yet.' }}</p>
                <p v-if="analysis.options?.executionSummary" class="context-note">{{ analysis.options.executionSummary }}</p>
                <div class="analysis-card__meta">
                  <span>{{ analysis.chartType }}</span>
                  <span>{{ analysis.resultType }}</span>
                  <span>{{ formatRelativeTime(analysis.updatedAt) }}</span>
                </div>
                <div class="analysis-card__actions">
                  <button type="button" @click="openTaskDetail(selectedTask.id, analysis.id)">{{ analysis.options?.report ? 'Open report' : 'Focus' }}</button>
                  <button type="button" @click="openAnalysisEdit(selectedTask.id, analysis.id)">Edit</button>
                  <button type="button" @click="rerunAnalysisItem(analysis)">Rerun</button>
                  <button type="button" @click="duplicateAnalysisItem(analysis)">Duplicate</button>
                </div>
              </article>
              <div v-if="!selectedTask.analyses.length" class="empty-note">No analyses yet. Add the first analysis to turn this task into a reusable result view.</div>
            </div>
          </section>

          <section class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Catalog work area</p>
                <h2>{{ helperCatalog.find((item) => item.id === selectedCatalogId)?.label }}</h2>
                <p>{{ helperCatalog.find((item) => item.id === selectedCatalogId)?.description }}</p>
              </div>
            </div>

            <template v-if="activeTab === 'file'">
              <div class="overview-strip">
                <div class="overview-card">
                  <span>Active Dataset</span>
                  <strong>{{ activeDataset?.name || "Not selected" }}</strong>
                </div>
                <div class="overview-card">
                  <span>Rows / Cols</span>
                  <strong>{{ activeDataset?.meta?.rowCount ?? activeDataset?.rows?.length ?? 0 }} / {{ activeDataset?.meta?.colCount ?? activeDataset?.columns?.length ?? 0 }}</strong>
                </div>
                <div class="overview-card">
                  <span>Recommended Prep</span>
                  <strong>{{ dashboard.preprocessingSelections?.length || 0 }}</strong>
                </div>
              </div>

              <div v-if="previewRows.length" class="preview-table">
                <table>
                  <thead>
                    <tr>
                      <th v-for="column in previewColumns" :key="column">{{ column }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex">
                      <td v-for="column in previewColumns" :key="`${rowIndex}-${column}`">{{ row[column] }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <RecentDatasets @open="onOpenRecentDataset" />
            </template>

            <template v-else-if="activeTab === 'graph'">
              <GraphPanel
                :rows="activeDataset?.rows || []"
                :columns="activeDataset?.columns || []"
                :override-rows="graphOverrideRows"
                :override-columns="graphOverrideColumns"
                :preset-spec="graphPreset"
              />
            </template>

            <template v-else-if="activeTab === 'stat'">
              <div class="stat-panels">
                <StatsReportPanel
                  :rows="activeDataset?.rows || []"
                  :columns="activeDataset?.columns || []"
                  :preset="statPreset"
                  @open-chart="onOpenChart"
                />
                <StatsCorrPanel
                  :rows="activeDataset?.rows || []"
                  :columns="activeDataset?.columns || []"
                  :preset="statPreset"
                  :artifact="selectedStatArtifact"
                  @open-chart="onOpenChart"
                />
                <StatTestsPanel
                  :rows="activeDataset?.rows || []"
                  :columns="activeDataset?.columns || []"
                  :preset="statPreset"
                  :artifact="selectedStatArtifact"
                  @open-chart="onOpenChart"
                />
              </div>
            </template>

            <template v-else>
              <MlPanel
                :rows="modelDataset?.rows || []"
                :columns="modelDataset?.columns || []"
                :profile-summary="profileSummary"
                :preset="mlPreset"
                :artifact="selectedMlArtifact"
                @artifact-ready="onMlArtifactReady"
              />
            </template>
          </section>
        </main>

        <aside :class="['right-panel', { open: detailOpen }]">
          <button class="detail-toggle" type="button" @click="detailOpen = !detailOpen">
            {{ detailOpen ? 'Hide details' : 'Show details' }}
          </button>

          <div v-if="detailOpen" class="right-panel__body">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Result detail panel</p>
                <h3>{{ detailContext.title }}</h3>
                <p>{{ detailContext.subtitle }}</p>
              </div>
            </div>

            <div class="detail-actions">
              <button type="button" data-testid="assistant-chat-toggle" @click="toggleAssistant('chat')">Chat</button>
              <button type="button" data-testid="assistant-mcp-toggle" @click="toggleAssistant('mcp')">MCP</button>
              <button type="button" @click="openTaskCreate">Add task</button>
            </div>

            <TextOverviewArtifact
              v-if="selectedTextOverviewArtifact && !assistantMode && selectedTask && mode === 'task-detail'"
              :artifact="selectedTextOverviewArtifact"
              compact
            />
            <AnalysisReportCard
              v-if="selectedTaskSummaryReport && !assistantMode && selectedTask && mode === 'task-detail'"
              :report="selectedTaskSummaryReport"
              compact
            />
            <AnalysisReportCard
              v-if="selectedReport && !assistantMode && selectedTask && mode === 'task-detail'"
              :report="selectedReport"
              compact
            />
            <TextFeatureArtifact
              v-if="selectedTextFeatureArtifact && !assistantMode && selectedTask && mode === 'task-detail'"
              :artifact="selectedTextFeatureArtifact"
              compact
            />
            <ImageFeatureArtifact
              v-if="selectedImageFeatureArtifact && !assistantMode && selectedTask && mode === 'task-detail'"
              :artifact="selectedImageFeatureArtifact"
              compact
            />
            <ImageOcrArtifact
              v-if="selectedImageOcrArtifact && !assistantMode && selectedTask && mode === 'task-detail'"
              :artifact="selectedImageOcrArtifact"
              compact
            />
            <StatArtifactCard
              v-if="selectedStatArtifact && !assistantMode && selectedTask && mode === 'task-detail'"
              :artifact="selectedStatArtifact"
              compact
            />
            <MlArtifactCard
              v-if="selectedMlArtifact && !assistantMode && selectedTask && mode === 'task-detail'"
              :artifact="selectedMlArtifact"
              compact
            />

            <template v-if="assistantMode">
              <McpPanel
                :rows="assistantDataset?.rows || []"
                :columns="assistantDataset?.columns || []"
                :dataset-name="assistantDataset?.name || 'untitled'"
                :dataset-id="assistantDataset?.id || ''"
                :assistant-mode="assistantMode || 'mcp'"
                :dashboard-title="dashboard?.title || ''"
                :dashboard-id="dashboard?.id || ''"
                :dashboard-type="dashboard?.dataType || ''"
                :task-title="selectedTask?.title || ''"
                :task-type="selectedTask?.type || ''"
                :analysis-title="selectedAnalysis?.title || ''"
                :analysis-assistant-context="analysisAssistantContext"
                :profile-summary="profileSummary"
                :workspace-datasets="datasetSummaries"
                @open-chart="onOpenChart"
                @open-stat="onOpenStat"
                @focus-panel="onFocusPanel"
              />
            </template>

            <template v-else-if="selectedTask && mode === 'task-detail'">
              <div class="detail-summary">
                <div class="overview-card">
                  <span>Analyses</span>
                  <strong>{{ selectedTask.analyses.length }}</strong>
                </div>
                <div class="overview-card">
                  <span>Preparation</span>
                  <strong>{{ formatTaskPreprocessingMode(selectedTask.preprocessingMode) }}</strong>
                </div>
                <div class="overview-card">
                  <span>Next recommendation</span>
                  <strong>{{ currentRecommendationHeadline }}</strong>
                </div>
              </div>
              <RecommendationSummaryCard
                v-if="currentRecommendationSummary?.top?.length"
                :summary="currentRecommendationSummary"
                compact
                title="Recommended next actions"
                :limit="3"
                actionable
                @select="applyContextRecommendation"
              />
            </template>

            <template v-else>
              <div class="detail-summary">
                <div class="overview-card">
                  <span>Datasets</span>
                  <strong>{{ dashboard.datasetIds.length }}</strong>
                </div>
                <div class="overview-card">
                  <span>Current selection</span>
                  <strong>{{ activeDataset?.name || "Not selected" }}</strong>
                </div>
                <div class="overview-card">
                  <span>Warnings</span>
                  <strong>{{ profileSummary.warnings.length + (datasetLinkArtifact?.warnings?.length || 0) + (datasetLinkArtifact?.errors?.length || 0) }}</strong>
                </div>
              </div>
              <RecommendationSummaryCard
                v-if="dashboardRecommendationSummary?.top?.length"
                :summary="dashboardRecommendationSummary"
                compact
                title="Recommended next actions"
                :limit="3"
                actionable
                @select="applyContextRecommendation"
              />
              <ul class="warning-list">
                <li v-for="entry in [...(datasetLinkArtifact?.errors || []), ...(datasetLinkArtifact?.warnings || [])]" :key="entry">{{ entry }}</li>
                <li v-for="warning in profileSummary.warnings" :key="warning">{{ warning }}</li>
                <li v-if="!profileSummary.warnings.length">The current data structure looks good for creating tasks right away.</li>
              </ul>
            </template>
          </div>
        </aside>
      </section>

      <div :class="['fab-cluster', { open: assistantMode || detailOpen }]">
        <button class="fab-main" type="button" @click="detailOpen = !detailOpen">+</button>
        <div class="fab-actions">
          <button type="button" @click="openTaskCreate">Add task</button>
          <button type="button" data-testid="fab-chat-toggle" @click="toggleAssistant('chat')">Chat</button>
          <button type="button" data-testid="fab-mcp-toggle" @click="toggleAssistant('mcp')">MCP</button>
        </div>
      </div>
    </template>

    <div v-else-if="loading" class="dashboard-loading">Loading dashboard...</div>
  </div>
</template>

<style scoped>
.dashboard-view { display:flex; flex-direction:column; gap:16px; padding:20px 20px 40px; }
.dashboard-header,.catalog-tabs,.panel-card,.dashboard-error { border:1px solid #d8e0d6; border-radius:24px; background:rgba(255,255,255,.9); box-shadow:0 14px 32px rgba(28,44,29,.06); }
.dashboard-header { display:flex; justify-content:space-between; gap:18px; padding:24px; background:radial-gradient(circle at top left, rgba(223,238,221,.9), transparent 38%), linear-gradient(135deg, #fffdf7, #f3faf5); }
.kicker,.panel-kicker { margin:0 0 8px; font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#5a6d5f; }
.dashboard-title-row { display:flex; gap:10px; align-items:center; }
.title-input,.subtitle-input,.description-input,.form-grid input,.form-grid textarea,.form-grid select { width:100%; border:1px solid #cad4c7; border-radius:14px; background:#fff; color:#203428; }
.form-hint { margin-top: 6px; color: #5f6d63; font-size: 12px; line-height: 1.45; }
.title-input { min-width:360px; padding:10px 12px; font-size:30px; font-weight:700; }
.subtitle-input,.description-input { margin-top:10px; padding:10px 12px; }
.description-input { resize:vertical; }
.header-meta,.header-actions,.catalog-tabs,.overview-strip,.task-card__actions,.analysis-card__actions,.detail-actions,.editor-actions,.task-card__meta,.analysis-card__meta { display:flex; flex-wrap:wrap; gap:10px; }
.header-meta { margin-top:12px; }
.header-meta span,.task-card__meta span,.analysis-card__meta span { padding:6px 10px; border-radius:999px; background:#edf4ec; font-size:12px; color:#355242; }
button { padding:10px 14px; border:1px solid #c4cfbf; border-radius:999px; background:#fff; color:#223228; cursor:pointer; }
.btn-primary,.catalog-tab.active,.helper-item.active,.resource-item.active,.template-card.active { border-color:#224d31; background:#224d31; color:#fff; }
.catalog-tabs { padding:10px; }
.catalog-tab { min-width:100px; }
.dashboard-layout { display:grid; grid-template-columns:minmax(250px,.78fr) minmax(0,1.55fr) minmax(0,.72fr); gap:16px; align-items:start; }
.left-panel,.main-panel { display:flex; flex-direction:column; gap:16px; }
.panel-card { padding:18px; }
.panel-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:14px; }
.artifact-panel { margin-bottom:16px; padding:16px; border:1px solid #dbe3d8; border-radius:20px; background:linear-gradient(180deg, #ffffff, #f7fbf7); }
.artifact-panel__head { margin-bottom:12px; }
.panel-head h2,.panel-head h3 { margin:0; }
.panel-head p,.helper-item span,.resource-item span,.task-card p,.analysis-card p,.empty-note { color:#5d6d61; line-height:1.55; }
.helper-item,.resource-item { width:100%; margin-top:10px; padding:14px; border-radius:18px; text-align:left; background:#f8fbf7; }
.helper-item strong,.resource-item strong { display:block; }
.overview-strip,.task-card-grid,.template-grid,.task-meta-grid,.analysis-list,.stat-panels { display:grid; gap:14px; }
.overview-strip,.task-meta-grid { grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); }
.task-card-grid,.template-grid,.analysis-list { grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
.overview-card,.task-card,.analysis-card,.template-card { padding:16px; border:1px solid #dbe3d8; border-radius:20px; background:linear-gradient(180deg, #ffffff, #f7fbf7); }
.overview-card span { display:block; font-size:12px; color:#667768; text-transform:uppercase; }
.overview-card strong { display:block; margin-top:6px; color:#1f3325; }
.task-card__head,.analysis-card__head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.task-card__head span,.analysis-card__head span { font-size:12px; color:#68806d; text-transform:uppercase; }
.task-card__head h3,.analysis-card__head h3,.template-card strong { margin:4px 0 0; }
.context-note { margin:0; font-size:13px; line-height:1.5; color:#47614e; }
.form-grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
.form-grid label { display:grid; gap:8px; color:#304533; }
.form-grid input,.form-grid textarea,.form-grid select { padding:11px 12px; }
.preview-table { overflow:auto; border:1px solid #dfe6dd; border-radius:20px; }
.preview-table table { width:100%; border-collapse:collapse; }
.preview-table th,.preview-table td { padding:9px 12px; border-bottom:1px solid #eef2ec; text-align:left; white-space:nowrap; }
.right-panel { position:sticky; top:74px; }
.right-panel__body { display:flex; flex-direction:column; gap:14px; padding:16px; border:1px solid #d8e1d5; border-radius:24px; background:rgba(255,255,255,.93); box-shadow:0 14px 30px rgba(28,44,29,.06); }
.detail-toggle { width:100%; margin-bottom:10px; }
.detail-summary,.warning-list { display:grid; gap:12px; }
.warning-list { margin:0; padding-left:18px; color:#5b6c5d; line-height:1.55; }
.fab-cluster { position:fixed; right:24px; bottom:24px; display:flex; flex-direction:column; align-items:flex-end; gap:10px; z-index:40; }
.fab-main { width:58px; height:58px; border-radius:999px; border:none; background:#1f4d31; color:#fff; font-size:30px; box-shadow:0 18px 30px rgba(31,77,49,.28); }
.fab-actions { display:flex; flex-direction:column; gap:10px; opacity:0; pointer-events:none; transform:translateY(8px); transition:opacity .2s ease, transform .2s ease; }
.fab-cluster.open .fab-actions,.fab-cluster:hover .fab-actions { opacity:1; pointer-events:auto; transform:translateY(0); }
.dashboard-loading,.dashboard-error { padding:28px; }
.dashboard-error a { color:#1d4ed8; }
@media (max-width:1180px) {
  .dashboard-layout { grid-template-columns:1fr; }
  .right-panel { position:static; }
}
@media (max-width:760px) {
  .dashboard-view { padding:14px 14px 32px; }
  .dashboard-header,.panel-card { padding:16px; }
  .dashboard-header { flex-direction:column; }
  .title-input { min-width:0; font-size:24px; }
}
</style>
