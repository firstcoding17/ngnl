<script setup>
import { computed, ref, watch } from 'vue';
import { inferColumnTypes } from '@/utils/colTypes';
import { effectBadgesFromStats, effectBadgeClass } from '@/utils/effectSize';
import {
  runStatAnova,
  runStatNormality,
  runStatMeanCI,
  runStatMannWhitney,
  runStatWilcoxon,
  runStatKruskal,
  runStatTukey,
  runStatPairwiseAdjusted,
} from '@/services/statApi';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  preset: { type: Object, default: null },
});

const emit = defineEmits(['openChart']);

const types = computed(() => inferColumnTypes(props.rows, props.columns));
const numCols = computed(() => props.columns.filter((c) => types.value[c] === 'number'));
const catCols = computed(() => props.columns.filter((c) => types.value[c] === 'category'));

const anovaValue = ref('');
const anovaGroup = ref('');
const normalityCol = ref('');
const ciCol = ref('');
const ciLevel = ref(0.95);
const mwValue = ref('');
const mwGroup = ref('');
const wilcoxonA = ref('');
const wilcoxonB = ref('');
const kruskalValue = ref('');
const kruskalGroup = ref('');
const posthocValue = ref('');
const posthocGroup = ref('');
const posthocAlpha = ref(0.05);
const pAdjustMethod = ref('holm');

const loading = ref('');
const error = ref('');
const anovaResult = ref(null);
const normalityResult = ref(null);
const ciResult = ref(null);
const mwResult = ref(null);
const wilcoxonResult = ref(null);
const kruskalResult = ref(null);
const tukeyResult = ref(null);
const pairwiseAdjResult = ref(null);
const expandedSection = ref('anova');
const presetNotice = ref('');
const lastPresetKey = ref('');

function clearError() {
  error.value = '';
}

