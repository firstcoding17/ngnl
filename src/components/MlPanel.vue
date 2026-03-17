<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { inferColumnTypes } from '@/utils/colTypes';
import { getMlCapabilities, runMlTrain } from '@/services/mlApi';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  profileSummary: { type: Object, default: () => ({}) },
  preset: { type: Object, default: null },
});

const task = ref('regression');
const model = ref('linear');
const target = ref('');
const features = ref([]);
const testSize = ref(0.2);
const nClusters = ref(3);
const dbscanEps = ref(0.5);
const dbscanMinSamples = ref(5);
const contamination = ref('auto');
const nComponents = ref(2);
const elasticAlpha = ref(1.0);
const elasticL1Ratio = ref(0.5);
const nNeighbors = ref(5);
const svmC = ref(1.0);
const svmKernel = ref('rbf');
const svmGamma = ref('scale');
const svmEpsilon = ref(0.1);
const calibMethod = ref('sigmoid');
const calibCv = ref(3);
const cvFolds = ref(0);
const scoring = ref('');
const preset = ref('balanced');
const includeArtifact = ref(false);
const enableShap = ref(false);
const timeColumn = ref('');
const tsHorizon = ref(12);
const maWindow = ref(7);
const seasonalPeriod = ref(0);
const tsTrend = ref('add');
const artifactFileInput = ref(null);
const lastRunRequest = ref(null);

const capLoading = ref(true);
const capError = ref('');
const caps = ref(null);

const loading = ref(false);
const error = ref('');
const result = ref(null);
const presetNotice = ref('');
const lastPresetKey = ref('');

const colTypes = computed(() => inferColumnTypes(props.rows, props.columns));
const numericColumns = computed(() => props.columns.filter((c) => colTypes.value[c] === 'number'));
const dateColumns = computed(() => props.columns.filter((c) => colTypes.value[c] === 'date'));
const taskRequiresTarget = computed(
  () => task.value === 'regression' || task.value === 'classification' || task.value === 'timeseries'
);
const taskSupportsTestSplit = computed(() => task.value === 'regression' || task.value === 'classification');
const targetColumns = computed(() => {
  if (task.value === 'regression') return numericColumns.value;
  if (task.value === 'classification') return props.columns;
  if (task.value === 'timeseries') return numericColumns.value;
  return [];
});
const featureColumns = computed(() => {
  if (task.value === 'timeseries') return [];
  if (taskRequiresTarget.value) return props.columns.filter((c) => c !== target.value);
  return props.columns;
});
const projectionColumns = computed(() => {
  const first = result.value?.projectionPreview?.[0];
  return first ? Object.keys(first) : [];
});
const targetClassCount = computed(() => {
  if (task.value !== 'classification' || !target.value) return 0;
  const uniq = new Set();
  for (const row of props.rows || []) {
    const v = row?.[target.value];
    if (v === null || v === undefined || v === '') continue;
    uniq.add(String(v));
    if (uniq.size > 1000) break;
  }
  return uniq.size;
});
const recommendationForTask = computed(() => {
  const rowCount = (props.rows || []).length;
  const numericCount = numericColumns.value.length;
  const warningCount = Array.isArray(props.profileSummary?.warnings) ? props.profileSummary.warnings.length : 0;
  const basePreset =
    rowCount >= 20000 ? 'fast' : rowCount < 500 && warningCount === 0 ? 'accurate' : 'balanced';

  if (task.value === 'classification') {
    const classes = targetClassCount.value;
    const modelChoice = rowCount >= 6000 ? 'hgb' : rowCount >= 300 ? 'forest' : 'tree';
    const scoringChoice = classes > 2 ? 'f1_weighted' : 'accuracy';
    return {
      task: 'classification',
      model: modelChoice,
      preset: basePreset,
      cv: rowCount >= 100 ? 5 : 3,
      scoring: scoringChoice,
      reason: `rows=${rowCount}, classes=${classes || 'n/a'}, numericCols=${numericCount}`,
    };
  }
  if (task.value === 'regression') {
    const modelChoice = rowCount >= 6000 ? 'hgb' : rowCount >= 300 ? 'forest' : 'linear';
    return {
      task: 'regression',
      model: modelChoice,
      preset: basePreset,
      cv: rowCount >= 100 ? 5 : 3,
      scoring: 'r2',
      reason: `rows=${rowCount}, numericCols=${numericCount}`,
    };
  }
  if (task.value === 'clustering') {
    const modelChoice = rowCount > 2500 ? 'kmeans' : 'dbscan';
    return {
      task: 'clustering',
      model: modelChoice,
      preset: basePreset,
      cv: 0,
      scoring: '',
      reason: `rows=${rowCount}, numericCols=${numericCount}`,
    };
  }
  if (task.value === 'anomaly') {
    return {
      task: 'anomaly',
      model: 'isolation_forest',
      preset: basePreset,
      cv: 0,
      scoring: '',
      reason: `rows=${rowCount}, warningCount=${warningCount}`,
    };
  }
  if (task.value === 'timeseries') {
    return {
      task: 'timeseries',
      model: 'moving_avg',
      preset: basePreset,
      cv: 0,
      scoring: '',
      reason: `rows=${rowCount}, dateCols=${dateColumns.value.length}`,
    };
  }
  return {
    task: 'dim_reduction',
    model: 'pca',
    preset: basePreset,
    cv: 0,
    scoring: '',
    reason: `rows=${rowCount}, numericCols=${numericCount}`,
  };
});

