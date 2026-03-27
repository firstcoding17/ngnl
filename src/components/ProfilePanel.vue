<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  rows: { type: Array, default: () => [] }
});
const emit = defineEmits(['summary']);
const worker = new Worker(new URL('../workers/profile.worker.js', import.meta.url), { type:'module' });

const state = ref(null);
const loading = ref(false);
const error = ref('');

function cloneRowsForWorker(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    return { ...row };
  });
}

function emitSummary() {
  emit('summary', {
    loading: loading.value,
    error: error.value,
    sampleCount: state.value?.sampleCount || 0,
    duplicates: state.value?.duplicates || 0,
    warnings: Array.isArray(state.value?.warnings) ? state.value.warnings : [],
    topCorrCount: Array.isArray(state.value?.topCorr) ? state.value.topCorr.length : 0,
    topAnovaCount: Array.isArray(state.value?.topAnova) ? state.value.topAnova.length : 0,
  });
}

function run(){
  if (!props.rows?.length) {
    state.value = null;
    loading.value = false;
    error.value = '';
    emitSummary();
    return;
  }
  loading.value = true;
  error.value = '';
  emitSummary();
  worker.postMessage({ rows: cloneRowsForWorker(props.rows), sampleSize: 1000, numericHint: [] });
}
onMounted(()=> {
  worker.onmessage = (e) => {
    const { ok, data, error: workerError } = e.data || {};
    if (!ok) {
      state.value = null;
      loading.value = false;
      error.value = workerError || 'Profile analysis failed.';
      emitSummary();
      return;
    }
    state.value = data || null;
    loading.value = false;
    error.value = '';
    emitSummary();
  };
  worker.onerror = () => {
    state.value = null;
    loading.value = false;
    error.value = 'Profile worker crashed.';
    emitSummary();
  };
  run();
});
onBeforeUnmount(()=> worker.terminate());
watch(() => props.rows, run);
</script>

<template>
  <div class="profile-card">
    <div class="profile-card__head">
      <h3>Profile</h3>
      <span v-if="loading" class="profile-card__meta">Analyzing sample...</span>
      <span v-else-if="error" class="profile-card__meta profile-card__meta--error">{{ error }}</span>
      <span v-else-if="state" class="profile-card__meta">Sample based on {{ state.sampleCount }} rows</span>
    </div>

    <div v-if="state?.warnings?.length" class="profile-card__warnings">
      <div v-for="(w,i) in state.warnings" :key="i">- {{ w }}</div>
    </div>

    <div v-if="state" class="profile-grid">
      <div class="profile-block">
        <div class="profile-block__title">Column Summary</div>
        <div class="profile-scroll">
          <table>
            <thead><tr><th class="text-left">Column</th><th>Type</th><th>null</th><th>unique</th></tr></thead>
            <tbody>
              <tr v-for="(p,c) in state.profile" :key="c">
                <td class="pr-2">{{ c }}</td>
                <td class="text-center">{{ p.type }}</td>
                <td class="text-center">{{ p.nullPct }}%</td>
                <td class="text-center">{{ p.unique }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="profile-block">
        <div class="profile-block__title">Duplicate Rows (sample)</div>
        <div class="profile-block__hero">{{ state.duplicates }}</div>
        <div class="profile-block__note">Counted from fully identical rows in sample.</div>
      </div>

      <div class="profile-block">
        <div class="profile-block__title">Correlation TOP10 (numeric)</div>
        <div class="profile-scroll">
          <ul>
            <li v-for="p in state.topCorr" :key="p.x+'-'+p.y">
              {{ p.x }} / {{ p.y }} : <b>{{ p.r }}</b>
            </li>
          </ul>
        </div>
      </div>

      <div class="profile-block profile-block--wide">
        <div class="profile-block__title">ANOVA TOP10 (category -> numeric)</div>
        <div class="profile-scroll">
          <table>
            <thead><tr><th>Category</th><th>Numeric</th><th>F</th><th>p</th></tr></thead>
            <tbody>
              <tr v-for="a in state.topAnova" :key="a.cat+'-'+a.y">
                <td>{{ a.cat }}</td><td>{{ a.y }}</td><td>{{ a.F }}</td><td>{{ a.p }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="profile-block__note">* Sample-based exploratory metrics only. Verify with full data for final decisions.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-card {
  border: 1px solid #d6dee6;
  border-radius: 12px;
  background: #fff;
  padding: 14px;
}

.profile-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

h3 {
  margin: 0;
  font-size: 18px;
}

.profile-card__meta {
  font-size: 12px;
  color: #6b7280;
}

.profile-card__meta--error {
  color: #c62828;
}

.profile-card__warnings {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #f3d28b;
  border-radius: 10px;
  background: #fff8e8;
  font-size: 12px;
  color: #8a5a00;
}

.profile-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.profile-block {
  border: 1px solid #e5ebf1;
  border-radius: 10px;
  padding: 12px;
  background: #fbfcfd;
}

.profile-block--wide {
  grid-column: 1 / -1;
}

.profile-block__title {
  margin-bottom: 10px;
  font-weight: 700;
}

.profile-block__hero {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
}

.profile-block__note {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}

.profile-scroll {
  max-height: 240px;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid #e5ebf1;
  text-align: left;
  font-size: 13px;
}

ul {
  margin: 0;
  padding-left: 18px;
}

li {
  margin-bottom: 6px;
  font-size: 13px;
}

@media (max-width: 960px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}
</style>

