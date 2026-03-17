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

const chartCategories = [
  { id: 'comparison', label: 'Comparison' },
  { id: 'trend', label: 'Change over time' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'composition', label: 'Composition / Flow' },
];

const chartCatalog = [
  { type: 'bar', label: 'Bar', category: 'comparison' },
  { type: 'line', label: 'Line', category: 'trend' },
  { type: 'area', label: 'Area', category: 'trend' },
  { type: 'scatter', label: 'Scatter', category: 'relationship' },
  { type: 'bubble', label: 'Bubble', category: 'relationship' },
  { type: 'histogram', label: 'Histogram', category: 'distribution' },
  { type: 'box', label: 'Boxplot', category: 'distribution' },
  { type: 'violin', label: 'Violin', category: 'distribution' },
  { type: 'heatmap', label: 'Heatmap', category: 'relationship' },
  { type: 'pie', label: 'Pie', category: 'composition' },
  { type: 'donut', label: 'Donut', category: 'composition' },
  { type: 'treemap', label: 'Treemap', category: 'composition' },
  { type: 'funnel', label: 'Funnel', category: 'composition' },
  { type: 'waterfall', label: 'Waterfall', category: 'comparison' },
  { type: 'radar', label: 'Radar', category: 'comparison' },
  { type: 'sankey', label: 'Sankey', category: 'composition' },
];

const aggChartTypes = new Set(['bar', 'pie', 'donut', 'funnel', 'waterfall']);
const serverAggSupportedTypes = new Set(['bar', 'histogram', 'box', 'violin', 'heatmap', 'line']);

const category = ref('comparison');
const type = ref('bar');
const x = ref('');
const y = ref('');
const hue = ref('');
const size = ref('');
const defaultOptions = {
  title: '',
  xLabel: '',
  yLabel: '',
  resample: '',
  palette: 'default',
  sortCategory: 'none',
  tooltip: { showX: true, showY: true, showCat: true },
  bins: 30,
  agg: 'count',
  stackedArea: true,
};
function normalizeOptions(next) {
  return {
    ...defaultOptions,
    ...(next || {}),
    tooltip: { ...(defaultOptions.tooltip || {}), ...((next || {}).tooltip || {}) },
  };
}
const options = ref(normalizeOptions());

const chartTypesByCategory = computed(() =>
  chartCatalog.filter((m) => m.category === category.value)
);
const selectedChartMeta = computed(() =>
  chartCatalog.find((m) => m.type === type.value) || chartCatalog[0]
);
const typeGuide = computed(() => {
  const map = {
    comparison: 'Compare categories or stages.',
    trend: 'Track changes over time.',
    distribution: 'Understand spread and outliers.',
    relationship: 'Inspect relationships between variables.',
    composition: 'Show proportion, hierarchy, or flow.',
  };
  return map[selectedChartMeta.value?.category] || '';
});
const canUseServerAgg = computed(() => serverAggSupportedTypes.has(type.value));
const requiredFieldMessage = computed(() => {
  const requiredByType = {
    bar: ['x'],
    line: ['x', 'y'],
    area: ['x', 'y'],
    scatter: ['x', 'y'],
    bubble: ['x', 'y'],
    histogram: ['x'],
    box: ['y'],
    violin: ['y'],
    heatmap: ['x', 'y'],
    pie: ['x'],
    donut: ['x'],
    treemap: ['x'],
    funnel: ['x'],
    waterfall: ['x'],
    radar: ['x', 'y'],
    sankey: ['x', 'y'],
  };

  const required = requiredByType[type.value] || [];
  const missing = required.filter((f) => {
    if (f === 'x') return !x.value;
    if (f === 'y') return !y.value;
    return false;
  });

  if (['bar', 'pie', 'donut', 'funnel', 'waterfall'].includes(type.value) && options.value?.agg !== 'count' && !y.value) {
    missing.push('y');
  }
  if (!missing.length) return '';
  return `Missing required field(s): ${Array.from(new Set(missing)).join(', ')}`;
});

const spec = computed(() => ({
  type: type.value,
  x: x.value || undefined,
  y: y.value || undefined,
  hue: hue.value || undefined,
  size: size.value || undefined,
  options: options.value,
}));

const effectiveRows = computed(() => (props.overrideRows?.length ? props.overrideRows : props.rows));
const effectiveCols = computed(() => (props.overrideColumns?.length ? props.overrideColumns : props.columns));

const numCols = computed(() =>
  effectiveCols.value.filter((c) => effectiveRows.value.some((r) => Number.isFinite(Number(r[c]))))
);
const catCols = computed(() => effectiveCols.value.filter((c) => !numCols.value.includes(c)));

watch(category, (next) => {
  const allowed = chartCatalog.filter((m) => m.category === next);
  if (!allowed.some((m) => m.type === type.value)) {
    type.value = allowed[0]?.type || 'bar';
  }
});

watch(type, (next) => {
  const meta = chartCatalog.find((m) => m.type === next);
  if (meta && category.value !== meta.category) category.value = meta.category;
  if (!canUseServerAgg.value) useServerAgg.value = false;
  if (next !== 'bubble') size.value = '';
});

