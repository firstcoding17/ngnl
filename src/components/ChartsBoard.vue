<script setup>
import { computed, ref, onMounted, nextTick } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import { listCharts, loadChart, deleteChart, saveChart } from '@/stores/useCharts';
import { saveBoard, listBoards, loadBoard, deleteBoard } from '@/stores/useBoards';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  inlineCharts: { type: Array, default: () => [] },
});
defineEmits(['clear-inline']);

const items = ref([]);
const canvasRefs = ref({});
const inlineCanvasRefs = ref({});
const boardSaveFormat = ref('png');
const activeBoardId = ref('');
const activeBoardName = ref('');
const isBoardMode = computed(() => !!activeBoardId.value);
const visibleInlineCharts = computed(() => (Array.isArray(props.inlineCharts) ? props.inlineCharts : []).filter((item) => item?.spec));

function serializeBoardItems(source = items.value) {
  return (Array.isArray(source) ? source : []).map((item, idx) => {
    const snapshot = item?.snapshot || ((item?.rows || item?.columns)
      ? {
        name: item.name,
        spec: item.spec,
        rows: item.rows || props.rows,
        columns: item.columns || props.columns,
      }
      : undefined);
    return {
      chartId: item.id,
      hidden: !!item.hidden,
      order: typeof item.order === 'number' ? item.order : idx,
      ...(snapshot ? { snapshot: { ...snapshot, name: item.name || snapshot.name } } : {}),
    };
  });
}

async function persistActiveBoard(nextItems = items.value) {
  if (!activeBoardId.value) return;
  await saveBoard(activeBoardName.value || 'Board', serializeBoardItems(nextItems), activeBoardId.value);
}

async function refresh() {
  const docs = await listCharts(100);
  const loaded = [];
  for (const d of docs) {
    const doc = await loadChart(d.id);
    loaded.push({ id: d.id, name: doc.name, spec: doc.spec });
  }
  items.value = loaded;
  activeBoardId.value = '';
  activeBoardName.value = '';
  await nextTick();
}

async function remove(id) {
  if (isBoardMode.value) {
    if (!confirm('Remove this chart from the opened board?')) return;
    const next = items.value
      .filter((item) => item.id !== id)
      .map((item, idx) => ({ ...item, order: idx }));
    items.value = next;
    await persistActiveBoard(next);
    return;
  }
  if (!confirm('Delete this chart?')) return;
  await deleteChart(id);
  await refresh();
}

async function rename(it) {
  const to = prompt('Rename chart', it.name)?.trim();
  if (!to || to === it.name) return;
  if (isBoardMode.value) {
    try {
      await saveChart(to, it.spec, it.id);
    } catch (_) {
      // keep board rename even if backing chart doc is unavailable
    }
    it.name = to;
    if (it.snapshot) {
      it.snapshot = { ...it.snapshot, name: to };
    }
    await persistActiveBoard();
    return;
  }
  await saveChart(to, it.spec, it.id);
  await refresh();
}

function dl(id, fmt) {
  canvasRefs.value[id]?.toImage(fmt, items.value.find((i) => i.id === id)?.name || 'chart');
}

function dlInline(id, fmt, fallbackName = 'chart') {
  inlineCanvasRefs.value[id]?.toImage(fmt, fallbackName);
}

function saveInlineAll() {
  visibleInlineCharts.value.forEach((it, idx) => {
    setTimeout(() => {
      dlInline(it.id, boardSaveFormat.value, it.name || 'compare-chart');
    }, idx * 200);
  });
}

function saveAll() {
  const visible = items.value.filter((i) => !i.hidden);
  visible.forEach((it, idx) => {
    setTimeout(() => {
      dl(it.id, boardSaveFormat.value);
    }, idx * 200);
  });
}

async function saveCurrentBoard() {
  if (!items.value.length) return alert('No charts to save.');
  const name = prompt('Board name', activeBoardName.value || 'My Board');
  if (!name) return;

  const boardId = await saveBoard(name, serializeBoardItems(), activeBoardId.value || undefined);
  activeBoardId.value = boardId;
  activeBoardName.value = name;
  alert('Board saved.');
}

