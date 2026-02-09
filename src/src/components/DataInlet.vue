<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import ProfilePanel from './ProfilePanel.vue';
import RecentDatasets from './RecentDatasets.vue';
import { saveDataset } from '@/stores/useDatasets';
import DataGrid from './DataGrid.vue'
import { tempUpload, tempDelete } from '@/services/tempUpload';
import { exportXLSX } from '@/services/exportXlsx';
import DownloadMenu from './DownloadMenu.vue';
import Toast from './Toast.vue';
import RecipePanel from './RecipePanel.vue';
import GraphPanel from './GraphPanel.vue';
import ChartsBoard from './ChartsBoard.vue';
import StatsReportPanel from './StatsReportPanel.vue';
import StatTestsPanel from './StatTestsPanel.vue';
import StatsOlsPanel from './StatsOlsPanel.vue';
import StatsCorrPanel from './StatsCorrPanel.vue';

const worker = new Worker(new URL('../workers/ingest.worker.js', import.meta.url), { type:'module' });

const dragOver = ref(false);
const fileInput = ref(null);
const rows = ref([]);
const columns = ref([]);
const meta  = ref({ count: 0, memMB: 0 });
const log = ref('');
const status = ref('idle');
const progress = ref({ mode: '', pct: null });
const tempMode = ref(false);
const tempBusy = ref(false);
const tempKey = ref(undefined);
const corrHeatRows = ref(null);
const corrHeatCols = ref(null);
const corrHeatPreset = ref(null);
const badge = computed(() => {
  if (tempMode.value && tempKey.value) return 'temp cached';
  return status.value==='done' ? 'data on desk!' : '';
});
const toastRef = ref(null);
const gridRef = ref(null);

const currentName = ref('untitled');
const dirty = ref(false);


function append(s){ log.value += s + '\n'; }

onMounted(()=>{
  worker.onmessage = (e) => {
    const { type, ok, data, error } = e.data;
    if (type === 'PROGRESS' && ok) {
      status.value = 'parsing';
      progress.value = data; // { mode, pct }
      return;
    }
    if (!ok) { append('Error: ' + error); status.value = 'idle'; return; }
    if (type === 'FILE' || type === 'PASTE') {
    rows.value = data.rows;
    columns.value = data.columns;
    meta.value.count = data.count;
    meta.value.memMB = estimateMB(rows.value);
    currentName.value = 'untitled';
    dirty.value = true;
    append(`Load complete: ${data.count} rows, ${columns.value.length} cols, ~${meta.value.memMB.toFixed(2)} MB`);
    status.value = 'done';
    progress.value = { mode:'', pct:null };
      
    }
  };
  window.addEventListener('paste', onPaste);
});
onBeforeUnmount(()=>{
  worker.terminate();
  window.removeEventListener('paste', onPaste);
});

function onFilePick(e){
  const f = e.target?.files?.[0];
  if (!f) return;
  lastFile = f;
  worker.postMessage({ type:'FILE', payload:{ file: f }});
  maybeTempUpload(f);
}
function onDrop(e){
  e.preventDefault(); dragOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  lastFile = f;
  worker.postMessage({ type:'FILE', payload:{ file: f }});
  maybeTempUpload(f);
}

async function maybeTempUpload(latestFile){
  if (!tempMode.value || !latestFile) return;
  tempBusy.value = true;
  try {
    const { key } = await tempUpload(latestFile);
    tempKey.value = key;
    append(`Temp upload done: ${key}`);
  } catch (e) {
    append('Temp upload failed: ' + (e?.message || e));
  } finally {
    tempBusy.value = false;
  }
}
let lastFile;


function onPaste(e){
  const html = e.clipboardData?.getData('text/html') || '';
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!html && !text) return;
  worker.postMessage({ type:'PASTE', payload:{ text, html }});
}

function onApplyRecipe(d){
  rows.value = d.rows; columns.value = d.columns;
  meta.value.memMB = estimateMB(rows.value);
  dirty.value = true;
  append(`Recipe applied: ${rows.value.length} rows / ${columns.value.length} cols`);
}

function onGridUpdate(r){ rows.value = r; meta.value.memMB = estimateMB(rows.value); dirty.value = true; }
function onColumnsUpdate(cols){ columns.value = cols; dirty.value = true; }

