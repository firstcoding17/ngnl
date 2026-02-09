import Dexie from 'dexie';

class AppDB extends Dexie {
  constructor() {
    super('ngnl-db');
    this.version(3).stores({
      datasets: 'id, name, createdAt, updatedAt',
      recipes: 'id, name, updatedAt',
      charts: 'id, name, updatedAt',
      boards: 'id, name, updatedAt'
    });
  }
}

export const db = new AppDB();
