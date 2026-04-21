function cloneRowsForWorker(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    return { ...row };
  });
}

function makeTransformWorker() {
  return new Worker(new URL('../workers/transform.worker.js', import.meta.url), { type: 'module' });
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function collectNonEmptyValues(rows, column) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.[column])
    .filter((value) => value !== '' && value !== null && value !== undefined);
}

function toFiniteNumber(value) {
  const numeric = Number(String(value ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function median(values = []) {
  const items = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!items.length) return '';
  const middle = Math.floor(items.length / 2);
  if (items.length % 2) return items[middle];
  return (items[middle - 1] + items[middle]) / 2;
}

function mode(values = []) {
  const counter = new Map();
  values.forEach((value) => {
    const key = String(value);
    counter.set(key, (counter.get(key) || 0) + 1);
  });
  let picked = '';
  let pickedCount = -1;
  counter.forEach((count, key) => {
    if (count > pickedCount) {
      picked = key;
      pickedCount = count;
    }
  });
  return picked;
}

function uniqueValues(rows, column, maxCount = 16) {
  const seen = [];
  const markers = new Set();
  for (const row of rows || []) {
    const raw = row?.[column];
    if (raw === '' || raw === null || raw === undefined) continue;
    const marker = normalizeText(raw);
    if (!marker || markers.has(marker)) continue;
    markers.add(marker);
    seen.push(raw);
    if (seen.length > maxCount) break;
  }
  return seen;
}

function pickTextColumns(dataset, maxCount = 2) {
  const textColumns = Array.isArray(dataset?.meta?.textColumns) ? dataset.meta.textColumns : [];
  if (textColumns.length) return textColumns.slice(0, maxCount);
  const categoricalColumns = Array.isArray(dataset?.meta?.categoricalColumns) ? dataset.meta.categoricalColumns : [];
  return categoricalColumns.slice(0, maxCount);
}

function pickImageColumns(dataset, maxCount = 2) {
  const imageColumns = Array.isArray(dataset?.meta?.imageColumns) ? dataset.meta.imageColumns : [];
  return imageColumns.slice(0, maxCount);
}

function buildMissingRecipe(dataset) {
  const recipe = { fillna: {}, typeCast: {} };
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const columnTypes = dataset?.meta?.columnTypes || {};

  columns.forEach((column) => {
    const values = collectNonEmptyValues(rows, column);
    if (!values.length) return;
    if ((dataset?.meta?.missingByColumn?.[column] || 0) <= 0) return;
    const columnType = columnTypes[column];
    if (columnType === 'number') {
      const numericValues = values.map(toFiniteNumber).filter((value) => Number.isFinite(value));
      if (numericValues.length) {
        recipe.fillna[column] = median(numericValues);
        recipe.typeCast[column] = 'number';
      }
      return;
    }
    recipe.fillna[column] = mode(values);
  });

  if (!Object.keys(recipe.typeCast).length) delete recipe.typeCast;
  return Object.keys(recipe.fillna).length ? recipe : null;
}

function buildBinaryRecipe(dataset) {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const binaryColumns = Array.isArray(dataset?.meta?.binaryLikeColumns) ? dataset.meta.binaryLikeColumns : [];
  const recipe = { mapValues: {}, typeCast: {} };

  binaryColumns.forEach((column) => {
    const values = uniqueValues(rows, column, 4);
    if (values.length !== 2) return;
    const normalized = values.map((value) => normalizeText(value));
    const positive = normalized.findIndex((value) => ['yes', 'y', 'true', '1', 'male', 'm', 'pass', 'positive'].includes(value));
    const positiveIndex = positive >= 0 ? positive : 1;
    const negativeIndex = positiveIndex === 0 ? 1 : 0;
    recipe.mapValues[column] = {
      [normalized[negativeIndex]]: 0,
      [normalized[positiveIndex]]: 1,
    };
    recipe.typeCast[column] = 'number';
  });

  return Object.keys(recipe.mapValues).length ? recipe : null;
}

function buildCategoricalRecipe(dataset) {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const categoricalColumns = Array.isArray(dataset?.meta?.categoricalColumns) ? dataset.meta.categoricalColumns : [];
  const textColumns = new Set(Array.isArray(dataset?.meta?.textColumns) ? dataset.meta.textColumns : []);
  const binaryColumns = new Set(Array.isArray(dataset?.meta?.binaryLikeColumns) ? dataset.meta.binaryLikeColumns : []);
  const onehot = categoricalColumns.filter((column) => {
    if (textColumns.has(column) || binaryColumns.has(column)) return false;
    const values = uniqueValues(rows, column, 20);
    return values.length >= 2 && values.length <= 12;
  });
  return onehot.length ? { onehot } : null;
}

function buildDateRecipe(dataset) {
  const dateColumns = Array.isArray(dataset?.meta?.dateColumns) ? dataset.meta.dateColumns : [];
  if (!dateColumns.length) return null;
  return {
    dateParts: dateColumns.map((column) => ({
      column,
      parts: ['year', 'month', 'day', 'weekday'],
    })),
  };
}

function buildTfidfRecipe(dataset) {
  const textColumns = pickTextColumns(dataset, 2);
  if (!textColumns.length) return null;
  return {
    textStats: textColumns,
    textTfidf: textColumns.map((column) => ({ column, topK: 4 })),
  };
}

function buildSentimentRecipe(dataset) {
  const textColumns = pickTextColumns(dataset, 2);
  if (!textColumns.length) return null;
  return {
    textStats: textColumns,
    textSentiment: textColumns,
  };
}

function buildEmbeddingRecipe(dataset) {
  const textColumns = pickTextColumns(dataset, 2);
  if (!textColumns.length) return null;
  return {
    textStats: textColumns,
    textEmbedding: textColumns.map((column) => ({ column, dims: 4 })),
  };
}

function buildImagePreviewRecipe(dataset) {
  const imageColumns = pickImageColumns(dataset, 2);
  if (!imageColumns.length) return null;
  return {
    imageFeatures: imageColumns,
  };
}

function buildImageEmbeddingRecipe(dataset) {
  const imageColumns = pickImageColumns(dataset, 2);
  if (!imageColumns.length) return null;
  return {
    imageFeatures: imageColumns,
    imageEmbedding: imageColumns.map((column) => ({ column, dims: 4 })),
  };
}

function mergeRecipePart(target, partial) {
  if (!partial || typeof partial !== 'object') return target;
  const next = target;
  Object.entries(partial).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const existing = Array.isArray(next[key]) ? next[key] : [];
      const seen = new Set();
      next[key] = [...existing, ...value].filter((item) => {
        const marker = typeof item === 'object' ? JSON.stringify(item) : String(item);
        if (seen.has(marker)) return false;
        seen.add(marker);
        return true;
      });
      return;
    }
    if (value && typeof value === 'object') {
      next[key] = { ...(next[key] || {}), ...value };
      return;
    }
    next[key] = value;
  });
  return next;
}

