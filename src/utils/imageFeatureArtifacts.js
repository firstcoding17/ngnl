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

function buildSampleRows(rows = [], imageColumn = '', featureColumns = [], targetColumn = '') {
  const visibleColumns = Array.from(new Set([targetColumn, ...featureColumns].filter(Boolean))).slice(0, 6);
  if (!visibleColumns.length) return [];
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 3)
    .map((row) => Object.fromEntries(visibleColumns.map((column) => [column, row?.[column]])));
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

export function buildImageFeatureDatasetName(sourceDataset, request = {}) {
  const suffix = String(request?.mode || '').trim() === 'opencv-basic' ? 'image features' : 'image preview';
  return `${sourceDataset?.name || 'dataset'} - ${suffix}`;
}

export function buildImageFeatureRequest(task = {}, analysis = null, dataset = null) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const imageColumns = Array.isArray(dataset?.meta?.imageColumns)
    ? dataset.meta.imageColumns.filter((column) => columns.includes(column))
    : [];
  const requestedImageColumn = [
    String(analysis?.options?.imageColumn || '').trim(),
    String(task?.options?.imageColumn || '').trim(),
    ...imageColumns,
  ].find((column) => column && columns.includes(column));
  if (!requestedImageColumn) return null;

  const requestedTarget = [
    String(analysis?.options?.targetColumn || '').trim(),
    String(task?.options?.targetColumn || '').trim(),
  ].find((column) => column && columns.includes(column) && column !== requestedImageColumn) || '';

  return {
    mode: 'opencv-basic',
    imageColumn: requestedImageColumn,
    targetColumn: requestedTarget,
  };
}

export function buildImageFeatureSignature(sourceDataset, request = {}) {
  return JSON.stringify({
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    mode: String(request?.mode || 'opencv-basic'),
    imageColumn: String(request?.imageColumn || ''),
    targetColumn: String(request?.targetColumn || ''),
  });
}

export function buildImageFeatureArtifact({
  sourceDataset,
  derivedDataset,
  request,
  runtimeData = {},
}) {
  const safeData = cloneValue(runtimeData || {});
  const sourceColumns = Array.isArray(sourceDataset?.columns) ? sourceDataset.columns : [];
  const derivedColumns = Array.isArray(derivedDataset?.columns) ? derivedDataset.columns : [];
  const derivedRows = Array.isArray(derivedDataset?.rows) ? derivedDataset.rows : [];
  const featureColumns = Array.isArray(safeData.featureColumns)
    ? safeData.featureColumns.filter((column) => derivedColumns.includes(column))
    : derivedColumns.filter((column) => !sourceColumns.includes(column));
  const previewRows = Array.isArray(safeData.previewRows) ? safeData.previewRows.slice(0, 4) : [];
  const imageColumn = String(request?.imageColumn || '');
  const targetColumn = String(request?.targetColumn || '');
  const widthValues = derivedRows.map((row) => Number(row?.[`${imageColumn}_width`])).filter((value) => Number.isFinite(value) && value > 0);
  const heightValues = derivedRows.map((row) => Number(row?.[`${imageColumn}_height`])).filter((value) => Number.isFinite(value) && value > 0);
  const byteValues = derivedRows.map((row) => Number(row?.[`${imageColumn}_byte_size`])).filter((value) => Number.isFinite(value) && value > 0);
  const labelSummary = safeData.labelSummary?.length ? safeData.labelSummary : summarizeLabelCounts(derivedRows, targetColumn);
  const availability = String(safeData.availability || 'direct');
  const effectiveRuntime = String(safeData.effectiveRuntime || (availability === 'fallback' ? 'manifest-fallback' : 'opencv-basic'));
  const availabilityReason = String(safeData.availabilityReason || '');
  const warnings = Array.isArray(safeData.warnings) ? safeData.warnings : [];
  const requirements = Array.isArray(safeData.requirements) ? safeData.requirements : [];
  const result = {
    mode: String(request?.mode || 'opencv-basic'),
    imageColumn,
    targetColumn,
    rowCount: derivedRows.length,
    featureColumns,
    featureCount: featureColumns.length,
    previewRows,
    labelSummary,
    processedCount: Number(safeData.processedCount || derivedRows.length || 0),
    directCount: Number(safeData.directCount || 0),
    fallbackCount: Number(safeData.fallbackCount || 0),
    failedCount: Number(safeData.failedCount || 0),
    avgWidth: round(average(widthValues), 2),
    avgHeight: round(average(heightValues), 2),
    avgByteSize: round(average(byteValues), 1),
    sampleRows: buildSampleRows(derivedRows, imageColumn, featureColumns, targetColumn),
    imageStats: cloneValue(safeData.imageStats || {}),
  };

  const runtimeLabel = availability === 'direct' ? 'OpenCV runtime' : availability === 'fallback' ? 'fallback runtime' : 'blocked runtime';
  const summaryParts = [
    `Image features ready via ${runtimeLabel}`,
    `${result.rowCount} rows`,
    `${result.featureCount} derived columns`,
  ];
  if (result.directCount) summaryParts.push(`${result.directCount} direct extracts`);
  if (result.fallbackCount) summaryParts.push(`${result.fallbackCount} fallback extracts`);
  if (targetColumn) summaryParts.push(`target ${targetColumn}`);
  if (availabilityReason && availability !== 'direct') summaryParts.push(availabilityReason);

  return {
    kind: 'image-features',
    status: availability === 'blocked' ? 'blocked' : 'ready',
    availability,
    availabilityReason,
    requestedRuntime: String(request?.mode || 'opencv-basic'),
    effectiveRuntime,
    createdAt: Date.now(),
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    derivedDatasetId: derivedDataset?.id || '',
    derivedVersion: Number(derivedDataset?.version || 0),
    request: {
      mode: String(request?.mode || 'opencv-basic'),
      imageColumn,
      targetColumn,
    },
    result,
    requirements,
    warnings,
    summary: summaryParts.join(' / '),
  };
}

export function buildImageBlockedArtifact({
  sourceDataset,
  request,
  runtimeData = {},
}) {
  const safeData = cloneValue(runtimeData || {});
  const availabilityReason = String(safeData.availabilityReason || safeData.error || 'Image runtime is unavailable in the current environment.');
  const requirements = Array.isArray(safeData.requirements) ? safeData.requirements : [];
  const warnings = Array.isArray(safeData.warnings) ? safeData.warnings : [];
  return {
    kind: 'image-features',
    status: 'blocked',
    availability: 'blocked',
    availabilityReason,
    requestedRuntime: String(request?.mode || 'opencv-basic'),
    effectiveRuntime: '',
    createdAt: Date.now(),
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    derivedDatasetId: '',
    derivedVersion: 0,
    request: {
      mode: String(request?.mode || 'opencv-basic'),
      imageColumn: String(request?.imageColumn || ''),
      targetColumn: String(request?.targetColumn || ''),
    },
    result: {
      mode: String(request?.mode || 'opencv-basic'),
      imageColumn: String(request?.imageColumn || ''),
      targetColumn: String(request?.targetColumn || ''),
      rowCount: Number(sourceDataset?.rows?.length || 0),
      featureColumns: [],
      featureCount: 0,
      previewRows: [],
      labelSummary: [],
      processedCount: 0,
      directCount: 0,
      fallbackCount: 0,
      failedCount: Number(sourceDataset?.rows?.length || 0),
      sampleRows: [],
      imageStats: {},
    },
    requirements,
    warnings,
    summary: `Image runtime is blocked: ${availabilityReason}`,
  };
}
