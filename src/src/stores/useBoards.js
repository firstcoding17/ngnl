import { db } from './db';

export async function saveBoard(name, items, id) {
  const doc = {
    id: id ?? crypto.randomUUID(),
    name,
    items,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await db.table('boards').put(doc);
  return doc.id;
}

export async function listBoards(limit = 50) {
  return db.table('boards').orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function loadBoard(id) {
  const doc = await db.table('boards').get(id);
  if (!doc) throw new Error('Board not found.');
  return doc;
}

export async function deleteBoard(id) {
  await db.table('boards').delete(id);
}
