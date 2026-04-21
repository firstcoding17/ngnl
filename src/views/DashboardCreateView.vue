<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RecommendationSummaryCard from '@/components/RecommendationSummaryCard.vue';
import { listRecent, loadDataset, saveDataset } from '@/stores/useDatasets';
import {
  attachDatasetToDashboard,
  createDashboard,
  getDataTypeOptions,
  loadDashboard,
  saveDashboard,
} from '@/stores/useDashboards';
import {
  buildStructuredTaskRecommendations,
  buildPreviewAnalysisRecommendations,
  buildPreprocessingRecommendations,
  readDatasetFile,
  summarizeDataset,
} from '@/utils/datasetImport';
import { buildRecommendationSummary } from '@/utils/recommendationEngine';
import { buildDatasetLinkPrefix } from '@/utils/datasetLinks';
import { makeId } from '@/utils/id';

const route = useRoute();
const router = useRouter();

const steps = ['Data type', 'Dataset upload', 'Structure review', 'Preprocessing', 'Preview and create'];
const selectedType = ref(String(route.query.type || 'tabular'));
const step = ref(1);
const loading = ref(false);
const error = ref('');
const fileInput = ref(null);
const linkedFileInput = ref(null);
const draftDataset = ref(null);
const linkedDatasets = ref([]);
const datasetLinkRules = ref([]);
const recentDatasets = ref([]);
const selectedDatasetId = ref(String(route.query.reuse || ''));
const selectedPreprocessing = ref([]);
const selectedPreviewAnalyses = ref([]);
const dashboardTitle = ref('');
const dashboardSubtitle = ref('');
const dashboardDescription = ref('');
const attachTarget = ref(null);
const preferredTaskType = ref('');
const preferredModelFamily = ref('');
const preferredTextMethod = ref('');
const preferredImageMethod = ref('');
const recommendationNote = ref('');

const dataTypeOptions = computed(() => getDataTypeOptions());
const selectedTypeMeta = computed(() =>
  dataTypeOptions.value.find((option) => option.id === selectedType.value) || dataTypeOptions.value[0]
);

function createDatasetDraft(dataset, source = 'recent') {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  return {
    selectionKey: dataset?.selectionKey || `${source}:${dataset?.id || makeId('dataset_pick')}`,
    persistedId: dataset?.persistedId || dataset?.id || '',
    id: dataset?.id || '',
    name: dataset?.name || 'dataset',
    format: dataset?.format || (source === 'recent' ? 'saved' : 'file'),
    source,
    rows,
    columns,
    summary: summarizeDataset(rows, columns, selectedType.value),
    diagnostics: dataset?.diagnostics || null,
  };
}

function ensureRulePrefix(dataset, fallback = 'linked') {
  return buildDatasetLinkPrefix(dataset?.name || dataset?.id || '', fallback);
}

function guessJoinRule(primaryDataset, linkedDataset) {
  const primaryColumns = Array.isArray(primaryDataset?.columns) ? primaryDataset.columns : [];
  const linkedColumns = Array.isArray(linkedDataset?.columns) ? linkedDataset.columns : [];
  const exactMatch = primaryColumns.find((column) => linkedColumns.includes(column));
  const baseKey = exactMatch || primaryColumns.find((column) => /(^id$|_id$|id_|code|name|key)/i.test(column)) || primaryColumns[0] || '';
  const joinKey = (baseKey && linkedColumns.includes(baseKey) ? baseKey : '')
    || exactMatch
    || linkedColumns.find((column) => /(^id$|_id$|id_|code|name|key)/i.test(column))
    || linkedColumns[0]
    || '';
  return { baseKey, joinKey };
}

function syncLinkRules() {
  if (!draftDataset.value) {
    datasetLinkRules.value = [];
    return;
  }
  const existing = new Map(datasetLinkRules.value.map((rule) => [rule.datasetSelectionKey, rule]));
  datasetLinkRules.value = linkedDatasets.value.map((dataset, index) => {
    const current = existing.get(dataset.selectionKey) || {};
    const guess = guessJoinRule(draftDataset.value, dataset);
    return {
      id: current.id || makeId('dataset_link'),
      datasetSelectionKey: dataset.selectionKey,
      datasetId: dataset.persistedId || '',
      baseDatasetId: draftDataset.value.persistedId || draftDataset.value.id || '',
      baseKey: current.baseKey && draftDataset.value.columns.includes(current.baseKey) ? current.baseKey : guess.baseKey,
      joinKey: current.joinKey && dataset.columns.includes(current.joinKey) ? current.joinKey : guess.joinKey,
      joinType: 'left',
      prefix: current.prefix || ensureRulePrefix(dataset, `linked_${index + 1}`),
    };
  });
}

function addLinkedDataset(dataset) {
  if (!dataset) return;
  if (draftDataset.value?.persistedId && dataset.persistedId && draftDataset.value.persistedId === dataset.persistedId) return;
  if (linkedDatasets.value.some((item) => item.selectionKey === dataset.selectionKey)) return;
  linkedDatasets.value = [...linkedDatasets.value, dataset];
  syncLinkRules();
}

function removeLinkedDataset(selectionKey) {
  linkedDatasets.value = linkedDatasets.value.filter((dataset) => dataset.selectionKey !== selectionKey);
  syncLinkRules();
}

