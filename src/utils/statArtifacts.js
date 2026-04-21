function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function findTable(result, name) {
  return Array.isArray(result?.tables) ? result.tables.find((table) => table?.name === name) || null : null;
}

function readCell(table, rowIndex, columnName) {
  if (!table?.columns || !Array.isArray(table.rows)) return null;
  const columnIndex = table.columns.indexOf(columnName);
  if (columnIndex < 0) return null;
  const row = table.rows[rowIndex];
  return Array.isArray(row) ? row[columnIndex] : null;
}

function summarizeCorrResult(result) {
  const topPairs = findTable(result, 'top_pairs');
  const pairCount = Array.isArray(topPairs?.rows) ? topPairs.rows.length : 0;
  const bestA = readCell(topPairs, 0, 'col_a');
  const bestB = readCell(topPairs, 0, 'col_b');
  const bestCorr = readCell(topPairs, 0, 'corr');
  const base = String(result?.summary?.conclusion || 'Correlation review is ready.');
  if (!pairCount || !bestA || !bestB) return base;
  return `${base} Strongest pair: ${bestA} ~ ${bestB} (r=${bestCorr}).`;
}

function summarizeTestsResult(result, request = {}) {
  const op = String(request?.op || result?.op || '').toLowerCase();
  const stats = result?.summary?.stats || {};
  const conclusionSuffix = result?.summary?.conclusion ? ` / ${result.summary.conclusion}` : '';

  if (op === 'ttest') {
    const value = request?.args?.value || 'value';
    const group = request?.args?.group || 'group';
    return `t-test on ${value} by ${group}: p=${stats.p_value ?? '-'}, d=${stats.cohen_d ?? '-'}${conclusionSuffix}`;
  }
  if (op === 'chisq') {
    const a = request?.args?.a || 'A';
    const b = request?.args?.b || 'B';
    return `Chi-square on ${a} x ${b}: p=${stats.p_value ?? '-'}, Cramer's V=${stats.cramers_v ?? '-'}${conclusionSuffix}`;
  }
  if (op === 'anova') {
    const value = request?.args?.value || 'value';
    const group = request?.args?.group || 'group';
    return `ANOVA on ${value} by ${group}: p=${stats.p_value ?? '-'}, eta_sq=${stats.eta_sq ?? '-'}${conclusionSuffix}`;
  }
  if (op === 'normality') {
    const column = request?.args?.column || 'column';
    return `Normality check on ${column}: p=${stats.p_value ?? '-'}, skew=${stats.skew ?? '-'}${conclusionSuffix}`;
  }
  if (op === 'levene') {
    const column = request?.args?.column || 'value';
    const group = request?.args?.group || 'group';
    return `Levene on ${column} by ${group}: p=${stats.p_value ?? '-'}, F=${stats.f_stat ?? '-'}${conclusionSuffix}`;
  }
  return String(result?.summary?.conclusion || 'Statistical test review is ready.');
}

export function buildStatArtifactSignature(dataset, request = {}) {
  return JSON.stringify({
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    statPanel: request?.statPanel || '',
    op: request?.op || '',
    args: request?.args || {},
    options: request?.options || {},
  });
}

export function buildCorrArtifact(dataset, request, result) {
  const safeResult = cloneValue(result || {});
  return {
    kind: 'stat-corr',
    createdAt: Date.now(),
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    signature: buildStatArtifactSignature(dataset, request),
    request: cloneValue(request || {}),
    result: safeResult,
    summary: summarizeCorrResult(safeResult),
  };
}

export function buildTestsArtifact(dataset, request, result) {
  const safeResult = cloneValue(result || {});
  return {
    kind: 'stat-tests',
    createdAt: Date.now(),
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    signature: buildStatArtifactSignature(dataset, request),
    request: cloneValue(request || {}),
    result: safeResult,
    summary: summarizeTestsResult(safeResult, request),
  };
}
