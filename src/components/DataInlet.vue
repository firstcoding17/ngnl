<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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
const USE_WORKER_INGEST = false;
const WORKSPACE_DRAFT_KEY = 'ngnl_workspace_draft_v1';

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
const hasWorkspaceData = computed(() => rows.value.length > 0 || columns.value.length > 0);
const hasFullDataset = computed(() => rows.value.length > 0 && columns.value.length > 0);
const badge = computed(() => {
  if (status.value === 'parsing') return 'reading file';
  if (tempMode.value && tempKey.value) return 'temp cached';
  if (hasWorkspaceData.value) return 'workspace ready';
  return '';
});
const toastRef = ref(null);
const gridRef = ref(null);
const recentDatasetsRef = ref(null);
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
const logEntryCount = computed(() =>
  log.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .length
);
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
function setParsingState(mode, pct = null) {
  status.value = 'parsing';
  progress.value = { mode: mode || 'parse', pct };
}

function resetParsingState() {
  status.value = 'idle';
  progress.value = { mode: '', pct: null };
}

function detectFileMode(file) {
  const name = String(file?.name || '');
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || /sheet/.test(String(file?.type || ''))) return 'xlsx';
  if (ext === 'json' || /application\/json/.test(String(file?.type || ''))) return 'json';
  return 'csv';
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
}

function persistWorkspaceDraft() {
  try {
    const payload = {
      workspaceTabs: workspaceTabs.value,
      activeTabId: activeTabId.value,
      currentName: currentName.value,
      dirty: dirty.value,
      activeDatasetId: activeDatasetId.value,
    };
    sessionStorage.setItem(WORKSPACE_DRAFT_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist workspace draft:', error);
  }
}

function restoreWorkspaceDraft() {
  try {
    const raw = sessionStorage.getItem(WORKSPACE_DRAFT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const tabs = Array.isArray(parsed?.workspaceTabs) ? parsed.workspaceTabs : [];
    if (!tabs.length) return false;

    workspaceTabs.value = tabs.map((tab) => ({
      tabId: tab.tabId || makeId(),
      datasetId: tab.datasetId,
      name: tab.name || 'untitled',
      rows: Array.isArray(tab.rows) ? tab.rows : [],
      columns: Array.isArray(tab.columns) ? tab.columns : [],
      dirty: !!tab.dirty,
      meta: tab.meta || { count: Array.isArray(tab.rows) ? tab.rows.length : 0, memMB: 0 },
    }));

    const targetId = parsed?.activeTabId && workspaceTabs.value.some((tab) => tab.tabId === parsed.activeTabId)
      ? parsed.activeTabId
      : workspaceTabs.value[0].tabId;

    activateWorkspaceTab(targetId);
    append(`Workspace restored: ${workspaceTabs.value.length} tab(s).`);
    return true;
  } catch (error) {
    console.warn('Failed to restore workspace draft:', error);
    return false;
  }
}

function clearWorkspaceDraft() {
  sessionStorage.removeItem(WORKSPACE_DRAFT_KEY);
}

function finalizeParsedRows(rows, preferredColumns = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const firstRow = safeRows[0] && typeof safeRows[0] === 'object' ? safeRows[0] : {};
  const columns = Array.isArray(preferredColumns) && preferredColumns.length
    ? preferredColumns
    : Object.keys(firstRow || {});
  return {
    rows: safeRows,
    columns,
    count: safeRows.length,
  };
}

function normalizeJSONRows(obj) {
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj?.data)) return obj.data;
  throw new Error('JSON must be an array of objects');
}