function isLinkedRecentDataset(datasetId) {
  return linkedDatasets.value.some((dataset) => dataset.persistedId === datasetId);
}

const linkRuleRows = computed(() =>
  linkedDatasets.value.map((dataset) => ({
    dataset,
    rule: datasetLinkRules.value.find((item) => item.datasetSelectionKey === dataset.selectionKey) || null,
  }))
);

function buildLinkedSummary(summary, prefix, joinKey = '') {
  const sourceColumns = Object.keys(summary?.columnTypes || {});
  const mappedColumns = sourceColumns
    .filter((column) => column !== joinKey)
    .map((column) => ({ source: column, target: `${prefix}_${column}` }));
  const remap = (items = []) => mappedColumns.filter(({ source }) => items.includes(source)).map(({ target }) => target);
  return {
    columnTypes: Object.fromEntries(
      mappedColumns.map(({ source, target }) => [target, summary?.columnTypes?.[source] || 'category'])
    ),
    missingByColumn: Object.fromEntries(
      mappedColumns.map(({ source, target }) => [target, summary?.missingByColumn?.[source] ?? 0])
    ),
    columnProfiles: Object.fromEntries(
      mappedColumns.map(({ source, target }) => [target, summary?.columnProfiles?.[source] || { uniqueCount: 0, averageTextLength: 0 }])
    ),
    numericColumns: remap(summary?.numericColumns || []),
    categoricalColumns: remap(summary?.categoricalColumns || []),
    dateColumns: remap(summary?.dateColumns || []),
    textColumns: remap(summary?.textColumns || []),
    binaryLikeColumns: remap(summary?.binaryLikeColumns || []),
    imageColumns: remap(summary?.imageColumns || []),
  };
}

function buildWizardSummary() {
  if (!draftDataset.value?.summary) return null;
  const primary = draftDataset.value.summary;
  const merged = {
    rowCount: primary.rowCount,
    colCount: primary.colCount,
    missingCount: primary.missingCount,
    missingByColumn: { ...(primary.missingByColumn || {}) },
    sampleRows: Array.isArray(primary.sampleRows) ? primary.sampleRows : [],
    columnTypes: { ...(primary.columnTypes || {}) },
    columnProfiles: { ...(primary.columnProfiles || {}) },
    numericColumns: [...(primary.numericColumns || [])],
    categoricalColumns: [...(primary.categoricalColumns || [])],
    dateColumns: [...(primary.dateColumns || [])],
    textColumns: [...(primary.textColumns || [])],
    binaryLikeColumns: [...(primary.binaryLikeColumns || [])],
    imageColumns: [...(primary.imageColumns || [])],
    previewColumns: Array.isArray(primary.previewColumns) ? primary.previewColumns : [],
    preferredType: selectedType.value,
    linkedDatasetCount: linkedDatasets.value.length,
  };

  linkRuleRows.value.forEach(({ dataset, rule }) => {
    if (!dataset?.summary || !rule?.prefix) return;
    const linked = buildLinkedSummary(dataset.summary, rule.prefix, rule.joinKey);
    merged.columnTypes = { ...merged.columnTypes, ...linked.columnTypes };
    merged.columnProfiles = { ...merged.columnProfiles, ...linked.columnProfiles };
    merged.missingByColumn = { ...merged.missingByColumn, ...linked.missingByColumn };
    merged.numericColumns = Array.from(new Set([...merged.numericColumns, ...linked.numericColumns]));
    merged.categoricalColumns = Array.from(new Set([...merged.categoricalColumns, ...linked.categoricalColumns]));
    merged.dateColumns = Array.from(new Set([...merged.dateColumns, ...linked.dateColumns]));
    merged.textColumns = Array.from(new Set([...merged.textColumns, ...linked.textColumns]));
    merged.binaryLikeColumns = Array.from(new Set([...merged.binaryLikeColumns, ...linked.binaryLikeColumns]));
    merged.imageColumns = Array.from(new Set([...merged.imageColumns, ...linked.imageColumns]));
  });

  merged.colCount = Object.keys(merged.columnTypes).length;
  merged.missingCount = Object.values(merged.missingByColumn).reduce((sum, value) => sum + Number(value || 0), 0);
  return merged;
}

