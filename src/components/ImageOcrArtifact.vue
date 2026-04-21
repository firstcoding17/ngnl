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
const runtimeBadges = computed(() => ([
  { label: 'requested', value: String(props.artifact?.requestedRuntime || '').trim() },
  { label: 'effective', value: String(props.artifact?.effectiveRuntime || '').trim() },
].filter((item) => item.value)));
</script>

<template>
  <section
    v-if="artifact"
    :class="['image-ocr-artifact', { compact, blocked: artifact.status === 'blocked' }]"
    data-testid="image-ocr-artifact"
  >
    <div class="image-ocr-artifact__summary">
      <div>
        <span>Image column</span>
        <strong>{{ artifact.request?.imageColumn || '-' }}</strong>
      </div>
      <div>
        <span>Text column</span>
        <strong>{{ artifact.request?.textColumn || '-' }}</strong>
      </div>
      <div>
        <span>Extracted texts</span>
        <strong>{{ result.extractedCount || 0 }}</strong>
      </div>
      <div>
        <span>Rows</span>
        <strong>{{ result.rowCount || 0 }}</strong>
      </div>
    </div>

    <p class="image-ocr-artifact__note">{{ artifact.summary }}</p>

    <RuntimeStatusBlock :artifact="artifact" :badges="runtimeBadges" :compact="compact" />

    <div class="image-ocr-artifact__meta">
      <div>
        <span>Direct</span>
        <strong>{{ result.directCount ?? 0 }}</strong>
      </div>
      <div>
        <span>Fallback</span>
        <strong>{{ result.fallbackCount ?? 0 }}</strong>
      </div>
      <div>
        <span>Avg text length</span>
        <strong>{{ result.avgTextLength ?? 0 }}</strong>
      </div>
      <div>
        <span>Avg confidence</span>
        <strong>{{ result.avgConfidence ?? 0 }}</strong>
      </div>
    </div>

    <div v-if="result.topTokens?.length" class="image-ocr-artifact__chips">
      <span v-for="item in result.topTokens" :key="item.token">{{ item.token }} x {{ item.count }}</span>
    </div>

    <div v-if="result.labelSummary?.length" class="image-ocr-artifact__table">
      <div class="image-ocr-artifact__table-head">
        <strong>Label summary</strong>
      </div>
      <table>
        <thead>
          <tr><th>label</th><th>count</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in result.labelSummary" :key="item.label">
            <td>{{ item.label }}</td>
            <td>{{ item.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="sampleColumns.length" class="image-ocr-artifact__table">
      <div class="image-ocr-artifact__table-head">
        <strong>OCR sample</strong>
      </div>
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
.image-ocr-artifact {
  display: grid;
  gap: 14px;
}

.image-ocr-artifact__summary,
.image-ocr-artifact__meta {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.image-ocr-artifact__summary > div,
.image-ocr-artifact__meta > div {
  border: 1px solid #d8e2d7;
  border-radius: 14px;
  background: #f8fbf6;
  padding: 12px 14px;
  display: grid;
  gap: 4px;
}

.image-ocr-artifact__summary span,
.image-ocr-artifact__meta span {
  color: #5d6f5d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.image-ocr-artifact__summary strong,
.image-ocr-artifact__meta strong {
  color: #203428;
}

.image-ocr-artifact__note {
  margin: 0;
  line-height: 1.5;
  color: #375037;
}

.image-ocr-artifact__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-ocr-artifact__chips span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  font-size: 12px;
  color: #355242;
}

.image-ocr-artifact__table {
  overflow: auto;
  border: 1px solid #d8e2d7;
  border-radius: 14px;
}

.image-ocr-artifact__table-head {
  padding: 10px 12px 0;
  color: #38503d;
}

.image-ocr-artifact__table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.image-ocr-artifact__table th,
.image-ocr-artifact__table td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2e8;
  text-align: left;
}

.image-ocr-artifact__table th {
  background: #f5f8f3;
  color: #38503d;
}

.compact .image-ocr-artifact__summary,
.compact .image-ocr-artifact__meta {
  grid-template-columns: 1fr 1fr;
}
</style>
