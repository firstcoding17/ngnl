import { db } from './db'; // 너가 만든 Dexie 인스턴스
import type { ChartSpec } from '@/types/chartSpec';

type ChartDoc = {
  id: string;
  name: string;
  spec: ChartSpec;
  createdAt: number;
  updatedAt: number;
};

export async function saveChart(name: string, spec: ChartSpec, id?: string) {
  const doc: ChartDoc = {
    id: id ?? crypto.randomUUID(),
    name,
    spec,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // @ts-ignore
  await db.table('charts').put(doc);
  return doc.id;
}
export async function listCharts(limit=50) {
  // @ts-ignore
  return db.table('charts').orderBy('updatedAt').reverse().limit(limit).toArray();
}
export async function loadChart(id: string) {
  // @ts-ignore
  const doc = await db.table('charts').get(id);
  if (!doc) throw new Error('그래프가 없습니다.');
  return doc as ChartDoc;
}
export async function deleteChart(id: string) {
  // @ts-ignore
  await db.table('charts').delete(id);
}
