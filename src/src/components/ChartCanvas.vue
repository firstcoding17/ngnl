<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import Plotly from 'plotly.js-dist-min';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  spec: { type: Object, default: null },
  figJson: { type: String, default: '' },
});

const emit = defineEmits(['clickFilter', 'focusRow']);

const el = ref(null);
let plot = null;

const palettes = {
  default: undefined,
  pastel: ['#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f', '#cab2d6', '#ffff99'],
  vivid: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'],
  mono: ['#5f6c7b', '#778396', '#9aa8b7', '#c2ccd9', '#e1e6ef', '#f4f6fb'],
};

function choosePalette(name) {
  return palettes[name || 'default'];
}

function bindClickHandlers() {
  if (!el.value) return;

  el.value.on('plotly_click', (ev) => {
    if (!ev?.points?.[0] || !props.spec) return;
    const pt = ev.points[0];

    if (props.spec.type === 'scatter' && Number.isInteger(pt.customdata)) {
      emit('focusRow', { rowIndex: pt.customdata });
      return;
    }
    if (props.spec.type === 'bar') {
      emit('clickFilter', { key: props.spec.x, value: pt.x });
      return;
    }
    if (props.spec.type === 'heatmap') {
      emit('clickFilter', { key: props.spec.x, value: pt.x });
      emit('clickFilter', { key: props.spec.y, value: pt.y });
      return;
    }
    if ((props.spec.type === 'box' || props.spec.type === 'violin') && props.spec.hue) {
      emit('clickFilter', {
        key: props.spec.hue,
        value: pt.curveNumber >= 0 ? plot?.data?.[pt.curveNumber]?.name : undefined,
      });
      return;
    }
    if (props.spec.type === 'treemap') {
      emit('clickFilter', { key: props.spec.x, value: pt.label });
    }
  });
}