function estimateMB(arr){
  try { return new Blob([JSON.stringify(arr)]).size / 1024 / 1024; }
  catch { return 0; }
}

// Create an empty dataset schema and set as active in IndexedDB flow
function openNewDataset(){
  const schemaStr = prompt('Enter column names separated by commas (e.g., colA,colB,target)');
  if (!schemaStr) return;
  const cols = schemaStr.split(',').map(s => s.trim()).filter(Boolean);
  rows.value = [];
  columns.value = cols;
  currentName.value = 'untitled';
  dirty.value = true;
  status.value = 'done';
  progress.value = { mode:'', pct:null };
  append(`New dataset schema created: ${cols.join(', ')}`);
}

async function saveCurrent(){
  if (!rows.value.length && !columns.value.length) return;
  const name = prompt('Enter dataset name', currentName.value || `dataset-${new Date().toISOString().slice(0,19).replace('T', ' ')}`);
  if (!name) return;
  await saveDataset(name, columns.value, rows.value);
  currentName.value = name;
  dirty.value = false;
  append('Saved to IndexedDB.');
  toastRef.value?.show('Saved.');
}


function onOpenRecent(payload){
  rows.value = payload.rows;
  columns.value = payload.columns;
  currentName.value = payload.name;
  dirty.value = false;
  status.value = 'done';
  progress.value = { mode:'', pct:null };
  append(`Opened: ${payload.name} (${payload.rows.length} rows, ${payload.columns.length} cols)`);
}


async function endSession(){
  if (!tempKey.value) return;
  if (!confirm('Delete temporary cache now?')) return;
  try {
    await tempDelete(tempKey.value);
    append(`Deleted: ${tempKey.value}`);
    tempKey.value = undefined;
  } catch (e) {
    append('Delete failed: ' + (e?.message || e));
  }
}

function downloadXlsx(){
  exportXLSX('dataset', columns.value, rows.value, {
    sample: 3000,     
    minWch: 8,        
    maxWch: 50,       
    autoFilter: true, 
  });
}

function onGraphFilter(p){
  // Example: { key: 'species', value: 'setosa' }
  gridRef.value?.filterEquals(p.key, p.value);
}

function onGraphFocus(p){
  gridRef.value?.focusRow(p.rowIndex);
}

function onOpenCorrHeatmap(p){
  const heatRows = [];
  for (let yi=0; yi<p.y.length; yi++){
    for (let xi=0; xi<p.x.length; xi++){
      heatRows.push({ x: p.x[xi], y: p.y[yi], value: p.z[yi][xi] });
    }
  }
  corrHeatRows.value = heatRows;
  corrHeatCols.value = ['x','y','value'];
  corrHeatPreset.value = {
    type: 'heatmap',
    x: 'x',
    y: 'y',
    hue: 'value',
    options: { title: p.title || 'Correlation Heatmap', bins: 30 }
    
  };
  
}

function closeCorrHeatmap(){
  corrHeatRows.value = null;
  corrHeatCols.value = null;
  corrHeatPreset.value = null;
}

</script>

