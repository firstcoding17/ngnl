import { db } from './db';

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ds_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
}

function cloneColumns(columns) {
  return Array.isArray(columns) ? columns.map((column) => String(column)) : [];
}

function cloneRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    return Object.fromEntries(Object.entries(row));
  });
}

function inferColumnTypes(rows, columns, maxScan = 1000) {
  const sample = Array.isArray(rows) ? rows.slice(0, maxScan) : [];
  const types = {};
  for (const c of columns || []) {
    let nNum = 0;
    let nDate = 0;
    let nStr = 0;
    for (const r of sample) {
      const v = r?.[c];
      if (v === null || v === undefined || v === '') continue;
      const num = Number(v);
      if (Number.isFinite(num)) {
        nNum += 1;
        continue;
      }
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        nDate += 1;
        continue;
      }
      nStr += 1;
    }
    if (nDate && nDate >= Math.max(nNum, nStr)) types[c] = 'date';
    else if (nNum && nNum >= Math.max(nDate, nStr)) types[c] = 'number';
    else types[c] = 'category';
  }
  return types;
}

function hashString(input) {
  let h = 2166136261;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}

function buildDatasetMeta(columns, rows, extraMeta = {}) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const columnList = Array.isArray(columns) ? columns : [];
  const columnTypes = inferColumnTypes(rows || [], columnList);
  const schemaHash = hashString(columnList.join('|'));
  return {
    rowCount,
    colCount: columnList.length,
    columnTypes,
    schemaHash,
    ...extraMeta,
  };
}

export async function saveDataset(name, columns, rows, id, options = {}) {
  const now = Date.now();
  const existing = id ? await db.datasets.get(id) : null;
  const datasetId = id ?? makeId();
  const safeColumns = cloneColumns(columns);
  const safeRows = cloneRows(rows);
  const version = Number(existing?.version || 0) + 1;
  const meta = buildDatasetMeta(safeColumns, safeRows, options?.meta || {});
  const doc = {
    id: datasetId,
    name,
    columns: safeColumns,
    rows: safeRows,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    version,
    meta,
  };
  await db.datasets.put(doc);
  await db.dataset_versions.put({
    id: makeId(),
    datasetId,
    version,
    name,
    columns: safeColumns,
    rows: safeRows,
    meta,
    createdAt: now,
  });
  return datasetId;
}

export async function listRecent(limit = 10) {
  return db.datasets.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function loadDataset(id) {
  const doc = await db.datasets.get(id);
  if (!doc) throw new Error('Dataset not found.');
  return doc;
}

export async function deleteDataset(id) {
  await db.dataset_versions.where('datasetId').equals(id).delete();
  await db.datasets.delete(id);
}

export async function listDatasetVersions(datasetId, limit = 20) {
  return db.dataset_versions.where('datasetId').equals(datasetId).reverse().sortBy('version').then((items) => {
    const sorted = items.sort((a, b) => b.version - a.version);
    return sorted.slice(0, limit);
  });
}

export async function loadDatasetVersion(versionId) {
  const doc = await db.dataset_versions.get(versionId);
  if (!doc) throw new Error('Dataset version not found.');
  return doc;
}
