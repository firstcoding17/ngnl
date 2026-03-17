import { db } from './db';

export async function saveRecipe(name, content, id) {
  const doc = { id: id ?? crypto.randomUUID(), name, content, updatedAt: Date.now() };
  await db.recipes.put(doc);
  return doc.id;
}

export async function listRecipes() {
  return db.recipes.orderBy('updatedAt').reverse().toArray();
}

export async function loadRecipe(id) {
  const r = await db.recipes.get(id);
  if (!r) throw new Error('Recipe not found.');
  return r;
}

export async function deleteRecipe(id) {
  await db.recipes.delete(id);
}