const wizardSummary = computed(() => buildWizardSummary());
const preprocessingOptions = computed(() => buildPreprocessingRecommendations(wizardSummary.value, selectedType.value));
const previewOptions = computed(() => buildPreviewAnalysisRecommendations(wizardSummary.value, selectedType.value));
const structuredRecommendations = computed(() => buildStructuredTaskRecommendations(wizardSummary.value, selectedType.value));
const wizardRecommendationSummary = computed(() => buildRecommendationSummary({
  dataType: selectedType.value,
  datasetSummary: wizardSummary.value,
  dashboard: {
    dataType: selectedType.value,
    datasetLinks: {
      primaryDatasetId: draftDataset.value?.persistedId || draftDataset.value?.id || '',
      links: datasetLinkRules.value.map((rule) => ({
        datasetId: rule.datasetId || '',
        baseKey: rule.baseKey || '',
        joinKey: rule.joinKey || '',
      })),
    },
  },
  datasetLinkArtifact: linkConfigIssues.value.length
    ? {
        availability: 'warning',
        warnings: linkConfigIssues.value,
      }
    : null,
}));
const previewColumns = computed(() => draftDataset.value?.summary?.previewColumns || []);
const previewRows = computed(() => draftDataset.value?.summary?.sampleRows || []);
const linkConfigIssues = computed(() => {
  if (!draftDataset.value) return [];
  return linkRuleRows.value.flatMap(({ dataset, rule }) => {
    const issues = [];
    if (!rule) {
      issues.push(`${dataset.name}: link rule is missing.`);
      return issues;
    }
    if (!rule.baseKey || !draftDataset.value.columns.includes(rule.baseKey)) {
      issues.push(`${dataset.name}: choose a primary key.`);
    }
    if (!rule.joinKey || !dataset.columns.includes(rule.joinKey)) {
      issues.push(`${dataset.name}: choose a linked key.`);
    }
    return issues;
  });
});
const canAdvance = computed(() => {
  if (step.value === 1) return !!selectedType.value;
  if (step.value === 2) return !!draftDataset.value;
  if (step.value === 3) return !!draftDataset.value;
  if (step.value === 4) return true;
  return !!draftDataset.value;
});
const canSubmitDashboard = computed(() => !!draftDataset.value && !linkConfigIssues.value.length);
const createButtonLabel = computed(() => (attachTarget.value ? 'Attach datasets' : 'Create dashboard'));

function seedDashboardText() {
  const option = selectedTypeMeta.value;
  if (!dashboardTitle.value) dashboardTitle.value = `${option.label} dashboard`;
  if (!dashboardSubtitle.value) dashboardSubtitle.value = `${option.shortLabel} workflow`;
}

async function refreshRecent() {
  recentDatasets.value = await listRecent(8);
}

async function loadAttachTarget() {
  const targetId = String(route.query.dashboardId || '');
  if (!targetId) {
    attachTarget.value = null;
    return;
  }
  try {
    attachTarget.value = loadDashboard(targetId);
    if (!dashboardTitle.value) dashboardTitle.value = `${attachTarget.value.title} - add datasets`;
    if (!dashboardSubtitle.value) {
      dashboardSubtitle.value = attachTarget.value.subtitle || 'Attach more data sources to the current dashboard.';
    }
  } catch {
    attachTarget.value = null;
  }
}

async function chooseRecentDataset(datasetId) {
  error.value = '';
  loading.value = true;
  try {
    clearRecommendationChoice();
    const dataset = await loadDataset(datasetId);
    if (isLinkedRecentDataset(dataset.id)) {
      removeLinkedDataset(linkedDatasets.value.find((item) => item.persistedId === dataset.id)?.selectionKey || '');
    }
    selectedDatasetId.value = dataset.id;
    draftDataset.value = createDatasetDraft(dataset, 'recent');
    syncLinkRules();
    if (step.value < 3) step.value = 3;
  } catch (loadError) {
    error.value = String(loadError?.message || loadError);
  } finally {
    loading.value = false;
  }
}

async function handleFileSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  error.value = '';
  loading.value = true;
  try {
    clearRecommendationChoice();
    draftDataset.value = createDatasetDraft(await readDatasetFile(file, selectedType.value), 'file');
    selectedDatasetId.value = '';
    syncLinkRules();
    step.value = 3;
  } catch (fileError) {
    error.value = String(fileError?.message || fileError);
  } finally {
    loading.value = false;
    if (event?.target) event.target.value = '';
  }
}

async function toggleRecentLinkedDataset(datasetId) {
  const existing = linkedDatasets.value.find((dataset) => dataset.persistedId === datasetId);
  if (existing) {
    removeLinkedDataset(existing.selectionKey);
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    const dataset = await loadDataset(datasetId);
    addLinkedDataset(createDatasetDraft(dataset, 'recent'));
    if (step.value < 3) step.value = 3;
  } catch (loadError) {
    error.value = String(loadError?.message || loadError);
  } finally {
    loading.value = false;
  }
}

async function handleLinkedFilesSelected(event) {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  error.value = '';
  loading.value = true;
  try {
    for (const file of files) {
      addLinkedDataset(createDatasetDraft(await readDatasetFile(file, selectedType.value), 'file'));
    }
    if (step.value < 3) step.value = 3;
  } catch (fileError) {
    error.value = String(fileError?.message || fileError);
  } finally {
    loading.value = false;
    if (event?.target) event.target.value = '';
  }
}

function openFilePicker() {
  fileInput.value?.click?.();
}

function openLinkedFilePicker() {
  linkedFileInput.value?.click?.();
}

function nextStep() {
  if (!canAdvance.value || step.value >= steps.length) return;
  step.value += 1;
}

function prevStep() {
  if (step.value <= 1) return;
  step.value -= 1;
}

function includeUnique(target, value) {
  if (!value) return target;
  return target.includes(value) ? target : [...target, value];
}

function rememberRecommendation(message = '') {
  recommendationNote.value = String(message || '').trim();
}

function clearRecommendationChoice() {
  preferredTaskType.value = '';
  preferredModelFamily.value = '';
  preferredTextMethod.value = '';
  preferredImageMethod.value = '';
  recommendationNote.value = '';
}

