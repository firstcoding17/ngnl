function normalizeJoinValue(value) {
  return String(value ?? '').trim();
}

function cloneRow(row) {
  if (!row || typeof row !== 'object') return {};
  return Object.fromEntries(Object.entries(row));
}

function uniqueList(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
}

export function buildDatasetLinkPrefix(name = '', fallback = 'linked') {
  const sanitized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || fallback;
}

export function buildDatasetLinksSignature(primaryDataset, linkState, datasetDocs = {}) {
  const primaryId = primaryDataset?.id || '';
  const primaryVersion = Number(primaryDataset?.version || 0);
  const links = Array.isArray(linkState?.links) ? linkState.links : [];
  return JSON.stringify({
    primaryDatasetId: primaryId,
    primaryVersion,
    links: links.map((rule) => {
      const linkedDataset = datasetDocs[rule.datasetId];
      return {
        datasetId: rule.datasetId || '',
        datasetVersion: Number(linkedDataset?.version || 0),
        baseDatasetId: rule.baseDatasetId || primaryId,
        baseKey: rule.baseKey || '',
        joinKey: rule.joinKey || '',
        joinType: rule.joinType || 'left',
        prefix: rule.prefix || buildDatasetLinkPrefix(linkedDataset?.name || rule.datasetId || 'linked'),
      };
    }),
  });
}

function buildDatasetLinkSummary(artifact) {
  if (!artifact) return '';
  const linkedCount = Array.isArray(artifact.links) ? artifact.links.length : 0;
  const joinedCount = Array.isArray(artifact.links)
    ? artifact.links.filter((item) => item.status === 'ready' || item.status === 'warning').length
    : 0;
  const parts = [
    `joined ${joinedCount}/${linkedCount} datasets`,
    `rows ${artifact.sourceRows} -> ${artifact.joinedRows}`,
    `cols ${artifact.sourceColumns} -> ${artifact.joinedColumns}`,
  ];
  if (Array.isArray(artifact.warnings) && artifact.warnings.length) {
    parts.push(`${artifact.warnings.length} warning${artifact.warnings.length > 1 ? 's' : ''}`);
  }
  if (Array.isArray(artifact.errors) && artifact.errors.length) {
    parts.push(`${artifact.errors.length} error${artifact.errors.length > 1 ? 's' : ''}`);
  }
  return parts.join(' / ');
}

export function buildLinkedDatasetName(primaryDataset, artifact) {
  const baseName = String(primaryDataset?.name || 'dataset').trim() || 'dataset';
  const linkedCount = Array.isArray(artifact?.links) ? artifact.links.length : 0;
  if (!linkedCount) return `${baseName} - linked`;
  return `${baseName} - linked (${linkedCount + 1})`;
}

