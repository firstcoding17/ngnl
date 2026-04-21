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

function canRenderImage(ref = '') {
  const value = String(ref || '').trim();
  return /^data:image\//i.test(value) || /^https?:\/\//i.test(value) || value.startsWith('/');
}

function shortRef(ref = '') {
  const value = String(ref || '').trim();
  if (!value) return 'no reference';
  if (value.startsWith('data:image/')) return 'inline image';
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}
</script>

<template>
  <section
    v-if="artifact"
    :class="['image-feature-artifact', { compact, blocked: artifact.status === 'blocked' }]"
    data-testid="image-feature-artifact"
  >
    <div class="image-feature-artifact__summary">
      <div>
        <span>Mode</span>
        <strong>{{ artifact.request?.mode || 'opencv-basic' }}</strong>
      </div>
      <div>
        <span>Image column</span>
        <strong>{{ artifact.request?.imageColumn || '-' }}</strong>
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

    <p class="image-feature-artifact__note">{{ artifact.summary }}</p>

    <RuntimeStatusBlock :artifact="artifact" :badges="runtimeBadges" :compact="compact" />

    <div class="image-feature-artifact__meta">
      <div>
        <span>Direct</span>
        <strong>{{ result.directCount ?? 0 }}</strong>
      </div>
      <div>
        <span>Fallback</span>
        <strong>{{ result.fallbackCount ?? 0 }}</strong>
      </div>
      <div>
        <span>Avg size</span>
        <strong>{{ result.avgWidth || 0 }} x {{ result.avgHeight || 0 }}</strong>
      </div>
      <div>
        <span>Avg bytes</span>
        <strong>{{ result.avgByteSize || 0 }}</strong>
      </div>
    </div>

    <div v-if="result.previewRows?.length" class="image-feature-artifact__preview">
      <article v-for="(row, index) in result.previewRows" :key="`${index}-${row.imageRef}`" class="image-feature-artifact__preview-card">
        <div class="image-feature-artifact__thumb">
          <img v-if="canRenderImage(row.imageRef)" :src="row.imageRef" :alt="row.label || `image-${index + 1}`" />
          <div v-else class="image-feature-artifact__thumb-placeholder">{{ shortRef(row.imageRef) }}</div>
        </div>
        <div class="image-feature-artifact__preview-meta">
          <strong>{{ row.label || `Row ${index + 1}` }}</strong>
          <span>{{ shortRef(row.imageRef) }}</span>
          <span v-if="row.width || row.height">{{ row.width || 0 }} x {{ row.height || 0 }}</span>
          <span v-if="row.byteSize">{{ row.byteSize }} bytes</span>
        </div>
      </article>
    </div>

    <div v-if="result.labelSummary?.length" class="image-feature-artifact__table">
      <div class="image-feature-artifact__table-head">
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

    <div v-if="sampleColumns.length" class="image-feature-artifact__table">
      <div class="image-feature-artifact__table-head">
        <strong>Feature sample</strong>
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
.image-feature-artifact {
  display: grid;
  gap: 14px;
}

.image-feature-artifact__summary,
.image-feature-artifact__meta {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.image-feature-artifact__summary > div,
.image-feature-artifact__meta > div {
  border: 1px solid #d8e2d7;
  border-radius: 14px;
  background: #f8fbf6;
  padding: 12px 14px;
  display: grid;
  gap: 4px;
}

.image-feature-artifact__summary span,
.image-feature-artifact__meta span {
  color: #5d6f5d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.image-feature-artifact__summary strong,
.image-feature-artifact__meta strong {
  color: #203428;
}

.image-feature-artifact__note {
  margin: 0;
  line-height: 1.5;
}

.image-feature-artifact__note {
  color: #375037;
}

.image-feature-artifact__preview {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.image-feature-artifact__preview-card {
  border: 1px solid #d8e2d7;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
}

.image-feature-artifact__thumb {
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #f7faf6, #eef4eb);
}

.image-feature-artifact__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-feature-artifact__thumb-placeholder {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #56705c;
}

.image-feature-artifact__preview-meta {
  display: grid;
  gap: 4px;
  padding: 10px 12px 12px;
  font-size: 12px;
  color: #4f6254;
}

.image-feature-artifact__table {
  overflow: auto;
  border: 1px solid #d8e2d7;
  border-radius: 14px;
}

.image-feature-artifact__table-head {
  padding: 10px 12px 0;
  color: #38503d;
}

.image-feature-artifact__table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.image-feature-artifact__table th,
.image-feature-artifact__table td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2e8;
  text-align: left;
}

.image-feature-artifact__table th {
  background: #f5f8f3;
  color: #38503d;
}

.compact .image-feature-artifact__summary,
.compact .image-feature-artifact__meta {
  grid-template-columns: 1fr 1fr;
}
</style>
