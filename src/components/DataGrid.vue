<script setup>
import { ref, watch, nextTick } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }
});

const emit = defineEmits(['update', 'columns']);

const defaultColDef = {
  sortable: true,
  filter: true,
  resizable: true,
  editable: true
};

const gridApi = ref(null);
const gridColumnApi = ref(null);
const rowData = ref([]);
const colDefs = ref([]);

watch(
  () => props.columns,
  (cols) => {
    colDefs.value = (cols || []).map((c) => ({
      field: c,
      headerName: c,
      editable: true,
      sortable: true,
      filter: true,
      resizable: true
    }));
  },
  { immediate: true }
);

watch(
  () => props.rows,
  (r) => {
    rowData.value = Array.isArray(r)
      ? r.map((row) => (row && typeof row === 'object' ? { ...row } : row))
      : [];
  },
  { immediate: true }
);

function currentCol() {
  const cs = gridApi.value?.getCellRanges?.()?.[0];
  const col = cs?.columns?.[0]?.colId;
  return col;
}

function onGridReady(params) {
  gridApi.value = params.api;
  gridColumnApi.value = params.columnApi;
  if (colDefs.value.length) {
    params.api.sizeColumnsToFit();
  }
}

function addRow() {
  rowData.value.push(Object.fromEntries((props.columns || []).map((c) => [c, ''])));
  emit('update', rowData.value.map((r) => ({ ...r })));
  nextTick(() => gridApi.value?.ensureIndexVisible?.(rowData.value.length - 1));
}

function delSelectedRows() {
  const sel = gridApi.value?.getSelectedRows?.() || [];
  if (!sel.length) return;
  rowData.value = rowData.value.filter((r) => !sel.includes(r));
  emit('update', rowData.value.map((r) => ({ ...r })));
}

function addColumn() {
  const base = 'col';
  let i = props.columns.length + 1;
  let name = `${base}${i}`;
  while (props.columns.includes(name)) {
    i++;
    name = `${base}${i}`;
  }
  const newCols = [...props.columns, name];
  for (const r of rowData.value) r[name] = '';
  emit('columns', newCols);
  emit('update', rowData.value.map((r) => ({ ...r })));
  nextTick(() => gridApi.value?.sizeColumnsToFit?.());
}

function renameColumn() {
  const col = currentCol();
  if (!col) return;
  const to = prompt(`Rename column "${col}" to:`, col)?.trim();
  if (!to || to === col) return;
  if (props.columns.includes(to)) {
    alert('A column with that name already exists.');
    return;
  }
  const newCols = props.columns.map((c) => (c === col ? to : c));
  for (const r of rowData.value) {
    r[to] = r[col];
    delete r[col];
  }
  emit('columns', newCols);
  emit('update', rowData.value.map((r) => ({ ...r })));
  nextTick(() => {
    gridApi.value?.setGridOption?.(
      'columnDefs',
      newCols.map((c) => ({
        field: c,
        headerName: c,
        editable: true,
        sortable: true,
        filter: true,
        resizable: true
      }))
    );
    gridApi.value?.sizeColumnsToFit?.();
  });
}

function delCurrentColumn() {
  const col = currentCol();
  if (!col) return;
  if (!confirm(`Delete column '${col}'?`)) return;
  const newCols = props.columns.filter((c) => c !== col);
  for (const r of rowData.value) delete r[col];
  emit('columns', newCols);
  emit('update', rowData.value.map((r) => ({ ...r })));
  nextTick(() => gridApi.value?.sizeColumnsToFit?.());
}

function cmdTrim() {
  const col = currentCol();
  if (!col) return;
  for (const r of rowData.value) {
    if (r[col] != null) r[col] = String(r[col]).trim();
  }
  emit('update', rowData.value.map((r) => ({ ...r })));
}

function cmdLower() {
  const col = currentCol();
  if (!col) return;
  for (const r of rowData.value) {
    if (r[col] != null) r[col] = String(r[col]).toLowerCase();
  }
  emit('update', rowData.value.map((r) => ({ ...r })));
}

function cmdSplit() {
  const col = currentCol();
  if (!col) return;
  const sep = prompt('Delimiter', ',') ?? ',';
  const idx = Number(prompt('Split index (0-based)', '0') ?? '0');
  for (const r of rowData.value) {
    const parts = String(r[col] ?? '').split(sep);
    r[col] = parts[idx] ?? '';
  }
  emit('update', rowData.value.map((r) => ({ ...r })));
}