export function buildLinkedDataset(linkState, primaryDataset, datasetDocs = {}) {
  const primaryRows = Array.isArray(primaryDataset?.rows) ? primaryDataset.rows : [];
  const primaryColumns = Array.isArray(primaryDataset?.columns) ? primaryDataset.columns.map((column) => String(column)) : [];
  const rules = Array.isArray(linkState?.links) ? linkState.links.filter((rule) => rule?.datasetId) : [];
  const errors = [];
  const warnings = [];
  const links = [];

  if (!primaryDataset?.id) {
    return {
      rows: [],
      columns: [],
      artifact: {
        kind: 'dataset-link',
        status: 'error',
        errors: ['Primary dataset is missing.'],
        warnings: [],
        links: [],
        sourceDatasetId: '',
        linkedDatasetIds: [],
        sourceRows: 0,
        sourceColumns: 0,
        joinedRows: 0,
        joinedColumns: 0,
        createdAt: Date.now(),
        summary: 'Primary dataset is missing.',
      },
    };
  }

  let rows = primaryRows.map((row) => cloneRow(row));
  let columns = [...primaryColumns];

  for (const rule of rules) {
    const linkedDataset = datasetDocs[rule.datasetId];
    const baseKey = String(rule.baseKey || '').trim();
    const joinKey = String(rule.joinKey || '').trim();
    const joinType = String(rule.joinType || 'left').trim() || 'left';
    const prefix = String(rule.prefix || buildDatasetLinkPrefix(linkedDataset?.name || rule.datasetId || 'linked')).trim();

    if (!linkedDataset) {
      const message = `Linked dataset ${rule.datasetId || '(unknown)'} could not be loaded.`;
      errors.push(message);
      links.push({
        datasetId: rule.datasetId || '',
        datasetName: rule.datasetId || 'Unknown dataset',
        baseKey,
        joinKey,
        joinType,
        prefix,
        status: 'error',
        matchedRows: 0,
        unmatchedRows: rows.length,
        duplicateKeys: 0,
        addedColumns: [],
        message,
      });
      continue;
    }

    const linkedColumns = Array.isArray(linkedDataset.columns) ? linkedDataset.columns.map((column) => String(column)) : [];
    if (!baseKey || !columns.includes(baseKey)) {
      const message = `${linkedDataset.name}: join base key "${baseKey || '(empty)'}" is not present in the primary dataset.`;
      errors.push(message);
      links.push({
        datasetId: linkedDataset.id,
        datasetName: linkedDataset.name,
        baseKey,
        joinKey,
        joinType,
        prefix,
        status: 'error',
        matchedRows: 0,
        unmatchedRows: rows.length,
        duplicateKeys: 0,
        addedColumns: [],
        message,
      });
      continue;
    }
    if (!joinKey || !linkedColumns.includes(joinKey)) {
      const message = `${linkedDataset.name}: join key "${joinKey || '(empty)'}" is not present in the linked dataset.`;
      errors.push(message);
      links.push({
        datasetId: linkedDataset.id,
        datasetName: linkedDataset.name,
        baseKey,
        joinKey,
        joinType,
        prefix,
        status: 'error',
        matchedRows: 0,
        unmatchedRows: rows.length,
        duplicateKeys: 0,
        addedColumns: [],
        message,
      });
      continue;
    }

    const linkedRows = Array.isArray(linkedDataset.rows) ? linkedDataset.rows : [];
    const duplicateMarkers = new Set();
    const rowByKey = new Map();
    linkedRows.forEach((row) => {
      const marker = normalizeJoinValue(row?.[joinKey]);
      if (!marker) return;
      if (rowByKey.has(marker)) duplicateMarkers.add(marker);
      if (!rowByKey.has(marker)) rowByKey.set(marker, row);
    });
    if (duplicateMarkers.size) {
      warnings.push(`${linkedDataset.name}: ${duplicateMarkers.size} duplicate key(s) found for "${joinKey}". The first matching row was used.`);
    }

    const mappedColumns = linkedColumns
      .filter((column) => column !== joinKey)
      .map((column) => ({
        source: column,
        target: uniqueList([`${prefix}_${column}`])[0],
      }));

    let matchedRows = 0;
    let unmatchedRows = 0;
    rows = rows.map((row) => {
      const next = cloneRow(row);
      mappedColumns.forEach(({ target }) => {
        if (!(target in next)) next[target] = '';
      });
      const marker = normalizeJoinValue(row?.[baseKey]);
      if (!marker) {
        unmatchedRows += 1;
        return next;
      }
      const match = rowByKey.get(marker);
      if (!match) {
        unmatchedRows += 1;
        return next;
      }
      matchedRows += 1;
      mappedColumns.forEach(({ source, target }) => {
        next[target] = match?.[source] ?? '';
      });
      return next;
    });

    const addedColumns = mappedColumns.map((item) => item.target);
    columns = uniqueList([...columns, ...addedColumns]);
    if (!matchedRows) {
      warnings.push(`${linkedDataset.name}: no rows matched between "${baseKey}" and "${joinKey}".`);
    }

    links.push({
      datasetId: linkedDataset.id,
      datasetName: linkedDataset.name,
      baseKey,
      joinKey,
      joinType,
      prefix,
      status: matchedRows ? (duplicateMarkers.size || unmatchedRows ? 'warning' : 'ready') : 'warning',
      matchedRows,
      unmatchedRows,
      duplicateKeys: duplicateMarkers.size,
      addedColumns,
      message: matchedRows
        ? `${matchedRows} row(s) matched on ${baseKey} = ${joinKey}.`
        : `No rows matched on ${baseKey} = ${joinKey}.`,
    });
  }

  const normalizedRows = rows.map((row) => {
    const next = {};
    columns.forEach((column) => {
      next[column] = row?.[column] ?? '';
    });
    return next;
  });

  const artifact = {
    kind: 'dataset-link',
    status: errors.length ? 'error' : warnings.length ? 'warning' : 'ready',
    createdAt: Date.now(),
    sourceDatasetId: primaryDataset.id,
    linkedDatasetIds: links.map((item) => item.datasetId).filter(Boolean),
    sourceRows: primaryRows.length,
    sourceColumns: primaryColumns.length,
    joinedRows: normalizedRows.length,
    joinedColumns: columns.length,
    errors,
    warnings,
    links,
  };
  artifact.summary = buildDatasetLinkSummary(artifact);

  return {
    rows: normalizedRows,
    columns,
    artifact,
  };
}