const modelOptions = computed(() => {
  if (task.value === 'classification') {
    return [
      { value: 'linear', label: 'Logistic (linear)' },
      { value: 'tree', label: 'Decision tree' },
      { value: 'forest', label: 'Random forest' },
      { value: 'extra_trees', label: 'Extra Trees' },
      { value: 'adaboost', label: 'AdaBoost' },
      { value: 'svm', label: 'SVM (SVC)' },
      { value: 'calibrated', label: 'Calibrated Forest' },
      { value: 'voting', label: 'Voting Ensemble' },
      { value: 'hgb', label: 'Hist Gradient Boosting' },
      { value: 'xgboost', label: 'XGBoost (optional)' },
      { value: 'lightgbm', label: 'LightGBM (optional)' },
      { value: 'catboost', label: 'CatBoost (optional)' },
      { value: 'tabnet', label: 'TabNet (optional)' },
      { value: 'ft_transformer', label: 'FT-Transformer (optional)' },
      { value: 'torch_mlp', label: 'PyTorch MLP (optional)' },
      { value: 'tf_mlp', label: 'TensorFlow MLP (optional)' },
      { value: 'nb', label: 'Naive Bayes (Gaussian)' },
      { value: 'knn', label: 'K-Nearest Neighbors' },
      { value: 'nn', label: 'Neural network (DL-lite)' },
    ];
  }
  if (task.value === 'anomaly') {
    return [
      { value: 'isolation_forest', label: 'Isolation Forest' },
      { value: 'autoencoder', label: 'Autoencoder (DL-lite)' },
    ];
  }
  if (task.value === 'timeseries') {
    return [
      { value: 'naive', label: 'Naive forecast' },
      { value: 'moving_avg', label: 'Moving average' },
      { value: 'arima', label: 'ARIMA (optional)' },
      { value: 'exp_smoothing', label: 'Exponential smoothing (optional)' },
    ];
  }
  if (task.value === 'clustering') {
    return [
      { value: 'kmeans', label: 'K-Means' },
      { value: 'dbscan', label: 'DBSCAN' },
    ];
  }
  if (task.value === 'dim_reduction') {
    return [{ value: 'pca', label: 'PCA' }];
  }
  return [
    { value: 'linear', label: 'Linear regression' },
    { value: 'tree', label: 'Decision tree' },
    { value: 'forest', label: 'Random forest' },
    { value: 'extra_trees', label: 'Extra Trees' },
    { value: 'adaboost', label: 'AdaBoost' },
    { value: 'svm', label: 'SVM (SVR)' },
    { value: 'voting', label: 'Voting Ensemble' },
    { value: 'elasticnet', label: 'ElasticNet' },
    { value: 'hgb', label: 'Hist Gradient Boosting' },
    { value: 'xgboost', label: 'XGBoost (optional)' },
    { value: 'lightgbm', label: 'LightGBM (optional)' },
    { value: 'catboost', label: 'CatBoost (optional)' },
    { value: 'tabnet', label: 'TabNet (optional)' },
    { value: 'ft_transformer', label: 'FT-Transformer (optional)' },
    { value: 'torch_mlp', label: 'PyTorch MLP (optional)' },
    { value: 'tf_mlp', label: 'TensorFlow MLP (optional)' },
    { value: 'nn', label: 'Neural network (DL-lite)' },
  ];
});
const scoringOptions = computed(() => {
  if (task.value === 'classification') {
    return [
      { value: 'accuracy', label: 'Accuracy' },
      { value: 'f1_weighted', label: 'F1 weighted' },
      { value: 'precision_weighted', label: 'Precision weighted' },
      { value: 'recall_weighted', label: 'Recall weighted' },
    ];
  }
  if (task.value === 'regression') {
    return [
      { value: 'r2', label: 'R2' },
      { value: 'neg_mean_absolute_error', label: 'Neg MAE' },
      { value: 'neg_root_mean_squared_error', label: 'Neg RMSE' },
      { value: 'neg_mean_squared_error', label: 'Neg MSE' },
    ];
  }
  return [];
});