function htmlTableToRows(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const headers = Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'))
    .map((cell) => String(cell.textContent || '').trim());
  const rows = [];
  const bodyRows = Array.from(table.querySelectorAll('tr')).slice(1);
  for (const tr of bodyRows) {
    const cells = Array.from(tr.querySelectorAll('td, th')).map((cell) => String(cell.textContent || ''));
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i] || `col${i + 1}`] = cells[i] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function looksLikeJSON(text) {
  const value = String(text || '').trim();
  return (value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'));
}

function applyParsedDataset({ name, rows: nextRows, columns: nextColumns, source = 'load', markDirty = true, datasetId = undefined }) {
  append(`Parsing success: ${nextRows.length} rows / ${nextColumns.length} cols`);
  stageDataset({
    name,
    rows: nextRows,
    columns: nextColumns,
    source,
    markDirty,
    datasetId,
  });
}

function reportParsingFailure(error) {
  const message = String(error?.message || error || 'unknown error');
  append(`Parsing failed: ${message}`);
  resetParsingState();
}

async function parseCSVFileOnMainThread(file) {
  const rawText = await file.text();
  const sanitizedText = String(rawText || '').replace(/^\uFEFF/, '');
  append(`CSV raw length: ${sanitizedText.length}`);

  return new Promise((resolve, reject) => {
    Papa.parse(sanitizedText, {
      header: true,
      skipEmptyLines: 'greedy',
      worker: false,
      complete: (parsed) => {
        const rawRows = Array.isArray(parsed?.data) ? parsed.data : [];
        const filteredRows = rawRows.filter((row) => {
          if (!row || typeof row !== 'object') return false;
          return Object.values(row).some((value) => String(value ?? '').trim() !== '');
        });
        const fields = Array.isArray(parsed?.meta?.fields)
          ? parsed.meta.fields.filter((field) => String(field || '').trim() !== '')
          : [];

        append(`CSV parsed rows (raw): ${rawRows.length}`);
        append(`CSV parsed fields: ${fields.join(', ') || '(none)'}`);

        resolve(finalizeParsedRows(filteredRows, fields));
      },
      error: (err) => reject(new Error(err?.message || 'CSV parse failed')),
    });
  });
}

async function parseXLSXFileOnMainThread(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const rows = sheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) : [];
  return finalizeParsedRows(rows);
}

async function parseJSONFileOnMainThread(file) {
  const text = await file.text();
  return finalizeParsedRows(normalizeJSONRows(JSON.parse(text)));
}

async function parseFileOnMainThread(file) {
  const mode = detectFileMode(file);
  append(`Parsing started: ${mode}`);
  setParsingState(mode, null);
  if (mode === 'xlsx') return parseXLSXFileOnMainThread(file);
  if (mode === 'json') return parseJSONFileOnMainThread(file);
  return parseCSVFileOnMainThread(file);
}

async function parsePasteOnMainThread(payload) {
  const html = String(payload?.html || '');
  const text = String(payload?.text || '');
  append('Parsing started: paste');
  setParsingState('paste', null);

  if (html && html.includes('<table')) {
    return finalizeParsedRows(htmlTableToRows(html));
  }
  if (looksLikeJSON(text)) {
    return finalizeParsedRows(normalizeJSONRows(JSON.parse(text)));
  }

  const delimiter = text.includes('\t') ? '\t' : ',';
  const parsed = Papa.parse(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    worker: false,
  });

  if (parsed?.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(first?.message || 'Paste parse failed');
  }

  return finalizeParsedRows(parsed?.data, parsed?.meta?.fields || []);
}

function clearActiveDatasetState() {
  rows.value = [];
  columns.value = [];
  currentName.value = 'untitled';
  meta.value = { count: 0, memMB: 0 };
  dirty.value = false;
  activeDatasetId.value = undefined;
  clearWorkspaceDraft();
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
  const tabId = makeId();
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
  openDatasetInWorkspace({
    name,
    rows: nextRows,
    columns: nextColumns,
    dirty: markDirty,
    datasetId,
  });
  status.value = 'done';
  progress.value = { mode: '', pct: null };
  append(`Dataset loaded (${source}): ${nextRows.length} rows, ${nextColumns.length} cols.`);
  toastRef.value?.show('Dataset loaded.');
}

let lastFile;
let lastPastePayload = null;

async function startFileIngest(file) {
  lastFile = file;
  append(`File selected: ${file?.name || 'untitled'}`);

  if (USE_WORKER_INGEST) {
    const mode = detectFileMode(file);
    append(`Parsing started: ${mode}`);
    setParsingState(mode, null);
    worker.postMessage({ type:'FILE', payload:{ file } });
    return;
  }

  try {
    const parsed = await parseFileOnMainThread(file);
    applyParsedDataset({
      name: file?.name || 'untitled',
      rows: parsed.rows,
      columns: parsed.columns,
      source: 'file',
      markDirty: true,
    });
  } catch (error) {
    reportParsingFailure(error);
  }
}

