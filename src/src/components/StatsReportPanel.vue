<script setup>
import { ref } from 'vue';
import { runStatDescribe } from '@/services/statApi';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }
});

const loading = ref(false);
const result = ref(null);
const err = ref('');

async function run(){
  err.value = '';
  loading.value = true;
  try {
    result.value = await runStatDescribe(props.rows, props.columns, { topNCat: 10 });
  } catch(e) {
    err.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div class="font-semibold">Stat Report</div>
      <button class="ml-auto" @click="run" :disabled="loading || !rows.length">
        {{ loading ? 'Running...' : 'Generate Report' }}
      </button>
    </div>

    <div v-if="err" class="text-sm text-red-600">{{ err }}</div>

    <div v-if="result">
      <div class="text-sm mb-2">
        <b>{{ result.summary?.title }}</b> /
        rows {{ result.summary?.stats?.rows }} / cols {{ result.summary?.stats?.cols }} /
        dup_rows {{ result.summary?.stats?.dup_rows }}
        <span class="ml-2 text-xs text-gray-500">({{ result.meta?.execMs }}ms)</span>
      </div>

      <div v-if="result.warnings?.length" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        <div v-for="w in result.warnings" :key="w">- {{ w }}</div>
      </div>

      <div class="space-y-3 mt-3">
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

      <div class="text-xs text-gray-600 mt-2">{{ result.summary?.conclusion }}</div>
    </div>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
button:disabled { opacity:.6; cursor:not-allowed; }
</style>

