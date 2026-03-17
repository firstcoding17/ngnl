<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
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
import StatsAdvancedPanel from './StatsAdvancedPanel.vue';
import MlPanel from './MlPanel.vue';
import McpPanel from './McpPanel.vue';

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
const pendingDataset = ref(null);
const badge = computed(() => {
  if (pendingDataset.value) return 'dataset pending apply';
  if (tempMode.value && tempKey.value) return 'temp cached';
  return status.value==='done' ? 'data on desk!' : '';
});
const toastRef = ref(null);
const gridRef = ref(null);
const graphPanelRef = ref(null);
const chartBoardRef = ref(null);
const statsPanelRef = ref(null);
const mlPanelRef = ref(null);
const reportPanelRef = ref(null);
const testsPanelRef = ref(null);
const olsPanelRef = ref(null);
const corrPanelRef = ref(null);
const advancedPanelRef = ref(null);
const statPreset = ref(null);
const mlPreset = ref(null);
const inlineBoardCharts = ref([]);

const currentName = ref('untitled');
const dirty = ref(false);
const activeDatasetId = ref(undefined);
const workspaceTabs = ref([]);
const activeTabId = ref('');
const profileSummary = ref({
  loading: false,
  error: '',
  sampleCount: 0,
  duplicates: 0,
  warnings: [],
  topCorrCount: 0,
  topAnovaCount: 0,
});
const workspaceDatasetSummaries = computed(() =>
  workspaceTabs.value.map((tab) => ({
    tabId: tab.tabId,
    datasetId: tab.datasetId || '',
    name: tab.name || 'untitled',
    rowCount: Array.isArray(tab.rows) ? tab.rows.length : 0,
    columnCount: Array.isArray(tab.columns) ? tab.columns.length : 0,
    columns: Array.isArray(tab.columns) ? [...tab.columns] : [],
    sampleRows: Array.isArray(tab.rows) ? tab.rows.slice(0, 120) : [],
    active: tab.tabId === activeTabId.value,
    dirty: !!tab.dirty,
  }))
);

function findWorkspaceTab(payload = {}) {
  if (payload?.datasetId) {
    const byId = workspaceTabs.value.find((tab) => tab.datasetId === payload.datasetId);
    if (byId) return byId;
  }
  if (payload?.datasetName) {
    const byName = workspaceTabs.value.find((tab) => tab.name === payload.datasetName);
    if (byName) return byName;
  }
  return workspaceTabs.value.find((tab) => tab.tabId === activeTabId.value) || null;
}

