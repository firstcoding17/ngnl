import { db } from './db';

export async function saveChart(name, spec, id) {
  const doc = {
    id: id ?? crypto.randomUUID(),
    name,
    spec,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await db.table('charts').put(doc);
  return doc.id;
}

export async function listCharts(limit = 50) {
  return db.table('charts').orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function loadChart(id) {
  const doc = await db.table('charts').get(id);
  if (!doc) throw new Error('Chart not found.');
  return doc;
}

export async function deleteChart(id) {
  await db.table('charts').delete(id);
}