function applyWizardRecommendation(item) {
  const actionType = String(item?.nextAction?.type || '').trim().toLowerCase();
  const actionValue = String(item?.nextAction?.value || '').trim();
  if (!actionType || !actionValue) return;

  if (actionType === 'preprocessing') {
    selectedPreprocessing.value = includeUnique(selectedPreprocessing.value, actionValue);
    step.value = Math.max(step.value, 4);
    rememberRecommendation(`${item.label} is selected for preprocessing.`);
    return;
  }

  if (actionType === 'task-template') {
    preferredTaskType.value = actionValue;
    step.value = Math.max(step.value, 5);
    rememberRecommendation(`${item.label} will be placed first when the dashboard seeds task suggestions.`);
    return;
  }

  if (actionType === 'model') {
    const [taskType, modelFamily] = actionValue.split(':');
    preferredTaskType.value = taskType || preferredTaskType.value;
    preferredModelFamily.value = modelFamily || '';
    step.value = Math.max(step.value, 5);
    rememberRecommendation(`${item.label} will be used as the first model suggestion for the seeded task.`);
    return;
  }

  if (actionType === 'runtime') {
    const [runtimeType, runtimeValue] = actionValue.split(':');
    if (runtimeType === 'text') {
      preferredTaskType.value = 'text-analysis';
      preferredTextMethod.value = runtimeValue || '';
      step.value = Math.max(step.value, 5);
      rememberRecommendation(`${item.label} will prefill the first text task suggestion.`);
      return;
    }
    if (runtimeType === 'image') {
      preferredTaskType.value = 'image-analysis';
      preferredImageMethod.value = runtimeValue || '';
      step.value = Math.max(step.value, 5);
      rememberRecommendation(`${item.label} will prefill the first image task suggestion.`);
      return;
    }
    step.value = Math.max(step.value, 5);
    rememberRecommendation(item.reason || `${item.label} is saved as the recommended runtime path.`);
    return;
  }

  if (actionType === 'panel' || actionType === 'ml-task') {
    if (actionValue.includes('graph')) {
      selectedPreviewAnalyses.value = includeUnique(selectedPreviewAnalyses.value, 'distribution');
    }
    if (actionValue.includes('stat') || actionValue.includes('corr')) {
      if ((wizardSummary.value?.numericColumns || []).length >= 2) {
        selectedPreviewAnalyses.value = includeUnique(selectedPreviewAnalyses.value, 'correlation');
      }
    }
    if (actionValue.includes('tests') || actionValue.includes('class')) {
      selectedPreviewAnalyses.value = includeUnique(selectedPreviewAnalyses.value, 'class-balance');
    }
    step.value = Math.max(step.value, 5);
    rememberRecommendation(`${item.label} is now reflected in the preview checks for this dashboard.`);
    return;
  }

  if (actionType === 'dataset-link') {
    step.value = Math.max(step.value, 3);
    rememberRecommendation(item.reason || 'Review the linked dataset configuration before creating the dashboard.');
  }
}

async function persistSelectedDataset(dataset, role = 'primary') {
  if (!dataset) return '';
  if (dataset.persistedId) return dataset.persistedId;
  const datasetId = await saveDataset(
    dataset.name,
    dataset.columns,
    dataset.rows,
    undefined,
    {
      meta: {
        source: 'dashboard-wizard',
        wizardRole: role,
        dataType: selectedType.value,
        missingCount: dataset.summary?.missingCount ?? 0,
        missingByColumn: dataset.summary?.missingByColumn || {},
        columnTypes: dataset.summary?.columnTypes || {},
        numericColumns: dataset.summary?.numericColumns || [],
        categoricalColumns: dataset.summary?.categoricalColumns || [],
        dateColumns: dataset.summary?.dateColumns || [],
        textColumns: dataset.summary?.textColumns || [],
        binaryLikeColumns: dataset.summary?.binaryLikeColumns || [],
        imageColumns: dataset.summary?.imageColumns || [],
      },
    }
  );
  dataset.persistedId = datasetId;
  dataset.id = datasetId;
  return datasetId;
}

function buildDatasetLinksPayload(primaryDatasetId, linkedDatasetIds = []) {
  const idBySelectionKey = new Map(linkedDatasetIds.map((item) => [item.selectionKey, item.id]));
  return {
    primaryDatasetId,
    preparedDatasetId: '',
    artifact: null,
    links: linkRuleRows.value
      .map(({ dataset, rule }) => {
        const datasetId = idBySelectionKey.get(dataset.selectionKey) || dataset.persistedId || '';
        if (!rule || !datasetId) return null;
        return {
          id: rule.id,
          datasetId,
          baseDatasetId: primaryDatasetId,
          baseKey: rule.baseKey,
          joinKey: rule.joinKey,
          joinType: rule.joinType || 'left',
          prefix: rule.prefix || ensureRulePrefix(dataset),
        };
      })
      .filter(Boolean),
  };
}