async function saveInlineBoard() {
  if (!visibleInlineCharts.value.length) return alert('No live compare charts to save.');
  const name = prompt('Board name', 'Live Compare Board');
  if (!name) return;

  const snapshotItems = [];
  for (let idx = 0; idx < visibleInlineCharts.value.length; idx += 1) {
    const chart = visibleInlineCharts.value[idx];
    const chartId = await saveChart(chart.name || `compare-chart-${idx + 1}`, chart.spec);
    snapshotItems.push({
      chartId,
      hidden: false,
      order: idx,
      snapshot: {
        name: chart.name || `compare-chart-${idx + 1}`,
        spec: chart.spec,
        rows: Array.isArray(chart.rows) ? chart.rows : props.rows,
        columns: Array.isArray(chart.columns) ? chart.columns : props.columns,
      },
    });
  }

  await saveBoard(name, snapshotItems);
  alert('Live compare board saved.');
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
    if (bi?.snapshot?.spec) {
      next.push({
        id: bi.chartId || `board-snapshot-${idx}`,
        name: bi.snapshot.name || `Board chart ${idx + 1}`,
        spec: bi.snapshot.spec,
        rows: Array.isArray(bi.snapshot.rows) ? bi.snapshot.rows : props.rows,
        columns: Array.isArray(bi.snapshot.columns) ? bi.snapshot.columns : props.columns,
        snapshot: bi.snapshot,
        hidden: !!bi.hidden,
        order: typeof bi.order === 'number' ? bi.order : idx,
      });
      continue;
    }
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
  activeBoardId.value = board.id || sel.trim();
  activeBoardName.value = board.name || 'Board';
}

async function deleteBoardDialog() {
  const boards = await listBoards();
  if (!boards.length) return alert('No boards.');

  const sel = prompt('Delete board ID:\n' + boards.map((b) => `${b.id} : ${b.name}`).join('\n'));
  if (!sel) return;

  await deleteBoard(sel.trim());
  alert('Board deleted.');
}

async function moveUp(i) {
  if (i <= 0) return;
  const a = items.value[i - 1];
  const b = items.value[i];
  const tmp = a.order ?? i - 1;
  a.order = b.order ?? i;
  b.order = tmp;
  items.value.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  if (isBoardMode.value) {
    await persistActiveBoard();
  }
}

async function moveDown(i) {
  if (i >= items.value.length - 1) return;
  const a = items.value[i];
  const b = items.value[i + 1];
  const tmp = a.order ?? i;
  a.order = b.order ?? i + 1;
  b.order = tmp;
  items.value.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  if (isBoardMode.value) {
    await persistActiveBoard();
  }
}

async function toggleHidden(i) {
  items.value[i].hidden = !items.value[i].hidden;
  if (isBoardMode.value) {
    await persistActiveBoard();
  }
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
      <select v-model="boardSaveFormat">
        <option value="png">PNG</option>
        <option value="jpeg">JPG</option>
        <option value="webp">WEBP</option>
        <option value="svg">SVG</option>
      </select>
      <button @click="saveAll">Save all</button>
      <button class="ml-auto" @click="refresh">Refresh</button>
    </div>
    <div v-if="isBoardMode" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
      Opened board: {{ activeBoardName || activeBoardId }}
    </div>

    <div v-if="visibleInlineCharts.length" class="space-y-2">
      <div class="flex items-center gap-2">
        <div class="text-sm font-medium">Live Compare Board</div>
        <button class="text-xs" @click="saveInlineBoard">Save live board</button>
        <button class="text-xs" @click="saveInlineAll">Export live board</button>
        <button class="text-xs" @click="$emit('clear-inline')">Clear inline board</button>
      </div>
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill,minmax(380px,1fr));">
        <div v-for="it in visibleInlineCharts" :key="`inline-${it.id}`" class="border rounded p-2 border-blue-200 bg-blue-50/40">
          <div class="flex items-center gap-2 mb-2">
            <div class="font-medium truncate">{{ it.name }}</div>
            <div class="ml-auto flex items-center gap-2">
              <button class="text-xs" @click="dlInline(it.id, 'png', it.name)">PNG</button>
              <button class="text-xs" @click="dlInline(it.id, 'svg', it.name)">SVG</button>
            </div>
          </div>
          <ChartCanvas
            :rows="it.rows || props.rows"
            :columns="it.columns || props.columns"
            :spec="it.spec"
            :ref="(el) => (inlineCanvasRefs[it.id] = el)"
          />
        </div>
      </div>
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
          :rows="it.rows || props.rows"
          :columns="it.columns || props.columns"
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
