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

const availability = computed(() => props.artifact?.availability || (props.artifact?.status === 'blocked' ? 'blocked' : 'runnable'));
const metrics = computed(() => Object.entries(props.artifact?.result?.metrics || {}).slice(0, props.compact ? 4 : 8));
const featureImportance = computed(() => Array.isArray(props.artifact?.result?.featureImportance) ? props.artifact.result.featureImportance.slice(0, props.compact ? 3 : 6) : []);
const clusterSummary = computed(() => Array.isArray(props.artifact?.result?.clusterSummary) ? props.artifact.result.clusterSummary.slice(0, props.compact ? 4 : 8) : []);
const projectionPreview = computed(() => Array.isArray(props.artifact?.result?.projectionPreview) ? props.artifact.result.projectionPreview.slice(0, props.compact ? 4 : 8) : []);
const projectionColumns = computed(() => {
  const first = projectionPreview.value[0];
  return first ? Object.keys(first) : [];
});
const projectionMetadata = computed(() => props.artifact?.result?.projectionMetadata || null);
const confusionRows = computed(() => {
  const labels = props.artifact?.result?.errorAnalysis?.labels || [];
  const matrix = props.artifact?.result?.errorAnalysis?.matrix || [];
  return Array.isArray(matrix) ? matrix.slice(0, props.compact ? 2 : 4).map((row, index) => ({ label: labels[index], values: row })) : [];
});
const residualSummary = computed(() => props.artifact?.result?.errorAnalysis?.residualSummary || null);
const requestedModel = computed(() => props.artifact?.requestedModel || props.artifact?.request?.model || '');
const effectiveModel = computed(() => props.artifact?.effectiveModel || props.artifact?.result?.model || props.artifact?.normalizedRequest?.model || '');
const runtimeBadges = computed(() => ([
  { label: 'requested', value: requestedModel.value },
  { label: 'effective', value: effectiveModel.value },
  { label: 'target', value: String(props.artifact?.result?.target || '').trim() },
  {
    label: 'runtime',
    value: String(
      props.artifact?.result?.diagnostics?.runtime
      || (availability.value === 'fallback' ? 'fallback' : 'backend')
      || ''
    ).trim(),
  },
].filter((item) => item.value)));
</script>

<template>
  <section
    v-if="artifact"
    :class="[
      'ml-artifact-card',
      `is-${availability}`,
      { compact, blocked: artifact.status === 'blocked' },
    ]"
  >
    <div class="ml-artifact-card__head">
      <div>
        <p class="ml-artifact-card__kicker">{{ artifact.kind }}</p>
        <h4>{{ artifact.status === 'blocked' ? 'ML execution blocked' : artifact.kind === 'ml-unsupervised' ? 'Saved unsupervised result' : 'Saved ML result' }}</h4>
      </div>
      <div class="ml-artifact-card__chips">
        <span class="ml-artifact-card__chip">{{ artifact.normalizedRequest?.task || artifact.request?.task || 'ml' }}</span>
      </div>
    </div>

    <p class="ml-artifact-card__summary">{{ artifact.summary }}</p>

    <RuntimeStatusBlock :artifact="artifact" :badges="runtimeBadges" :compact="compact" />

    <div v-if="metrics.length" class="ml-artifact-card__stats">
      <span v-for="[key, value] in metrics" :key="key">
        <b>{{ key }}</b> {{ Number.isFinite(Number(value)) ? Number(value).toFixed(4) : value }}
      </span>
    </div>

    <div v-if="featureImportance.length" class="ml-artifact-card__table">
      <div class="ml-artifact-card__table-head">
        <strong>Top features</strong>
      </div>
      <div class="ml-artifact-card__table-wrap">
        <table>
          <thead>
            <tr><th>feature</th><th>importance</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in featureImportance" :key="item.feature">
              <td>{{ item.feature }}</td>
              <td>{{ Number(item.importance || 0).toFixed(4) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="clusterSummary.length" class="ml-artifact-card__table">
      <div class="ml-artifact-card__table-head">
        <strong>Cluster sizes</strong>
      </div>
      <div class="ml-artifact-card__table-wrap">
        <table>
          <thead>
            <tr><th>cluster</th><th>count</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in clusterSummary" :key="item.cluster">
              <td>{{ item.cluster }}</td>
              <td>{{ item.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="projectionMetadata" class="ml-artifact-card__stats">
      <span v-if="projectionMetadata.componentCount != null"><b>components</b> {{ projectionMetadata.componentCount }}</span>
      <span v-if="projectionMetadata.inputFeatureCount != null"><b>input features</b> {{ projectionMetadata.inputFeatureCount }}</span>
      <span v-if="projectionMetadata.sourceRowCount != null"><b>rows</b> {{ projectionMetadata.sourceRowCount }}</span>
    </div>

    <div v-if="projectionPreview.length" class="ml-artifact-card__table">
      <div class="ml-artifact-card__table-head">
        <strong>Projection preview</strong>
      </div>
      <div class="ml-artifact-card__table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="column in projectionColumns" :key="column">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in projectionPreview" :key="`proj-${index}`">
              <td v-for="column in projectionColumns" :key="`${index}-${column}`">{{ row[column] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="confusionRows.length" class="ml-artifact-card__table">
      <div class="ml-artifact-card__table-head">
        <strong>Confusion matrix</strong>
      </div>
      <div class="ml-artifact-card__table-wrap">
        <table>
          <tbody>
            <tr v-for="row in confusionRows" :key="row.label">
              <th>{{ row.label }}</th>
              <td v-for="(cell, index) in row.values" :key="`${row.label}-${index}`">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="residualSummary" class="ml-artifact-card__stats">
      <span><b>mean</b> {{ Number(residualSummary.mean || 0).toFixed(4) }}</span>
      <span><b>absMean</b> {{ Number(residualSummary.absMean || 0).toFixed(4) }}</span>
      <span><b>q05</b> {{ Number(residualSummary.q05 || 0).toFixed(4) }}</span>
      <span><b>q95</b> {{ Number(residualSummary.q95 || 0).toFixed(4) }}</span>
    </div>
  </section>
</template>

<style scoped>
.ml-artifact-card {
  display: grid;
  gap: 12px;
}

.ml-artifact-card.blocked {
  color: #7a2f18;
}

.ml-artifact-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.ml-artifact-card__chips,
.ml-artifact-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ml-artifact-card__kicker {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5a6d5f;
}

.ml-artifact-card__head h4 {
  margin: 0;
  color: #1f3325;
}

.ml-artifact-card__chip,
.ml-artifact-card__meta span,
.ml-artifact-card__stats span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  color: #355242;
  font-size: 12px;
}

.ml-artifact-card__summary {
  margin: 0;
  line-height: 1.55;
}

.ml-artifact-card__summary {
  color: #47614e;
}

.ml-artifact-card__table {
  padding: 12px;
  border: 1px solid #dbe3d8;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f7fbf7);
}

.ml-artifact-card__table-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: #355242;
}

.ml-artifact-card__table-wrap {
  overflow: auto;
}

.ml-artifact-card__table table {
  width: 100%;
  border-collapse: collapse;
}

.ml-artifact-card__table th,
.ml-artifact-card__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e8eee7;
  text-align: left;
  font-size: 12px;
  white-space: nowrap;
}
</style>
