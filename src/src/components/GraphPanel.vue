<script setup>
import { computed, ref, watch } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import RecommendCharts from './RecommendCharts.vue';
import { inferColumnTypes } from '@/utils/colTypes';
import { prepareChart, aggregateChart } from '@/services/vizApi';
import { saveChart, listCharts, loadChart, deleteChart } from '@/stores/useCharts';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  overrideRows: { type: Array, default: null },
  overrideColumns: { type: Array, default: null },
  presetSpec: { type: Object, default: null },
});

const emit = defineEmits(['applyFilter', 'focusRow', 'closeOverride']);

const type = ref('bar');
const x = ref('');
const y = ref('');
const hue = ref('');
const options = ref({
  title: '',
  xLabel: '',
  yLabel: '',
  palette: 'default',
  sortCategory: 'none',
  tooltip: { showX: true, showY: true, showCat: true },
  bins: 30,
  agg: 'count',
});

const spec = computed(() => ({
  type: type.value,
  x: x.value || undefined,
  y: y.value || undefined,
  hue: hue.value || undefined,
  options: options.value,
}));

const effectiveRows = computed(() => (props.overrideRows?.length ? props.overrideRows : props.rows));
const effectiveCols = computed(() => (props.overrideColumns?.length ? props.overrideColumns : props.columns));

const numCols = computed(() =>
  effectiveCols.value.filter((c) => effectiveRows.value.some((r) => Number.isFinite(Number(r[c]))))
);
const catCols = computed(() => effectiveCols.value.filter((c) => !numCols.value.includes(c)));

watch(
  () => [effectiveCols.value, effectiveRows.value],
  () => {
    if (!x.value && catCols.value.length) x.value = catCols.value[0];
    if (!y.value && numCols.value.length) y.value = numCols.value[0];
  },
  { immediate: true }
);

const colTypes = ref({});

watch(
  () => [effectiveRows.value, effectiveCols.value],
  () => {
    if (!effectiveRows.value?.length || !effectiveCols.value?.length) {
      colTypes.value = {};
      return;
    }

    colTypes.value = inferColumnTypes(effectiveRows.value, effectiveCols.value);

    if (!x.value) {
      const dates = effectiveCols.value.filter((c) => colTypes.value[c] === 'date');
      const cats = effectiveCols.value.filter((c) => colTypes.value[c] === 'category');
      x.value = dates[0] || cats[0] || effectiveCols.value[0];
    }
    if (!y.value) {
      const nums = effectiveCols.value.filter((c) => colTypes.value[c] === 'number');
      y.value = nums[0] || '';
    }
  },
  { immediate: true }
);

watch(
  () => props.presetSpec,
  (p) => {
    if (!p) return;
    type.value = p.type;
    x.value = p.x;
    y.value = p.y;
    hue.value = p.hue || '';
    options.value = p.options || {};
  },
  { immediate: true, deep: true }
);

const useServer = ref(false);
const useServerAgg = ref(false);
const serverFig = ref('');
const serverFigJson = ref('');

const saved = ref([]);

async function refreshSaved() {
  saved.value = await listCharts();
}

async function save() {
  const name = prompt('Chart name', options.value.title || 'chart');
  if (!name) return;
  await saveChart(name, spec.value);
  await refreshSaved();
}

async function open() {
  if (!saved.value.length) await refreshSaved();
  const id = prompt('Chart ID:\n' + saved.value.map((d) => `${d.id} : ${d.name}`).join('\n'));
  if (!id) return;

  const doc = await loadChart(id.trim());
  type.value = doc.spec.type;
  x.value = doc.spec.x || '';
  y.value = doc.spec.y || '';
  hue.value = doc.spec.hue || '';
  options.value = doc.spec.options || {};
}

async function remove() {
  const id = prompt('Delete chart ID');
  if (!id) return;
  await deleteChart(id.trim());
  await refreshSaved();
}

const canvasRef = ref(null);
function download(format) {
  canvasRef.value?.toImage(format, options.value.title || 'chart');
}

function onClickFilter(p) {
  emit('applyFilter', p);
}

function onFocusRow(p) {
  emit('focusRow', p);
}

function onPickRecommend(p) {
  type.value = p.type;
  if (p.x !== undefined) x.value = p.x || '';
  if (p.y !== undefined) y.value = p.y || '';
  if (p.hue !== undefined) hue.value = p.hue || '';
}

