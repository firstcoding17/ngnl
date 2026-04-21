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
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function min(values = []) {
  return values.length ? Math.min(...values) : 0;
}

function max(values = []) {
  return values.length ? Math.max(...values) : 0;
}

function decodeFeatureSuffix(column = '', prefix = '') {
  return String(column || '')
    .replace(prefix, '')
    .replace(/_/g, ' ')
    .trim();
}

function buildSampleRows(rows = [], featureColumns = [], targetColumn = '') {
  const visibleColumns = Array.from(new Set([targetColumn, ...featureColumns].filter(Boolean))).slice(0, 6);
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 3)
    .map((row) => Object.fromEntries(visibleColumns.map((column) => [column, row?.[column]])));
}

export function normalizeTextFeatureMethod(method = '') {
  const value = String(method || '').trim().toLowerCase();
  if (value === 'sentiment') return 'sentiment';
  if (value === 'tfidf') return 'tfidf';
  if (value === 'semantic' || value === 'semantic-preview' || value === 'semantic-runtime') return 'semantic';
  if (value === 'embedding' || value === 'embedding-preview') return 'embedding';
  return '';
}

export function buildTextFeatureRequest(task = {}, analysis = null, dataset = null) {
  const method = normalizeTextFeatureMethod(analysis?.method || task?.options?.textMethod || 'tfidf');
  if (!method) return null;
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const metaTextColumns = Array.isArray(dataset?.meta?.textColumns) ? dataset.meta.textColumns : [];
  const textColumn = [
    String(task?.options?.textColumn || '').trim(),
    ...metaTextColumns,
    ...columns,
  ].find((column) => column && columns.includes(column));
  if (!textColumn) return null;
  const targetColumn = String(task?.options?.targetColumn || '').trim();
  return {
    method,
    textColumn,
    targetColumn: targetColumn && columns.includes(targetColumn) ? targetColumn : '',
  };
}

export function buildTextFeatureRecipe(request = {}) {
  const textColumn = String(request?.textColumn || '').trim();
  const method = normalizeTextFeatureMethod(request?.method || '');
  if (!textColumn || !method) return null;
  const recipe = {
    textStats: [textColumn],
  };
  if (method === 'tfidf') {
    recipe.textTfidf = [{ column: textColumn, topK: 6 }];
  }
  if (method === 'sentiment') {
    recipe.textSentiment = [textColumn];
  }
  if (method === 'embedding') {
    recipe.textEmbedding = [{ column: textColumn, dims: 4 }];
  }
  if (method === 'semantic') {
    recipe.textSemantic = [{ column: textColumn }];
  }
  return recipe;
}

export function buildTextFeatureSignature(sourceDataset, request = {}) {
  return JSON.stringify({
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    method: normalizeTextFeatureMethod(request?.method || ''),
    textColumn: String(request?.textColumn || ''),
    targetColumn: String(request?.targetColumn || ''),
  });
}