async function createOrAttach() {
  if (!canSubmitDashboard.value) {
    error.value = linkConfigIssues.value[0] || 'Check the join configuration before continuing.';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    const preprocessingPlan = preprocessingOptions.value
      .filter((item) => selectedPreprocessing.value.includes(item.id))
      .map((item) => ({ id: item.id, label: item.label, group: item.group, reason: item.reason, recommended: !!item.recommended }));
    const previewPlan = previewOptions.value
      .filter((item) => selectedPreviewAnalyses.value.includes(item.id))
      .map((item) => ({ id: item.id, label: item.label, reason: item.reason, recommended: !!item.recommended }));

    const primaryDatasetId = await persistSelectedDataset(draftDataset.value, 'primary');
    const linkedDatasetIds = [];
    for (const dataset of linkedDatasets.value) {
      const datasetId = await persistSelectedDataset(dataset, 'linked');
      linkedDatasetIds.push({ selectionKey: dataset.selectionKey, id: datasetId });
    }

    const datasetIds = [primaryDatasetId, ...linkedDatasetIds.map((item) => item.id)];
    const datasetLinks = buildDatasetLinksPayload(primaryDatasetId, linkedDatasetIds);
    const summary = wizardSummary.value || draftDataset.value.summary || {};

    if (attachTarget.value?.id) {
      datasetIds.forEach((datasetId) => attachDatasetToDashboard(attachTarget.value.id, datasetId));
      if (datasetLinks.links.length) {
        saveDashboard({
          ...attachTarget.value,
          datasetIds: Array.from(new Set([...(attachTarget.value.datasetIds || []), ...datasetIds])),
          activeDatasetId: attachTarget.value.activeDatasetId || primaryDatasetId,
          sourceDatasetId: primaryDatasetId,
          datasetMeta: summary,
          datasetLinks,
        });
      }
      router.push({ name: 'dashboard', params: { dashboardId: attachTarget.value.id }, query: { tab: 'file' } });
      return;
    }

    const dashboard = createDashboard({
      title: dashboardTitle.value.trim() || `${selectedTypeMeta.value.label} dashboard`,
      subtitle: dashboardSubtitle.value.trim(),
      description: dashboardDescription.value.trim(),
      dataType: selectedType.value,
      datasetIds,
      activeDatasetId: primaryDatasetId,
      datasetLinks,
      preprocessingSelections: selectedPreprocessing.value,
      previewSelections: selectedPreviewAnalyses.value,
      preprocessingPlan,
      previewPlan,
      datasetMeta: summary,
      preferredTaskType: preferredTaskType.value,
      preferredModelFamily: preferredModelFamily.value,
      preferredTextMethod: preferredTextMethod.value,
      preferredImageMethod: preferredImageMethod.value,
    });
    router.push({ name: 'dashboard', params: { dashboardId: dashboard.id }, query: { tab: 'file' } });
  } catch (createError) {
    error.value = String(createError?.message || createError);
  } finally {
    loading.value = false;
  }
}

watch(selectedType, () => {
  if (draftDataset.value) draftDataset.value = createDatasetDraft(draftDataset.value, draftDataset.value.source || 'recent');
  if (linkedDatasets.value.length) {
    linkedDatasets.value = linkedDatasets.value.map((dataset) => createDatasetDraft(dataset, dataset.source || 'recent'));
    syncLinkRules();
  }
  clearRecommendationChoice();
  seedDashboardText();
});

watch(
  preprocessingOptions,
  (items) => {
    const allowed = new Set(items.map((item) => item.id));
    selectedPreprocessing.value = selectedPreprocessing.value.filter((item) => allowed.has(item));
    if (!selectedPreprocessing.value.length) {
      selectedPreprocessing.value = items.filter((item) => item.recommended).map((item) => item.id);
    }
  },
  { immediate: true }
);

watch(
  previewOptions,
  (items) => {
    const allowed = new Set(items.map((item) => item.id));
    selectedPreviewAnalyses.value = selectedPreviewAnalyses.value.filter((item) => allowed.has(item));
    if (!selectedPreviewAnalyses.value.length) {
      selectedPreviewAnalyses.value = items.filter((item) => item.recommended).map((item) => item.id);
    }
  },
  { immediate: true }
);

onMounted(async () => {
  seedDashboardText();
  await refreshRecent();
  await loadAttachTarget();
  if (route.query.reuse) {
    await chooseRecentDataset(String(route.query.reuse));
  }
});
</script>

