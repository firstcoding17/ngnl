<script setup>
import { ref, onMounted } from 'vue';
import {
  listRecent,
  loadDataset,
  deleteDataset,
  listDatasetVersions,
  loadDatasetVersion,
} from '@/stores/useDatasets';

const emit = defineEmits(['open', 'openMany']);

const items = ref([]);
const loading = ref(false);
const expandedId = ref('');
const versionsByDataset = ref({});
async function refresh() {
  loading.value = true;
  items.value = await listRecent(20);
  loading.value = false;
}
async function open(id) {
  const ds = await loadDataset(id);
  emit('open', {
    rows: ds.rows,
    columns: ds.columns,
    name: ds.name,
    id: ds.id,
    version: ds.version,
    meta: ds.meta,
  });
}
async function remove(id) {
  if (!confirm('Delete this dataset?')) return;
  await deleteDataset(id);
  if (expandedId.value === id) expandedId.value = '';
  await refresh();
}
async function toggleHistory(datasetId) {
  if (expandedId.value === datasetId) {
    expandedId.value = '';
    return;
  }
  expandedId.value = datasetId;
  if (!versionsByDataset.value[datasetId]) {
    const history = await listDatasetVersions(datasetId, 20);
    versionsByDataset.value = { ...versionsByDataset.value, [datasetId]: history };
  }
}
async function openVersion(versionId) {
  const ds = await loadDatasetVersion(versionId);
  emit('open', {
    rows: ds.rows,
    columns: ds.columns,
    name: ds.name,
    id: ds.datasetId,
    version: ds.version,
    meta: ds.meta,
    rollback: true,
  });
}
function openMany() {
  if (!items.value.length) return;
  emit('openMany', items.value.map((ds) => ({
    rows: ds.rows,
    columns: ds.columns,
    name: ds.name,
    id: ds.id,
    version: ds.version,
    meta: ds.meta,
  })));
}
onMounted(refresh);
</script>

<template>
  <div class="p-3 border rounded space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">Recent Datasets</h3>
      <div class="flex gap-2">
        <button :disabled="loading || !items.length" @click="openMany">Open all</button>
        <button @click="refresh">Refresh</button>
      </div>
    </div>
    <div v-if="loading" class="text-sm text-gray-500">Loading...</div>
    <ul v-else>
      <li v-for="ds in items" :key="ds.id" class="py-1">
        <div class="flex items-center justify-between">
          <div class="truncate">
            <b>{{ ds.name }}</b>
            <span class="text-xs text-gray-500"> | {{ new Date(ds.updatedAt).toLocaleString() }}</span>
            <span class="text-xs text-gray-500">
              | v{{ ds.version ?? 1 }} | {{ ds.meta?.rowCount ?? ds.rows?.length ?? 0 }} rows /
              {{ ds.meta?.colCount ?? ds.columns?.length ?? 0 }} cols
            </span>
          </div>
          <div class="flex gap-2">
            <button @click="open(ds.id)">Open</button>
            <button @click="toggleHistory(ds.id)">{{ expandedId === ds.id ? 'Hide history' : 'History' }}</button>
            <button @click="remove(ds.id)">Delete</button>
          </div>
        </div>
        <div v-if="expandedId === ds.id" class="mt-2 ml-2 space-y-1">
          <div v-if="!(versionsByDataset[ds.id] || []).length" class="text-xs text-gray-500">
            No versions found.
          </div>
          <div
            v-for="ver in (versionsByDataset[ds.id] || [])"
            :key="ver.id"
            class="flex items-center justify-between text-xs"
          >
            <span class="text-gray-600">
              v{{ ver.version }} | {{ new Date(ver.createdAt).toLocaleString() }} |
              {{ ver.meta?.rowCount ?? ver.rows?.length ?? 0 }} rows /
              {{ ver.meta?.colCount ?? ver.columns?.length ?? 0 }} cols
            </span>
            <button @click="openVersion(ver.id)">Rollback</button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
</style>


