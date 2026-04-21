function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function tokenize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u3131-\u318e\uac00-\ud7a3\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length >= 2);
}

function collectTopTokens(rows = [], textColumn = '') {
  const counter = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    tokenize(row?.[textColumn]).forEach((token) => {
      counter.set(token, (counter.get(token) || 0) + 1);
    });
  });
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([token, count]) => ({ token, count }));
}

function summarizeLabelCounts(rows = [], targetColumn = '') {
  if (!targetColumn) return [];
  const counter = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const label = String(row?.[targetColumn] ?? '').trim();
    if (!label) return;
    counter.set(label, (counter.get(label) || 0) + 1);
  });
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));
}

function buildSampleRows(rows = [], imageColumn = '', textColumn = '', targetColumn = '', confidenceColumn = '') {
  const visibleColumns = Array.from(new Set([
    imageColumn,
    textColumn,
    confidenceColumn,
    targetColumn,
  ].filter(Boolean))).slice(0, 6);
  if (!visibleColumns.length) return [];
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 4)
    .map((row) => Object.fromEntries(visibleColumns.map((column) => [column, row?.[column]])));
}

export function normalizeImageTaskMethod(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ocr') return 'ocr';
  return 'features';
}

export function buildImageOcrDatasetName(sourceDataset, request = {}) {
  const baseName = String(sourceDataset?.name || 'dataset').trim() || 'dataset';
  const suffix = String(request?.mode || '').trim() === 'ocr' ? 'OCR text' : 'OCR preview';
  return `${baseName} - ${suffix}`;
}

export function buildImageOcrRequest(task = {}, analysis = null, dataset = null) {
  if (!task || task.type !== 'image-analysis') return null;
  const analysisMethod = String(analysis?.method || '').trim().toLowerCase();
  const taskMethod = normalizeImageTaskMethod(task?.options?.imageMethod || '');
  if (analysis) {
    if (analysisMethod !== 'ocr') return null;
  } else if (taskMethod !== 'ocr') {
    return null;
  }

  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const imageColumns = Array.isArray(dataset?.meta?.imageColumns)
    ? dataset.meta.imageColumns.filter((column) => columns.includes(column))
    : [];
  const imageColumn = [
    String(analysis?.options?.imageColumn || '').trim(),
    String(task?.options?.imageColumn || '').trim(),
    ...imageColumns,
  ].find((column) => column && columns.includes(column));

  if (!imageColumn) return null;

  const targetColumn = [
    String(analysis?.options?.targetColumn || '').trim(),
    String(task?.options?.targetColumn || '').trim(),
  ].find((column) => column && columns.includes(column) && column !== imageColumn) || '';

  return {
    mode: 'ocr',
    imageColumn,
    textColumn: `${imageColumn}_ocr_text`,
    targetColumn,
  };
}

export function buildImageOcrSignature(sourceDataset, request = {}) {
  return JSON.stringify({
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    mode: String(request?.mode || 'ocr'),
    imageColumn: String(request?.imageColumn || ''),
    textColumn: String(request?.textColumn || ''),
    targetColumn: String(request?.targetColumn || ''),
  });
}