export function buildWizardTransformPlan(dataset, preprocessingPlan = []) {
  const selectedIds = Array.isArray(preprocessingPlan) ? preprocessingPlan.map((item) => item?.id).filter(Boolean) : [];
  const recipe = {};
  const appliedSteps = [];
  const skippedSteps = [];

  const builders = {
    'handle-missing': buildMissingRecipe,
    'binary-mapping': buildBinaryRecipe,
    'categorical-encoding': buildCategoricalRecipe,
    'date-features': buildDateRecipe,
    tfidf: buildTfidfRecipe,
    sentiment: buildSentimentRecipe,
    embedding: buildEmbeddingRecipe,
    'image-preview': buildImagePreviewRecipe,
    'image-embedding': buildImageEmbeddingRecipe,
  };

  selectedIds.forEach((id) => {
    const stepMeta = preprocessingPlan.find((item) => item?.id === id) || { id, label: id };
    const builder = builders[id];
    if (!builder) {
      skippedSteps.push({
        id,
        label: stepMeta.label || id,
        reason: 'This preprocessing option is not wired into the automatic transform pipeline yet.',
      });
      return;
    }
    const partial = builder(dataset);
    if (!partial) {
      skippedSteps.push({
        id,
        label: stepMeta.label || id,
        reason: 'The current dataset does not need this preprocessing step after inspection.',
      });
      return;
    }
    mergeRecipePart(recipe, partial);
    appliedSteps.push({
      id,
      label: stepMeta.label || id,
      reason: stepMeta.reason || '',
    });
  });

  return {
    recipe,
    appliedSteps,
    skippedSteps,
    hasRecipe: Object.keys(recipe).length > 0,
  };
}