function figFromAgg(result, s) {
  const kind = s.type;
  const layout = { title: s?.options?.title || '' };
  let data = [];

  if (kind === 'bar') {
    if (result.series) {
      const cats = new Set();
      Object.values(result.series).forEach((series) => series.x.forEach((c) => cats.add(c)));
      const ordered = Array.from(cats);

      data = Object.entries(result.series).map(([name, series]) => ({
        type: 'bar',
        name,
        x: ordered,
        y: ordered.map((c) => {
          const i = series.x.indexOf(c);
          return i >= 0 ? series.y[i] : 0;
        }),
      }));

      layout.barmode = 'group';
    } else {
      data = [{ type: 'bar', x: result.x, y: result.y }];
    }
  } else if (kind === 'histogram') {
    const bins = result.bins || [];
    const counts = result.counts || [];
    const centers = [];
    for (let i = 0; i < counts.length; i += 1) centers.push((bins[i] + bins[i + 1]) / 2);
    data = [{ type: 'bar', x: centers, y: counts }];
  } else if (kind === 'box' || kind === 'violin') {
    const q = result.quantiles || {};
    data = Object.keys(q).map((name) => ({
      type: 'box',
      name,
      q1: q[name].q1,
      median: q[name].median,
      q3: q[name].q3,
      y: [q[name].q1, q[name].median, q[name].q3],
      boxpoints: false,
    }));
  } else if (kind === 'heatmap') {
    data = [{ type: 'heatmap', x: result.xBins, y: result.yBins, z: result.zCounts }];
  } else if (kind === 'line' && s?.options?.resample) {
    data = [{ type: 'scatter', mode: 'lines+markers', x: result.x, y: result.y }];
  }

  return JSON.stringify({ data, layout });
}

watch(
  [useServer, spec, () => effectiveRows.value],
  async () => {
    if (!useServer.value) {
      serverFig.value = '';
      return;
    }
    if (!effectiveRows.value?.length) return;

    try {
      const payload = await prepareChart(spec.value, effectiveRows.value);
      serverFig.value = payload?.fig_json || payload?.data?.fig_json || '';
    } catch (e) {
      console.error(e);
      serverFig.value = '';
    }
  },
  { deep: true }
);

watch(
  [useServerAgg, spec, () => effectiveRows.value],
  async () => {
    if (!useServerAgg.value) {
      serverFigJson.value = '';
      return;
    }
    if (!effectiveRows.value?.length) return;

    try {
      const payload = await aggregateChart(spec.value, effectiveRows.value);
      serverFigJson.value = figFromAgg(payload?.result, spec.value);
    } catch (e) {
      console.error(e);
      serverFigJson.value = '';
    }
  },
  { deep: true }
);
</script>

<template>
  <button v-if="overrideRows?.length" @click="$emit('closeOverride')">Back to base data</button>

  <div class="p-3 border rounded space-y-3">
    <RecommendCharts
      v-if="effectiveRows.length && effectiveCols.length"
      :columns="effectiveCols"
      :colTypes="colTypes"
      @pick="onPickRecommend"
    />

    <div class="flex flex-wrap items-center gap-2">
      <select v-model="type">
        <option value="bar">Bar</option>
        <option value="line">Line</option>
        <option value="scatter">Scatter</option>
        <option value="histogram">Histogram</option>
        <option value="box">Boxplot</option>
        <option value="violin">Violin</option>
        <option value="treemap">Treemap</option>
        <option value="heatmap">Heatmap</option>
        <option value="radar">Radar</option>
        <option value="sankey">Sankey</option>
      </select>

      <select v-model="x">
        <option value="">x</option>
        <option v-for="c in effectiveCols" :key="c">{{ c }}</option>
      </select>
      <select v-model="y">
        <option value="">y</option>
        <option v-for="c in effectiveCols" :key="c">{{ c }}</option>
      </select>
      <select v-model="hue">
        <option value="">hue</option>
        <option v-for="c in effectiveCols" :key="c">{{ c }}</option>
      </select>

      <input class="w-48" placeholder="Title" v-model="options.title" />
      <select v-model="options.palette">
        <option value="default">palette: default</option>
        <option value="pastel">pastel</option>
        <option value="vivid">vivid</option>
        <option value="mono">mono</option>
      </select>
      <select v-if="type === 'bar'" v-model="options.agg">
        <option value="count">count</option>
        <option value="sum">sum</option>
        <option value="mean">mean</option>
      </select>
      <input v-if="type === 'histogram'" type="number" class="w-24" v-model.number="options.bins" min="5" max="200" />

      <div class="flex items-center gap-3">
        <label class="text-sm flex items-center gap-1">
          <input type="checkbox" v-model="useServer" /> Use Python backend
        </label>
        <label class="text-sm flex items-center gap-1">
          <input type="checkbox" v-model="useServerAgg" /> Use server aggregation
        </label>

        <button @click="save">Save (DB)</button>
        <button @click="open">Open (DB)</button>
        <button @click="remove">Delete (DB)</button>

        <div class="ml-auto flex gap-2">
          <button @click="download('png')">PNG</button>
          <button @click="download('svg')">SVG</button>
        </div>
      </div>
    </div>

    <ChartCanvas
      ref="canvasRef"
      v-if="useServer ? !!serverFig : (useServerAgg ? !!serverFigJson : true)"
      :rows="useServer || useServerAgg ? [] : effectiveRows"
      :columns="useServer || useServerAgg ? [] : effectiveCols"
      :spec="useServer || useServerAgg ? undefined : spec"
      :fig-json="useServer ? serverFig : (useServerAgg ? serverFigJson : undefined)"
      @clickFilter="onClickFilter"
      @focusRow="onFocusRow"
    />

    <div class="text-xs text-gray-500">* Bar/heatmap/treemap clicks apply filters. Scatter point click focuses a row.</div>
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
</style>