<script setup>
import { computed } from 'vue';
import RuntimeStatusBlock from '@/components/RuntimeStatusBlock.vue';

const props = defineProps({
  artifact: {
    type: Object,
    default: null,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const title = computed(() => {
  if (props.artifact?.kind === 'stat-corr') return 'Correlation artifact';
  if (props.artifact?.kind === 'stat-tests') return 'Statistical test artifact';
  return 'Stat artifact';
});

const statEntries = computed(() => Object.entries(props.artifact?.result?.summary?.stats || {}).slice(0, props.compact ? 4 : 8));
const visibleTables = computed(() => Array.isArray(props.artifact?.result?.tables) ? props.artifact.result.tables.slice(0, props.compact ? 1 : 2) : []);
const runtimeBadges = computed(() => ([
  { label: 'op', value: String(props.artifact?.request?.op || '').trim() },
].filter((item) => item.value)));
</script>

<template>
  <section v-if="artifact" :class="['stat-artifact-card', { compact }]">
    <div class="stat-artifact-card__head">
      <div>
        <p class="stat-artifact-card__kicker">{{ artifact.kind }}</p>
        <h4>{{ title }}</h4>
      </div>
      <span v-if="artifact.request?.op" class="stat-artifact-card__op">{{ artifact.request.op }}</span>
    </div>

    <p class="stat-artifact-card__summary">{{ artifact.summary }}</p>

    <RuntimeStatusBlock :artifact="artifact" :badges="runtimeBadges" :compact="compact" />

    <div v-if="statEntries.length" class="stat-artifact-card__stats">
      <span v-for="[key, value] in statEntries" :key="key">
        <b>{{ key }}</b> {{ value }}
      </span>
    </div>

    <div v-if="visibleTables.length" class="stat-artifact-card__tables">
      <article v-for="table in visibleTables" :key="table.name" class="stat-artifact-card__table">
        <div class="stat-artifact-card__table-head">
          <strong>{{ table.name }}</strong>
          <span>{{ table.rows?.length || 0 }} rows</span>
        </div>
        <div class="stat-artifact-card__table-wrap">
          <table>
            <thead>
              <tr>
                <th v-for="column in table.columns" :key="column">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in (table.rows || []).slice(0, compact ? 3 : 5)" :key="`${table.name}-${rowIndex}`">
                <td v-for="(cell, cellIndex) in row" :key="`${table.name}-${rowIndex}-${cellIndex}`">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.stat-artifact-card {
  display: grid;
  gap: 12px;
}

.stat-artifact-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.stat-artifact-card__kicker {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5a6d5f;
}

.stat-artifact-card__head h4 {
  margin: 0;
  color: #1f3325;
}

.stat-artifact-card__op {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  color: #355242;
  font-size: 12px;
}

.stat-artifact-card__summary {
  margin: 0;
  color: #47614e;
  line-height: 1.55;
}

.stat-artifact-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stat-artifact-card__stats span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  font-size: 12px;
  color: #355242;
}

.stat-artifact-card__tables {
  display: grid;
  gap: 12px;
}

.stat-artifact-card__table {
  padding: 12px;
  border: 1px solid #dbe3d8;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f7fbf7);
}

.stat-artifact-card__table-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: #355242;
}

.stat-artifact-card__table-wrap {
  overflow: auto;
}

.stat-artifact-card__table table {
  width: 100%;
  border-collapse: collapse;
}

.stat-artifact-card__table th,
.stat-artifact-card__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e8eee7;
  text-align: left;
  font-size: 12px;
  white-space: nowrap;
}
</style>
