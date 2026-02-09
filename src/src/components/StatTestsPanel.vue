<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { runStatTTest, runStatChiSq, getStatCapabilities } from '@/services/statApi';
import { inferColumnTypes } from '@/utils/colTypes';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }
});
const worker = new Worker(new URL('../workers/tests.worker.js', import.meta.url), { type:'module' });

const types = computed(()=> inferColumnTypes(props.rows, props.columns));
const numCols = computed(()=> props.columns.filter(c => props.rows.some(r => Number.isFinite(Number(r[c])))));
const catCols = computed(()=> props.columns.filter(c => !numCols.value.includes(c)));

const result = ref(null);
const loading = ref(false);
worker.onmessage = (e) => { result.value = e.data; loading.value=false; };

function run(kind, payload){ loading.value=true; worker.postMessage({ kind, payload:{ rows:props.rows, ...payload } }); }

const t = ref({ mode:'independent', colA:'', colB:'', oneCol:'', mu:0, alternative:'two-sided' });
const norm = ref({ column:'' });
const lev = ref({ column:'', group:'' });
// t-test selected columns
const t_value = ref('');
const t_group = ref('');
// chi-square selected columns
const c_a = ref('');
const c_b = ref('');
const err = ref('');
const capLoading = ref(true);
const scipyReady = ref(true);

onMounted(async () => {
  try {
    const caps = await getStatCapabilities();
    scipyReady.value = !!caps?.scipy;
  } catch {
    scipyReady.value = false;
  } finally {
    capLoading.value = false;
  }
});

function reset(){
  result.value = null; err.value = '';
}

async function runT(){
  reset();
  if (!scipyReady.value) {
    err.value = 'scipy is not installed on the server. t-test is unavailable.';
    return;
  }
  if(!t_value.value || !t_group.value) return;
  loading.value = true;
  try { result.value = await runStatTTest(props.rows, t_value.value, t_group.value); }
  catch(e){ err.value = String(e?.message||e); }
  finally{ loading.value=false; }
}

async function runC(){
  reset();
  if (!scipyReady.value) {
    err.value = 'scipy is not installed on the server. Chi-square is unavailable.';
    return;
  }
  if(!c_a.value || !c_b.value || c_a.value===c_b.value) return;
  loading.value = true;
  try { result.value = await runStatChiSq(props.rows, c_a.value, c_b.value); }
  catch(e){ err.value = String(e?.message||e); }
  finally{ loading.value=false; }
}

</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <h3 class="font-semibold">Statistical Tests</h3>
    <div v-if="capLoading" class="text-xs text-gray-500">Checking statistical package availability...</div>
    <div v-else-if="!scipyReady" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
      scipy is not installed on the server. t-test and Chi-square buttons are disabled.
    </div>

    <!-- t-test -->
    <details open class="p-2 border rounded">
      <summary class="font-medium">t-test</summary>
      <div class="flex flex-wrap gap-2 items-center mt-2">
        <select v-model="t.mode">
          <option value="independent">independent</option>
          <option value="paired">paired</option>
          <option value="one-sample">one-sample</option>
        </select>
        <template v-if="t.mode==='independent' || t.mode==='paired'">
          <select v-model="t.colA"><option value="">A column</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
          <select v-model="t.colB"><option value="">B column</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
        </template>
        <template v-else>
          <select v-model="t.oneCol"><option value="">sample column</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
          mu=<input type="number" v-model.number="t.mu" class="w-24" />
        </template>
        <select v-model="t.alternative">
          <option value="two-sided">two-sided</option>
          <option value="greater">A&gt;B / sample&gt;mu</option>
          <option value="less">A&lt;B / sample&lt;mu</option>
        </select>
        <button @click="run('ttest', t)">Run</button>
      </div>
    </details>

    <!-- Normality -->
    <details class="p-2 border rounded">
      <summary class="font-medium">Normality (Jarque-Bera)</summary>
      <div class="flex gap-2 items-center mt-2">
        <select v-model="norm.column"><option value="">column</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
        <button @click="run('normality', norm)">Run</button>
      </div>
    </details>

    <!-- Homogeneity -->
    <details class="p-2 border rounded">
      <summary class="font-medium">Homogeneity (Levene: Brown-Forsythe)</summary>
      <div class="flex gap-2 items-center mt-2">
        <select v-model="lev.column"><option value="">numeric column</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
        <select v-model="lev.group"><option value="">group column (categorical)</option><option v-for="c in catCols" :key="c">{{ c }}</option></select>
        <button @click="run('levene', lev)">Run</button>
      </div>
    </details>

    <!-- Result -->
    <div v-if="loading" class="text-sm text-gray-500">Running...</div>
    <div v-else-if="result?.ok && result?.data" class="text-sm">
      <pre class="bg-gray-50 p-2 rounded">{{ JSON.stringify(result.data, null, 2) }}</pre>
      <div class="text-xs text-gray-600">
        * For exploratory support only. Validate assumptions and multiple-testing adjustments for final reporting.
      </div>
    </div>
    <div v-else-if="result && !result.ok" class="text-sm text-red-600">Error: {{ result.error }}</div>
   <div class="font-semibold">Group Comparison</div>

    <div class="grid md:grid-cols-2 gap-3">
      <!-- t-test -->
      <div class="border rounded p-2 space-y-2">
        <div class="text-sm font-semibold">t-test (two-group mean)</div>
        <div class="flex gap-2">
          <select v-model="t_value" class="border rounded p-1 w-1/2">
            <option value="">value column</option>
            <option v-for="c in numCols" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="t_group" class="border rounded p-1 w-1/2">
            <option value="">group column (2 levels)</option>
            <option v-for="c in catCols" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <button @click="runT" :disabled="capLoading || !scipyReady || loading || !t_value || !t_group">Run</button>
      </div>

      <!-- chisq -->
      <div class="border rounded p-2 space-y-2">
        <div class="text-sm font-semibold">Chi-square (cat-cat independence)</div>
        <div class="flex gap-2">
          <select v-model="c_a" class="border rounded p-1 w-1/2">
            <option value="">category A</option>
            <option v-for="c in catCols" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="c_b" class="border rounded p-1 w-1/2">
            <option value="">category B</option>
            <option v-for="c in catCols" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <button @click="runC" :disabled="capLoading || !scipyReady || loading || !c_a || !c_b || c_a===c_b">Run</button>
      </div>
    </div>

    <div v-if="err" class="text-sm text-red-600">{{ err }}</div>

    <div v-if="result" class="border rounded p-2">
      <div class="text-sm font-semibold">{{ result.summary?.title }}</div>
      <div class="text-xs text-gray-600 mb-2">{{ result.summary?.conclusion }}</div>

      <div v-if="result.warnings?.length" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
        <div v-for="w in result.warnings" :key="w">- {{ w }}</div>
      </div>

      <div class="text-xs mb-2">
        <span v-for="(v,k) in (result.summary?.stats||{})" :key="k" class="mr-3">
          <b>{{ k }}</b>: {{ v }}
        </span>
      </div>

      <div v-for="t in result.tables||[]" :key="t.name" class="mt-2">
        <div class="text-xs font-semibold mb-1">{{ t.name }}</div>
        <div class="overflow-auto">
          <table class="min-w-full text-xs">
            <thead><tr>
              <th v-for="c in t.columns" :key="c" class="text-left p-1 border-b">{{ c }}</th>
            </tr></thead>
            <tbody>
              <tr v-for="(r,idx) in t.rows" :key="idx">
                <td v-for="(cell,j) in r" :key="j" class="p-1 border-b">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
button:disabled { opacity:.6; cursor:not-allowed; }
</style>

