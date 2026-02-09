<script setup>
import { computed, ref, onMounted } from 'vue';
import { runStatOLS, getStatCapabilities } from '@/services/statApi';
import { inferColumnTypes } from '@/utils/colTypes';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }
});

const types = computed(()=> inferColumnTypes(props.rows, props.columns));
const numCols = computed(()=> props.columns.filter(c => types.value[c]==='number'));
const allXCols = computed(()=> props.columns.filter(c => c));

const y = ref('');
const x = ref([]);
const addIntercept = ref(true);
const dummy = ref(true);
const dropFirst = ref(true);
const robust = ref('HC3');

const loading = ref(false);
const result = ref(null);
const err = ref('');
const capLoading = ref(true);
const statsmodelsReady = ref(true);

onMounted(async () => {
  try {
    const caps = await getStatCapabilities();
    statsmodelsReady.value = !!caps?.statsmodels;
  } catch {
    statsmodelsReady.value = false;
  } finally {
    capLoading.value = false;
  }
});

async function run(){
  err.value = ''; result.value = null;
  if (!statsmodelsReady.value) {
    err.value = 'statsmodels is not installed on the server. OLS is unavailable.';
    return;
  }
  if(!y.value || !x.value.length) return;
  loading.value = true;
  try {
    result.value = await runStatOLS(props.rows, y.value, x.value, {
      addIntercept: addIntercept.value,
      dummy: dummy.value,
      dropFirst: dropFirst.value,
      robust: robust.value,
    });
  } catch(e){
    err.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div class="font-semibold">OLS Regression</div>
      <button class="ml-auto" @click="run" :disabled="capLoading || !statsmodelsReady || loading || !y || !x.length">
        {{ loading ? 'Running...' : 'Run OLS' }}
      </button>
    </div>
    <div v-if="capLoading" class="text-xs text-gray-500">Checking statistical package availability...</div>
    <div v-else-if="!statsmodelsReady" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
      statsmodels is not installed on the server. OLS run is disabled.
    </div>

    <div class="grid md:grid-cols-2 gap-3">
      <div class="space-y-2">
        <div class="text-sm font-semibold">Target (Y)</div>
        <select v-model="y" class="border rounded p-2 w-full">
          <option value="">Select numeric column</option>
          <option v-for="c in numCols" :key="c" :value="c">{{ c }}</option>
        </select>

        <div class="text-sm font-semibold mt-3">Features (X)</div>
        <select v-model="x" multiple size="10" class="border rounded p-2 w-full">
          <option v-for="c in allXCols" :key="c" :value="c">{{ c }}</option>
        </select>
        <div class="text-xs text-gray-500">Use Ctrl/Shift for multi-select</div>
      </div>

      <div class="space-y-2">
        <div class="text-sm font-semibold">Options</div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="addIntercept" /> Include intercept
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="dummy" /> Dummy encode categorical features
        </label>
        <label class="flex items-center gap-2 text-sm" :class="dummy ? '' : 'opacity-50'">
          <input type="checkbox" v-model="dropFirst" :disabled="!dummy" /> Drop first dummy
        </label>
        <label class="flex items-center gap-2 text-sm">
          Robust covariance:
          <select v-model="robust" class="border rounded p-1">
            <option :value="null">None</option>
            <option value="HC3">HC3 (recommended)</option>
            <option value="HC1">HC1</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="err" class="text-sm text-red-600">{{ err }}</div>

    <div v-if="result" class="border rounded p-2 space-y-2">
      <div class="text-sm font-semibold">{{ result.summary?.title }}</div>
      <div class="text-xs text-gray-600">{{ result.summary?.conclusion }}</div>

      <div v-if="result.warnings?.length" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        <div v-for="w in result.warnings" :key="w">- {{ w }}</div>
      </div>

      <div class="text-xs">
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