watch(
  () => [effectiveCols.value, effectiveRows.value],
  () => {
    if (!x.value && catCols.value.length) x.value = catCols.value[0];
    if (!y.value && numCols.value.length) y.value = numCols.value[0];
    if (type.value === 'bubble' && !size.value && numCols.value.length) {
      size.value = numCols.value[Math.min(2, numCols.value.length - 1)];
    }
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
    size.value = p.size || p.options?.sizeCol || '';
    options.value = normalizeOptions(p.options);
  },
  { immediate: true, deep: true }
);

const useServer = ref(false);
const useServerAgg = ref(false);
const serverFig = ref('');
const serverFigJson = ref('');
const graphError = ref('');
const saveFormat = ref('png');

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
  size.value = doc.spec.size || doc.spec.options?.sizeCol || '';
  options.value = normalizeOptions(doc.spec.options);
}

async function remove() {
  const id = prompt('Delete chart ID');
  if (!id) return;
  await deleteChart(id.trim());
  await refreshSaved();
}

const canvasRef = ref(null);
function fileSafeName(raw) {
  return String(raw || 'chart')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}
function download(format) {
  const fmt = format || saveFormat.value || 'png';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = fileSafeName(options.value.title || type.value || 'chart');
  canvasRef.value?.toImage(fmt, `${base}-${stamp}`);
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
  if (p.size !== undefined) size.value = p.size || '';
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
    graphError.value = '';
    if (!useServer.value) {
      serverFig.value = '';
      return;
    }
    if (!effectiveRows.value?.length) return;
    if (requiredFieldMessage.value) {
      serverFig.value = '';
      graphError.value = requiredFieldMessage.value;
      return;
    }

    try {
      const payload = await prepareChart(spec.value, effectiveRows.value);
      serverFig.value = payload?.fig_json || payload?.data?.fig_json || '';
    } catch (e) {
      console.error(e);
      serverFig.value = '';
      graphError.value = e?.message || 'Failed to prepare chart on backend.';
    }
  },
  { deep: true }
);

watch(
  [useServerAgg, spec, () => effectiveRows.value],
  async () => {
    graphError.value = '';
    if (!useServerAgg.value) {
      serverFigJson.value = '';
      return;
    }
    if (!effectiveRows.value?.length) return;
    if (requiredFieldMessage.value) {
      serverFigJson.value = '';
      graphError.value = requiredFieldMessage.value;
      return;
    }
    if (type.value === 'line' && !options.value?.resample) {
      serverFigJson.value = '';
      graphError.value = 'Line + server aggregation requires a resample interval.';
      return;
    }

    try {
      const payload = await aggregateChart(spec.value, effectiveRows.value);
      const aggResult = payload?.data?.result || payload?.result;
      serverFigJson.value = figFromAgg(aggResult, spec.value);
    } catch (e) {
      console.error(e);
      serverFigJson.value = '';
      graphError.value = e?.message || 'Failed to aggregate chart on backend.';
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
      <select v-model="category">
        <option v-for="c in chartCategories" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <select v-model="type">
        <option v-for="m in chartTypesByCategory" :key="m.type" :value="m.type">{{ m.label }}</option>
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
      <select v-if="type === 'bubble'" v-model="size">
        <option value="">size</option>
        <option v-for="c in numCols" :key="c">{{ c }}</option>
      </select>

      <input class="w-48" placeholder="Title" v-model="options.title" />
      <input class="w-40" placeholder="X-axis title" v-model="options.xLabel" />
      <input class="w-40" placeholder="Y-axis title" v-model="options.yLabel" />
      <select v-if="type === 'line'" v-model="options.resample">
        <option value="">resample: none</option>
        <option value="D">day</option>
        <option value="W">week</option>
        <option value="M">month</option>
      </select>
      <select v-model="options.palette">
        <option value="default">palette: default</option>
        <option value="pastel">pastel</option>
        <option value="vivid">vivid</option>
        <option value="mono">mono</option>
      </select>
      <select v-if="aggChartTypes.has(type)" v-model="options.agg">
        <option value="count">count</option>
        <option value="sum">sum</option>
        <option value="mean">mean</option>
      </select>
      <input v-if="type === 'histogram'" type="number" class="w-24" v-model.number="options.bins" min="5" max="200" />
      <label v-if="type === 'area'" class="text-sm flex items-center gap-1">
        <input type="checkbox" v-model="options.stackedArea" />
        Stacked area
      </label>

      <div class="flex items-center gap-3">
        <label class="text-sm flex items-center gap-1">
          <input type="checkbox" v-model="useServer" /> Use Python backend
        </label>
        <label class="text-sm flex items-center gap-1">
          <input type="checkbox" v-model="useServerAgg" :disabled="!canUseServerAgg" /> Use server aggregation
        </label>

        <button @click="save">Save (DB)</button>
        <button @click="open">Open (DB)</button>
        <button @click="remove">Delete (DB)</button>

        <div class="ml-auto flex gap-2">
          <select v-model="saveFormat">
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WEBP</option>
            <option value="svg">SVG</option>
          </select>
          <button @click="download()">Save Image</button>
        </div>
      </div>
    </div>
    <div class="text-xs text-gray-500">
      {{ typeGuide }}
      <span v-if="!canUseServerAgg">Server aggregation is disabled for this chart type.</span>
    </div>
    <div v-if="graphError" class="text-xs text-red-600">{{ graphError }}</div>

    <ChartCanvas
      ref="canvasRef"
      v-if="useServer ? !!serverFig : (useServerAgg ? !!serverFigJson : !requiredFieldMessage)"
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