export function buildTextFeatureArtifact({
  sourceDataset,
  derivedDataset,
  request,
  transformedRows,
  transformedColumns,
  warnings = [],
}) {
  const method = normalizeTextFeatureMethod(request?.method || '');
  const textColumn = String(request?.textColumn || '');
  const targetColumn = String(request?.targetColumn || '');
  const columns = Array.isArray(transformedColumns) ? transformedColumns : [];
  const rows = Array.isArray(transformedRows) ? transformedRows : [];
  const prefix = `${textColumn}_`;
  const featureColumns = columns.filter((column) => column.startsWith(prefix) && column !== textColumn);
  const tfidfPrefix = `${textColumn}_tfidf_`;
  const topTerms = featureColumns
    .filter((column) => column.startsWith(tfidfPrefix))
    .map((column) => decodeFeatureSuffix(column, tfidfPrefix))
    .filter(Boolean)
    .slice(0, 8);
  const sentimentColumn = `${textColumn}_sentiment`;
  const sentimentValues = rows
    .map((row) => Number(row?.[sentimentColumn]))
    .filter((value) => Number.isFinite(value));
  const charLengths = rows
    .map((row) => Number(row?.[`${textColumn}_char_len`]))
    .filter((value) => Number.isFinite(value));
  const wordCounts = rows
    .map((row) => Number(row?.[`${textColumn}_word_count`]))
    .filter((value) => Number.isFinite(value));
  const embeddingPrefix = `${textColumn}_embed_`;
  const embeddingColumns = featureColumns.filter((column) => column.startsWith(embeddingPrefix));
  const semanticPrefix = `${textColumn}_semantic_`;
  const semanticColumns = featureColumns.filter((column) => column.startsWith(semanticPrefix));
  const topConcepts = semanticColumns
    .map((column) => {
      const values = rows
        .map((row) => Number(row?.[column]))
        .filter((value) => Number.isFinite(value));
      return {
        concept: decodeFeatureSuffix(column, semanticPrefix),
        score: Math.round(average(values) * 1000) / 1000,
      };
    })
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => right.score - left.score || left.concept.localeCompare(right.concept))
    .slice(0, 6);
  const tokenCounter = new Map();
  rows.forEach((row) => {
    tokenizeText(row?.[textColumn]).forEach((token) => {
      tokenCounter.set(token, (tokenCounter.get(token) || 0) + 1);
    });
  });
  const topTokens = Array.from(tokenCounter.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([token, count]) => ({ token, count }));

  const result = {
    method,
    textColumn,
    targetColumn,
    rowCount: rows.length,
    sourceColumns: Array.isArray(sourceDataset?.columns) ? sourceDataset.columns.length : 0,
    derivedColumns: columns.length,
    featureColumns,
    featureCount: featureColumns.length,
    embeddingColumns,
    embeddingDims: embeddingColumns.length,
    embeddingRuntime: method === 'embedding' ? 'hash-vector' : '',
    semanticColumns,
    semanticDims: semanticColumns.length,
    semanticRuntime: method === 'semantic' ? 'concept-lexicon' : '',
    runtimeClass: method === 'semantic' ? 'semantic' : method === 'embedding' ? 'heuristic' : '',
    representationKind: method === 'semantic' ? 'semantic-concept' : method === 'embedding' ? 'hash-vector' : method,
    topConcepts,
    topTerms,
    topTokens,
    avgCharLength: Math.round(average(charLengths) * 10) / 10,
    avgWordCount: Math.round(average(wordCounts) * 10) / 10,
    sentimentStats: sentimentValues.length
      ? {
          avg: Math.round(average(sentimentValues) * 1000) / 1000,
          min: Math.round(min(sentimentValues) * 1000) / 1000,
          max: Math.round(max(sentimentValues) * 1000) / 1000,
        }
      : null,
    sampleRows: buildSampleRows(rows, featureColumns, targetColumn),
  };

  const summaryParts = [
    method === 'sentiment'
      ? 'Sentiment features ready'
      : method === 'semantic'
        ? 'Semantic text features ready'
      : method === 'embedding'
        ? 'Embedding features ready'
        : 'TF-IDF features ready',
    `${rows.length} rows`,
    `${featureColumns.length} derived columns`,
  ];
  if (topTerms.length) summaryParts.push(`top terms ${topTerms.slice(0, 4).join(', ')}`);
  if (method === 'semantic' && topConcepts.length) {
    summaryParts.push(`top concepts ${topConcepts.slice(0, 3).map((item) => item.concept).join(', ')}`);
  }
  if (result.sentimentStats) summaryParts.push(`avg sentiment ${result.sentimentStats.avg}`);
  if (method === 'embedding' && embeddingColumns.length) {
    summaryParts.push(`${embeddingColumns.length} embedding dims`);
  }
  if (method === 'semantic' && semanticColumns.length) {
    summaryParts.push(`${semanticColumns.length} semantic dims`);
  }

  const nextWarnings = Array.isArray(warnings) ? warnings.slice() : [];
  if (method === 'embedding') {
    nextWarnings.push('Hash-based embedding vectors are used in this slice; semantic embedding models are not enabled yet.');
  }

  return {
    kind: 'text-features',
    availability: 'direct',
    availabilityReason: method === 'semantic' ? 'Semantic concept features were generated with the built-in concept lexicon runtime.' : '',
    createdAt: Date.now(),
    sourceDatasetId: sourceDataset?.id || '',
    sourceVersion: Number(sourceDataset?.version || 0),
    derivedDatasetId: derivedDataset?.id || '',
    derivedVersion: Number(derivedDataset?.version || 0),
    request: {
      method,
      textColumn,
      targetColumn,
    },
    result,
    warnings: Array.from(new Set(nextWarnings)),
    summary: summaryParts.join(' / '),
  };
}
