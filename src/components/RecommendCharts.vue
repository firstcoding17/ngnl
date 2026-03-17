<script setup>
import { computed } from 'vue';

const props = defineProps({
  columns: { type: Array, default: () => [] },
  colTypes: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['pick']);

const numCols = computed(() => props.columns.filter((c) => props.colTypes[c] === 'number'));
const catCols = computed(() => props.columns.filter((c) => props.colTypes[c] === 'category'));
const dateCols = computed(() => props.columns.filter((c) => props.colTypes[c] === 'date'));

const cards = computed(() => {
  const out = [];

  if (dateCols.value.length && numCols.value.length) {
    out.push({ title: 'Line (time trend)', type: 'line', x: dateCols.value[0], y: numCols.value[0], hint: 'Date vs value', category: 'Change over time' });
    out.push({ title: 'Area (time trend)', type: 'area', x: dateCols.value[0], y: numCols.value[0], hint: 'Cumulative trend over time', category: 'Change over time' });
  }
  if (catCols.value.length && numCols.value.length) {
    out.push({ title: 'Bar (category compare)', type: 'bar', x: catCols.value[0], y: numCols.value[0], hint: 'count/sum/mean by category', category: 'Comparison' });
    out.push({ title: 'Box (distribution)', type: 'box', y: numCols.value[0], hue: catCols.value[0], hint: 'distribution and outliers', category: 'Distribution' });
    out.push({ title: 'Violin (distribution)', type: 'violin', y: numCols.value[0], hue: catCols.value[0], hint: 'distribution shape', category: 'Distribution' });
    out.push({ title: 'Pie (composition)', type: 'pie', x: catCols.value[0], y: numCols.value[0], hint: 'share by category', category: 'Composition / Flow' });
    out.push({ title: 'Donut (composition)', type: 'donut', x: catCols.value[0], y: numCols.value[0], hint: 'share with center space', category: 'Composition / Flow' });
    out.push({ title: 'Funnel (stage)', type: 'funnel', x: catCols.value[0], y: numCols.value[0], hint: 'drop-off across stages', category: 'Composition / Flow' });
    out.push({ title: 'Waterfall (change)', type: 'waterfall', x: catCols.value[0], y: numCols.value[0], hint: 'incremental increase/decrease', category: 'Comparison' });
  }
  if (numCols.value.length >= 2) {
    out.push({ title: 'Scatter (relation)', type: 'scatter', x: numCols.value[0], y: numCols.value[1], hint: 'relation between two values', category: 'Relationship' });
    out.push({ title: 'Heatmap (2D bins)', type: 'heatmap', x: numCols.value[0], y: numCols.value[1], hint: '2D density/count map', category: 'Relationship' });
    if (numCols.value.length >= 3) {
      out.push({ title: 'Bubble (3 variables)', type: 'bubble', x: numCols.value[0], y: numCols.value[1], size: numCols.value[2], hint: 'x/y plus bubble size', category: 'Relationship' });
    }
  }
  if (catCols.value.length && numCols.value.length) {
    out.push({ title: 'Treemap (composition)', type: 'treemap', x: catCols.value[0], y: numCols.value[0], hint: 'hierarchy/composition', category: 'Composition / Flow' });
    out.push({ title: 'Radar (series)', type: 'radar', x: catCols.value[0], y: numCols.value[0], hint: 'category axis + value', category: 'Comparison' });
  }
  if (catCols.value.length >= 2) {
    out.push({ title: 'Sankey (flow)', type: 'sankey', x: catCols.value[0], y: catCols.value[1], hint: 'source -> target', category: 'Composition / Flow' });
  }
  if (numCols.value.length) {
    out.push({ title: 'Histogram (distribution)', type: 'histogram', x: numCols.value[0], hint: 'frequency distribution', category: 'Distribution' });
  }

  const seen = new Set();
  return out
    .filter((c) => {
      const key = `${c.type}|${c.x}|${c.y}|${c.hue}|${c.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
});

function pick(c) {
  emit('pick', c);
}
</script>

<template>
  <div class="p-3 border rounded space-y-2">
    <div class="text-sm font-semibold">Recommended Charts</div>
    <div class="grid md:grid-cols-4 sm:grid-cols-2 gap-2">
      <button
        v-for="c in cards"
        :key="c.title + '-' + c.type"
        class="p-3 border rounded hover:bg-gray-50 text-left"
        @click="pick(c)"
      >
        <div class="text-sm font-semibold">{{ c.title }}</div>
        <div class="text-xs text-gray-500">{{ c.hint }}</div>
        <div class="text-[11px] text-blue-600 mt-1">{{ c.category }}</div>
        <div class="text-[11px] text-gray-400 mt-1">
          <span v-if="c.x">x={{ c.x }} </span>
          <span v-if="c.y">/ y={{ c.y }} </span>
          <span v-if="c.hue">/ hue={{ c.hue }} </span>
          <span v-if="c.size">/ size={{ c.size }}</span>
        </div>
      </button>
    </div>
  </div>
</template>