<template>
  <div class="p-4 space-y-3">
    <div class="flex items-center gap-2">
      <h2 class="text-xl font-semibold">Data Inlet (Local)</h2>
  <span v-if="badge" class="text-xs px-2 py-1 rounded bg-green-100 text-green-700 border border-green-300">
    {{ badge }}
  </span>

  <div class="ml-3 text-sm text-gray-600">
    <b>{{ currentName }}</b><span v-if="dirty">*</span>
    <span class="ml-2 text-xs text-gray-500">
      (rows {{ rows.length }} / cols {{ columns.length }}<template v-if="rows.length"> / ~{{ meta.memMB.toFixed(2) }}MB</template>)
    </span>
  </div>


  <div class="ml-auto flex items-center gap-2">
    <button class="ml-2" @click="gridRef?.clearFilters()">Clear filters</button>
    <DownloadMenu :name="currentName" :columns="columns" :rows="rows" />
  </div>
      <label class="ml-auto text-sm flex items-center gap-1">
      <input type="checkbox" v-model="tempMode" />
      Temp upload (session only)
    </label>
    <button v-if="tempKey" :disabled="tempBusy" @click="endSession">End session (delete)</button>
    </div>

    <div class="flex gap-2">
      <button @click="openNewDataset()">+ New dataset</button>
      <button :disabled="!rows.length && !columns.length" @click="saveCurrent()">Save current dataset</button>
      <button :disabled="!rows.length" @click="downloadXlsx()">Download XLSX</button>
    </div>

    <div
      class="border-2 border-dashed rounded-lg p-6 text-center"
      :class="dragOver ? 'bg-blue-50 border-blue-400' : 'border-gray-300'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop="onDrop"
    >
      <p class="mb-2">Drag and drop a file here</p>
      <button @click="fileInput?.click()">Choose file</button>
      <input ref="fileInput" type="file" class="hidden" @change="onFilePick"
             accept=".csv,.xlsx,.json,text/csv,application/json" />
      <p class="mt-2 text-sm text-gray-500">Or paste CSV/JSON using <b>Ctrl+V</b></p>
    </div>

    
    <div v-if="status==='parsing'" class="w-full bg-gray-100 rounded h-2 overflow-hidden">
      <div class="bg-blue-500 h-2 transition-all"
           :style="{ width: (progress.pct==null ? '100%' : progress.pct+'%'),
                     animation: (progress.pct==null ? 'indet 1.2s linear infinite' : 'none') }">
      </div>
      <div class="text-xs mt-1 text-gray-600">
        {{ progress.mode.toUpperCase() }} {{ progress.pct==null ? '(processing...)' : progress.pct + '%' }}
      </div>
    </div>

    <div v-if="rows.length || columns.length" class="text-sm text-gray-700">
      <span>Rows: <b>{{ rows.length }}</b></span>
      <span>Cols: <b>{{ columns.length }}</b></span>
      <template v-if="rows.length">
        <span>Estimated memory: <b>{{ meta.memMB.toFixed(2) }} MB</b></span>
      </template>
    </div>

    <details v-if="rows.length" class="p-3 border rounded">
      <summary class="font-semibold">Preview (top 20 rows)</summary>
      <div class="overflow-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th v-for="c in columns" :key="c" class="border px-2 py-1 text-left whitespace-nowrap">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r,i) in rows.slice(0,20)" :key="i">
              <td v-for="c in columns" :key="c" class="border px-2 py-1 whitespace-nowrap">{{ r[c] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
<DataGrid
  ref="gridRef"
  v-if="rows.length || columns.length"
  :rows="rows"
  :columns="columns"
  @update="onGridUpdate"
  @columns="onColumnsUpdate"
/>
<RecipePanel
  v-if="rows.length || columns.length"
  :rows="rows"
  :columns="columns"
  @apply="onApplyRecipe"
/>
<GraphPanel
  v-if="rows.length || columns.length"
  :rows="rows"
  :columns="columns"
  :override-rows="corrHeatRows"
  :override-columns="corrHeatCols"
  :preset-spec="corrHeatPreset"
  @applyFilter="onGraphFilter"
  @focusRow="onGraphFocus"
  @closeOverride="closeCorrHeatmap"
/>
<ChartsBoard
  v-if="rows.length || columns.length"
  :rows="rows"
  :columns="columns"
/>
<StatsReportPanel v-if="rows.length && columns.length" :rows="rows" :columns="columns" />
<StatTestsPanel v-if="rows.length && columns.length" :rows="rows" :columns="columns" />
<StatsOlsPanel v-if="rows.length && columns.length" :rows="rows" :columns="columns" />
<StatsCorrPanel v-if="rows.length && columns.length" :rows="rows" :columns="columns" @openHeatmap="onOpenCorrHeatmap" />
  
    <ProfilePanel v-if="rows.length" :rows="rows" />
    <RecentDatasets @open="onOpenRecent" />

    <pre class="bg-gray-50 p-2 whitespace-pre-wrap text-xs">{{ log }}</pre>

  <Toast ref="toastRef" />
  
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
@keyframes indet {
  0%{ transform: translateX(-100%); width: 30%; }
  50%{ transform: translateX(50%); width: 40%; }
  100%{ transform: translateX(200%); width: 30%; }
}
</style>





