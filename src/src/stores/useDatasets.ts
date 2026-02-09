import { db, type Dataset } from './db';

export async function saveDataset(name: string, columns: string[], rows: any[], id?: string) {
  const now = Date.now();
  const doc: Dataset = {
    id: id ?? crypto.randomUUID(),
    name,
    columns,
    rows,
    createdAt: now,
    updatedAt: now,
  };
  await db.datasets.put(doc);
  return doc.id;
}

export async function listRecent(limit = 10) {
  return db.datasets.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function loadDataset(id: string) {
  const doc = await db.datasets.get(id);
  if (!doc) throw new Error('데이터셋을 찾을 수 없습니다.');
  return doc;
}

export async function deleteDataset(id: string) {
  await db.datasets.delete(id);
}
