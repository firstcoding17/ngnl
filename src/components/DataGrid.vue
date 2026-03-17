<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }
});
const emit = defineEmits(['update', 'columns']);
const defaultColDef = { sortable:true, filter:true, resizable:true, editable:true };
const gridApi = ref(null);
const gridColumnApi = ref(null);
const rowData = ref([]);
const colDefs = ref([]);

watch(()=>props.columns, (cols)=>{
  colDefs.value = (cols||[]).map((c)=>({
    field: c, headerName: c, editable: true, sortable: true, filter: true, resizable: true
  }));
},{ immediate:true });

watch(()=>props.rows, (r)=>{ rowData.value = structuredClone(r||[]); },{ immediate:true });

// Selected column based on current cell range
function currentCol() {
  const cs = gridApi.value?.getCellRanges?.()[0];
  const col = cs?.columns?.[0]?.colId;
  return col;
}

function onGridReady(params){
  gridApi.value = params.api;
  gridColumnApi.value = params.columnApi;
  params.api.setRowData(rowData.value);
  params.api.sizeColumnsToFit();
}

// Toolbar actions
function addRow(){
  rowData.value.push(Object.fromEntries((props.columns||[]).map(c=>[c,''])));
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.ensureIndexVisible(rowData.value.length-1));
}
function delSelectedRows(){
  const sel = gridApi.value.getSelectedRows?.() || [];
  if (!sel.length) return;
  rowData.value = rowData.value.filter(r => !sel.includes(r));
  emit('update', rowData.value.map(r => ({ ...r })));
}
function addColumn(){
  const base = 'col';
  let i = props.columns.length+1;
  let name = `${base}${i}`;
  while (props.columns.includes(name)) { i++; name = `${base}${i}`; }
  const newCols = [...props.columns, name];
  for (const r of rowData.value) r[name] = '';
  emit('columns', newCols);
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.sizeColumnsToFit());
}
function renameColumn(){
  const col = currentCol(); if (!col) return;
  const to = prompt(`Rename column "${col}" to:`, col)?.trim();
  if (!to || to===col) return;
  if (props.columns.includes(to)) { alert('A column with that name already exists.'); return; }
  const newCols = props.columns.map(c => c===col ? to : c);
  for (const r of rowData.value) { r[to] = r[col]; delete r[col]; }
  emit('columns', newCols);
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.setColumnDefs(newCols.map((c)=>({ field:c, editable:true, sortable:true, filter:true, resizable:true }))));
}
function delCurrentColumn(){
  const col = currentCol(); if (!col) return;
  if (!confirm(`Delete column '${col}'?`)) return;
  const newCols = props.columns.filter(c => c!==col);
  for (const r of rowData.value) delete r[col];
  emit('columns', newCols);
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.sizeColumnsToFit());
}

// Column quick transforms
function cmdTrim(){
  const col = currentCol(); if (!col) return;
  for (const r of rowData.value) if (r[col]!=null) r[col] = String(r[col]).trim();
 emit('update', rowData.value.map(r => ({ ...r })));
}
function cmdLower(){
  const col = currentCol(); if (!col) return;
  for (const r of rowData.value) if (r[col]!=null) r[col] = String(r[col]).toLowerCase();
  emit('update', rowData.value.map(r => ({ ...r })));
}
function cmdSplit(){
  const col = currentCol(); if (!col) return;
  const sep = prompt('Delimiter', ',') ?? ',';
  const idx = Number(prompt('Split index (0-based)', '0') ?? '0');
  for (const r of rowData.value) {
    const parts = String(r[col] ?? '').split(sep);
    r[col] = parts[idx] ?? '';
  }
  emit('update', rowData.value.map(r => ({ ...r })));
}
// Focus row and select it
function focusRow(index){
  if (!gridApi.value) return;
  gridApi.value.ensureIndexVisible(index);
  gridApi.value.deselectAll();
  const node = gridApi.value.getDisplayedRowAtIndex(index);
  if (node) node.setSelected(true);
}

// Apply equals filter to a single column
function filterEquals(col, value){
  if (!gridApi.value) return;
  const inst = gridApi.value.getFilterInstance(col);
  if (!inst) {
    gridApi.value.setFilterModel({ [col]: { type: 'equals', filter: String(value) }});
  } else {
    inst.setModel({ type: 'equals', filter: String(value) });
    gridApi.value.onFilterChanged();
  }
}

// Clear all active filters
function clearFilters(){
  if (!gridApi.value) return;
  gridApi.value.setFilterModel(null);
}

defineExpose({ focusRow, filterEquals, clearFilters });
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-sm text-gray-600">Grid Editor</span>
      <button @click="addRow">+ Row</button>
      <button @click="delSelectedRows">Delete selected rows</button>
      <span class="mx-2 h-6 w-px bg-gray-300"></span>
      <button @click="addColumn">+ Column</button>
      <button @click="renameColumn">Rename column</button>
      <button @click="delCurrentColumn">Delete current column</button>
      <span class="mx-2 h-6 w-px bg-gray-300"></span>
      <button @click="cmdTrim">=trim(col)</button>
      <button @click="cmdLower">=lower(col)</button>
      <button @click="cmdSplit">=split(col, sep, idx)</button>
      <span class="text-xs text-gray-500 ml-auto">Copy/Paste: Ctrl+C / Ctrl+V</span>
    </div>

    <div class="ag-theme-alpine" style="height: 520px; width: 100%;">
      <AgGridVue
        :defaultColDef="defaultColDef"
        :columnDefs="colDefs"
        :rowData="rowData"
        rowSelection="multiple"
        :enableRangeSelection="true"
        :suppressRowClickSelection="true"
        :ensureDomOrder="true"
        :enableCellTextSelection="true"
        @grid-ready="onGridReady"
        @cell-value-changed="(e)=>{ rowData[e.rowIndex][e.colDef.field]=e.newValue; emit('update', rowData) }"
      />
    </div>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
</style>