async function startPasteIngest(payload) {
  lastPastePayload = payload;
  append('Paste detected');

  if (USE_WORKER_INGEST) {
    append('Parsing started: paste');
    setParsingState('paste', null);
    worker.postMessage({ type:'PASTE', payload });
    return;
  }

  try {
    const parsed = await parsePasteOnMainThread(payload);
    applyParsedDataset({
      name: 'pasted-data',
      rows: parsed.rows,
      columns: parsed.columns,
      source: 'paste',
      markDirty: true,
    });
  } catch (error) {
    reportParsingFailure(error);
  }
}

function onBeforeUnload() {
  if (!workspaceTabs.value.length) return;
  persistWorkspaceDraft();
}

onMounted(()=>{
  restoreWorkspaceDraft();
  worker.onmessage = async (e) => {
    const { type, ok, data, error } = e.data;
    if (type === 'PROGRESS' && ok) {
      setParsingState(data?.mode || 'parse', data?.pct ?? null);
      return;
    }
    if (!ok) {
      append(`Parsing failed: ${error}`);
      if (type === 'FILE' && lastFile) {
        append('Retrying on main thread parser...');
        try {
          const parsed = await parseFileOnMainThread(lastFile);
          applyParsedDataset({
            name: lastFile?.name || 'untitled',
            rows: parsed.rows,
            columns: parsed.columns,
            source: 'file',
            markDirty: true,
          });
          return;
        } catch (fallbackError) {
          reportParsingFailure(fallbackError);
          return;
        }
      }
      if (type === 'PASTE' && lastPastePayload) {
        append('Retrying paste on main thread parser...');
        try {
          const parsed = await parsePasteOnMainThread(lastPastePayload);
          applyParsedDataset({
            name: 'pasted-data',
            rows: parsed.rows,
            columns: parsed.columns,
            source: 'paste',
            markDirty: true,
          });
          return;
        } catch (fallbackError) {
          reportParsingFailure(fallbackError);
          return;
        }
      }
      resetParsingState();
      return;
    }
    if (type === 'FILE' || type === 'PASTE') {
      const stagedName = type === 'FILE' ? (lastFile?.name || 'untitled') : 'pasted-data';
      applyParsedDataset({
        name: stagedName,
        rows: data.rows,
        columns: data.columns,
        source: type === 'FILE' ? 'file' : 'paste',
        markDirty: true,
      });
    }
  };
  worker.onerror = async () => {
    append('Parsing failed: worker crashed');
    if (lastFile) {
      append('Retrying on main thread parser...');
      try {
        const parsed = await parseFileOnMainThread(lastFile);
        applyParsedDataset({
          name: lastFile?.name || 'untitled',
          rows: parsed.rows,
          columns: parsed.columns,
          source: 'file',
          markDirty: true,
        });
        return;
      } catch (fallbackError) {
        reportParsingFailure(fallbackError);
        return;
      }
    }
    if (lastPastePayload) {
      append('Retrying paste on main thread parser...');
      try {
        const parsed = await parsePasteOnMainThread(lastPastePayload);
        applyParsedDataset({
          name: 'pasted-data',
          rows: parsed.rows,
          columns: parsed.columns,
          source: 'paste',
          markDirty: true,
        });
        return;
      } catch (fallbackError) {
        reportParsingFailure(fallbackError);
        return;
      }
    }
    resetParsingState();
  };
  window.addEventListener('paste', onPaste);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(()=>{
  worker.terminate();
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('beforeunload', onBeforeUnload);
});

watch(
  [workspaceTabs, activeTabId, currentName, dirty, activeDatasetId],
  () => {
    if (!workspaceTabs.value.length) {
      clearWorkspaceDraft();
      return;
    }
    persistWorkspaceDraft();
  },
  { deep: true }
);

async function onFilePick(e){
  const f = e.target?.files?.[0];
  if (!f) return;
  await startFileIngest(f);
  maybeTempUpload(f);
  if (e?.target) e.target.value = '';
}
async function onDrop(e){
  e.preventDefault(); dragOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  await startFileIngest(f);
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

async function onPaste(e){
  const html = e.clipboardData?.getData('text/html') || '';
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!html && !text) return;
  await startPasteIngest({ text, html });
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

function resolveDatasetSaveName(defaultName, { promptIfMissing = true } = {}) {
  if (typeof window !== 'undefined') {
    const injected = String(window.__NGNL_E2E_SAVE_NAME || '').trim();
    if (injected) return injected;
  }
  if (!promptIfMissing) return String(defaultName || '').trim();
  const prompted = prompt('Enter dataset name', defaultName);
  return String(prompted || '').trim();
}

async function saveCurrent(){
  if (!rows.value.length && !columns.value.length) return;
  const defaultName = currentName.value || `dataset-${new Date().toISOString().slice(0,19).replace('T', ' ')}`;
  append(`Save requested: ${defaultName}`);
  const shouldPromptForName = !currentName.value || currentName.value === 'untitled';
  const name = resolveDatasetSaveName(defaultName, { promptIfMissing: shouldPromptForName });
  if (!name) return;
  try {
    const savedId = await saveDataset(name, columns.value, rows.value, activeDatasetId.value);
    activeDatasetId.value = savedId;
    currentName.value = name;
    dirty.value = false;
    syncActiveTabFromState();
    await recentDatasetsRef.value?.refresh?.();
    append('Saved to IndexedDB.');
    toastRef.value?.show('Saved.');
  } catch (error) {
    append(`Save failed: ${error?.message || error}`);
    toastRef.value?.show('Save failed.');
  }
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
  await recentDatasetsRef.value?.refresh?.();
  append(`Save all done: ${saved} saved, ${failed} failed.`);
  toastRef.value?.show(`Saved ${saved} tab(s).`);
}

function closeAllTabs() {
  if (!workspaceTabs.value.length) return;
  if (workspaceTabs.value.some((tab) => tab.dirty) && !confirm('Some tabs have unsaved changes. Close all anyway?')) return;
  workspaceTabs.value = [];
  activeTabId.value = '';
  clearActiveDatasetState();
  clearWorkspaceDraft();
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
        key: makeId(),
      };
    }
    scrollToPanel(mlPanelRef);
  }
}

