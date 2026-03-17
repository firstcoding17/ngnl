import Dexie from 'dexie';

class AppDB extends Dexie {
  constructor() {
    super('ngnl-db');
    this.version(4).stores({
      datasets: 'id, name, createdAt, updatedAt',
      dataset_versions: 'id, datasetId, version, createdAt',
      recipes: 'id, name, updatedAt',
      charts: 'id, name, updatedAt',
      boards: 'id, name, updatedAt'
    });
  }
}

export const db = new AppDB();
