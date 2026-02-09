<script setup>
import { ref, onMounted, nextTick } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import { listCharts, loadChart, deleteChart, saveChart } from '@/stores/useCharts';
import { saveBoard, listBoards, loadBoard, deleteBoard } from '@/stores/useBoards';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
});

const items = ref([]);
const canvasRefs = ref({});

async function refresh() {
  const docs = await listCharts(100);
  const loaded = [];
  for (const d of docs) {
    const doc = await loadChart(d.id);
    loaded.push({ id: d.id, name: doc.name, spec: doc.spec });
  }
  items.value = loaded;
  await nextTick();
}

async function remove(id) {
  if (!confirm('Delete this chart?')) return;
  await deleteChart(id);
  await refresh();
}

async function rename(it) {
  const to = prompt('Rename chart', it.name)?.trim();
  if (!to || to === it.name) return;
  await saveChart(to, it.spec, it.id);
  await refresh();
}

function dl(id, fmt) {
  canvasRefs.value[id]?.toImage(fmt, items.value.find((i) => i.id === id)?.name || 'chart');
}

async function saveCurrentBoard() {
  if (!items.value.length) return alert('No charts to save.');
  const name = prompt('Board name', 'My Board');
  if (!name) return;

  const ids = items.value.map((i, idx) => ({
    chartId: i.id,
    hidden: !!i.hidden,
    order: typeof i.order === 'number' ? i.order : idx,
  }));

  await saveBoard(name, ids);
  alert('Board saved.');
}

async function openBoard() {
  const boards = await listBoards();
  if (!boards.length) return alert('No saved boards.');

  const sel = prompt('Board ID:\n' + boards.map((b) => `${b.id} : ${b.name}`).join('\n'));
  if (!sel) return;

  const board = await loadBoard(sel.trim());
  const next = [];

  for (let idx = 0; idx < board.items.length; idx += 1) {
    const bi = board.items[idx];
    try {
      const doc = await loadChart(bi.chartId);
      next.push({
        id: doc.id,
        name: doc.name,
        spec: doc.spec,
        hidden: !!bi.hidden,
        order: typeof bi.order === 'number' ? bi.order : idx,
      });
    } catch (_) {
      // ignore missing chart docs
    }
  }

  items.value = next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function deleteBoardDialog() {
  const boards = await listBoards();
  if (!boards.length) return alert('No boards.');

  const sel = prompt('Delete board ID:\n' + boards.map((b) => `${b.id} : ${b.name}`).join('\n'));
  if (!sel) return;

  await deleteBoard(sel.trim());
  alert('Board deleted.');
}

function moveUp(i) {
  if (i <= 0) return;
  const a = items.value[i - 1];
  const b = items.value[i];
  const tmp = a.order ?? i - 1;
  a.order = b.order ?? i;
  b.order = tmp;
  items.value.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
}

function moveDown(i) {
  if (i >= items.value.length - 1) return;
  const a = items.value[i];
  const b = items.value[i + 1];
  const tmp = a.order ?? i;
  a.order = b.order ?? i + 1;
  b.order = tmp;
  items.value.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
}

function toggleHidden(i) {
  items.value[i].hidden = !items.value[i].hidden;
}

onMounted(refresh);
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold">Chart Board</h3>
      <button @click="saveCurrentBoard">Save board</button>
      <button @click="openBoard">Open board</button>
      <button @click="deleteBoardDialog">Delete board</button>
      <button class="ml-auto" @click="refresh">Refresh</button>
    </div>

    <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill,minmax(380px,1fr));">
      <div
        v-for="(it, idx) in items"
        :key="it.id"
        class="border rounded p-2"
        :style="it.hidden ? 'opacity:.4; filter:grayscale(0.3);' : ''"
      >
        <div class="flex items-center gap-2 mb-2">
          <div class="font-medium truncate">{{ it.name }}</div>
          <div class="ml-auto flex items-center gap-2">
            <button class="text-xs" @click="moveUp(idx)">Up</button>
            <button class="text-xs" @click="moveDown(idx)">Down</button>
            <button class="text-xs" @click="toggleHidden(idx)">{{ it.hidden ? 'Show' : 'Hide' }}</button>
            <button class="text-xs" @click="rename(it)">Rename</button>
            <button class="text-xs" @click="dl(it.id, 'png')">PNG</button>
            <button class="text-xs" @click="dl(it.id, 'svg')">SVG</button>
            <button class="text-xs" @click="remove(it.id)">Delete</button>
          </div>
        </div>

        <ChartCanvas
          v-if="!it.hidden"
          :rows="props.rows"
          :columns="props.columns"
          :spec="it.spec"
          :ref="(el) => (canvasRefs[it.id] = el)"
        />
        <div v-else class="text-xs text-gray-500 py-6 text-center">Hidden</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
}
</style>