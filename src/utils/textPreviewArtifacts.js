function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function tokenizeText(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\u00c0-\u024f\u3131-\u318e\uac00-\ud7a3\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length >= 2);
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function topTokenEntries(counter, limit = 6) {
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }));
}

function buildTextColumnArtifact(rows, column) {
  const values = (rows || [])
    .map((row) => String(row?.[column] ?? '').trim())
    .filter(Boolean);

  const tokenCounter = new Map();
  const charLengths = [];
  const wordCounts = [];
  const samples = [];

  values.forEach((value) => {
    const tokens = tokenizeText(value);
    charLengths.push(value.length);
    wordCounts.push(tokens.length);
    tokens.forEach((token) => {
      tokenCounter.set(token, (tokenCounter.get(token) || 0) + 1);
    });
    if (samples.length < 3) samples.push(value.slice(0, 120));
  });

  return {
    column,
    rowCount: values.length,
    avgCharLength: Math.round(average(charLengths) * 10) / 10,
    avgWordCount: Math.round(average(wordCounts) * 10) / 10,
    topTokens: topTokenEntries(tokenCounter, 6),
    samples,
  };
}

export function buildTextPreviewArtifact(dataset) {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const textColumns = Array.isArray(dataset?.meta?.textColumns) && dataset.meta.textColumns.length
    ? dataset.meta.textColumns
    : Array.isArray(dataset?.columns) ? dataset.columns.slice(0, 1) : [];
  const columnArtifacts = textColumns
    .map((column) => buildTextColumnArtifact(rows, column))
    .filter((artifact) => artifact.rowCount > 0);

  const tokenCounter = new Map();
  columnArtifacts.forEach((artifact) => {
    artifact.topTokens.forEach(({ token, count }) => {
      tokenCounter.set(token, (tokenCounter.get(token) || 0) + count);
    });
  });

  const avgWords = columnArtifacts.length
    ? Math.round(average(columnArtifacts.map((artifact) => artifact.avgWordCount)) * 10) / 10
    : 0;

  const summary = columnArtifacts.length
    ? `${columnArtifacts.length} text column reviewed / avg ${avgWords} words / top tokens ${topTokenEntries(tokenCounter, 4).map((item) => item.token).join(', ')}`
    : 'No text overview artifact could be generated from the current dataset.';

  return {
    kind: 'text-overview',
    createdAt: Date.now(),
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    totalRows: rows.length,
    textColumnCount: columnArtifacts.length,
    avgWordCount: avgWords,
    topTokens: topTokenEntries(tokenCounter, 8),
    columns: columnArtifacts,
    summary,
  };
}

export function buildTextPreviewSignature(dataset) {
  return JSON.stringify({
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    textColumns: Array.isArray(dataset?.meta?.textColumns) ? dataset.meta.textColumns : [],
  });
}