const runState = computed(() => {
  if (loading.value) return 'loading';
  if (error.value) return 'error';
  if (!result.value) return 'empty';
  if (result.value?.warnings?.length) return 'partial';
  return 'success';
});

const canRun = computed(() => {
  if (!props.rows.length) return false;
  if (task.value === 'timeseries') return !!target.value;
  if (taskRequiresTarget.value && !target.value) return false;
  if (!features.value.length) return false;
  return true;
});

function setDefaults() {
  if (!props.columns.length) return;
  if (taskRequiresTarget.value) {
    const validTargets = targetColumns.value;
    if (!validTargets.includes(target.value)) {
      target.value = validTargets[0] || '';
    }
  } else {
    target.value = '';
  }
  const validFeatureSet = new Set(featureColumns.value);
  features.value = (features.value || []).filter((c) => validFeatureSet.has(c));
  if (!features.value.length && task.value !== 'timeseries') {
    features.value = featureColumns.value.slice(0, Math.min(5, featureColumns.value.length));
  }
  if (task.value === 'timeseries') {
    const dateCols = dateColumns.value;
    if (!dateCols.includes(timeColumn.value)) {
      timeColumn.value = dateCols[0] || props.columns[0] || '';
    }
    features.value = [];
  }
}

watch(task, () => {
  model.value = modelOptions.value[0]?.value || '';
  scoring.value = '';
  if (!taskSupportsTestSplit.value) cvFolds.value = 0;
  setDefaults();
});

watch(
  () => [props.columns, props.rows],
  () => setDefaults(),
  { deep: true, immediate: true }
);

watch(
  () => props.preset,
  async (nextPreset) => {
    if (!nextPreset || nextPreset.panel !== 'ml' || nextPreset.key === lastPresetKey.value) return;
    lastPresetKey.value = nextPreset.key;
    if (nextPreset.request && typeof nextPreset.request === 'object') {
      await applyArtifactRequest(nextPreset.request);
    }
    presetNotice.value = nextPreset.title || 'Preset ready for ML panel. Review settings and click Train model.';
    error.value = '';
    result.value = null;
  },
  { deep: true }
);

onMounted(async () => {
  try {
    capLoading.value = true;
    capError.value = '';
    const res = await getMlCapabilities();
    caps.value = res?.data || null;
  } catch (e) {
    capError.value = String(e?.message || e);
  } finally {
    capLoading.value = false;
  }
});