async function onMcpOpenStat(payload){
  await focusWorkspacePanel(payload);
  statPreset.value = {
    ...(payload || {}),
    key: makeId(),
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
  <div class="workspace-shell" data-testid="workspace-shell">
    <section class="workspace-card workspace-card--hero">
      <div class="workspace-hero">
        <div>
          <p class="workspace-hero__kicker">Data Desk</p>
          <h2>업로드한 데이터를 바로 확인하고 편집할 수 있는 작업공간입니다.</h2>
          <p class="workspace-hero__subtitle">
            CSV, XLSX, JSON 파일을 올리거나 붙여넣으면 즉시 현재 화면에 반영되고, 같은 흐름에서 저장과 그래프/통계 작업으로 이어집니다.
          </p>
        </div>
        <div class="workspace-hero__meta">
          <span v-if="badge" class="workspace-badge">{{ badge }}</span>
          <div class="workspace-hero__name">
            <b>{{ currentName }}</b><span v-if="dirty">*</span>
          </div>
          <div class="workspace-hero__stats">
            <span>Rows <b>{{ rows.length }}</b></span>
            <span>Cols <b>{{ columns.length }}</b></span>
            <span v-if="rows.length">Memory <b>{{ meta.memMB.toFixed(2) }}MB</b></span>
          </div>
        </div>
      </div>
    </section>

    <section class="workspace-card workspace-card--toolbar">
      <div class="toolbar-row">
        <div class="toolbar-group">
          <button type="button" class="btn-primary" data-testid="new-dataset-button" @click="openNewDataset">+ New dataset</button>
          <button type="button" :disabled="!hasWorkspaceData" data-testid="save-current-dataset" @click="saveCurrent">Save current dataset</button>
          <button type="button" :disabled="!workspaceTabs.length" @click="saveAllTabs">Save all tabs</button>
          <button type="button" :disabled="!workspaceTabs.length" @click="closeAllTabs">Close all tabs</button>
        </div>
        <div class="toolbar-group toolbar-group--right">
          <label class="toolbar-check">
            <input type="checkbox" v-model="tempMode" />
            <span>Temp upload (session only)</span>
          </label>
          <button type="button" :disabled="!tempKey || tempBusy" @click="endSession">Delete temp cache</button>
          <button type="button" :disabled="!hasWorkspaceData" @click="gridRef?.clearFilters()">Clear filters</button>
          <button type="button" :disabled="!rows.length" @click="downloadXlsx">Download XLSX</button>
          <div class="toolbar-download">
            <DownloadMenu :name="currentName" :columns="columns" :rows="rows" />
          </div>
        </div>
      </div>
    </section>

    <section
      class="workspace-card upload-card"
      :class="{ 'upload-card--drag': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop="onDrop"
    >
      <div class="upload-card__copy">
        <h3>Load File</h3>
        <p>파일을 드래그하거나 직접 선택하세요. CSV/JSON 텍스트는 <b>Ctrl+V</b>로 붙여넣어도 됩니다.</p>
        <div class="upload-card__actions">
          <button type="button" class="btn-primary" data-testid="choose-file-button" @click="fileInput?.click()">Choose file</button>
          <span>Supported: CSV, XLSX, JSON</span>
        </div>
        <input
          ref="fileInput"
          type="file"
          class="file-input"
          data-testid="workspace-file-input"
          @change="onFilePick"
          accept=".csv,.xlsx,.json,text/csv,application/json"
        />
      </div>
      <div class="upload-card__summary">
        <div class="summary-tile">
          <span class="summary-tile__label">Status</span>
          <strong>{{ status === 'idle' ? 'Ready' : status }}</strong>
        </div>
        <div class="summary-tile">
          <span class="summary-tile__label">Workspace</span>
          <strong>{{ workspaceTabs.length }} tab(s)</strong>
        </div>
        <div class="summary-tile">
          <span class="summary-tile__label">Temp cache</span>
          <strong>{{ tempKey ? 'Active' : 'Off' }}</strong>
        </div>
      </div>
    </section>

    <section v-if="status === 'parsing'" class="workspace-card progress-card">
      <div class="progress-card__bar">
        <div
          class="progress-card__fill"
          :style="{
            width: progress.pct == null ? '100%' : `${progress.pct}%`,
            animation: progress.pct == null ? 'indet 1.2s linear infinite' : 'none'
          }"
        />
      </div>
      <div class="progress-card__meta">
        {{ progress.mode.toUpperCase() }} {{ progress.pct == null ? '(processing...)' : `${progress.pct}%` }}
      </div>
    </section>

    <section v-if="workspaceTabs.length" class="workspace-card tabs-card">
      <div class="tabs-card__head">Workspace tabs ({{ workspaceTabs.length }})</div>
      <div class="workspace-tabs">
        <div
          v-for="tab in workspaceTabs"
          :key="tab.tabId"
          class="workspace-tab"
          :class="{ active: tab.tabId === activeTabId }"
        >
          <button type="button" class="tab-main" @click="activateWorkspaceTab(tab.tabId)">
            <span>{{ tab.name }}</span>
            <span v-if="tab.dirty">*</span>
            <span class="tab-meta">{{ tab.rows.length }}r / {{ tab.columns.length }}c</span>
          </button>
          <button type="button" class="tab-close" @click.stop="closeWorkspaceTab(tab.tabId)">x</button>
        </div>
      </div>
    </section>

    <div class="workspace-layout">
      <div class="workspace-layout__main">
        <section class="workspace-card grid-card">
          <div class="card-head">
            <div>
              <h3>Data Grid</h3>
              <p v-if="hasWorkspaceData">파일을 올리면 바로 표에 반영되고 여기서 편집할 수 있습니다.</p>
              <p v-else>아직 데이터가 없습니다. 파일 업로드, 붙여넣기, 새 데이터셋 생성 중 하나를 선택하세요.</p>
            </div>
            <div class="card-head__stats">
              <span data-testid="workspace-row-count">Rows {{ rows.length }}</span>
              <span data-testid="workspace-col-count">Cols {{ columns.length }}</span>
            </div>
          </div>

          <div v-if="rows.length" class="profile-strip">
            <div v-if="profileSummary.loading">Profile analyzing sample...</div>
            <div v-else-if="profileSummary.error" class="profile-strip__error">
              {{ profileSummary.error }}
            </div>
            <div v-else-if="profileSummary.sampleCount">
              Sample {{ profileSummary.sampleCount }} rows / duplicates {{ profileSummary.duplicates }} /
              corr {{ profileSummary.topCorrCount }} / anova {{ profileSummary.topAnovaCount }}
              <span v-if="profileSummary.warnings.length">/ warnings {{ profileSummary.warnings.length }}</span>
            </div>
            <div v-else>Profile summary will appear after a dataset is loaded.</div>
          </div>

          <DataGrid
            ref="gridRef"
            :rows="rows"
            :columns="columns"
            @update="onGridUpdate"
            @columns="onColumnsUpdate"
          />
        </section>

        <section class="workspace-card log-card">
          <div class="card-head">
            <div>
              <h3>Workspace Log</h3>
              <p>불러오기, 저장, 탭 전환 같은 주요 동작을 여기서 확인할 수 있습니다.</p>
            </div>
            <div class="card-head__stats">
              <span>{{ logEntryCount }} entries</span>
            </div>
          </div>
          <pre data-testid="workspace-log">{{ log || 'No actions yet.' }}</pre>
        </section>
      </div>

      <aside class="workspace-layout__side">
        <RecentDatasets ref="recentDatasetsRef" @open="onOpenRecent" @open-many="onOpenRecentMany" />
        <ProfilePanel v-if="rows.length" :rows="rows" @summary="onProfileSummary" />
      </aside>
    </div>

    <section v-if="rows.length" class="workspace-card preview-card" data-testid="workspace-preview">
      <details open>
        <summary>Preview (top 20 rows)</summary>
        <div class="preview-card__table">
          <table data-testid="preview-table">
            <thead>
              <tr>
                <th v-for="c in columns" :key="c">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in rows.slice(0, 20)" :key="i">
                <td v-for="c in columns" :key="c">{{ r[c] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <RecipePanel
      v-if="hasWorkspaceData"
      :rows="rows"
      :columns="columns"
      @apply="onApplyRecipe"
    />
    <div v-if="hasWorkspaceData" ref="graphPanelRef">
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
    <div v-if="hasWorkspaceData" ref="chartBoardRef">
      <ChartsBoard
        :rows="rows"
        :columns="columns"
        :inline-charts="inlineBoardCharts"
        @clear-inline="clearInlineBoard"
      />
    </div>
    <div v-if="hasFullDataset" ref="statsPanelRef">
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
    <div v-if="hasFullDataset" ref="mlPanelRef">
      <MlPanel :rows="rows" :columns="columns" :profile-summary="profileSummary" :preset="mlPreset" />
    </div>
    <McpPanel
      v-if="hasFullDataset"
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

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.workspace-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-card {
  border: 1px solid #d6dee6;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.workspace-card--hero {
  padding: 18px 20px;
}

.workspace-hero {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.workspace-hero__kicker {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6b7280;
}

.workspace-hero h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.35;
}

.workspace-hero__subtitle {
  margin: 10px 0 0;
  max-width: 760px;
  color: #5f6b7a;
  line-height: 1.55;
}

.workspace-hero__meta {
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.workspace-badge {
  padding: 6px 10px;
  border: 1px solid #bbd7b0;
  border-radius: 999px;
  background: #edf9e8;
  color: #25663a;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.workspace-hero__name {
  font-size: 18px;
}

.workspace-hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #5f6b7a;
  font-size: 13px;
}

.workspace-hero__stats span {
  padding: 6px 9px;
  border: 1px solid #e5ebf1;
  border-radius: 999px;
  background: #f8fafc;
}

.workspace-card--toolbar {
  padding: 14px 16px;
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.toolbar-group--right {
  margin-left: auto;
}

.toolbar-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4b5563;
}

.toolbar-download {
  display: inline-flex;
}

.upload-card {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
  border-style: dashed;
}

.upload-card--drag {
  border-color: #2563eb;
  background: #f5f9ff;
}

.upload-card__copy h3 {
  margin: 0 0 8px;
  font-size: 20px;
}

.upload-card__copy p {
  margin: 0;
  color: #5f6b7a;
  line-height: 1.55;
}

.upload-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  color: #6b7280;
  font-size: 13px;
}

.upload-card__summary {
  min-width: 220px;
  display: grid;
  gap: 10px;
}

.summary-tile {
  padding: 12px;
  border: 1px solid #e5ebf1;
  border-radius: 10px;
  background: #f8fafc;
}

.summary-tile__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
}

.file-input {
  display: none;
}

.progress-card {
  padding: 14px 16px;
}

.progress-card__bar {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #e7edf3;
  overflow: hidden;
}

.progress-card__fill {
  height: 100%;
  background: linear-gradient(90deg, #1d4ed8, #60a5fa);
}

.progress-card__meta {
  margin-top: 8px;
  font-size: 12px;
  color: #5f6b7a;
}

.tabs-card {
  padding: 12px 14px;
}

.tabs-card__head {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
}

.workspace-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.1fr) minmax(280px, 0.9fr);
  gap: 16px;
}

