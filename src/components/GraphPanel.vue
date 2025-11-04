<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import { saveChart, listCharts, loadChart, deleteChart } from '@/stores/useCharts';
import type { ChartSpec, ChartType } from '@/types/chartSpec';

const props = defineProps<{ rows:any[], columns:string[], columnTypes?: Record<string,'number'|'category'|'date'> }>();
const emit = defineEmits<{
  (e:'applyFilter', payload:{ key:string, value:any }): void,
  (e:'focusRow', payload:{ rowIndex:number }): void
}>();

const type = ref<ChartType>('bar');
const x = ref(''); const y = ref(''); const hue = ref('');
const options = ref<any>({
  title:'', xLabel:'', yLabel:'', palette:'default',
  sortCategory:'none', tooltip:{ showX:true, showY:true, showCat:true }, bins:30, agg:'count'
});
const spec = computed<ChartSpec>(()=> ({ type:type.value, x:x.value||undefined, y:y.value||undefined, hue:hue.value||undefined, options: options.value }));

// 추천 (간단 룰)
const numCols = computed(()=> props.columns.filter(c => props.rows.some(r => Number.isFinite(Number(r[c])))));
const catCols = computed(()=> props.columns.filter(c => !numCols.value.includes(c)));
watch(()=> [props.columns, props.rows], ()=>{
  if (!x.value && catCols.value.length) x.value = catCols.value[0];
  if (!y.value && numCols.value.length) y.value = numCols.value[0];
}, { immediate:true });

// 저장/불러오기
const saved = ref<any[]>([]);
async function refreshSaved(){ saved.value = await listCharts(); }
async function save(){ const name = prompt('그래프 이름', options.value.title || 'chart'); if(!name) return; await saveChart(name, spec.value); await refreshSaved(); }
async function open(){ if(!saved.value.length){ await refreshSaved(); } const id = prompt('열 ID:\n'+saved.value.map(d=>`${d.id} : ${d.name}`).join('\n')); if(!id) return; const doc=await loadChart(id.trim()); type.value=doc.spec.type; x.value=doc.spec.x||''; y.value=doc.spec.y||''; hue.value=doc.spec.hue||''; options.value=doc.spec.options||{}; }
async function remove(){ const id=prompt('삭제 ID'); if(!id) return; await deleteChart(id.trim()); await refreshSaved(); }

// 이미지 저장
const canvasRef = ref<InstanceType<typeof ChartCanvas> | null>(null);
function download(format:'png'|'svg'){ canvasRef.value?.toImage(format, options.value.title || 'chart'); }

// 클릭-필터/포커스 연동
function onClickFilter(p:{key:string,value:any}){ emit('applyFilter', p); }
function onFocusRow(p:{rowIndex:number}){ emit('focusRow', p); }
</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <select v-model="type">
        <option value="bar">Bar</option><option value="line">Line</option><option value="scatter">Scatter</option><option value="histogram">Histogram</option>
        <option value="box">Boxplot</option><option value="violin">Violin</option><option value="treemap">Treemap</option><option value="heatmap">Heatmap</option>
        <option value="radar">Radar</option><option value="sankey">Sankey</option>
      </select>

      <select v-model="x"><option value="">x</option><option v-for="c in columns" :key="c">{{ c }}</option></select>
      <select v-model="y"><option value="">y</option><option v-for="c in columns" :key="c">{{ c }}</option></select>
      <select v-model="hue"><option value="">hue</option><option v-for="c in columns" :key="c">{{ c }}</option></select>

      <input class="w-48" placeholder="제목" v-model="options.title" />
      <select v-model="options.palette">
        <option value="default">palette: default</option>
        <option value="pastel">pastel</option>
        <option value="vivid">vivid</option>
        <option value="mono">mono</option>
      </select>
      <select v-if="type==='bar'" v-model="options.agg">
        <option value="count">count</option><option value="sum">sum</option><option value="mean">mean</option>
      </select>
      <input v-if="type==='histogram'" type="number" class="w-24" v-model.number="options.bins" min="5" max="200" />

      <button @click="save">저장(DB)</button>
      <button @click="open">불러오기(DB)</button>
      <button @click="remove">삭제(DB)</button>

      <div class="ml-auto flex gap-2">
        <button @click="download('png')">PNG</button>
        <button @click="download('svg')">SVG</button>
      </div>
    </div>

    <ChartCanvas ref="canvasRef"
      :rows="rows"
      :columns="columns"
      :spec="spec"
      @clickFilter="onClickFilter"
      @focusRow="onFocusRow"
    />

    <div class="text-xs text-gray-500">
      * 막대/히트맵/트리맵: 요소 클릭 → 필터 적용 · 산점도: 점 클릭 → 행 포커스
    </div>
  </div>
</template>

<style scoped>
select, input, button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; }
</style>