function plotFromFigJson(figJson) {
  if (!el.value) return;

  try {
    const parsed = JSON.parse(figJson);
    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    const layout = parsed?.layout || {};
    const conf = { displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

    Plotly.newPlot(el.value, data, layout, conf).then((p) => {
      plot = p;
      bindClickHandlers();
    });
  } catch (e) {
    console.error(e);
  }
}

function plotFromSpec() {
  if (!el.value || !props.spec) return;

  const { type, x, y, hue, options } = props.spec;
  const rows = props.rows || [];
  const pal = choosePalette(options?.palette);

  const val = (r, c) => (c ? r[c] : undefined);

  let data = [];
  const layout = {
    title: options?.title || '',
    xaxis: { title: options?.xLabel || x || '' },
    yaxis: { title: options?.yLabel || y || '' },
    margin: { t: 40, r: 20, b: 50, l: 50 },
    hovermode: 'closest',
  };

  function groupBy(key) {
    if (!key) return { '': rows };
    const m = new Map();
    for (const r of rows) {
      const k = String(r[key] ?? '');
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return Object.fromEntries(m.entries());
  }

  function sortCats(cats, by, valueMap) {
    if (by === 'alpha') return [...cats].sort();
    if (by === 'valueAsc' && valueMap) return [...cats].sort((a, b) => (valueMap[a] ?? 0) - (valueMap[b] ?? 0));
    if (by === 'valueDesc' && valueMap) return [...cats].sort((a, b) => (valueMap[b] ?? 0) - (valueMap[a] ?? 0));
    return cats;
  }

  if (type === 'bar') {
    const groups = groupBy(hue);
    const catGroups = new Map();
    const traces = [];
    const cats = Array.from(new Set(rows.map((r) => String(val(r, x) ?? ''))));
    const agg = options?.agg || 'count';

    const sortedCats = sortCats(cats, options?.sortCategory || 'none');
    const hues = Object.keys(groups);

    hues.forEach((hk, hi) => {
      const rr = groups[hk];
      const yvals = [];

      for (const c of sortedCats) {
        const sub = rr.filter((r) => String(val(r, x) ?? '') === c);
        let v = 0;

        if (agg === 'count') v = sub.length;
        else if (agg === 'sum' && y) v = sub.reduce((s, r) => s + (Number(r[y]) || 0), 0);
        else if (agg === 'mean' && y) {
          const arr = sub.map((r) => Number(r[y])).filter(Number.isFinite);
          v = arr.length ? arr.reduce((s, a) => s + a, 0) / arr.length : 0;
        }

        yvals.push(v);
        catGroups.set(c, (catGroups.get(c) || 0) + v);
      }

      traces.push({
        type: 'bar',
        name: hk || (hue ? 'NA' : ''),
        x: sortedCats,
        y: yvals,
        marker: pal ? { color: pal[hi % pal.length] } : undefined,
      });
    });

    const sorted = sortCats(
      [...new Set(rows.map((r) => String(val(r, x) ?? '')))],
      options?.sortCategory || 'none',
      Object.fromEntries(catGroups)
    );
    traces.forEach((t) => {
      t.x = sorted;
    });

    data = traces;
    layout.barmode = hues.length > 1 ? 'group' : 'relative';
  } else if (type === 'line') {
    const groups = groupBy(hue);
    const traces = [];
    const key = x;

    Object.keys(groups).forEach((k, i) => {
      const arr = [...groups[k]].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: k || (hue ? 'NA' : ''),
        x: arr.map((r) => r[x]),
        y: arr.map((r) => Number(r[y])),
        marker: pal ? { color: pal[i % pal.length] } : undefined,
      });
    });

    data = traces;
  } else if (type === 'scatter') {
    const indexOfRow = rows.map((_, i) => i);
    data = [
      {
        type: 'scatter',
        mode: 'markers',
        x: rows.map((r) => Number(r[x])),
        y: rows.map((r) => Number(r[y])),
        customdata: indexOfRow,
        text: rows.map((_, i) => `#${i}`),
        hovertemplate: `%{text} x=${x}: %{x}<br>y=${y}: %{y}<extra></extra>`,
      },
    ];
  } else if (type === 'histogram') {
    data = [{ type: 'histogram', x: rows.map((r) => Number(r[x])), nbinsx: options?.bins || 30 }];
  } else if (type === 'box') {
    const groups = groupBy(hue);
    data = Object.keys(groups).map((k, i) => ({
      type: 'box',
      name: k || (hue ? 'NA' : ''),
      y: groups[k].map((r) => Number(r[y])),
      marker: pal ? { color: pal[i % pal.length] } : undefined,
    }));
    layout.xaxis.title = hue || '';
    layout.yaxis.title = y || '';
  } else if (type === 'violin') {
    const groups = groupBy(hue);
    data = Object.keys(groups).map((k, i) => ({
      type: 'violin',
      name: k || (hue ? 'NA' : ''),
      y: groups[k].map((r) => Number(r[y])),
      box: { visible: true },
      meanline: { visible: true },
      marker: pal ? { color: pal[i % pal.length] } : undefined,
    }));
    layout.xaxis.title = hue || '';
    layout.yaxis.title = y || '';
  } else if (type === 'treemap') {
    data = [
      {
        type: 'treemap',
        labels: rows.map((r) => String(r[x])),
        parents: rows.map((r) => (hue ? String(r[hue]) : '')),
        values: y ? rows.map((r) => Number(r[y])) : undefined,
        branchvalues: y ? 'total' : undefined,
      },
    ];
  } else if (type === 'heatmap') {
    const xs = Array.from(new Set(rows.map((r) => String(r[x] ?? ''))));
    const ys = Array.from(new Set(rows.map((r) => String(r[y] ?? ''))));
    const z = ys.map(() => xs.map(() => 0));

    for (const r of rows) {
      const xi = xs.indexOf(String(r[x]));
      const yi = ys.indexOf(String(r[y]));
      if (xi >= 0 && yi >= 0) z[yi][xi] += hue ? Number(r[hue]) || 0 : 1;
    }

    data = [{ type: 'heatmap', x: xs, y: ys, z, colorscale: 'Viridis' }];
  } else if (type === 'radar') {
    const groups = groupBy(hue);
    const axes = Array.from(new Set(rows.map((r) => String(r[x]))));

    data = Object.keys(groups).map((k, i) => {
      const g = groups[k];
      const map = {};
      for (const r of g) map[String(r[x])] = Number(r[y]);
      return {
        type: 'scatterpolar',
        r: axes.map((a) => map[a] ?? 0),
        theta: axes,
        fill: 'toself',
        name: k || (hue ? 'NA' : ''),
        marker: pal ? { color: pal[i % pal.length] } : undefined,
      };
    });

    layout.polar = { radialaxis: { visible: true } };
  } else if (type === 'sankey') {
    const sources = Array.from(new Set(rows.map((r) => String(r[x]))));
    const targets = Array.from(new Set(rows.map((r) => String(r[y]))));
    const all = Array.from(new Set([...sources, ...targets]));
    const idx = (s) => all.indexOf(s);

    const links = rows.map((r) => ({
      source: idx(String(r[x])),
      target: idx(String(r[y])),
      value: Number(hue ? r[hue] : 1),
    }));

    data = [{ type: 'sankey', orientation: 'h', node: { label: all }, link: links }];
  }

  const conf = { displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };
  Plotly.newPlot(el.value, data, layout, conf).then((p) => {
    plot = p;
    bindClickHandlers();
  });
}

function build() {
  if (!el.value) return;

  if (props.figJson) {
    plotFromFigJson(props.figJson);
    return;
  }

  if (!props.spec) return;
  plotFromSpec();
}

function toImage(format = 'png', filename = 'chart') {
  if (!plot) return;
  Plotly.toImage(plot, { format, height: 600, width: 1000 }).then((url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${format}`;
    a.click();
  });
}

watch(() => props.spec, build, { deep: true });
watch(() => [props.rows, props.columns], build, { deep: true });
watch(() => props.figJson, build);
onMounted(build);
onBeforeUnmount(() => {
  if (plot && el.value) {
    Plotly.purge(el.value);
    plot = null;
  }
});

defineExpose({ toImage });
</script>

<template>
  <div class="space-y-2">
    <div ref="el" style="height: 420px"></div>
  </div>
</template>