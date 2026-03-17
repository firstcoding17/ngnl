<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { runStatOLS, getStatCapabilities } from '@/services/statApi';
import { inferColumnTypes } from '@/utils/colTypes';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  preset: { type: Object, default: null },
});
const emit = defineEmits(['openChart']);

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
const presetNotice = ref('');
const lastPresetKey = ref('');
const pendingAutoRun = ref(false);

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

watch(
  () => props.preset,
  async (preset) => {
    if (!preset || preset.statPanel !== 'ols' || preset.key === lastPresetKey.value) return;
    lastPresetKey.value = preset.key;
    const args = preset.args || {};
    const options = preset.options || {};
    if (numCols.value.includes(args.y)) y.value = args.y;
    if (Array.isArray(args.x)) {
      x.value = args.x.filter((column) => allXCols.value.includes(column) && column !== y.value);
    }
    if (options.addIntercept != null) addIntercept.value = !!options.addIntercept;
    if (options.dummy != null) dummy.value = !!options.dummy;
    if (options.dropFirst != null) dropFirst.value = !!options.dropFirst;
    if (options.robust != null) robust.value = options.robust;
    presetNotice.value = 'Preset ready for OLS regression.';
    pendingAutoRun.value = !!preset.autoRun;
    if (preset.autoRun && !capLoading.value) {
      presetNotice.value = 'Running OLS from MCP preset...';
      await run();
      pendingAutoRun.value = false;
    }
  },
  { deep: true }
);

watch(
  () => capLoading.value,
  async (loadingNow) => {
    if (loadingNow || !pendingAutoRun.value) return;
    pendingAutoRun.value = false;
    presetNotice.value = 'Running OLS from MCP preset...';
    await run();
  }
);

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

function openCoefChart() {
  const table = result.value?.tables?.find((t) => t?.name === 'coef_table');
  if (!table?.rows?.length) return;
  const termIdx = table.columns.indexOf('term');
  const coefIdx = table.columns.indexOf('coef');
  if (termIdx < 0 || coefIdx < 0) return;

  const chartRows = table.rows
    .filter((r) => String(r[termIdx]) !== 'const')
    .map((r) => ({
      term: r[termIdx],
      coef_abs: Math.abs(Number(r[coefIdx])),
    }));

  emit('openChart', {
    rows: chartRows,
    columns: ['term', 'coef_abs'],
    spec: {
      type: 'bar',
      x: 'term',
      y: 'coef_abs',
      options: { title: 'OLS Coefficient Magnitude', xLabel: 'Term', yLabel: '|Coefficient|', agg: 'mean' },
    },
  });
}

function getFigure(kind) {
  return result.value?.figures?.find((f) => f?.type === kind);
}

function hasFigure(kind) {
  return !!getFigure(kind);
}

function rowsFromFigure(fig, xKey, yKey) {
  const xs = Array.isArray(fig?.x) ? fig.x : [];
  const ys = Array.isArray(fig?.y) ? fig.y : [];
  const n = Math.min(xs.length, ys.length);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const xv = Number(xs[i]);
    const yv = Number(ys[i]);
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    rows.push({ [xKey]: xv, [yKey]: yv, case_index: i });
  }
  return rows;
}

function openResidualFittedChart() {
  const fig = getFigure('residual_fitted');
  if (!fig) return;
  const rows = rowsFromFigure(fig, 'fitted', 'residual');
  emit('openChart', {
    rows,
    columns: ['fitted', 'residual', 'case_index'],
    spec: {
      type: 'scatter',
      x: 'fitted',
      y: 'residual',
      options: { title: 'Residual vs Fitted', xLabel: 'Fitted', yLabel: 'Residual' },
    },
  });
}

function openResidualQQChart() {
  const fig = getFigure('residual_qq');
  if (!fig) return;
  const rows = rowsFromFigure(fig, 'theoretical_quantile', 'sample_quantile');
  emit('openChart', {
    rows,
    columns: ['theoretical_quantile', 'sample_quantile', 'case_index'],
    spec: {
      type: 'scatter',
      x: 'theoretical_quantile',
      y: 'sample_quantile',
      options: { title: 'Residual Q-Q', xLabel: 'Theoretical quantile', yLabel: 'Sample quantile' },
    },
  });
}

function openScaleLocationChart() {
  const fig = getFigure('scale_location');
  if (!fig) return;
  const rows = rowsFromFigure(fig, 'fitted', 'sqrt_abs_std_resid');
  emit('openChart', {
    rows,
    columns: ['fitted', 'sqrt_abs_std_resid', 'case_index'],
    spec: {
      type: 'scatter',
      x: 'fitted',
      y: 'sqrt_abs_std_resid',
      options: { title: 'Scale-Location', xLabel: 'Fitted', yLabel: 'Sqrt(|Std Residual|)' },
    },
  });
}

function openCooksDistanceChart() {
  const fig = getFigure('cooks_distance');
  if (!fig) return;
  const rows = rowsFromFigure(fig, 'case_index', 'cooks_d');
  emit('openChart', {
    rows,
    columns: ['case_index', 'cooks_d'],
    spec: {
      type: 'bar',
      x: 'case_index',
      y: 'cooks_d',
      options: { title: "Cook's Distance", xLabel: 'Case index', yLabel: "Cook's D", agg: 'mean' },
    },
  });
}
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div class="font-semibold">OLS Regression</div>
      <button @click="openCoefChart" :disabled="!result">Open coef chart</button>
      <button @click="openResidualFittedChart" :disabled="!hasFigure('residual_fitted')">Residual vs Fitted</button>
      <button @click="openResidualQQChart" :disabled="!hasFigure('residual_qq')">Residual QQ</button>
      <button @click="openScaleLocationChart" :disabled="!hasFigure('scale_location')">Scale-Location</button>
      <button @click="openCooksDistanceChart" :disabled="!hasFigure('cooks_distance')">Cook's Distance</button>
      <button class="ml-auto" @click="run" :disabled="capLoading || !statsmodelsReady || loading || !y || !x.length">
        {{ loading ? 'Running...' : 'Run OLS' }}
      </button>
    </div>
    <div v-if="capLoading" class="text-xs text-gray-500">Checking statistical package availability...</div>
    <div v-else-if="!statsmodelsReady" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
      statsmodels is not installed on the server. OLS run is disabled.
    </div>
    <div v-if="presetNotice" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
      {{ presetNotice }}
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