async function runTrain() {
  error.value = '';
  result.value = null;
  loading.value = true;
  try {
    const payload = buildTrainPayload();
    lastRunRequest.value = payload;
    const res = await runMlTrain(payload);
    result.value = res?.data || null;
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}

function buildTrainPayload() {
  return {
    task: task.value,
    model: model.value,
    rows: props.rows,
    args: {
      target: target.value,
      features: features.value,
      timeColumn: task.value === 'timeseries' ? timeColumn.value : undefined,
    },
    options: {
      testSize: testSize.value,
      randomState: 42,
      nClusters: nClusters.value,
      eps: dbscanEps.value,
      minSamples: dbscanMinSamples.value,
      contamination: contamination.value,
      nComponents: nComponents.value,
      alpha: elasticAlpha.value,
      l1Ratio: elasticL1Ratio.value,
      nNeighbors: nNeighbors.value,
      svmC: svmC.value,
      svmKernel: svmKernel.value,
      svmGamma: svmGamma.value,
      svmEpsilon: svmEpsilon.value,
      calibMethod: calibMethod.value,
      calibCv: calibCv.value,
      cv: cvFolds.value,
      scoring: scoring.value,
      preset: preset.value,
      includeArtifact: includeArtifact.value,
      enableShap: enableShap.value,
      horizon: tsHorizon.value,
      maWindow: maWindow.value,
      seasonalPeriod: seasonalPeriod.value,
      tsTrend: tsTrend.value,
    },
  };
}

function applyRecommendation() {
  const rec = recommendationForTask.value;
  if (!rec) return;
  model.value = rec.model;
  preset.value = rec.preset;
  if (taskSupportsTestSplit.value) {
    cvFolds.value = rec.cv;
    scoring.value = rec.scoring;
  } else {
    cvFolds.value = 0;
    scoring.value = '';
  }
}

function saveArtifact() {
  if (!result.value) return;
  const payload = {
    version: 'ml-artifact-v1',
    createdAt: new Date().toISOString(),
    request: lastRunRequest.value || buildTrainPayload(),
    result: result.value,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ml-artifact-${task.value}-${model.value}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openArtifactFile() {
  artifactFileInput.value?.click();
}

async function applyArtifactRequest(req) {
  if (!req || typeof req !== 'object') return;
  if (req.task) task.value = String(req.task);
  await nextTick();
  if (req.model) model.value = String(req.model);
  if (req.args?.target != null) target.value = String(req.args.target || '');
  if (Array.isArray(req.args?.features)) features.value = req.args.features.map((v) => String(v));
  const opts = req.options || {};
  if (opts.testSize != null) testSize.value = Number(opts.testSize) || testSize.value;
  if (opts.nClusters != null) nClusters.value = Number(opts.nClusters) || nClusters.value;
  if (opts.eps != null) dbscanEps.value = Number(opts.eps) || dbscanEps.value;
  if (opts.minSamples != null) dbscanMinSamples.value = Number(opts.minSamples) || dbscanMinSamples.value;
  if (opts.contamination != null) contamination.value = String(opts.contamination);
  if (opts.nComponents != null) nComponents.value = Number(opts.nComponents) || nComponents.value;
  if (opts.alpha != null) elasticAlpha.value = Number(opts.alpha) || elasticAlpha.value;
  if (opts.l1Ratio != null) elasticL1Ratio.value = Number(opts.l1Ratio) || elasticL1Ratio.value;
  if (opts.nNeighbors != null) nNeighbors.value = Number(opts.nNeighbors) || nNeighbors.value;
  if (opts.svmC != null) svmC.value = Number(opts.svmC) || svmC.value;
  if (opts.svmKernel != null) svmKernel.value = String(opts.svmKernel || svmKernel.value);
  if (opts.svmGamma != null) svmGamma.value = String(opts.svmGamma || svmGamma.value);
  if (opts.svmEpsilon != null) svmEpsilon.value = Number(opts.svmEpsilon) || svmEpsilon.value;
  if (opts.calibMethod != null) calibMethod.value = String(opts.calibMethod || calibMethod.value);
  if (opts.calibCv != null) calibCv.value = Number(opts.calibCv) || calibCv.value;
  if (opts.cv != null) cvFolds.value = Number(opts.cv) || 0;
  if (opts.scoring != null) scoring.value = String(opts.scoring || '');
  if (opts.preset != null) preset.value = String(opts.preset || preset.value);
  includeArtifact.value = !!opts.includeArtifact;
  enableShap.value = !!opts.enableShap;
  if (req.args?.timeColumn != null) timeColumn.value = String(req.args.timeColumn || '');
  if (opts.horizon != null) tsHorizon.value = Number(opts.horizon) || tsHorizon.value;
  if (opts.maWindow != null) maWindow.value = Number(opts.maWindow) || maWindow.value;
  if (opts.seasonalPeriod != null) seasonalPeriod.value = Number(opts.seasonalPeriod) || seasonalPeriod.value;
  if (opts.tsTrend != null) tsTrend.value = String(opts.tsTrend || tsTrend.value);
}

async function onArtifactFilePick(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.result) {
      throw new Error('invalid artifact file');
    }
    await applyArtifactRequest(parsed.request || {});
    lastRunRequest.value = parsed.request || null;
    result.value = parsed.result || null;
    error.value = '';
  } catch (err) {
    error.value = String(err?.message || err);
  } finally {
    if (e?.target) e.target.value = '';
  }
}
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div class="font-semibold">ML / DL Playground</div>
      <div class="ml-auto flex items-center gap-2">
        <label class="inline-flex items-center gap-1 text-xs">
          <input type="checkbox" v-model="includeArtifact" />
          Include model binary
        </label>
        <button @click="saveArtifact" :disabled="!result">Save artifact</button>
        <button @click="openArtifactFile">Load artifact</button>
        <input
          ref="artifactFileInput"
          type="file"
          class="hidden"
          accept="application/json,.json"
          @change="onArtifactFilePick"
        />
        <button @click="runTrain" :disabled="loading || !canRun">
          {{ loading ? 'Training...' : 'Train model' }}
        </button>
      </div>
    </div>

    <div v-if="capLoading" class="state loading">Checking ML capabilities...</div>
    <div v-else-if="capError" class="state error">{{ capError }}</div>
    <div v-else-if="caps" class="state success">
      sklearn: <b>{{ caps.sklearn ? 'ready' : 'missing' }}</b>,
      pandas: <b>{{ caps.pandas ? 'ready' : 'missing' }}</b>,
      shap: <b>{{ caps.shap ? 'ready' : 'missing' }}</b>,
      statsmodels: <b>{{ caps.statsmodels ? 'ready' : 'missing' }}</b>,
      pytorch-tabnet: <b>{{ caps.pytorch_tabnet ? 'ready' : 'missing' }}</b>,
      rtdl: <b>{{ caps.rtdl ? 'ready' : 'missing' }}</b>,
      xgboost: <b>{{ caps.xgboost ? 'ready' : 'missing' }}</b>,
      lightgbm: <b>{{ caps.lightgbm ? 'ready' : 'missing' }}</b>,
      catboost: <b>{{ caps.catboost ? 'ready' : 'missing' }}</b>,
      dl mode: <b>{{ caps.deepLearningMode || 'n/a' }}</b>
    </div>
    <div v-if="presetNotice" class="state success">{{ presetNotice }}</div>

    <div class="grid md:grid-cols-2 gap-3">
      <label>
        Task
        <select v-model="task">
          <option value="regression">Regression</option>
          <option value="classification">Classification</option>
          <option value="anomaly">Anomaly Detection</option>
          <option value="clustering">Clustering</option>
          <option value="dim_reduction">Dimensionality Reduction</option>
          <option value="timeseries">Time Series Forecast</option>
        </select>
      </label>

      <label>
        Model
        <select v-model="model">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </label>

      <label>
        Preset
        <select v-model="preset">
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="accurate">Accurate</option>
        </select>
      </label>

      <label v-if="task === 'regression' || task === 'classification'">
        Explainability
        <span class="inline-flex items-center gap-1 text-xs">
          <input type="checkbox" v-model="enableShap" />
          Enable SHAP (optional)
        </span>
      </label>

      <label v-if="taskRequiresTarget">
        Target
        <select v-model="target">
          <option value="">Select target</option>
          <option v-for="c in targetColumns" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>

      <label v-if="task === 'timeseries'">
        Time column
        <select v-model="timeColumn">
          <option v-for="c in props.columns" :key="`ts-${c}`" :value="c">{{ c }}</option>
        </select>
      </label>

      <label v-if="taskSupportsTestSplit">
        Test split
        <input type="number" min="0.1" max="0.5" step="0.05" v-model.number="testSize" />
      </label>

      <label v-if="taskSupportsTestSplit">
        CV folds (0=off)
        <input type="number" min="0" max="10" step="1" v-model.number="cvFolds" />
      </label>

      <label v-if="taskSupportsTestSplit">
        Scoring
        <select v-model="scoring">
          <option value="">Auto</option>
          <option v-for="it in scoringOptions" :key="`sc-${it.value}`" :value="it.value">{{ it.label }}</option>
        </select>
      </label>

      <label v-if="task === 'regression' && model === 'elasticnet'">
        ElasticNet alpha
        <input type="number" min="0.001" step="0.01" v-model.number="elasticAlpha" />
      </label>

      <label v-if="task === 'regression' && model === 'elasticnet'">
        ElasticNet l1 ratio
        <input type="number" min="0" max="1" step="0.05" v-model.number="elasticL1Ratio" />
      </label>

      <label v-if="task === 'classification' && model === 'knn'">
        KNN neighbors
        <input type="number" min="1" max="100" step="1" v-model.number="nNeighbors" />
      </label>

      <label v-if="(task === 'classification' || task === 'regression') && model === 'svm'">
        SVM C
        <input type="number" min="0.01" max="1000" step="0.01" v-model.number="svmC" />
      </label>

      <label v-if="(task === 'classification' || task === 'regression') && model === 'svm'">
        SVM kernel
        <select v-model="svmKernel">
          <option value="rbf">rbf</option>
          <option value="linear">linear</option>
          <option value="poly">poly</option>
          <option value="sigmoid">sigmoid</option>
        </select>
      </label>

      <label v-if="task === 'classification' && model === 'svm'">
        SVM gamma
        <input type="text" v-model="svmGamma" />
      </label>

      <label v-if="task === 'classification' && model === 'calibrated'">
        Calibration method
        <select v-model="calibMethod">
          <option value="sigmoid">sigmoid</option>
          <option value="isotonic">isotonic</option>
        </select>
      </label>

      <label v-if="task === 'classification' && model === 'calibrated'">
        Calibration CV
        <input type="number" min="2" max="10" step="1" v-model.number="calibCv" />
      </label>

      <label v-if="task === 'regression' && model === 'svm'">
        SVM epsilon
        <input type="number" min="0.001" max="10" step="0.001" v-model.number="svmEpsilon" />
      </label>

      <label v-if="task === 'clustering' && model === 'kmeans'">
        KMeans clusters
        <input type="number" min="2" max="100" step="1" v-model.number="nClusters" />
      </label>

      <label v-if="task === 'clustering' && model === 'dbscan'">
        DBSCAN eps
        <input type="number" min="0.05" max="10" step="0.05" v-model.number="dbscanEps" />
      </label>

      <label v-if="task === 'clustering' && model === 'dbscan'">
        DBSCAN min samples
        <input type="number" min="1" max="100" step="1" v-model.number="dbscanMinSamples" />
      </label>

      <label v-if="task === 'anomaly'">
        Contamination (`auto` or 0~0.5)
        <input type="text" v-model="contamination" />
      </label>

      <label v-if="task === 'dim_reduction'">
        PCA components
        <input type="number" min="1" max="30" step="1" v-model.number="nComponents" />
      </label>

      <label v-if="task === 'timeseries'">
        Forecast horizon
        <input type="number" min="1" max="365" step="1" v-model.number="tsHorizon" />
      </label>

      <label v-if="task === 'timeseries' && model === 'moving_avg'">
        Moving average window
        <input type="number" min="2" max="180" step="1" v-model.number="maWindow" />
      </label>

      <label v-if="task === 'timeseries' && model === 'exp_smoothing'">
        Seasonal period (0=off)
        <input type="number" min="0" max="365" step="1" v-model.number="seasonalPeriod" />
      </label>

      <label v-if="task === 'timeseries' && model === 'exp_smoothing'">
        Trend
        <select v-model="tsTrend">
          <option value="add">add</option>
          <option value="mul">mul</option>
          <option value="none">none</option>
        </select>
      </label>
    </div>

    <div class="state recommend">
      Recommended config for this task:
      <b>{{ recommendationForTask.model }}</b>,
      preset <b>{{ recommendationForTask.preset }}</b>,
      <template v-if="taskSupportsTestSplit">
        cv <b>{{ recommendationForTask.cv }}</b>,
        scoring <b>{{ recommendationForTask.scoring || 'auto' }}</b>,
      </template>
      reason: {{ recommendationForTask.reason }}.
      <button class="ml-2" @click="applyRecommendation" :disabled="loading">Apply recommendation</button>
    </div>

    <label v-if="task !== 'timeseries'">
      Features (multi-select)
      <select v-model="features" multiple size="8">
        <option v-for="c in featureColumns" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <div v-if="runState === 'loading'" class="state loading">Model training in progress...</div>
    <div v-else-if="runState === 'error'" class="state error">{{ error }}</div>
    <div v-else-if="runState === 'empty'" class="state empty">No model result yet.</div>

    <div v-else class="space-y-2">
      <div v-if="runState === 'partial'" class="state partial">
        <div v-for="w in result.warnings" :key="w">- {{ w }}</div>
      </div>

      <div class="text-sm">
        task <b>{{ result.task }}</b> / model <b>{{ result.model }}</b> / preset <b>{{ result.preset || 'n/a' }}</b> /
        <template v-if="result.target">
          target <b>{{ result.target }}</b> /
        </template>
        encoded features <b>{{ result.encodedFeatureCount }}</b>
        <template v-if="result.modelArtifact?.byteSize">
          / artifact <b>{{ result.modelArtifact.byteSize }}</b> bytes
        </template>
      </div>

      <div class="metric-grid">
        <div v-for="(v, k) in (result.metrics || {})" :key="k" class="metric-item">
          <span>{{ k }}</span>
          <b>{{ Number(v).toFixed(4) }}</b>
        </div>
      </div>

      <div v-if="result.validation" class="border rounded p-2 text-xs">
        <div>
          validation: holdout={{ Number(result.validation.holdoutTestSize || 0).toFixed(2) }},
          scoring={{ result.validation.scoring || 'n/a' }}
        </div>
        <div v-if="result.validation.cv?.enabled">
          cv={{ result.validation.cv.folds }} folds,
          mean={{ Number(result.validation.cv.mean).toFixed(6) }},
          std={{ Number(result.validation.cv.std).toFixed(6) }}
        </div>
        <div v-else>cv=off</div>
      </div>

      <div
        v-if="result.errorAnalysis?.type === 'classification' && result.errorAnalysis?.matrix?.length"
        class="border rounded p-2"
      >
        <div class="text-sm font-semibold mb-1">Confusion matrix</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>actual \ predicted</th>
                <th v-for="lb in result.errorAnalysis.labels || []" :key="`cm-h-${lb}`">{{ lb }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ridx) in result.errorAnalysis.matrix" :key="`cm-r-${ridx}`">
                <td>{{ (result.errorAnalysis.labels || [])[ridx] }}</td>
                <td v-for="(v, cidx) in row" :key="`cm-${ridx}-${cidx}`">{{ v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-if="result.errorAnalysis?.type === 'regression' && result.errorAnalysis?.residualSummary"
        class="border rounded p-2"
      >
        <div class="text-sm font-semibold mb-1">Residual diagnostics</div>
        <div class="text-xs">
          mean={{ Number(result.errorAnalysis.residualSummary.mean || 0).toFixed(6) }},
          absMean={{ Number(result.errorAnalysis.residualSummary.absMean || 0).toFixed(6) }},
          q05={{ Number(result.errorAnalysis.residualSummary.q05 || 0).toFixed(6) }},
          q95={{ Number(result.errorAnalysis.residualSummary.q95 || 0).toFixed(6) }}
        </div>
        <div v-if="result.errorAnalysis.topResiduals?.length" class="table-scroll mt-2">
          <table>
            <thead>
              <tr><th>actual</th><th>predicted</th><th>residual</th></tr>
            </thead>
            <tbody>
              <tr v-for="(it, idx) in result.errorAnalysis.topResiduals" :key="`resid-${idx}`">
                <td>{{ Number(it.actual).toFixed(6) }}</td>
                <td>{{ Number(it.predicted).toFixed(6) }}</td>
                <td>{{ Number(it.residual).toFixed(6) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.featureImportance?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">Top feature importance</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>feature</th><th>importance</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in result.featureImportance" :key="it.feature">
                <td>{{ it.feature }}</td>
                <td>{{ Number(it.importance).toFixed(6) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.permutationImportance?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">Permutation importance (holdout)</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>feature</th><th>importance</th><th>std</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in result.permutationImportance" :key="`perm-${it.feature}`">
                <td>{{ it.feature }}</td>
                <td>{{ Number(it.importance).toFixed(6) }}</td>
                <td>{{ Number(it.std || 0).toFixed(6) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.shapImportance?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">SHAP importance</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>feature</th><th>importance</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in result.shapImportance" :key="`shap-${it.feature}`">
                <td>{{ it.feature }}</td>
                <td>{{ Number(it.importance).toFixed(6) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.timeSeriesPreview?.forecast?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">Time series forecast preview</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>t</th><th>actual</th><th>predicted</th></tr>
            </thead>
            <tbody>
              <tr v-for="(it, idx) in result.timeSeriesPreview.forecast" :key="`tsf-${idx}`">
                <td>{{ it.t }}</td>
                <td>{{ Number(it.actual).toFixed(6) }}</td>
                <td>{{ Number(it.predicted).toFixed(6) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.anomalySummary?.labelCounts?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">Anomaly summary</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>label</th><th>count</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in result.anomalySummary.labelCounts" :key="it.label">
                <td>{{ it.label }}</td>
                <td>{{ it.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.clusterSummary?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">Cluster summary</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>cluster</th><th>count</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in result.clusterSummary" :key="it.cluster">
                <td>{{ it.cluster }}</td>
                <td>{{ it.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result.explainedVarianceRatio?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">PCA explained variance ratio</div>
        <div class="text-xs">
          <span v-for="(v, idx) in result.explainedVarianceRatio" :key="`evr-${idx}`" class="mr-2">
            PC{{ idx + 1 }}={{ Number(v).toFixed(4) }}
          </span>
        </div>
      </div>

      <div v-if="result.projectionPreview?.length" class="border rounded p-2">
        <div class="text-sm font-semibold mb-1">Projection preview (first 20 rows)</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th v-for="col in projectionColumns" :key="`proj-h-${col}`">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in result.projectionPreview" :key="`proj-${idx}`">
                <td v-for="col in projectionColumns" :key="`proj-${idx}-${col}`">{{ row[col] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
select,
input,
button {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.state {
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 13px;
}

.state.loading {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.state.error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.state.empty {
  background: #f9fafb;
  color: #4b5563;
}

.state.success {
  background: #ecfdf5;
  border-color: #bbf7d0;
  color: #166534;
}

.state.partial {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

.state.recommend {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #1e3a8a;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.metric-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.table-scroll {
  max-height: 220px;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th,
td {
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  padding: 6px 8px;
}
</style>