<template>
  <div class="dashboard-create">
    <section class="create-hero">
      <div>
        <p class="kicker">{{ attachTarget ? 'Attach data sources' : 'Create dashboard' }}</p>
        <h1>{{ attachTarget ? attachTarget.title : 'Understand the data first, then create the dashboard.' }}</h1>
        <p class="subtitle">
          {{ attachTarget
            ? 'Attach one or more datasets, confirm the join keys, and return to the current dashboard with a linked staging-like source.'
            : 'Choose a data type, upload the primary dataset, optionally link extra datasets, and seed the dashboard with one prepared source.' }}
        </p>
      </div>
      <div class="hero-actions">
        <router-link to="/">Home</router-link>
        <router-link to="/workspace">Workspace</router-link>
      </div>
    </section>

    <section class="stepper-card">
      <div
        v-for="(label, index) in steps"
        :key="label"
        :class="['step-chip', { active: step === index + 1, done: step > index + 1 }]"
      >
        <span>{{ index + 1 }}</span>
        <strong>{{ label }}</strong>
      </div>
    </section>

    <section class="create-grid">
      <div class="main-column">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">1. Data type</p>
              <h2>Start from the structure that best matches the analysis.</h2>
            </div>
          </div>
          <div class="type-grid">
            <button
              v-for="option in dataTypeOptions"
              :key="option.id"
              type="button"
              :class="['type-card', { selected: selectedType === option.id }]"
              @click="selectedType = option.id"
            >
              <strong>{{ option.label }}</strong>
              <p>{{ option.description }}</p>
              <div class="type-card__meta">
                <span v-for="format in option.formats" :key="format">{{ format }}</span>
              </div>
            </button>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">2. Dataset upload and selection</p>
              <h2>Choose the primary dataset first, then add linked datasets if needed.</h2>
            </div>
            <button type="button" @click="openFilePicker">Primary file</button>
          </div>

          <input
            ref="fileInput"
            data-testid="dashboard-create-primary-file"
            class="file-input"
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            @change="handleFileSelected"
          />
          <input
            ref="linkedFileInput"
            data-testid="dashboard-create-linked-file"
            class="file-input"
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            multiple
            @change="handleLinkedFilesSelected"
          />

          <div class="upload-strip">
            <button class="btn-primary" type="button" @click="openFilePicker">Choose primary file</button>
            <button v-if="draftDataset" type="button" @click="openLinkedFilePicker">Add linked files</button>
            <span v-if="draftDataset">{{ draftDataset.name }} / {{ draftDataset.columns.length }} cols / {{ draftDataset.rows.length }} rows</span>
            <span v-else>Upload CSV, Excel, or JSON, or pick a recent dataset below.</span>
          </div>

          <div class="recent-grid">
            <article
              v-for="dataset in recentDatasets"
              :key="dataset.id"
              :class="['recent-dataset', { selected: selectedDatasetId === dataset.id }]"
            >
              <div>
                <strong>{{ dataset.name }}</strong>
                <span>{{ dataset.meta?.rowCount ?? dataset.rows?.length ?? 0 }} rows / {{ dataset.meta?.colCount ?? dataset.columns?.length ?? 0 }} cols</span>
              </div>
              <div class="recent-dataset__actions">
                <button type="button" :class="{ 'btn-primary': selectedDatasetId === dataset.id }" @click="chooseRecentDataset(dataset.id)">
                  Set as primary
                </button>
                <button
                  v-if="draftDataset && selectedDatasetId !== dataset.id"
                  type="button"
                  @click="toggleRecentLinkedDataset(dataset.id)"
                >
                  {{ isLinkedRecentDataset(dataset.id) ? 'Remove link' : 'Add as linked' }}
                </button>
              </div>
            </article>
          </div>

          <div v-if="draftDataset" class="link-builder">
            <div class="panel-subhead">
              <div>
                <strong>Cross-dataset join</strong>
                <p>
                  {{ linkedDatasets.length
                    ? `Link ${linkedDatasets.length} extra dataset(s) to the primary dataset with a left join.`
                    : 'Add one or more extra datasets and choose the shared key to build one prepared cross-dataset source.' }}
                </p>
              </div>
              <button type="button" @click="openLinkedFilePicker">Add linked file</button>
            </div>

            <div v-if="linkedDatasets.length" class="linked-grid">
              <article v-for="{ dataset, rule } in linkRuleRows" :key="dataset.selectionKey" class="linked-card">
                <div class="linked-card__head">
                  <div>
                    <strong>{{ dataset.name }}</strong>
                    <span>{{ dataset.columns.length }} cols / {{ dataset.rows.length }} rows</span>
                  </div>
                  <button type="button" @click="removeLinkedDataset(dataset.selectionKey)">Remove</button>
                </div>
                <div class="linked-card__body">
                  <label>
                    Primary key
                    <select v-model="rule.baseKey">
                      <option value="">Select</option>
                      <option v-for="column in draftDataset.columns" :key="`${dataset.selectionKey}-base-${column}`" :value="column">{{ column }}</option>
                    </select>
                  </label>
                  <label>
                    Linked key
                    <select v-model="rule.joinKey">
                      <option value="">Select</option>
                      <option v-for="column in dataset.columns" :key="`${dataset.selectionKey}-join-${column}`" :value="column">{{ column }}</option>
                    </select>
                  </label>
                  <label>
                    Column prefix
                    <input v-model="rule.prefix" type="text" />
                  </label>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">No linked datasets yet. The flow stays identical to the single-dataset dashboard until you add one.</div>
          </div>
        </article>

        <article class="panel-card" :class="{ muted: !draftDataset }">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">3. Structure review</p>
              <h2>Review the primary sample and the combined wizard summary before creating the dashboard.</h2>
            </div>
          </div>

          <div v-if="draftDataset" class="summary-grid">
            <div class="summary-item">
              <span>Primary dataset</span>
              <strong>{{ draftDataset.name }}</strong>
            </div>
            <div class="summary-item">
              <span>Primary rows / cols</span>
              <strong>{{ draftDataset.summary?.rowCount ?? draftDataset.rows.length }} rows / {{ draftDataset.summary?.colCount ?? draftDataset.columns.length }} cols</strong>
            </div>
            <div class="summary-item">
              <span>Linked datasets</span>
              <strong>{{ linkedDatasets.length }}</strong>
            </div>
            <div class="summary-item">
              <span>Wizard combined summary</span>
              <strong>{{ wizardSummary?.rowCount ?? 0 }} rows / {{ wizardSummary?.colCount ?? 0 }} cols</strong>
            </div>
          </div>
          <div v-else class="empty-inline">Pick the primary dataset first.</div>

          <div v-if="draftDataset" class="column-summary">
            <span>numeric {{ wizardSummary?.numericColumns?.length ?? 0 }}</span>
            <span>categorical {{ wizardSummary?.categoricalColumns?.length ?? 0 }}</span>
            <span>date {{ wizardSummary?.dateColumns?.length ?? 0 }}</span>
            <span>text {{ wizardSummary?.textColumns?.length ?? 0 }}</span>
            <span>image {{ wizardSummary?.imageColumns?.length ?? 0 }}</span>
          </div>

          <div v-if="previewRows.length" class="preview-table">
            <table>
              <thead>
                <tr>
                  <th v-for="column in previewColumns" :key="column">{{ column }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in previewRows" :key="index">
                  <td v-for="column in previewColumns" :key="`${index}-${column}`">{{ row[column] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel-card" :class="{ muted: !draftDataset }">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">4. Preprocessing</p>
              <h2>Show only the recommendations that make sense for the current data shape.</h2>
            </div>
          </div>
          <div v-if="preprocessingOptions.length" class="option-list">
            <label v-for="item in preprocessingOptions" :key="item.id" class="option-card">
              <input v-model="selectedPreprocessing" type="checkbox" :value="item.id" />
              <div>
                <div class="option-card__head">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.group }}</span>
                </div>
                <p>{{ item.reason }}</p>
              </div>
            </label>
          </div>
          <div v-else class="empty-inline">No recommended preprocessing is needed for the current summary. You can still add more detailed transforms later inside the dashboard.</div>
        </article>

        <article class="panel-card" :class="{ muted: !draftDataset }">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">5. Preview and dashboard metadata</p>
              <h2>Seed the first tasks with the checks you want to preserve inside the dashboard.</h2>
            </div>
          </div>
          <div class="option-list">
            <label v-for="item in previewOptions" :key="item.id" class="option-card">
              <input v-model="selectedPreviewAnalyses" type="checkbox" :value="item.id" />
              <div>
                <div class="option-card__head">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.recommended ? 'Recommended' : 'Optional' }}</span>
                </div>
                <p>{{ item.reason }}</p>
              </div>
            </label>
          </div>

          <div class="meta-form">
            <label>
              Dashboard title
              <input v-model="dashboardTitle" type="text" placeholder="Customer health dashboard" />
            </label>
            <label>
              Subtitle
              <input v-model="dashboardSubtitle" type="text" placeholder="Q1 linked profile and feedback dataset" />
            </label>
            <label>
              Description
              <textarea v-model="dashboardDescription" rows="4" placeholder="Describe the main question or the workflow you want this dashboard to guide." />
            </label>
          </div>
        </article>
      </div>

      <aside class="side-column">
        <article class="panel-card sticky-card">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Current summary</p>
              <h2>{{ selectedTypeMeta.label }}</h2>
            </div>
          </div>

          <div class="quick-list">
            <div>
              <span>Type</span>
              <strong>{{ selectedTypeMeta.shortLabel }}</strong>
            </div>
            <div>
              <span>Primary dataset</span>
              <strong>{{ draftDataset ? draftDataset.name : 'Not selected' }}</strong>
            </div>
            <div>
              <span>Linked datasets</span>
              <strong>{{ linkedDatasets.length }}</strong>
            </div>
            <div>
              <span>Preprocessing</span>
              <strong>{{ selectedPreprocessing.length }}</strong>
            </div>
            <div>
              <span>Preview checks</span>
              <strong>{{ selectedPreviewAnalyses.length }}</strong>
            </div>
          </div>

          <div
            v-if="wizardRecommendationSummary?.top?.length || structuredRecommendations.length"
            class="diagnostics-box"
            data-testid="structured-recommendation-box"
          >
            <RecommendationSummaryCard
              :summary="wizardRecommendationSummary"
              title="Recommended next direction"
              :limit="4"
              actionable
              @select="applyWizardRecommendation"
            />
            <p v-if="recommendationNote" class="form-hint" data-testid="wizard-recommendation-note">{{ recommendationNote }}</p>
          </div>

          <div v-if="draftDataset?.diagnostics" class="diagnostics-box">
            <b>CSV diagnostics</b>
            <span>CSV raw length: {{ draftDataset.diagnostics.rawLength }}</span>
            <span>CSV parsed rows (raw): {{ draftDataset.diagnostics.parsedRows }}</span>
            <span>CSV parsed fields: {{ draftDataset.diagnostics.parsedFields.join(', ') || '-' }}</span>
          </div>

          <div v-if="linkConfigIssues.length" class="error-box" data-testid="dashboard-create-link-errors">
            <strong>Join configuration</strong>
            <ul class="issue-list">
              <li v-for="issue in linkConfigIssues" :key="issue">{{ issue }}</li>
            </ul>
          </div>

          <div v-if="error" class="error-box" data-testid="dashboard-create-error">{{ error }}</div>

          <div class="step-actions">
            <button type="button" :disabled="step <= 1" @click="prevStep">Previous</button>
            <button type="button" :disabled="!canAdvance || step >= steps.length" @click="nextStep">Next</button>
            <button class="btn-primary" data-testid="dashboard-create-submit" type="button" :disabled="loading || !canSubmitDashboard" @click="createOrAttach">
              {{ loading ? 'Processing...' : createButtonLabel }}
            </button>
          </div>
        </article>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.dashboard-create {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
}