export function buildImageOcrArtifact({
  sourceDataset,
  derivedDataset,
  request,
  runtimeData = {},
}) {
  const safeData = cloneValue(runtimeData || {});
  const rows = Array.isArray(derivedDataset?.rows) ? derivedDataset.rows : [];
  const textColumn = String(request?.textColumn || safeData.textColumn || '');
  const imageColumn = String(request?.imageColumn || '');
  const targetColumn = String(request?.targetColumn || '');
  const confidenceColumn = `${textColumn}_confidence`;
  const textLengths = rows
    .map((row) => Number(row?.[`${textColumn}_len`]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const confidences = rows
    .map((row) => Number(row?.[confidenceColumn]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const extractedCount = rows.filter((row) => String(row?.[textColumn] || '').trim()).length;
  const topTokens = Array.isArray(safeData.topTokens) && safeData.topTokens.length
    ? safeData.topTokens
    : collectTopTokens(rows, textColumn);
  const availability = String(safeData.availability || 'direct');
  const effectiveRuntime = String(safeData.effectiveRuntime || (availability === 'fallback' ? 'reference-fallback' : 'tesseract'));
  const availabilityReason = String(safeData.availabilityReason || '');
  const warnings = Array.isArray(safeData.warnings) ? safeData.warnings : [];
  const requirements = Array.isArray(safeData.requirements) ? safeData.requirements : [];
  const labelSummary = Array.isArray(safeData.labelSummary) && safeData.labelSummary.length
    ? safeData.labelSummary
    : summarizeLabelCounts(rows, targetColumn);
  const result = {
    mode: 'ocr',
    imageColumn,
    textColumn,
    targetColumn,
    rowCount: rows.length,
    extractedCount,
    directCount: Number(safeData.directCount || 0),
    fallbackCount: Number(safeData.fallbackCount || 0),
    failedCount: Number(safeData.failedCount || 0),
    avgTextLength: round(average(textLengths), 1),
    avgConfidence: round(average(confidences), 1),
    topTokens,
    labelSummary,
    previewRows: Array.isArray(safeData.previewRows) ? safeData.previewRows.slice(0, 4) : [],
    sampleRows: buildSampleRows(rows, imageColumn, textColumn, targetColumn, confidenceColumn),
  };

  const runtimeLabel = availability === 'direct'
    ? 'direct OCR'
    : availability === 'fallback'
      ? 'fallback OCR'
      : 'blocked OCR';
  const summaryParts = [
    `OCR text ready via ${runtimeLabel}`,
    `${result.rowCount} rows`,
    `${result.extractedCount} extracted texts`,
  ];
  if (result.avgTextLength) summaryParts.push(`avg text len ${result.avgTextLength}`);
  if (availabilityReason && availability !== 'direct') summaryParts.push(availabilityReason);

  return {
    kind: 'image-ocr',
    status: availability === 'blocked' ? 'blocked' : 'ready',
    availability,
    availabilityReason,
    requestedRuntime: 'ocr',
    effectiveRuntime,
    createdAt: Date.now(),
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    derivedDatasetId: derivedDataset?.id || '',
    derivedVersion: Number(derivedDataset?.version || 0),
    request: {
      mode: 'ocr',
      imageColumn,
      textColumn,
      targetColumn,
    },
    result,
    requirements,
    warnings,
    summary: summaryParts.join(' / '),
  };
}

export function buildImageOcrBlockedArtifact({
  sourceDataset,
  request,
  runtimeData = {},
}) {
  const safeData = cloneValue(runtimeData || {});
  const availabilityReason = String(safeData.availabilityReason || safeData.error || 'OCR runtime is unavailable in the current environment.');
  const requirements = Array.isArray(safeData.requirements) ? safeData.requirements : [];
  const warnings = Array.isArray(safeData.warnings) ? safeData.warnings : [];
  const textColumn = String(request?.textColumn || `${request?.imageColumn || 'image'}_ocr_text`);
  return {
    kind: 'image-ocr',
    status: 'blocked',
    availability: 'blocked',
    availabilityReason,
    requestedRuntime: 'ocr',
    effectiveRuntime: '',
    createdAt: Date.now(),
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    derivedDatasetId: '',
    derivedVersion: 0,
    request: {
      mode: 'ocr',
      imageColumn: String(request?.imageColumn || ''),
      textColumn,
      targetColumn: String(request?.targetColumn || ''),
    },
    result: {
      mode: 'ocr',
      imageColumn: String(request?.imageColumn || ''),
      textColumn,
      targetColumn: String(request?.targetColumn || ''),
      rowCount: Number(sourceDataset?.rows?.length || 0),
      extractedCount: 0,
      directCount: 0,
      fallbackCount: 0,
      failedCount: Number(sourceDataset?.rows?.length || 0),
      avgTextLength: 0,
      avgConfidence: 0,
      topTokens: [],
      labelSummary: [],
      previewRows: [],
      sampleRows: [],
    },
    requirements,
    warnings,
    summary: `OCR runtime is blocked: ${availabilityReason}`,
  };
}
