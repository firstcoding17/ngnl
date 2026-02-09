import { db } from './db';

export type BoardItem = { chartId: string; hidden?: boolean; order?: number };
export type BoardDoc = { id: string; name: string; items: BoardItem[]; createdAt: number; updatedAt: number };


export async function saveBoard(name: string, items: BoardItem[], id?: string) {
  const doc: BoardDoc = {
    id: id ?? crypto.randomUUID(),
    name,
    items,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // @ts-ignore
  await db.table('boards').put(doc);
  return doc.id;
}

export async function listBoards(limit=50) {
  // @ts-ignore
  return db.table('boards').orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function loadBoard(id: string) {
  // @ts-ignore
  const doc = await db.table('boards').get(id);
  if (!doc) throw new Error('보드를 찾을 수 없습니다.');
  return doc as BoardDoc;
}

export async function deleteBoard(id: string) {
  // @ts-ignore
  await db.table('boards').delete(id);
}