.create-hero,
.stepper-card,
.panel-card {
  border: 1px solid #d8e1d4;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 34px rgba(28, 44, 29, 0.06);
}

.create-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  background:
    radial-gradient(circle at top right, rgba(227, 238, 226, 0.82), transparent 35%),
    linear-gradient(135deg, #fffdf7, #f5fbf5);
}

.kicker,
.panel-kicker {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #5e7062;
}

h1,
h2 {
  margin: 0;
  color: #1e3326;
}

.subtitle {
  margin: 12px 0 0;
  max-width: 780px;
  color: #5a685c;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.hero-actions a,
button,
input,
textarea,
select {
  font: inherit;
}

.hero-actions a,
button {
  padding: 10px 14px;
  border: 1px solid #c4cfbf;
  border-radius: 999px;
  background: #fff;
  color: #223228;
}

.btn-primary {
  border-color: #214d31;
  background: #214d31;
  color: #fff;
}

.stepper-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  padding: 14px;
}

.step-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 18px;
  background: #f5f8f4;
  color: #526355;
}

.step-chip span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #dfeadf;
  font-weight: 700;
}

.step-chip.active {
  background: #edf5ef;
  color: #1f3d28;
}

.step-chip.active span,
.step-chip.done span {
  background: #214d31;
  color: #fff;
}

