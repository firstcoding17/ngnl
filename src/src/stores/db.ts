import Dexie, { Table } from 'dexie';

export type Dataset = {
  id: string;                // uuid
  name: string;              // 사용자 표시명
  columns: string[];         // 컬럼 배열
  rows: any[];               // 행 데이터(객체 배열)
  createdAt: number;         // epoch ms
  updatedAt: number;         // epoch ms
};

class AppDB extends Dexie {
  datasets!: Table<Dataset, string>;
  recipes!: Table<{id:string; name:string; content:any; updatedAt:number}, string>;
  constructor() {
    super('ngnl-db');
    this.version(3).stores({
   datasets: 'id, name, createdAt, updatedAt',
  recipes:  'id, name, updatedAt',
  charts:   'id, name, updatedAt',
  boards:   'id, name, updatedAt' 
});
  }
}
export const db = new AppDB();
