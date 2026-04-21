<script setup>
import { computed } from 'vue';
import RuntimeStatusBlock from '@/components/RuntimeStatusBlock.vue';

const props = defineProps({
  artifact: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const result = computed(() => props.artifact?.result || {});
const sampleColumns = computed(() => {
  const first = result.value?.sampleRows?.[0];
  return first ? Object.keys(first) : [];
});
</script>

<template>
  <section v-if="artifact" :class="['text-feature-artifact', { compact }]" data-testid="text-feature-artifact">
    <div class="text-feature-artifact__summary">
      <div>
        <span>Method</span>
        <strong>{{ artifact.request?.method || '-' }}</strong>
      </div>
      <div>
        <span>Text column</span>
        <strong>{{ artifact.request?.textColumn || '-' }}</strong>
      </div>
      <div>
        <span>Derived features</span>
        <strong>{{ result.featureCount || 0 }}</strong>
      </div>
      <div>
        <span>Rows</span>
        <strong>{{ result.rowCount || 0 }}</strong>
      </div>
    </div>

    <p class="text-feature-artifact__note">{{ artifact.summary }}</p>

    <RuntimeStatusBlock :artifact="artifact" :compact="compact" />

    <div v-if="result.topTerms?.length" class="text-feature-artifact__tokens">
      <span v-for="term in result.topTerms" :key="term">{{ term }}</span>
    </div>

    <div class="text-feature-artifact__meta">
      <div v-if="result.runtimeClass">
        <span>Runtime class</span>
        <strong>{{ result.runtimeClass }}</strong>
      </div>
      <div>
        <span>Avg chars</span>
        <strong>{{ result.avgCharLength ?? 0 }}</strong>
      </div>
      <div>
        <span>Avg words</span>
        <strong>{{ result.avgWordCount ?? 0 }}</strong>
      </div>
      <div v-if="result.sentimentStats">
        <span>Avg sentiment</span>
        <strong>{{ result.sentimentStats.avg }}</strong>
      </div>
      <div v-if="result.embeddingDims">
        <span>Embedding dims</span>
        <strong>{{ result.embeddingDims }}</strong>
      </div>
      <div v-if="result.embeddingRuntime">
        <span>Embedding runtime</span>
        <strong>{{ result.embeddingRuntime }}</strong>
      </div>
      <div v-if="result.semanticDims">
        <span>Semantic dims</span>
        <strong>{{ result.semanticDims }}</strong>
      </div>
      <div v-if="result.semanticRuntime">
        <span>Semantic runtime</span>
        <strong>{{ result.semanticRuntime }}</strong>
      </div>
      <div v-if="artifact.request?.targetColumn">
        <span>Downstream target</span>
        <strong>{{ artifact.request.targetColumn }}</strong>
      </div>
    </div>

    <div v-if="result.embeddingColumns?.length" class="text-feature-artifact__tokens">
      <span v-for="column in result.embeddingColumns.slice(0, 8)" :key="column">{{ column }}</span>
    </div>

    <div v-if="result.topConcepts?.length" class="text-feature-artifact__tokens">
      <span v-for="item in result.topConcepts" :key="item.concept">{{ item.concept }} {{ item.score }}</span>
    </div>

    <div v-if="sampleColumns.length" class="text-feature-artifact__table">
      <table>
        <thead>
          <tr>
            <th v-for="column in sampleColumns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in result.sampleRows" :key="index">
            <td v-for="column in sampleColumns" :key="`${index}-${column}`">{{ row[column] }}</td>
          </tr>
        </tbody>
      </table>
    </div>

  </section>
</template>

<style scoped>
.text-feature-artifact {
  display: grid;
  gap: 14px;
}

.text-feature-artifact__summary,
.text-feature-artifact__meta {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.text-feature-artifact__summary > div,
.text-feature-artifact__meta > div {
  border: 1px solid #d8e2d7;
  border-radius: 14px;
  background: #f8fbf6;
  padding: 12px 14px;
  display: grid;
  gap: 4px;
}

.text-feature-artifact__summary span,
.text-feature-artifact__meta span {
  color: #5d6f5d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.text-feature-artifact__summary strong,
.text-feature-artifact__meta strong {
  color: #203428;
}

.text-feature-artifact__note {
  margin: 0;
  color: #375037;
  line-height: 1.5;
}

.text-feature-artifact__tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.text-feature-artifact__tokens span {
  border-radius: 999px;
  background: #edf6e8;
  color: #30543a;
  padding: 6px 10px;
  font-size: 12px;
}

.text-feature-artifact__table {
  overflow: auto;
  border: 1px solid #d8e2d7;
  border-radius: 14px;
}

.text-feature-artifact__table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.text-feature-artifact__table th,
.text-feature-artifact__table td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2e8;
  text-align: left;
}

.text-feature-artifact__table th {
  background: #f5f8f3;
  color: #38503d;
}

.compact .text-feature-artifact__summary,
.compact .text-feature-artifact__meta {
  grid-template-columns: 1fr 1fr;
}
</style>
