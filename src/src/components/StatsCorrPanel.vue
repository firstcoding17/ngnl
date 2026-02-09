<script setup>
import { ref } from 'vue';
import { runStatCorr } from '@/services/statApi';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }
});

const loading = ref(false);
const result = ref(null);
const err = ref('');

const emit = defineEmits(['openHeatmap']);

async function run(){
  err.value = '';
  loading.value = true;
  try {
    result.value = await runStatCorr(props.rows, { topNPairs: 20 });
  } catch(e) {
    err.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}

function openHeatmap(){
  const fig = result.value?.figures?.[0];
  if (!fig) return;
  emit('openHeatmap', { x: fig.x, y: fig.y, z: fig.z, title: 'Correlation Heatmap' });
}
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div class="font-semibold">Correlation</div>
      <button class="ml-auto" @click="run" :disabled="loading || !rows.length">
        {{ loading ? 'Running...' : 'Run correlation' }}
      </button>
      <button v-if="result?.figures?.length" @click="openHeatmap">Open heatmap</button>
    </div>

    <div v-if="err" class="text-sm text-red-600">{{ err }}</div>

    <div v-if="result?.warnings?.length" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
      <div v-for="w in result.warnings" :key="w">- {{ w }}</div>
    </div>

    <div v-if="result?.tables?.length" class="space-y-3">
      <div v-for="t in result.tables" :key="t.name" class="border rounded p-2">
        <div class="text-sm font-semibold mb-2">{{ t.name }}</div>
        <div class="overflow-auto">
          <table class="min-w-full text-xs">
            <thead>
              <tr>
                <th v-for="c in t.columns" :key="c" class="text-left p-1 border-b">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r,idx) in t.rows" :key="idx">
                <td v-for="(cell,j) in r" :key="j" class="p-1 border-b">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="result" class="text-xs text-gray-600">{{ result.summary?.conclusion }}</div>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
button:disabled { opacity:.6; cursor:not-allowed; }
</style>