function focusRow(index) {
  if (!gridApi.value) return;
  gridApi.value.ensureIndexVisible(index);
  gridApi.value.deselectAll?.();
  const node = gridApi.value.getDisplayedRowAtIndex?.(index);
  if (node) node.setSelected(true);
}

function filterEquals(col, value) {
  if (!gridApi.value) return;
  gridApi.value.setFilterModel({
    ...(gridApi.value.getFilterModel?.() || {}),
    [col]: { type: 'equals', filter: String(value) }
  });
  gridApi.value.onFilterChanged?.();
}

function clearFilters() {
  if (!gridApi.value) return;
  gridApi.value.setFilterModel(null);
}

defineExpose({ focusRow, filterEquals, clearFilters });
</script>

<template>
  <div class="grid-editor">
    <div class="grid-editor__toolbar">
      <div class="grid-editor__group">
        <span class="grid-editor__label">Grid Editor</span>
        <button type="button" @click="addRow">+ Row</button>
        <button type="button" :disabled="!rowData.length" @click="delSelectedRows">Delete selected rows</button>
      </div>
      <div class="grid-editor__group">
        <button type="button" @click="addColumn">+ Column</button>
        <button type="button" :disabled="!columns.length" @click="renameColumn">Rename column</button>
        <button type="button" :disabled="!columns.length" @click="delCurrentColumn">Delete current column</button>
      </div>
      <div class="grid-editor__group">
        <button type="button" :disabled="!columns.length" @click="cmdTrim">Trim</button>
        <button type="button" :disabled="!columns.length" @click="cmdLower">Lower</button>
        <button type="button" :disabled="!columns.length" @click="cmdSplit">Split</button>
      </div>
      <div class="grid-editor__hint">셀 편집, 다중 선택, 복사/붙여넣기를 바로 사용할 수 있습니다.</div>
    </div>

    <div class="grid-editor__frame">
      <div v-if="!columns.length && !rowData.length" class="grid-editor__empty">
        <h4>빈 데이터 그리드</h4>
        <p>파일을 올리거나 새 데이터셋을 만들면 표가 바로 여기에 표시됩니다.</p>
        <button type="button" @click="addColumn">첫 컬럼 만들기</button>
      </div>

      <div class="ag-theme-alpine grid-editor__table">
        <AgGridVue
          theme="legacy"
          :defaultColDef="defaultColDef"
          :columnDefs="colDefs"
          :rowData="rowData"
          :rowSelection="{ mode: 'multiRow', enableClickSelection: false }"
          :ensureDomOrder="true"
          :enableCellTextSelection="true"
          @grid-ready="onGridReady"
          @cell-value-changed="(e) => {
            rowData[e.rowIndex][e.colDef.field] = e.newValue;
            emit('update', rowData.map((r) => ({ ...r })));
          }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid #d6dee6;
  border-radius: 10px;
  background: #f8fafc;
}

.grid-editor__group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.grid-editor__label {
  font-size: 13px;
  font-weight: 700;
  color: #4a5565;
  margin-right: 4px;
}

.grid-editor__hint {
  margin-left: auto;
  font-size: 12px;
  color: #6b7280;
}

.grid-editor__frame {
  position: relative;
  min-height: 520px;
  border: 1px solid #d6dee6;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.grid-editor__table {
  height: 520px;
  width: 100%;
}

.grid-editor__empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.98)),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 30px,
      rgba(148, 163, 184, 0.08) 30px,
      rgba(148, 163, 184, 0.08) 31px
    );
  text-align: center;
  padding: 20px;
}

.grid-editor__empty h4 {
  margin: 0;
  font-size: 20px;
}

.grid-editor__empty p {
  margin: 0;
  max-width: 420px;
  color: #5f6b7a;
  line-height: 1.5;
}

button {
  padding: 7px 12px;
  border: 1px solid #cbd5df;
  border-radius: 8px;
  background: #fff;
  color: #243446;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

button:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 900px) {
  .grid-editor__hint {
    width: 100%;
    margin-left: 0;
  }
}
</style>