async function runAnova() {
  clearError();
  anovaResult.value = null;
  if (!anovaValue.value || !anovaGroup.value) return;
  loading.value = 'anova';
  try {
    anovaResult.value = await runStatAnova(props.rows, anovaValue.value, anovaGroup.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runNormality() {
  clearError();
  normalityResult.value = null;
  if (!normalityCol.value) return;
  loading.value = 'normality';
  try {
    normalityResult.value = await runStatNormality(props.rows, normalityCol.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runMeanCI() {
  clearError();
  ciResult.value = null;
  if (!ciCol.value) return;
  loading.value = 'ci';
  try {
    ciResult.value = await runStatMeanCI(props.rows, ciCol.value, ciLevel.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runMannWhitney() {
  clearError();
  mwResult.value = null;
  if (!mwValue.value || !mwGroup.value) return;
  loading.value = 'mannwhitney';
  try {
    mwResult.value = await runStatMannWhitney(props.rows, mwValue.value, mwGroup.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runWilcoxon() {
  clearError();
  wilcoxonResult.value = null;
  if (!wilcoxonA.value || !wilcoxonB.value || wilcoxonA.value === wilcoxonB.value) return;
  loading.value = 'wilcoxon';
  try {
    wilcoxonResult.value = await runStatWilcoxon(props.rows, wilcoxonA.value, wilcoxonB.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runKruskal() {
  clearError();
  kruskalResult.value = null;
  if (!kruskalValue.value || !kruskalGroup.value) return;
  loading.value = 'kruskal';
  try {
    kruskalResult.value = await runStatKruskal(props.rows, kruskalValue.value, kruskalGroup.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runTukey() {
  clearError();
  tukeyResult.value = null;
  if (!posthocValue.value || !posthocGroup.value) return;
  loading.value = 'tukey';
  try {
    tukeyResult.value = await runStatTukey(props.rows, posthocValue.value, posthocGroup.value, posthocAlpha.value);
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

async function runPairwiseAdjusted() {
  clearError();
  pairwiseAdjResult.value = null;
  if (!posthocValue.value || !posthocGroup.value) return;
  loading.value = 'pairwise_adjusted';
  try {
    pairwiseAdjResult.value = await runStatPairwiseAdjusted(
      props.rows,
      posthocValue.value,
      posthocGroup.value,
      pAdjustMethod.value,
    );
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = '';
  }
}

function openAnovaChart() {
  const t = anovaResult.value?.tables?.find((x) => x?.name === 'group_summary');
  if (!t?.rows?.length) return;
  const gIdx = t.columns.indexOf('group');
  const mIdx = t.columns.indexOf('mean');
  if (gIdx < 0 || mIdx < 0) return;
  const rows = t.rows.map((r) => ({ group: r[gIdx], mean: Number(r[mIdx]) }));
  emit('openChart', {
    rows,
    columns: ['group', 'mean'],
    spec: {
      type: 'bar',
      x: 'group',
      y: 'mean',
      options: { title: 'ANOVA Group Means', xLabel: 'Group', yLabel: 'Mean', agg: 'mean' },
    },
  });
}

function openNormalityQQ() {
  const fig = normalityResult.value?.figures?.find((f) => f?.type === 'qq_plot');
  if (!fig?.x?.length || !fig?.y?.length) return;
  const rows = fig.x.map((xv, i) => ({
    theoretical_quantile: Number(xv),
    observed_quantile: Number(fig.y[i]),
  }));
  emit('openChart', {
    rows,
    columns: ['theoretical_quantile', 'observed_quantile'],
    spec: {
      type: 'scatter',
      x: 'theoretical_quantile',
      y: 'observed_quantile',
      options: { title: 'Normality Q-Q Plot', xLabel: 'Theoretical quantile', yLabel: 'Observed quantile' },
    },
  });
}

function openNormalityHist() {
  const fig = normalityResult.value?.figures?.find((f) => f?.type === 'histogram');
  if (!fig?.bins?.length || !fig?.counts?.length) return;
  const rows = [];
  for (let i = 0; i < fig.counts.length; i += 1) {
    rows.push({
      bin_center: (Number(fig.bins[i]) + Number(fig.bins[i + 1])) / 2,
      count: Number(fig.counts[i]),
    });
  }
  emit('openChart', {
    rows,
    columns: ['bin_center', 'count'],
    spec: {
      type: 'bar',
      x: 'bin_center',
      y: 'count',
      options: { title: 'Normality Histogram', xLabel: 'Bin center', yLabel: 'Count', agg: 'sum' },
    },
  });
}

function openCIChart() {
  const stats = ciResult.value?.summary?.stats || {};
  if (stats.mean == null || stats.ci_low == null || stats.ci_high == null) return;
  const rows = [
    { metric: 'ci_low', value: Number(stats.ci_low) },
    { metric: 'mean', value: Number(stats.mean) },
    { metric: 'ci_high', value: Number(stats.ci_high) },
  ];
  emit('openChart', {
    rows,
    columns: ['metric', 'value'],
    spec: {
      type: 'bar',
      x: 'metric',
      y: 'value',
      options: { title: 'Mean Confidence Interval', xLabel: 'Metric', yLabel: 'Value', agg: 'mean' },
    },
  });
}

function openGroupMedianChart(testResult, title) {
  const t = testResult?.tables?.find((x) => x?.name === 'group_summary');
  if (!t?.rows?.length) return;
  const gIdx = t.columns.indexOf('group');
  const mIdx = t.columns.indexOf('median');
  if (gIdx < 0 || mIdx < 0) return;
  const rows = t.rows.map((r) => ({ group: r[gIdx], median: Number(r[mIdx]) }));
  emit('openChart', {
    rows,
    columns: ['group', 'median'],
    spec: {
      type: 'bar',
      x: 'group',
      y: 'median',
      options: { title, xLabel: 'Group', yLabel: 'Median', agg: 'mean' },
    },
  });
}

function openMannWhitneyChart() {
  openGroupMedianChart(mwResult.value, 'Mann-Whitney Group Medians');
}

function openKruskalChart() {
  openGroupMedianChart(kruskalResult.value, 'Kruskal Group Medians');
}

function openWilcoxonChart() {
  const fig = wilcoxonResult.value?.figures?.find((f) => f?.type === 'paired_points');
  if (!fig?.x?.length || !fig?.y?.length) return;
  const rows = fig.x.map((xv, i) => ({ a: Number(xv), b: Number(fig.y[i]) }));
  emit('openChart', {
    rows,
    columns: ['a', 'b'],
    spec: {
      type: 'scatter',
      x: 'a',
      y: 'b',
      options: { title: 'Wilcoxon Paired Points', xLabel: wilcoxonA.value || 'A', yLabel: wilcoxonB.value || 'B' },
    },
  });
}

function openPosthocChart(resultObj, titlePrefix = 'Post-hoc') {
  const fig = resultObj?.figures?.find((f) => f?.type === 'posthoc_pairs' || f?.type === 'pairwise_adjusted_pairs');
  if (!fig?.x?.length || !fig?.y?.length) return;
  const rows = fig.x.map((label, i) => ({
    pair: String(label),
    abs_mean_diff: Number(fig.y[i]),
    p_adj: Number((fig.p || [])[i] ?? 1),
    significant: !!((fig.reject || [])[i]),
  }));
  emit('openChart', {
    rows,
    columns: ['pair', 'abs_mean_diff', 'p_adj', 'significant'],
    spec: {
      type: 'bar',
      x: 'pair',
      y: 'abs_mean_diff',
      options: { title: `${titlePrefix} Pair Differences`, xLabel: 'Pair', yLabel: '|Mean diff|', agg: 'mean' },
    },
  });
}

function openTukeyChart() {
  openPosthocChart(tukeyResult.value, 'Tukey HSD');
}

function openPairwiseAdjustedChart() {
  openPosthocChart(pairwiseAdjResult.value, `Adjusted (${pAdjustMethod.value})`);
}

function badgesForResult(resultObj) {
  return effectBadgesFromStats(resultObj?.summary?.stats || {});
}

async function runAdvancedPreset(op) {
  if (op === 'anova') return runAnova();
  if (op === 'normality') return runNormality();
  if (op === 'ci_mean') return runMeanCI();
  if (op === 'mannwhitney') return runMannWhitney();
  if (op === 'wilcoxon') return runWilcoxon();
  if (op === 'kruskal') return runKruskal();
  if (op === 'tukey') return runTukey();
  if (op === 'pairwise_adjusted') return runPairwiseAdjusted();
  return null;
}

watch(
  () => props.preset,
  async (preset) => {
    if (!preset || preset.statPanel !== 'advanced' || preset.key === lastPresetKey.value) return;
    lastPresetKey.value = preset.key;
    const op = String(preset.op || '').toLowerCase();
    const args = preset.args || {};
    if (op === 'anova') {
      if (numCols.value.includes(args.value)) anovaValue.value = args.value;
      if (catCols.value.includes(args.group)) anovaGroup.value = args.group;
      expandedSection.value = 'anova';
      presetNotice.value = 'Preset ready for ANOVA.';
    } else if (op === 'normality') {
      if (numCols.value.includes(args.column)) normalityCol.value = args.column;
      expandedSection.value = 'normality';
      presetNotice.value = 'Preset ready for normality check.';
    } else if (op === 'ci_mean') {
      if (numCols.value.includes(args.column)) ciCol.value = args.column;
      if (Number.isFinite(Number(args.confidence))) ciLevel.value = Number(args.confidence);
      expandedSection.value = 'ci';
      presetNotice.value = 'Preset ready for mean confidence interval.';
    } else if (op === 'mannwhitney') {
      if (numCols.value.includes(args.value)) mwValue.value = args.value;
      if (catCols.value.includes(args.group)) mwGroup.value = args.group;
      expandedSection.value = 'mannwhitney';
      presetNotice.value = 'Preset ready for Mann-Whitney.';
    } else if (op === 'wilcoxon') {
      if (numCols.value.includes(args.a)) wilcoxonA.value = args.a;
      if (numCols.value.includes(args.b)) wilcoxonB.value = args.b;
      expandedSection.value = 'wilcoxon';
      presetNotice.value = 'Preset ready for Wilcoxon paired test.';
    } else if (op === 'kruskal') {
      if (numCols.value.includes(args.value)) kruskalValue.value = args.value;
      if (catCols.value.includes(args.group)) kruskalGroup.value = args.group;
      expandedSection.value = 'kruskal';
      presetNotice.value = 'Preset ready for Kruskal-Wallis.';
    } else if (op === 'tukey') {
      if (numCols.value.includes(args.value)) posthocValue.value = args.value;
      if (catCols.value.includes(args.group)) posthocGroup.value = args.group;
      if (Number.isFinite(Number(args.alpha))) posthocAlpha.value = Number(args.alpha);
      expandedSection.value = 'posthoc';
      presetNotice.value = 'Preset ready for Tukey HSD.';
    } else if (op === 'pairwise_adjusted') {
      if (numCols.value.includes(args.value)) posthocValue.value = args.value;
      if (catCols.value.includes(args.group)) posthocGroup.value = args.group;
      if (args.pAdjust) pAdjustMethod.value = String(args.pAdjust);
      expandedSection.value = 'posthoc';
      presetNotice.value = 'Preset ready for adjusted pairwise comparison.';
    } else {
      presetNotice.value = 'Preset ready for advanced statistics.';
    }
    if (preset.autoRun) {
      presetNotice.value = `Running ${op || 'advanced stats'} from MCP preset...`;
      await runAdvancedPreset(op);
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="font-semibold">Advanced Statistics</div>
    <div v-if="presetNotice" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
      {{ presetNotice }}
    </div>

    <details :open="expandedSection === 'anova'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">One-way ANOVA</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="anovaValue">
          <option value="">Value (numeric)</option>
          <option v-for="c in numCols" :key="`anova-v-${c}`" :value="c">{{ c }}</option>
        </select>
        <select v-model="anovaGroup">
          <option value="">Group (categorical)</option>
          <option v-for="c in catCols" :key="`anova-g-${c}`" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="runAnova" :disabled="loading || !anovaValue || !anovaGroup">
          {{ loading === 'anova' ? 'Running...' : 'Run ANOVA' }}
        </button>
        <button @click="openAnovaChart" :disabled="!anovaResult">Open mean chart</button>
      </div>
      <div v-if="anovaResult" class="text-xs text-gray-600">{{ anovaResult.summary?.conclusion }}</div>
      <div v-if="badgesForResult(anovaResult).length" class="effect-badges">
        <span v-for="b in badgesForResult(anovaResult)" :key="`anova-${b.key}`" class="effect-badge" :class="effectBadgeClass(b.level)">
          {{ b.label }} {{ b.value }} ({{ b.level }})
        </span>
      </div>
    </details>

    <details :open="expandedSection === 'normality'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">Normality Check</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="normalityCol">
          <option value="">Column (numeric)</option>
          <option v-for="c in numCols" :key="`norm-${c}`" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="runNormality" :disabled="loading || !normalityCol">
          {{ loading === 'normality' ? 'Running...' : 'Run Normality' }}
        </button>
        <button @click="openNormalityQQ" :disabled="!normalityResult">Open QQ chart</button>
        <button @click="openNormalityHist" :disabled="!normalityResult">Open histogram</button>
      </div>
      <div v-if="normalityResult" class="text-xs text-gray-600">{{ normalityResult.summary?.conclusion }}</div>
    </details>

    <details :open="expandedSection === 'ci'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">Mean Confidence Interval</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="ciCol">
          <option value="">Column (numeric)</option>
          <option v-for="c in numCols" :key="`ci-${c}`" :value="c">{{ c }}</option>
        </select>
        <input type="number" min="0.8" max="0.99" step="0.01" v-model.number="ciLevel" />
      </div>
      <div class="flex gap-2">
        <button @click="runMeanCI" :disabled="loading || !ciCol">
          {{ loading === 'ci' ? 'Running...' : 'Run CI' }}
        </button>
        <button @click="openCIChart" :disabled="!ciResult">Open CI chart</button>
      </div>
      <div v-if="ciResult" class="text-xs text-gray-600">{{ ciResult.summary?.conclusion }}</div>
    </details>

    <details :open="expandedSection === 'mannwhitney'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">Mann-Whitney U (Nonparametric 2-group)</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="mwValue">
          <option value="">Value (numeric)</option>
          <option v-for="c in numCols" :key="`mw-v-${c}`" :value="c">{{ c }}</option>
        </select>
        <select v-model="mwGroup">
          <option value="">Group (categorical, 2 levels)</option>
          <option v-for="c in catCols" :key="`mw-g-${c}`" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="runMannWhitney" :disabled="loading || !mwValue || !mwGroup">
          {{ loading === 'mannwhitney' ? 'Running...' : 'Run Mann-Whitney' }}
        </button>
        <button @click="openMannWhitneyChart" :disabled="!mwResult">Open median chart</button>
      </div>
      <div v-if="mwResult" class="text-xs text-gray-600">{{ mwResult.summary?.conclusion }}</div>
      <div v-if="badgesForResult(mwResult).length" class="effect-badges">
        <span v-for="b in badgesForResult(mwResult)" :key="`mw-${b.key}`" class="effect-badge" :class="effectBadgeClass(b.level)">
          {{ b.label }} {{ b.value }} ({{ b.level }})
        </span>
      </div>
    </details>

    <details :open="expandedSection === 'wilcoxon'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">Wilcoxon Signed-Rank (Paired)</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="wilcoxonA">
          <option value="">Paired column A (numeric)</option>
          <option v-for="c in numCols" :key="`w-a-${c}`" :value="c">{{ c }}</option>
        </select>
        <select v-model="wilcoxonB">
          <option value="">Paired column B (numeric)</option>
          <option v-for="c in numCols" :key="`w-b-${c}`" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="runWilcoxon" :disabled="loading || !wilcoxonA || !wilcoxonB || wilcoxonA === wilcoxonB">
          {{ loading === 'wilcoxon' ? 'Running...' : 'Run Wilcoxon' }}
        </button>
        <button @click="openWilcoxonChart" :disabled="!wilcoxonResult">Open paired chart</button>
      </div>
      <div v-if="wilcoxonResult" class="text-xs text-gray-600">{{ wilcoxonResult.summary?.conclusion }}</div>
      <div v-if="badgesForResult(wilcoxonResult).length" class="effect-badges">
        <span v-for="b in badgesForResult(wilcoxonResult)" :key="`w-${b.key}`" class="effect-badge" :class="effectBadgeClass(b.level)">
          {{ b.label }} {{ b.value }} ({{ b.level }})
        </span>
      </div>
    </details>

    <details :open="expandedSection === 'kruskal'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">Kruskal-Wallis (Nonparametric multi-group)</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="kruskalValue">
          <option value="">Value (numeric)</option>
          <option v-for="c in numCols" :key="`k-v-${c}`" :value="c">{{ c }}</option>
        </select>
        <select v-model="kruskalGroup">
          <option value="">Group (categorical)</option>
          <option v-for="c in catCols" :key="`k-g-${c}`" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="runKruskal" :disabled="loading || !kruskalValue || !kruskalGroup">
          {{ loading === 'kruskal' ? 'Running...' : 'Run Kruskal' }}
        </button>
        <button @click="openKruskalChart" :disabled="!kruskalResult">Open median chart</button>
      </div>
      <div v-if="kruskalResult" class="text-xs text-gray-600">{{ kruskalResult.summary?.conclusion }}</div>
      <div v-if="badgesForResult(kruskalResult).length" class="effect-badges">
        <span v-for="b in badgesForResult(kruskalResult)" :key="`k-${b.key}`" class="effect-badge" :class="effectBadgeClass(b.level)">
          {{ b.label }} {{ b.value }} ({{ b.level }})
        </span>
      </div>
    </details>

    <details :open="expandedSection === 'posthoc'" class="border rounded p-2 space-y-2">
      <summary class="font-medium">Post-hoc + Multiple Comparison Correction</summary>
      <div class="grid md:grid-cols-2 gap-2">
        <select v-model="posthocValue">
          <option value="">Value (numeric)</option>
          <option v-for="c in numCols" :key="`ph-v-${c}`" :value="c">{{ c }}</option>
        </select>
        <select v-model="posthocGroup">
          <option value="">Group (categorical)</option>
          <option v-for="c in catCols" :key="`ph-g-${c}`" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="grid md:grid-cols-2 gap-2">
        <input type="number" min="0.01" max="0.2" step="0.01" v-model.number="posthocAlpha" />
        <select v-model="pAdjustMethod">
          <option value="holm">Holm</option>
          <option value="bonferroni">Bonferroni</option>
          <option value="fdr_bh">FDR (Benjamini-Hochberg)</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="runTukey" :disabled="loading || !posthocValue || !posthocGroup">
          {{ loading === 'tukey' ? 'Running...' : 'Run Tukey HSD' }}
        </button>
        <button @click="openTukeyChart" :disabled="!tukeyResult">Open Tukey chart</button>
      </div>
      <div class="flex gap-2">
        <button @click="runPairwiseAdjusted" :disabled="loading || !posthocValue || !posthocGroup">
          {{ loading === 'pairwise_adjusted' ? 'Running...' : 'Run Pairwise (Adjusted)' }}
        </button>
        <button @click="openPairwiseAdjustedChart" :disabled="!pairwiseAdjResult">Open adjusted chart</button>
      </div>
      <div v-if="tukeyResult" class="text-xs text-gray-600">{{ tukeyResult.summary?.conclusion }}</div>
      <div v-if="pairwiseAdjResult" class="text-xs text-gray-600">{{ pairwiseAdjResult.summary?.conclusion }}</div>
    </details>

    <div v-if="error" class="text-sm text-red-600">{{ error }}</div>
  </div>
</template>

<style scoped>
select,
input,
button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.effect-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.effect-badge {
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid;
}
.badge-negligible {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #374151;
}
.badge-small {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.badge-medium {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}
.badge-large {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #991b1b;
}
</style>