function scrollToPanel(panelRef) {
  panelRef?.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function resolveStatPanelRef(panelName) {
  if (panelName === 'report') return reportPanelRef;
  if (panelName === 'tests') return testsPanelRef;
  if (panelName === 'ols') return olsPanelRef;
  if (panelName === 'corr') return corrPanelRef;
  if (panelName === 'advanced') return advancedPanelRef;
  return statsPanelRef;
}

async function focusWorkspacePanel(payload = {}) {
  const target = findWorkspaceTab(payload);
  if (target && target.tabId !== activeTabId.value) {
    syncActiveTabFromState();
    activateWorkspaceTab(target.tabId);
    await nextTick();
  }
}


function append(s){ log.value += s + '\n'; }

function clearActiveDatasetState() {
  rows.value = [];
  columns.value = [];
  currentName.value = 'untitled';
  meta.value = { count: 0, memMB: 0 };
  dirty.value = false;
  activeDatasetId.value = undefined;
}

function activateWorkspaceTab(tabId) {
  const tab = workspaceTabs.value.find((it) => it.tabId === tabId);
  if (!tab) return;
  activeTabId.value = tab.tabId;
  rows.value = tab.rows;
  columns.value = tab.columns;
  currentName.value = tab.name;
  dirty.value = !!tab.dirty;
  meta.value = { count: tab.rows.length, memMB: estimateMB(tab.rows) };
  activeDatasetId.value = tab.datasetId;
  status.value = 'done';
  progress.value = { mode: '', pct: null };
}

function syncActiveTabFromState() {
  const tab = workspaceTabs.value.find((it) => it.tabId === activeTabId.value);
  if (!tab) return;
  tab.name = currentName.value;
  tab.rows = rows.value;
  tab.columns = columns.value;
  tab.dirty = dirty.value;
  tab.datasetId = activeDatasetId.value;
  tab.meta = { count: rows.value.length, memMB: meta.value.memMB };
}

function openDatasetInWorkspace({ name, rows: nextRows, columns: nextColumns, dirty: markDirty, datasetId }) {
  const tabId = crypto.randomUUID();
  const tab = {
    tabId,
    datasetId,
    name: name || 'untitled',
    rows: nextRows || [],
    columns: nextColumns || [],
    dirty: !!markDirty,
    meta: { count: (nextRows || []).length, memMB: estimateMB(nextRows || []) },
  };
  workspaceTabs.value.push(tab);
  activateWorkspaceTab(tabId);
  return tabId;
}

function closeWorkspaceTab(tabId) {
  const idx = workspaceTabs.value.findIndex((it) => it.tabId === tabId);
  if (idx < 0) return;
  const tab = workspaceTabs.value[idx];
  if (tab.dirty && !confirm('This tab has unsaved changes. Close anyway?')) return;
  const wasActive = tab.tabId === activeTabId.value;
  workspaceTabs.value.splice(idx, 1);
  if (!workspaceTabs.value.length) {
    activeTabId.value = '';
    clearActiveDatasetState();
    return;
  }
  if (wasActive) {
    const fallback = workspaceTabs.value[Math.max(0, idx - 1)] || workspaceTabs.value[0];
    activateWorkspaceTab(fallback.tabId);
  }
}

function stageDataset({
  name = 'untitled',
  rows: nextRows = [],
  columns: nextColumns = [],
  source = 'load',
  markDirty = true,
  datasetId = undefined,
}) {
  pendingDataset.value = {
    name,
    rows: nextRows,
    columns: nextColumns,
    source,
    datasetId,
    dirty: markDirty,
    count: nextRows.length,
    memMB: estimateMB(nextRows),
  };
  status.value = 'done';
  progress.value = { mode: '', pct: null };
  append(`Dataset ready (${source}): ${nextRows.length} rows, ${nextColumns.length} cols. Click Apply to activate.`);
}

function applyPendingDataset() {
  const pending = pendingDataset.value;
  if (!pending) return;
  openDatasetInWorkspace({
    name: pending.name,
    rows: pending.rows,
    columns: pending.columns,
    dirty: pending.dirty,
    datasetId: pending.datasetId,
  });
  pendingDataset.value = null;
  append(`Dataset applied: ${rows.value.length} rows, ${columns.value.length} cols.`);
  toastRef.value?.show('Dataset applied.');
}

function cancelPendingDataset() {
  if (!pendingDataset.value) return;
  pendingDataset.value = null;
  append('Dataset apply canceled.');
}

function onBeforeUnload(e) {
  if (!workspaceTabs.value.some((tab) => tab.dirty)) return;
  e.preventDefault();
  e.returnValue = '';
}

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
      const stagedName = type === 'FILE' ? (lastFile?.name || 'untitled') : 'pasted-data';
      stageDataset({
        name: stagedName,
        rows: data.rows,
        columns: data.columns,
        source: type === 'FILE' ? 'file' : 'paste',
        markDirty: true,
      });
      
    }
  };
  window.addEventListener('paste', onPaste);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(()=>{
  worker.terminate();
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('beforeunload', onBeforeUnload);
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
  syncActiveTabFromState();
  append(`Recipe applied: ${rows.value.length} rows / ${columns.value.length} cols`);
}

function onGridUpdate(r){ rows.value = r; meta.value.memMB = estimateMB(rows.value); dirty.value = true; syncActiveTabFromState(); }
function onColumnsUpdate(cols){ columns.value = cols; dirty.value = true; syncActiveTabFromState(); }

function estimateMB(arr){
  try { return new Blob([JSON.stringify(arr)]).size / 1024 / 1024; }
  catch { return 0; }
}

// Create an empty dataset schema and set as active in IndexedDB flow
function openNewDataset(){
  const schemaStr = prompt('Enter column names separated by commas (e.g., colA,colB,target)');
  if (!schemaStr) return;
  const cols = schemaStr.split(',').map(s => s.trim()).filter(Boolean);
  openDatasetInWorkspace({
    name: 'untitled',
    rows: [],
    columns: cols,
    dirty: true,
    datasetId: undefined,
  });
  append(`New dataset schema created: ${cols.join(', ')}`);
}

async function saveCurrent(){
  if (!rows.value.length && !columns.value.length) return;
  const name = prompt('Enter dataset name', currentName.value || `dataset-${new Date().toISOString().slice(0,19).replace('T', ' ')}`);
  if (!name) return;
  const savedId = await saveDataset(name, columns.value, rows.value, activeDatasetId.value);
  activeDatasetId.value = savedId;
  currentName.value = name;
  dirty.value = false;
  syncActiveTabFromState();
  append('Saved to IndexedDB.');
  toastRef.value?.show('Saved.');
}

async function saveAllTabs() {
  syncActiveTabFromState();
  if (!workspaceTabs.value.length) return;
  let saved = 0;
  let failed = 0;
  for (const tab of workspaceTabs.value) {
    if (!tab.rows?.length && !tab.columns?.length) continue;
    try {
      const defaultName = tab.name || `dataset-${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
      const savedId = await saveDataset(defaultName, tab.columns || [], tab.rows || [], tab.datasetId);
      tab.datasetId = savedId;
      tab.name = defaultName;
      tab.dirty = false;
      saved += 1;
    } catch (e) {
      failed += 1;
      append(`Save failed (${tab.name || 'untitled'}): ${e?.message || e}`);
    }
  }
  const active = workspaceTabs.value.find((it) => it.tabId === activeTabId.value);
  if (active) activateWorkspaceTab(active.tabId);
  append(`Save all done: ${saved} saved, ${failed} failed.`);
  toastRef.value?.show(`Saved ${saved} tab(s).`);
}

function closeAllTabs() {
  if (!workspaceTabs.value.length) return;
  if (workspaceTabs.value.some((tab) => tab.dirty) && !confirm('Some tabs have unsaved changes. Close all anyway?')) return;
  workspaceTabs.value = [];
  activeTabId.value = '';
  clearActiveDatasetState();
  append('All workspace tabs closed.');
}

function onOpenRecentMany(payloads) {
  if (!Array.isArray(payloads) || !payloads.length) return;
  let opened = 0;
  let skipped = 0;
  for (const payload of payloads) {
    const existing = workspaceTabs.value.find((it) => it.datasetId && payload.id && it.datasetId === payload.id);
    if (existing) {
      skipped += 1;
      continue;
    }
    openDatasetInWorkspace({
      name: payload.name,
      rows: payload.rows,
      columns: payload.columns,
      dirty: !!payload.rollback,
      datasetId: payload.id,
    });
    opened += 1;
  }
  append(`Batch open from recent: ${opened} opened, ${skipped} skipped (already open).`);
  toastRef.value?.show(`Opened ${opened} tab(s).`);
}


function onOpenRecent(payload){
  const fromHistory = !!payload.rollback;
  stageDataset({
    name: payload.name,
    rows: payload.rows,
    columns: payload.columns,
    source: fromHistory ? 'version-history' : 'recent',
    markDirty: fromHistory,
    datasetId: payload.id,
  });
  if (fromHistory) {
    append(`Rollback candidate loaded (v${payload.version ?? 'n/a'}). Apply and Save to create a new head version.`);
  }
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

function onOpenStatChart(payload){
  if (!payload?.rows?.length || !payload?.columns?.length || !payload?.spec) return;
  corrHeatRows.value = payload.rows;
  corrHeatCols.value = payload.columns;
  corrHeatPreset.value = payload.spec;
}

async function onMcpOpenChart(payload){
  await focusWorkspacePanel(payload);
  corrHeatRows.value = Array.isArray(payload?.rows) ? payload.rows : null;
  corrHeatCols.value = Array.isArray(payload?.columns) ? payload.columns : null;
  corrHeatPreset.value = payload?.spec || null;
  await nextTick();
  scrollToPanel(graphPanelRef);
}

async function onMcpOpenChartBoard(payload){
  const nextCharts = Array.isArray(payload?.charts) ? payload.charts : [];
  inlineBoardCharts.value = nextCharts
    .map((chart, index) => {
      const target = findWorkspaceTab(chart);
      if (!chart?.spec || !target) return null;
      return {
        id: chart.id || `mcp-board-${index}`,
        name: chart.title || `${chart.datasetName || target.name || 'dataset'} compare`,
        spec: chart.spec,
        rows: target.rows,
        columns: target.columns,
      };
    })
    .filter(Boolean);
  await nextTick();
  scrollToPanel(chartBoardRef);
}

async function onMcpFocusPanel(payload){
  await focusWorkspacePanel(payload);
  await nextTick();
  if (payload?.panel === 'graph') {
    scrollToPanel(graphPanelRef);
    return;
  }
  if (payload?.panel === 'stats') {
    scrollToPanel(statsPanelRef);
    return;
  }
  if (payload?.panel === 'ml') {
    if (payload?.request && typeof payload.request === 'object') {
      mlPreset.value = {
        ...(payload || {}),
        key: crypto.randomUUID(),
      };
    }
    scrollToPanel(mlPanelRef);
  }
}

async function onMcpOpenStat(payload){
  await focusWorkspacePanel(payload);
  statPreset.value = {
    ...(payload || {}),
    key: crypto.randomUUID(),
  };
  await nextTick();
  scrollToPanel(resolveStatPanelRef(payload?.statPanel));
}

function clearInlineBoard(){
  inlineBoardCharts.value = [];
}

function closeCorrHeatmap(){
  corrHeatRows.value = null;
  corrHeatCols.value = null;
  corrHeatPreset.value = null;
}

function onProfileSummary(summary){
  profileSummary.value = {
    loading: !!summary?.loading,
    error: summary?.error || '',
    sampleCount: summary?.sampleCount || 0,
    duplicates: summary?.duplicates || 0,
    warnings: Array.isArray(summary?.warnings) ? summary.warnings : [],
    topCorrCount: summary?.topCorrCount || 0,
    topAnovaCount: summary?.topAnovaCount || 0,
  };
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
      <button :disabled="!workspaceTabs.length" @click="saveAllTabs()">Save all tabs</button>
      <button :disabled="!workspaceTabs.length" @click="closeAllTabs()">Close all tabs</button>
      <button :disabled="!rows.length" @click="downloadXlsx()">Download XLSX</button>
    </div>

    <div v-if="workspaceTabs.length" class="border rounded p-2 bg-gray-50">
      <div class="text-xs text-gray-600 mb-1">Workspace tabs ({{ workspaceTabs.length }})</div>
      <div class="workspace-tabs">
        <div
          v-for="tab in workspaceTabs"
          :key="tab.tabId"
          class="workspace-tab"
          :class="{ active: tab.tabId === activeTabId }"
        >
          <button class="tab-main" @click="activateWorkspaceTab(tab.tabId)">
            <span>{{ tab.name }}</span>
            <span v-if="tab.dirty">*</span>
            <span class="tab-meta">{{ tab.rows.length }}r / {{ tab.columns.length }}c</span>
          </button>
          <button class="tab-close" @click.stop="closeWorkspaceTab(tab.tabId)">x</button>
        </div>
      </div>
    </div>

    <div v-if="pendingDataset" class="border rounded p-3 bg-amber-50 border-amber-200 space-y-2">
      <div class="text-sm text-amber-900">
        New dataset is ready from <b>{{ pendingDataset.source }}</b>:
        {{ pendingDataset.count }} rows, {{ pendingDataset.columns.length }} columns.
        Apply to dashboard now?
      </div>
      <div class="flex items-center gap-2">
        <button @click="applyPendingDataset">Apply</button>
        <button @click="cancelPendingDataset">Cancel</button>
      </div>
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

    <div v-if="rows.length" class="text-xs border rounded p-2 bg-slate-50 text-slate-700">
      <div v-if="profileSummary.loading">Profile: analyzing sample...</div>
      <div v-else-if="profileSummary.error" class="text-red-600">
        Profile: {{ profileSummary.error }} (retry by editing or reloading data)
      </div>
      <div v-else-if="profileSummary.sampleCount">
        Profile sample {{ profileSummary.sampleCount }} rows:
        duplicates {{ profileSummary.duplicates }},
        corr pairs {{ profileSummary.topCorrCount }},
        anova pairs {{ profileSummary.topAnovaCount }}.
        <span v-if="profileSummary.warnings.length" class="text-amber-700">
          Warnings {{ profileSummary.warnings.length }}.
        </span>
      </div>
      <div v-else>Profile: no sample yet.</div>
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
<div v-if="rows.length || columns.length" ref="graphPanelRef">
  <GraphPanel
    :rows="rows"
    :columns="columns"
    :override-rows="corrHeatRows"
    :override-columns="corrHeatCols"
    :preset-spec="corrHeatPreset"
    @applyFilter="onGraphFilter"
    @focusRow="onGraphFocus"
    @closeOverride="closeCorrHeatmap"
  />
</div>
<div v-if="rows.length || columns.length" ref="chartBoardRef">
  <ChartsBoard
    :rows="rows"
    :columns="columns"
    :inline-charts="inlineBoardCharts"
    @clear-inline="clearInlineBoard"
  />
</div>
<div v-if="rows.length && columns.length" ref="statsPanelRef">
  <div ref="reportPanelRef">
    <StatsReportPanel :rows="rows" :columns="columns" :preset="statPreset" @openChart="onOpenStatChart" />
  </div>
  <div ref="testsPanelRef">
    <StatTestsPanel :rows="rows" :columns="columns" :preset="statPreset" @openChart="onOpenStatChart" />
  </div>
  <div ref="olsPanelRef">
    <StatsOlsPanel :rows="rows" :columns="columns" :preset="statPreset" @openChart="onOpenStatChart" />
  </div>
  <div ref="corrPanelRef">
    <StatsCorrPanel
      :rows="rows"
      :columns="columns"
      :preset="statPreset"
      @openHeatmap="onOpenCorrHeatmap"
      @openChart="onOpenStatChart"
    />
  </div>
  <div ref="advancedPanelRef">
    <StatsAdvancedPanel :rows="rows" :columns="columns" :preset="statPreset" @openChart="onOpenStatChart" />
  </div>
</div>
<div v-if="rows.length && columns.length" ref="mlPanelRef">
  <MlPanel :rows="rows" :columns="columns" :profile-summary="profileSummary" :preset="mlPreset" />
</div>
<McpPanel
  v-if="rows.length && columns.length"
  :rows="rows"
  :columns="columns"
  :dataset-name="currentName"
  :dataset-id="activeDatasetId || ''"
  :profile-summary="profileSummary"
  :workspace-datasets="workspaceDatasetSummaries"
  @open-chart="onMcpOpenChart"
  @open-chart-board="onMcpOpenChartBoard"
  @open-stat="onMcpOpenStat"
  @focus-panel="onMcpFocusPanel"
/>
  
    <ProfilePanel v-if="rows.length" :rows="rows" @summary="onProfileSummary" />
    <RecentDatasets @open="onOpenRecent" @open-many="onOpenRecentMany" />

    <pre class="bg-gray-50 p-2 whitespace-pre-wrap text-xs">{{ log }}</pre>

  <Toast ref="toastRef" />
  
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
.workspace-tabs { display:flex; gap:8px; overflow:auto; padding-bottom:2px; }
.workspace-tab { display:flex; align-items:center; border:1px solid #d1d5db; border-radius:999px; background:#fff; }
.workspace-tab.active { border-color:#3b82f6; background:#eff6ff; }
.tab-main { border:none; background:transparent; padding:4px 10px; display:flex; align-items:center; gap:6px; }
.tab-close { border:none; background:transparent; padding:4px 8px; color:#6b7280; }
.tab-meta { font-size:11px; color:#6b7280; }
@keyframes indet {
  0%{ transform: translateX(-100%); width: 30%; }
  50%{ transform: translateX(50%); width: 40%; }
  100%{ transform: translateX(200%); width: 30%; }
}
</style>





