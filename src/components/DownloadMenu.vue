<script setup>
import { ref } from 'vue';
import { exportCSV } from '@/services/exportCSV';
import { exportXLSX } from '@/services/exportXlsx';

const props = defineProps({
  name: { type: String, default: 'dataset' },
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] }
});
const fmt = ref('xlsx');

function download() {
  if (!props.columns?.length) return;
  if (fmt.value === 'csv') exportCSV(props.name, props.columns, props.rows);
  else exportXLSX(props.name, props.columns, props.rows);
}
</script>

<template>
  <div class="download-menu">
    <select v-model="fmt">
      <option value="xlsx">XLSX</option>
      <option value="csv">CSV</option>
    </select>
    <button :disabled="!columns.length" @click="download">Download</button>
  </div>
</template>

<style scoped>
.download-menu {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

button {
  padding: 7px 11px;
  border: 1px solid #cbd5df;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

select {
  padding: 7px 11px;
  border: 1px solid #cbd5df;
  border-radius: 8px;
  background: #fff;
}

button:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>

