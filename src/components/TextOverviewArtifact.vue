<script setup>
import { computed } from 'vue';

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

const visibleColumns = computed(() => {
  const columns = Array.isArray(props.artifact?.columns) ? props.artifact.columns : [];
  return props.compact ? columns.slice(0, 1) : columns.slice(0, 3);
});

const visibleTokens = computed(() => {
  const tokens = Array.isArray(props.artifact?.topTokens) ? props.artifact.topTokens : [];
  return props.compact ? tokens.slice(0, 4) : tokens.slice(0, 8);
});
</script>

<template>
  <section v-if="artifact" :class="['text-overview-artifact', { compact }]">
    <div class="text-overview-artifact__summary">
      <div class="overview-card">
        <span>Rows reviewed</span>
        <strong>{{ artifact.totalRows || 0 }}</strong>
      </div>
      <div class="overview-card">
        <span>Text columns</span>
        <strong>{{ artifact.textColumnCount || 0 }}</strong>
      </div>
      <div class="overview-card">
        <span>Avg words</span>
        <strong>{{ artifact.avgWordCount || 0 }}</strong>
      </div>
    </div>

    <p class="text-overview-artifact__note">{{ artifact.summary }}</p>

    <div v-if="visibleTokens.length" class="text-overview-artifact__tokens">
      <span v-for="item in visibleTokens" :key="`${item.token}-${item.count}`">
        {{ item.token }} · {{ item.count }}
      </span>
    </div>

    <div class="text-overview-artifact__columns">
      <article
        v-for="column in visibleColumns"
        :key="column.column"
        class="text-overview-artifact__column"
      >
        <div class="text-overview-artifact__column-head">
          <h4>{{ column.column }}</h4>
          <p>{{ column.rowCount }} rows · {{ column.avgWordCount }} avg words · {{ column.avgCharLength }} avg chars</p>
        </div>

        <div v-if="column.topTokens?.length" class="text-overview-artifact__token-list">
          <span v-for="token in column.topTokens.slice(0, 5)" :key="`${column.column}-${token.token}`">
            {{ token.token }} ({{ token.count }})
          </span>
        </div>

        <ul v-if="column.samples?.length" class="text-overview-artifact__samples">
          <li v-for="(sample, index) in column.samples.slice(0, compact ? 1 : 2)" :key="`${column.column}-${index}`">
            {{ sample }}
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.text-overview-artifact {
  display: grid;
  gap: 14px;
}

.text-overview-artifact.compact {
  gap: 12px;
}

.text-overview-artifact__summary {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.text-overview-artifact__note {
  margin: 0;
  color: #47614e;
  line-height: 1.55;
}

.text-overview-artifact__tokens,
.text-overview-artifact__token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.text-overview-artifact__tokens span,
.text-overview-artifact__token-list span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  font-size: 12px;
  color: #355242;
}

.text-overview-artifact__columns {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.text-overview-artifact.compact .text-overview-artifact__columns {
  grid-template-columns: 1fr;
}

.text-overview-artifact__column {
  padding: 14px;
  border: 1px solid #dbe3d8;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #f7fbf7);
}

.text-overview-artifact__column-head h4 {
  margin: 0;
  color: #203428;
}

.text-overview-artifact__column-head p {
  margin: 6px 0 0;
  color: #5d6d61;
  line-height: 1.5;
}

.text-overview-artifact__samples {
  margin: 10px 0 0;
  padding-left: 18px;
  color: #46604d;
  line-height: 1.5;
}

.text-overview-artifact__samples li + li {
  margin-top: 6px;
}
</style>
