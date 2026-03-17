import Dexie, { Table } from 'dexie';

export type Dataset = {
  id: string;                // uuid
  name: string;              // user-facing display name
  columns: string[];         // column list
  rows: any[];               // row data (array of objects)
  createdAt: number;         // epoch ms
  updatedAt: number;         // epoch ms
  version?: number;
  meta?: Record<string, any>;
};

export type DatasetVersion = {
  id: string;
  datasetId: string;
  version: number;
  name: string;
  columns: string[];
  rows: any[];
  meta?: Record<string, any>;
  createdAt: number;
};

class AppDB extends Dexie {
  datasets!: Table<Dataset, string>;
  dataset_versions!: Table<DatasetVersion, string>;
  recipes!: Table<{id:string; name:string; content:any; updatedAt:number}, string>;
  constructor() {
    super('ngnl-db');
    this.version(4).stores({
   datasets: 'id, name, createdAt, updatedAt',
  dataset_versions: 'id, datasetId, version, createdAt',
  recipes:  'id, name, updatedAt',
  charts:   'id, name, updatedAt',
  boards:   'id, name, updatedAt' 
});
  }
}
export const db = new AppDB();
