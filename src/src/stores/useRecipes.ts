import { db } from './db';
export async function saveRecipe(name:string, content:any, id?:string){
  const doc = { id: id ?? crypto.randomUUID(), name, content, updatedAt: Date.now() };
  await db.recipes.put(doc); return doc.id;
}
export async function listRecipes(){ return db.recipes.orderBy('updatedAt').reverse().toArray(); }
export async function loadRecipe(id:string){ const r = await db.recipes.get(id); if(!r) throw new Error('레시피 없음'); return r; }
export async function deleteRecipe(id:string){ await db.recipes.delete(id); }
