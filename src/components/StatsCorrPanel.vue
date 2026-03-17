<script setup>
import { ref, watch } from 'vue';
import { runStatCorr } from '@/services/statApi';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  preset: { type: Object, default: null },
});

const loading = ref(false);
const result = ref(null);
const err = ref('');
const presetNotice = ref('');
const lastPresetKey = ref('');

const emit = defineEmits(['openHeatmap', 'openChart']);

watch(
  () => props.preset,
  async (preset) => {
    if (!preset || preset.statPanel !== 'corr' || preset.key === lastPresetKey.value) return;
    lastPresetKey.value = preset.key;
    presetNotice.value = preset.title || 'Preset ready for correlation review.';
    if (preset.autoRun) {
      presetNotice.value = preset.title || 'Running correlation from MCP preset...';
      await run();
    }
  },
  { deep: true }
);

async function run(){
  err.value = '';
  loading.value = true;
  try {
    result.value = await runStatCorr(props.rows, { topNPairs: 20 });
  } catch(e) {
    err.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}

function openHeatmap(){
  const fig = result.value?.figures?.[0];
  if (!fig) return;
  emit('openHeatmap', { x: fig.x, y: fig.y, z: fig.z, title: 'Correlation Heatmap' });
}

function openTopPairsChart() {
  const t = result.value?.tables?.find((x) => x?.name === 'top_pairs');
  if (!t?.rows?.length) return;
  const aIdx = t.columns.indexOf('col_a');
  const bIdx = t.columns.indexOf('col_b');
  const corrIdx = t.columns.indexOf('corr');
  if (aIdx < 0 || bIdx < 0 || corrIdx < 0) return;

  const chartRows = t.rows.map((r) => ({
    pair: `${r[aIdx]} ~ ${r[bIdx]}`,
    abs_corr: Math.abs(Number(r[corrIdx])),
  }));

  emit('openChart', {
    rows: chartRows,
    columns: ['pair', 'abs_corr'],
    spec: {
      type: 'bar',
      x: 'pair',
      y: 'abs_corr',
      options: { title: 'Top Correlation Pairs (|r|)', xLabel: 'Pair', yLabel: '|r|', agg: 'mean' },
    },
  });
}
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div class="font-semibold">Correlation</div>
      <button class="ml-auto" @click="run" :disabled="loading || !rows.length">
        {{ loading ? 'Running...' : 'Run correlation' }}
      </button>
      <button v-if="result?.figures?.length" @click="openHeatmap">Open heatmap</button>
      <button v-if="result?.tables?.length" @click="openTopPairsChart">Open top-pairs chart</button>
    </div>

    <div v-if="err" class="text-sm text-red-600">{{ err }}</div>
    <div v-if="presetNotice" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
      {{ presetNotice }}
    </div>

    <div v-if="result?.warnings?.length" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
      <div v-for="w in result.warnings" :key="w">- {{ w }}</div>
    </div>

    <div v-if="result?.tables?.length" class="space-y-3">
      <div v-for="t in result.tables" :key="t.name" class="border rounded p-2">
        <div class="text-sm font-semibold mb-2">{{ t.name }}</div>
        <div class="overflow-auto">
          <table class="min-w-full text-xs">
            <thead>
              <tr>
                <th v-for="c in t.columns" :key="c" class="text-left p-1 border-b">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r,idx) in t.rows" :key="idx">
                <td v-for="(cell,j) in r" :key="j" class="p-1 border-b">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="result" class="text-xs text-gray-600">{{ result.summary?.conclusion }}</div>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
button:disabled { opacity:.6; cursor:not-allowed; }
</style>

