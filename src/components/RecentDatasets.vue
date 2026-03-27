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

defineExpose({ refresh });
</script>

<template>
  <div class="recent-card" data-testid="recent-datasets">
    <div class="recent-card__head">
      <h3>Recent Datasets</h3>
      <div class="recent-card__actions">
        <button :disabled="loading || !items.length" @click="openMany">Open all</button>
        <button @click="refresh">Refresh</button>
      </div>
    </div>
    <div v-if="loading" class="recent-card__state">Loading...</div>
    <ul v-else class="recent-list">
      <li v-for="ds in items" :key="ds.id" class="recent-item">
        <div class="recent-item__row">
          <div class="recent-item__meta">
            <b>{{ ds.name }}</b>
            <span class="recent-item__stamp">| {{ new Date(ds.updatedAt).toLocaleString() }}</span>
            <span class="recent-item__stamp">
              | v{{ ds.version ?? 1 }} | {{ ds.meta?.rowCount ?? ds.rows?.length ?? 0 }} rows /
              {{ ds.meta?.colCount ?? ds.columns?.length ?? 0 }} cols
            </span>
          </div>
          <div class="recent-item__actions">
            <button @click="open(ds.id)">Open</button>
            <button @click="toggleHistory(ds.id)">{{ expandedId === ds.id ? 'Hide history' : 'History' }}</button>
            <button @click="remove(ds.id)">Delete</button>
          </div>
        </div>
        <div v-if="expandedId === ds.id" class="recent-history">
          <div v-if="!(versionsByDataset[ds.id] || []).length" class="recent-history__empty">
            No versions found.
          </div>
          <div
            v-for="ver in (versionsByDataset[ds.id] || [])"
            :key="ver.id"
            class="recent-history__row"
          >
            <span class="recent-history__meta">
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
.recent-card {
  border: 1px solid #d6dee6;
  border-radius: 12px;
  background: #fff;
  padding: 14px;
}

.recent-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

h3 {
  margin: 0;
  font-size: 18px;
}

.recent-card__actions,
.recent-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recent-card__state,
.recent-history__empty {
  font-size: 13px;
  color: #6b7280;
}

.recent-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent-item {
  padding: 12px 0;
  border-top: 1px solid #eef2f7;
}

.recent-item:first-child {
  border-top: none;
  padding-top: 0;
}

.recent-item__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.recent-item__meta {
  min-width: 0;
  line-height: 1.5;
}

.recent-item__stamp,
.recent-history__meta {
  font-size: 12px;
  color: #6b7280;
}

.recent-history {
  margin-top: 10px;
  margin-left: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-history__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

button {
  padding: 7px 11px;
  border: 1px solid #cbd5df;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #f8fafc;
}

button:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 860px) {
  .recent-card__head,
  .recent-item__row,
  .recent-history__row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>


