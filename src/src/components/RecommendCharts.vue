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
    out.push({ title: 'Line (time trend)', type: 'line', x: dateCols.value[0], y: numCols.value[0], hint: 'Date vs value' });
  }
  if (catCols.value.length && numCols.value.length) {
    out.push({ title: 'Bar (category compare)', type: 'bar', x: catCols.value[0], y: numCols.value[0], hint: 'count/sum/mean by category' });
    out.push({ title: 'Box (distribution)', type: 'box', y: numCols.value[0], hue: catCols.value[0], hint: 'distribution and outliers' });
    out.push({ title: 'Violin (distribution)', type: 'violin', y: numCols.value[0], hue: catCols.value[0], hint: 'distribution shape' });
  }
  if (numCols.value.length >= 2) {
    out.push({ title: 'Scatter (relation)', type: 'scatter', x: numCols.value[0], y: numCols.value[1], hint: 'relation between two values' });
    out.push({ title: 'Heatmap (2D bins)', type: 'heatmap', x: numCols.value[0], y: numCols.value[1], hint: '2D density/count map' });
  }
  if (catCols.value.length && numCols.value.length) {
    out.push({ title: 'Treemap (composition)', type: 'treemap', x: catCols.value[0], y: numCols.value[0], hint: 'hierarchy/composition' });
    out.push({ title: 'Radar (series)', type: 'radar', x: catCols.value[0], y: numCols.value[0], hint: 'category axis + value' });
  }
  if (catCols.value.length >= 2) {
    out.push({ title: 'Sankey (flow)', type: 'sankey', x: catCols.value[0], y: catCols.value[1], hint: 'source -> target' });
  }
  if (numCols.value.length) {
    out.push({ title: 'Histogram (distribution)', type: 'histogram', x: numCols.value[0], hint: 'frequency distribution' });
  }

  const seen = new Set();
  return out
    .filter((c) => {
      const key = `${c.type}|${c.x}|${c.y}|${c.hue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
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
        <div class="text-[11px] text-gray-400 mt-1">
          <span v-if="c.x">x={{ c.x }} </span>
          <span v-if="c.y">/ y={{ c.y }} </span>
          <span v-if="c.hue">/ hue={{ c.hue }}</span>
        </div>
      </button>
    </div>
  </div>
</template>