import { db, type Dataset } from './db';

function inferColumnTypes(rows: any[], columns: string[], maxScan = 1000) {
  const sample = Array.isArray(rows) ? rows.slice(0, maxScan) : [];
  const types: Record<string, string> = {};
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

function hashString(input: string) {
  let h = 2166136261;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}

function buildDatasetMeta(columns: string[], rows: any[], extraMeta: Record<string, any> = {}) {
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

export async function saveDataset(
  name: string,
  columns: string[],
  rows: any[],
  id?: string,
  options: { meta?: Record<string, any> } = {}
) {
  const now = Date.now();
  const existing = id ? await db.datasets.get(id) : null;
  const datasetId = id ?? crypto.randomUUID();
  const version = Number(existing?.version || 0) + 1;
  const meta = buildDatasetMeta(columns || [], rows || [], options?.meta || {});
  const doc: Dataset = {
    id: datasetId,
    name,
    columns,
    rows,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    version,
    meta,
  };
  await db.datasets.put(doc);
  await db.dataset_versions.put({
    id: crypto.randomUUID(),
    datasetId,
    version,
    name,
    columns,
    rows,
    meta,
    createdAt: now,
  });
  return datasetId;
}

export async function listRecent(limit = 10) {
  return db.datasets.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function loadDataset(id: string) {
  const doc = await db.datasets.get(id);
  if (!doc) throw new Error('Dataset not found.');
  return doc;
}

export async function deleteDataset(id: string) {
  await db.dataset_versions.where('datasetId').equals(id).delete();
  await db.datasets.delete(id);
}

export async function listDatasetVersions(datasetId: string, limit = 20) {
  const items = await db.dataset_versions.where('datasetId').equals(datasetId).reverse().sortBy('version');
  const sorted = items.sort((a, b) => b.version - a.version);
  return sorted.slice(0, limit);
}

export async function loadDatasetVersion(versionId: string) {
  const doc = await db.dataset_versions.get(versionId);
  if (!doc) throw new Error('Dataset version not found.');
  return doc;
}
