<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const props = defineProps<{ rows:any[], columns:string[] }>();
const emit = defineEmits<{ (e:'update', rows:any[]):void, (e:'columns', columns:string[]):void }>();
const defaultColDef = { sortable:true, filter:true, resizable:true, editable:true };
const gridApi = ref<any>(null);
const gridColumnApi = ref<any>(null);
const rowData = ref<any[]>([]);
const colDefs = ref<any[]>([]);

watch(()=>props.columns, (cols)=>{
  colDefs.value = (cols||[]).map((c:string)=>({
    field: c, headerName: c, editable: true, sortable: true, filter: true, resizable: true
  }));
},{ immediate:true });

watch(()=>props.rows, (r)=>{ rowData.value = structuredClone(r||[]); },{ immediate:true });

// 편의: 현재 선택된 셀의 컬럼
function currentCol(): string|undefined {
  const cs = gridApi.value?.getCellRanges?.()[0];
  const col = cs?.columns?.[0]?.colId;
  return col;
}

function onGridReady(params:any){
  gridApi.value = params.api;
  gridColumnApi.value = params.columnApi;
  params.api.setRowData(rowData.value);
  params.api.sizeColumnsToFit();
}

// ----- 툴바 액션 -----
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
  for (const r of rowData.value) (r as any)[name] = '';
  emit('columns', newCols);
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.sizeColumnsToFit());
}
function renameColumn(){
  const col = currentCol(); if (!col) return;
  const to = prompt(`컬럼명 변경: ${col} →`, col)?.trim();
  if (!to || to===col) return;
  if (props.columns.includes(to)) { alert('같은 이름의 컬럼이 이미 있습니다.'); return; }
  const newCols = props.columns.map(c => c===col ? to : c);
  for (const r of rowData.value) { (r as any)[to]=(r as any)[col]; delete (r as any)[col]; }
  emit('columns', newCols);
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.setColumnDefs(newCols.map((c:string)=>({ field:c, editable:true, sortable:true, filter:true, resizable:true }))));
}
function delCurrentColumn(){
  const col = currentCol(); if (!col) return;
  if (!confirm(`컬럼 '${col}' 을(를) 삭제할까요?`)) return;
  const newCols = props.columns.filter(c => c!==col);
  for (const r of rowData.value) delete (r as any)[col];
  emit('columns', newCols);
  emit('update', rowData.value.map(r => ({ ...r })));
  nextTick(()=> gridApi.value.sizeColumnsToFit());
}

// 편의 함수: trim/lower/split 같은 경량 변환
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
  const sep = prompt('구분자', ',') ?? ',';
  const idx = Number(prompt('인덱스(0부터)', '0') ?? '0');
  for (const r of rowData.value) {
    const parts = String(r[col] ?? '').split(sep);
    r[col] = parts[idx] ?? '';
  }
  emit('update', rowData.value.map(r => ({ ...r })));
}

</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-sm text-gray-600">엑셀형 편집</span>
      <button @click="addRow">+ 행</button>
      <button @click="delSelectedRows">행 삭제</button>
      <span class="mx-2 h-6 w-px bg-gray-300"></span>
      <button @click="addColumn">+ 열</button>
      <button @click="renameColumn">열 이름 변경</button>
      <button @click="delCurrentColumn">열 삭제</button>
      <span class="mx-2 h-6 w-px bg-gray-300"></span>
      <button @click="cmdTrim">=trim(col)</button>
      <button @click="cmdLower">=lower(col)</button>
      <button @click="cmdSplit">=split(col, sep, idx)</button>
      <span class="text-xs text-gray-500 ml-auto">복사/붙여넣기: Ctrl+C / Ctrl+V</span>
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
        @cell-value-changed="(e:any)=>{ rowData[e.rowIndex][e.colDef.field]=e.newValue; emit('update', rowData) }"
      />
    </div>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
</style>
