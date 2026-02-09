<script setup>
import { ref, onMounted } from 'vue';
import { listRecent, loadDataset, deleteDataset } from '@/stores/useDatasets';

const emit = defineEmits(['open']);

const items = ref([]);
const loading = ref(false);
async function refresh() {
  loading.value = true;
  items.value = await listRecent(20);
  loading.value = false;
}
async function open(id) {
  const ds = await loadDataset(id);
  emit('open', { rows: ds.rows, columns: ds.columns, name: ds.name, id: ds.id });
}
async function remove(id) {
  if (!confirm('Delete this dataset?')) return;
  await deleteDataset(id);
  await refresh();
}
onMounted(refresh);
</script>

<template>
  <div class="p-3 border rounded space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">Recent Datasets</h3>
      <button @click="refresh">Refresh</button>
    </div>
    <div v-if="loading" class="text-sm text-gray-500">Loading...</div>
    <ul v-else>
      <li v-for="ds in items" :key="ds.id" class="flex items-center justify-between py-1">
        <div class="truncate">
          <b>{{ ds.name }}</b>
          <span class="text-xs text-gray-500"> | {{ new Date(ds.updatedAt).toLocaleString() }}</span>
          <span class="text-xs text-gray-500"> | {{ ds.rows?.length ?? 0 }} rows / {{ ds.columns?.length ?? 0 }} cols</span>
        </div>
        <div class="flex gap-2">
          <button @click="open(ds.id)">Open</button>
          <button @click="remove(ds.id)">Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
</style>


