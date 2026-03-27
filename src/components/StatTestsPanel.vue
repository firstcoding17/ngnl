<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { runStatTTest, runStatChiSq, getStatCapabilities } from '@/services/statApi';
import { inferColumnTypes } from '@/utils/colTypes';
import { effectBadgesFromStats, effectBadgeClass } from '@/utils/effectSize';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  preset: { type: Object, default: null },
});
const emit = defineEmits(['openChart']);
const worker = new Worker(new URL('../workers/tests.worker.js', import.meta.url), { type:'module' });

const types = computed(()=> inferColumnTypes(props.rows, props.columns));
const numCols = computed(()=> props.columns.filter(c => props.rows.some(r => Number.isFinite(Number(r[c])))));
const catCols = computed(()=> props.columns.filter(c => !numCols.value.includes(c)));
const effectBadges = computed(() => effectBadgesFromStats(result.value?.summary?.stats || {}));

const result = ref(null);
const loading = ref(false);
worker.onmessage = (e) => { result.value = e.data; loading.value=false; };

function cloneRowsForWorker(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    return { ...row };
  });
}

function run(kind, payload){
  loading.value=true;
  worker.postMessage({ kind, payload:{ rows: cloneRowsForWorker(props.rows), ...payload } });
}

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
const presetNotice = ref('');
const lastPresetKey = ref('');
const pendingAutoRunOp = ref('');

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

async function runPresetTest(op) {
  if (op === 'ttest') {
    await runT();
    return;
  }
  if (op === 'chisq') {
    await runC();
  }
}

watch(
  () => props.preset,
  async (preset) => {
    if (!preset || preset.statPanel !== 'tests' || preset.key === lastPresetKey.value) return;
    lastPresetKey.value = preset.key;
    const op = String(preset.op || '').toLowerCase();
    const args = preset.args || {};
    if (op === 'ttest') {
      if (numCols.value.includes(args.value)) t_value.value = args.value;
      if (catCols.value.includes(args.group)) t_group.value = args.group;
      presetNotice.value = 'Preset ready for t-test.';
    } else if (op === 'chisq') {
      if (catCols.value.includes(args.a)) c_a.value = args.a;
      if (catCols.value.includes(args.b)) c_b.value = args.b;
      presetNotice.value = 'Preset ready for Chi-square.';
    } else {
      presetNotice.value = 'Preset ready for statistical test review.';
    }
    pendingAutoRunOp.value = preset.autoRun ? op : '';
    if (preset.autoRun && !capLoading.value) {
      presetNotice.value = `Running ${op || 'test'} from MCP preset...`;
      await runPresetTest(op);
      pendingAutoRunOp.value = '';
    }
  },
  { deep: true }
);

watch(
  () => capLoading.value,
  async (loadingNow) => {
    if (loadingNow || !pendingAutoRunOp.value) return;
    presetNotice.value = `Running ${pendingAutoRunOp.value} from MCP preset...`;
    const op = pendingAutoRunOp.value;
    pendingAutoRunOp.value = '';
    await runPresetTest(op);
  }
);

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

function openResultChart() {
  const op = result.value?.op;
  if (op === 'ttest') {
    const t = result.value?.tables?.find((x) => x?.name === 'group_summary');
    if (!t?.rows?.length) return;
    const groupIdx = t.columns.indexOf('group');
    const meanIdx = t.columns.indexOf('mean');
    if (groupIdx < 0 || meanIdx < 0) return;
    const chartRows = t.rows.map((r) => ({
      group: r[groupIdx],
      mean: Number(r[meanIdx]),
    }));
    emit('openChart', {
      rows: chartRows,
      columns: ['group', 'mean'],
      spec: {
        type: 'bar',
        x: 'group',
        y: 'mean',
        options: { title: 't-test Group Mean', xLabel: 'Group', yLabel: 'Mean', agg: 'mean' },
      },
    });
    return;
  }

  if (op === 'chisq') {
    const t = result.value?.tables?.find((x) => x?.name === 'contingency_table');
    if (!t?.rows?.length || t.columns.length < 2) return;
    const rowKey = t.columns[0];
    const colKeys = t.columns.slice(1);

    const heatRows = [];
    t.rows.forEach((r) => {
      const rowLabel = r[0];
      for (let i = 0; i < colKeys.length; i += 1) {
        heatRows.push({
          row: rowLabel,
          col: colKeys[i],
          count: Number(r[i + 1]) || 0,
        });
      }
    });

    emit('openChart', {
      rows: heatRows,
      columns: ['row', 'col', 'count'],
      spec: {
        type: 'heatmap',
        x: 'col',
        y: 'row',
        hue: 'count',
        options: {
          title: `Chi-square Contingency Heatmap (${rowKey} x columns)`,
          xLabel: 'Column category',
          yLabel: 'Row category',
          bins: 30,
        },
      },
    });
  }
}

</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <h3 class="font-semibold">Statistical Tests</h3>
    <div v-if="capLoading" class="text-xs text-gray-500">Checking statistical package availability...</div>
    <div v-else-if="!scipyReady" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
      scipy is not installed on the server. t-test and Chi-square buttons are disabled.
    </div>
    <div v-if="presetNotice" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
      {{ presetNotice }}
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
    <div>
      <button @click="openResultChart" :disabled="!result || loading">Open result chart</button>
    </div>

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
      <div v-if="effectBadges.length" class="effect-badges mb-2">
        <span
          v-for="b in effectBadges"
          :key="b.key"
          class="effect-badge"
          :class="effectBadgeClass(b.level)"
        >
          {{ b.label }} {{ b.value }} ({{ b.level }})
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
.effect-badges { display:flex; flex-wrap:wrap; gap:6px; }
.effect-badge { border-radius:999px; padding:4px 8px; font-size:11px; border:1px solid; }
.badge-negligible { background:#f3f4f6; border-color:#d1d5db; color:#374151; }
.badge-small { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
.badge-medium { background:#fff7ed; border-color:#fdba74; color:#9a3412; }
.badge-large { background:#fef2f2; border-color:#fca5a5; color:#991b1b; }
</style>

