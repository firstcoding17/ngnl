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
  <div class="flex items-center gap-2">
    <select v-model="fmt">
      <option value="xlsx">XLSX</option>
      <option value="csv">CSV</option>
    </select>
    <button :disabled="!columns.length" @click="download">Download</button>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
select { padding:6px 10px; border:1px solid #ddd; border-radius:8px; }
</style>