.create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(300px, 0.8fr);
  gap: 18px;
  align-items: start;
}

.main-column,
.side-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-card {
  padding: 20px;
}

.panel-card.muted {
  opacity: 0.78;
}

.panel-head,
.panel-subhead {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.type-grid,
.recent-grid,
.summary-grid,
.option-list,
.meta-form,
.linked-grid,
.quick-list {
  display: grid;
  gap: 12px;
}

.type-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.type-card,
.recent-dataset,
.option-card,
.linked-card {
  width: 100%;
  padding: 16px;
  border: 1px solid #dbe3d8;
  border-radius: 18px;
  background: #f8fbf7;
  text-align: left;
}

.type-card.selected,
.recent-dataset.selected {
  border-color: #214d31;
  background: #eef6ef;
}

.type-card p,
.option-card p,
.panel-subhead p {
  margin: 8px 0 0;
  color: #5c6a5e;
  line-height: 1.55;
}

.type-card__meta,
.column-summary,
.upload-strip,
.step-actions,
.recent-dataset__actions,
.linked-card__head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.type-card__meta span,
.column-summary span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #e7f0e6;
  font-size: 12px;
  color: #355041;
}

.upload-strip {
  padding: 14px;
  border: 1px dashed #cad5c8;
  border-radius: 18px;
  background: #fbfcfa;
  color: #617264;
}

.file-input {
  display: none;
}

.recent-grid {
  margin-top: 12px;
}

.recent-dataset {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.recent-dataset span,
.linked-card__head span {
  font-size: 13px;
  color: #637265;
}

.summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.summary-item {
  padding: 14px;
  border: 1px solid #dbe4d8;
  border-radius: 18px;
  background: #f9fbf8;
}

.summary-item span,
.quick-list span {
  display: block;
  font-size: 12px;
  color: #6d7a6d;
  text-transform: uppercase;
}

.summary-item strong,
.quick-list strong {
  display: block;
  margin-top: 6px;
  color: #1f3326;
}

.preview-table {
  margin-top: 16px;
  overflow: auto;
  border: 1px solid #dfe5dd;
  border-radius: 18px;
}

.preview-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.preview-table th,
.preview-table td {
  padding: 9px 12px;
  border-bottom: 1px solid #edf1ec;
  text-align: left;
  white-space: nowrap;
}

.option-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
}

.option-card__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.option-card__head span {
  font-size: 12px;
  color: #5f7063;
}

.link-builder {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #dbe4d8;
  border-radius: 18px;
  background: #fbfcfa;
}

.linked-card__head {
  justify-content: space-between;
}

.linked-card__body {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-top: 12px;
}

.linked-card__body label,
.meta-form label {
  display: grid;
  gap: 8px;
  color: #324634;
}

.linked-card__body select,
.linked-card__body input,
.meta-form input,
.meta-form textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #ccd6ca;
  border-radius: 16px;
  background: #fff;
}

.sticky-card {
  position: sticky;
  top: 76px;
}

.diagnostics-box,
.error-box,
.empty-inline {
  margin-top: 16px;
  padding: 14px;
  border-radius: 16px;
}

.diagnostics-box {
  display: grid;
  gap: 6px;
  background: #f6f9f5;
  border: 1px solid #dfe8dc;
  color: #536253;
  font-size: 13px;
}

.structured-recommendation {
  display: grid;
  gap: 4px;
}

.error-box {
  background: #fff0f0;
  border: 1px solid #f0c9c9;
  color: #a13939;
}

.empty-inline {
  border: 1px dashed #cdd7ca;
  background: #fafcf9;
  color: #667668;
}

.issue-list {
  margin: 8px 0 0;
  padding-left: 18px;
}

@media (max-width: 980px) {
  .create-grid {
    grid-template-columns: 1fr;
  }

  .sticky-card {
    position: static;
  }
}

@media (max-width: 760px) {
  .dashboard-create {
    padding: 16px;
  }

  .create-hero,
  .panel-card {
    padding: 18px;
  }

  .create-hero,
  .recent-dataset {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
