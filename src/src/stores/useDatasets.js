import { db } from './db';

export async function saveDataset(name, columns, rows, id) {
  const now = Date.now();
  const doc = {
    id: id ?? crypto.randomUUID(),
    name,
    columns,
    rows,
    createdAt: now,
    updatedAt: now
  };
  await db.datasets.put(doc);
  return doc.id;
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
  await db.datasets.delete(id);
}
