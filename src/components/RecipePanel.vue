<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { saveRecipe, listRecipes, loadRecipe } from '@/stores/useRecipes';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
});

const emit = defineEmits(['apply']);

const worker = new Worker(new URL('../workers/transform.worker.js', import.meta.url), { type: 'module' });

const recipe = ref({
  select: [],
  rename: {},
  trim: [],
  typeCast: {},
  fillna: {},
  dropna: [],
  filter: [],
  cap: {},
  derive: [],
  onehot: [],
  scale: { standardize: [] },
});

const history = ref([]);
const future = ref([]);
const log = ref('');

function append(s) {
  log.value += `${s}\n`;
}

onMounted(() => {
  worker.onmessage = (e) => {
    const { ok, type, data, error } = e.data;
    if (!ok) {
      append(`Error: ${error}`);
      return;
    }
    if (type === 'APPLY') {
      pushHistory(props.rows);
      future.value = [];
      emit('apply', data);
      append('Recipe applied.');
    }
  };
});

onBeforeUnmount(() => worker.terminate());

function runApply() {
  worker.postMessage({ type: 'APPLY', payload: { rows: props.rows, recipe: recipe.value } });
}

function exportCsv() {
  worker.postMessage({ type: 'EXPORT_CSV', payload: { rows: props.rows } });
}

function pushHistory(rows) {
  history.value.push(rows.slice(0, 2000));
}

function undo() {
  if (!history.value.length) return;
  const prev = history.value.pop();
  future.value.push(structuredClone(props.rows));
  emit('apply', { rows: prev, columns: Object.keys(prev[0] || {}) });
}

function redo() {
  if (!future.value.length) return;
  const next = future.value.pop();
  history.value.push(structuredClone(props.rows));
  emit('apply', { rows: next, columns: Object.keys(next[0] || {}) });
}

async function save() {
  const name = prompt('Recipe name', `recipe-${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  if (!name) return;
  await saveRecipe(name, recipe.value);
  append('Recipe saved.');
}

async function open() {
  const items = await listRecipes();
  if (!items.length) return alert('No saved recipes.');

  const pick = prompt('Recipe ID:\n' + items.map((r) => `${r.id} : ${r.name}`).join('\n'));
  if (!pick) return;

  const r = await loadRecipe(pick.trim());
  recipe.value = r.content;
  append(`Loaded recipe: ${r.name}`);
}

function exportRecipeJSON() {
  const blob = new Blob([JSON.stringify(recipe.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `recipe-${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/[: ]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importRecipeJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Invalid JSON object');
      recipe.value = obj;
      append('Recipe JSON loaded.');
    } catch (e) {
      append(`Recipe JSON load failed: ${e?.message || e}`);
    }
  };
  input.click();
}
</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold">Recipe-based Transform</h3>
      <button @click="undo" :disabled="!history.length">Undo</button>
      <button @click="redo" :disabled="!future.length">Redo</button>
      <button @click="runApply" :disabled="!props.rows.length">Apply recipe</button>
      <button @click="exportCsv" :disabled="!props.rows.length">Export CSV</button>
      <button @click="save">Save recipe (DB)</button>
      <button @click="open">Open recipe (DB)</button>
      <button @click="exportRecipeJSON">Export JSON</button>
      <button @click="importRecipeJSON">Import JSON</button>
    </div>

    <details class="p-2 border rounded" open>
      <summary class="font-medium">Recipe Editor</summary>

      <div class="grid md:grid-cols-2 gap-4 mt-3">
        <div>
          <label class="block text-sm">select</label>
          <select multiple class="w-full" v-model="recipe.select">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">trim</label>
          <select multiple class="w-full" v-model="recipe.trim">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">typeCast</label>
          <div v-for="c in props.columns" :key="'tc-' + c" class="flex items-center gap-2 my-1">
            <span class="w-32 truncate">{{ c }}</span>
            <select v-model="recipe.typeCast[c]" class="flex-1">
              <option value="">(none)</option>
              <option value="number">number</option>
              <option value="string">string</option>
              <option value="date">date</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm">fillna</label>
          <div v-for="c in props.columns" :key="'fn-' + c" class="flex items-center gap-2 my-1">
            <span class="w-32 truncate">{{ c }}</span>
            <input class="flex-1" placeholder="value" @input="(e) => (recipe.fillna[c] = e.target.value)" />
          </div>
        </div>

        <div>
          <label class="block text-sm">dropna</label>
          <select multiple class="w-full" v-model="recipe.dropna">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">filter</label>
          <div v-for="(f, i) in recipe.filter" :key="'f-' + i" class="flex gap-2 my-1">
            <select v-model="f.col" class="w-40">
              <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
            </select>
            <select v-model="f.op" class="w-24">
              <option>==</option>
              <option>!=</option>
              <option>&gt;</option>
              <option>&gt;=</option>
              <option>&lt;</option>
              <option>&lt;=</option>
            </select>
            <input v-model="f.value" class="flex-1" placeholder="value" />
          </div>
          <button @click="recipe.filter.push({ col: '', op: '>=', value: 0 })">+ Add condition</button>
        </div>

        <div>
          <label class="block text-sm">cap (outlier)</label>
          <div v-for="c in props.columns" :key="'cap-' + c" class="flex items-center gap-2 my-1">
            <span class="w-32 truncate">{{ c }}</span>
            <select
              class="w-28"
              @change="(e) => {
                const m = e.target.value;
                recipe.cap[c] = m ? { method: m, mult: 1.5 } : undefined;
              }"
            >
              <option value="">(none)</option>
              <option value="iqr">iqr</option>
              <option value="zscore">zscore</option>
            </select>
            <input
              class="w-24"
              placeholder="mult/k"
              @input="(e) => {
                const v = Number(e.target.value);
                if (!recipe.cap[c]) recipe.cap[c] = { method: 'iqr', mult: 1.5 };
                if (Number.isFinite(v)) recipe.cap[c].mult = v;
              }"
            />
          </div>
        </div>

        <div class="md:col-span-2">
          <label class="block text-sm">derive (new column)</label>
          <div v-for="(d, i) in recipe.derive" :key="'d-' + i" class="flex gap-2 my-1">
            <input v-model="d.new" class="w-40" placeholder="new column" />
            <input v-model="d.expr" class="flex-1" placeholder="expression (e.g. colA/(colB+1e-9))" />
          </div>
          <button @click="recipe.derive.push({ new: '', expr: '' })">+ Add derive</button>
        </div>

        <div>
          <label class="block text-sm">onehot</label>
          <select multiple class="w-full" v-model="recipe.onehot">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">scale.standardize</label>
          <select multiple class="w-full" v-model="recipe.scale.standardize">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
    </details>

    <pre class="bg-gray-50 p-2 whitespace-pre-wrap text-xs">{{ log }}</pre>
  </div>
</template>

<style scoped>
button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
}
</style>