export function runTransformRecipe(rows = [], recipe = {}) {
  return new Promise((resolve, reject) => {
    const worker = makeTransformWorker();
    worker.onmessage = (event) => {
      worker.terminate();
      const { ok, data, error } = event.data || {};
      if (!ok) {
        reject(new Error(error || 'Transform worker failed.'));
        return;
      }
      resolve(data || { rows: [], columns: [] });
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(error instanceof Error ? error : new Error(String(error?.message || error)));
    };
    worker.postMessage({
      type: 'APPLY',
      payload: {
        rows: cloneRowsForWorker(rows),
        recipe: JSON.parse(JSON.stringify(recipe || {})),
      },
    });
  });
}

function listColumnDelta(before = [], after = []) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((column) => !beforeSet.has(column)),
    removed: before.filter((column) => !afterSet.has(column)),
  };
}

export function buildTransformArtifact({ sourceDataset, transformedRows, transformedColumns, planResult, reportArtifact }) {
  const sourceColumns = Array.isArray(sourceDataset?.columns) ? sourceDataset.columns : [];
  const sourceRows = Array.isArray(sourceDataset?.rows) ? sourceDataset.rows : [];
  const delta = listColumnDelta(sourceColumns, transformedColumns);
  return {
    createdAt: Date.now(),
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    sourceRows: sourceRows.length,
    sourceColumns: sourceColumns.length,
    transformedRows: Array.isArray(transformedRows) ? transformedRows.length : 0,
    transformedColumns: Array.isArray(transformedColumns) ? transformedColumns.length : 0,
    addedColumns: delta.added,
    removedColumns: delta.removed,
    appliedSteps: Array.isArray(planResult?.appliedSteps) ? planResult.appliedSteps : [],
    skippedSteps: Array.isArray(planResult?.skippedSteps) ? planResult.skippedSteps : [],
    reportArtifact: reportArtifact || null,
  };
}

export function buildTransformExecutionSummary(artifact) {
  if (!artifact) return '';
  const applied = Array.isArray(artifact.appliedSteps) ? artifact.appliedSteps.map((step) => step.label).filter(Boolean) : [];
  const addedCols = Array.isArray(artifact.addedColumns) ? artifact.addedColumns : [];
  const parts = [];
  if (applied.length) parts.push(`Applied ${applied.join(', ')}`);
  parts.push(`rows ${artifact.sourceRows} -> ${artifact.transformedRows}`);
  parts.push(`cols ${artifact.sourceColumns} -> ${artifact.transformedColumns}`);
  if (addedCols.length) parts.push(`added ${addedCols.slice(0, 4).join(', ')}${addedCols.length > 4 ? '...' : ''}`);
  if (artifact.reportArtifact?.summary?.stats) {
    const stats = artifact.reportArtifact.summary.stats;
    parts.push(`report rows ${stats.rows}, dup_rows ${stats.dup_rows}`);
  }
  if (Array.isArray(artifact.skippedSteps) && artifact.skippedSteps.length) {
    parts.push(`pending ${artifact.skippedSteps.map((step) => step.label).join(', ')}`);
  }
  return parts.join(' / ');
}