.workspace-layout__main,
.workspace-layout__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.grid-card,
.log-card,
.preview-card {
  padding: 16px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.card-head h3 {
  margin: 0;
  font-size: 19px;
}

.card-head p {
  margin: 6px 0 0;
  color: #5f6b7a;
  line-height: 1.5;
}

.card-head__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #5f6b7a;
}

.card-head__stats span {
  padding: 5px 9px;
  border: 1px solid #dbe4ec;
  border-radius: 999px;
  background: #f8fafc;
}

.profile-strip {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #e5ebf1;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 13px;
  color: #4b5563;
}

.profile-strip__error {
  color: #c62828;
}

.preview-card details summary {
  cursor: pointer;
  font-weight: 700;
}

.preview-card__table {
  margin-top: 12px;
  overflow: auto;
}

.preview-card table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.preview-card th,
.preview-card td {
  padding: 8px 10px;
  border: 1px solid #e5ebf1;
  text-align: left;
  white-space: nowrap;
}

.log-card pre {
  margin: 0;
  min-height: 140px;
  max-height: 220px;
  overflow: auto;
  padding: 12px;
  border-radius: 10px;
  background: #f7f8fa;
  color: #344256;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

button {
  padding: 8px 12px;
  border: 1px solid #cbd5df;
  border-radius: 8px;
  background: #fff;
  color: #243446;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

button:disabled {
  opacity: 0.55;
  cursor: default;
}

.btn-primary {
  border-color: #1f4fbf;
  background: #1f4fbf;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #173f9a;
  border-color: #173f9a;
}

.workspace-tabs { display:flex; gap:8px; overflow:auto; padding-bottom:2px; }
.workspace-tab { display:flex; align-items:center; border:1px solid #d1d5db; border-radius:999px; background:#fff; }
.workspace-tab.active { border-color:#2563eb; background:#eff6ff; }
.tab-main { border:none; background:transparent; padding:4px 10px; display:flex; align-items:center; gap:6px; }
.tab-main:hover:not(:disabled),
.tab-close:hover:not(:disabled) { background: transparent; border-color: transparent; }
.tab-close { border:none; background:transparent; padding:4px 8px; color:#6b7280; }
.tab-meta { font-size:11px; color:#6b7280; }

@keyframes indet {
  0%{ transform: translateX(-100%); width: 30%; }
  50%{ transform: translateX(50%); width: 40%; }
  100%{ transform: translateX(200%); width: 30%; }
}

@media (max-width: 1024px) {
  .workspace-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .workspace-card--hero,
  .workspace-card--toolbar,
  .upload-card,
  .grid-card,
  .log-card,
  .preview-card {
    padding: 14px;
  }

  .upload-card,
  .workspace-hero,
  .card-head {
    flex-direction: column;
  }

  .toolbar-group--right {
    margin-left: 0;
  }

  .upload-card__summary {
    min-width: 0;
    width: 100%;
  }
}
</style>





