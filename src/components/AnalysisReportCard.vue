<script setup>
import { computed, ref } from 'vue';
import RuntimeStatusBlock from '@/components/RuntimeStatusBlock.vue';
import {
  buildReportFilename,
  copyTextToClipboard,
  downloadTextFile,
  serializeReportAsMarkdown,
  serializeReportAsPlainText,
} from '@/utils/reportExport';

const props = defineProps({
  report: {
    type: Object,
    default: null,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const actionMessage = ref('');
let actionMessageTimer = null;

const runtimeArtifact = computed(() => {
  const runtime = props.report?.sections?.runtime || {};
  return {
    availability: props.report?.status || runtime.availability || '',
    availabilityReason: runtime.reason || '',
    requirements: Array.isArray(runtime.requirements) ? runtime.requirements : [],
    warnings: Array.isArray(runtime.warnings) ? runtime.warnings : [],
    status: props.report?.status === 'blocked' ? 'blocked' : 'ready',
  };
});

const runtimeBadges = computed(() => ([
  { label: 'type', value: String(props.report?.type || '').trim() },
  { label: 'artifact', value: String(props.report?.sourceArtifactKind || '').trim() },
].filter((item) => item.value)));

const overviewEntries = computed(() => Object.entries(props.report?.sections?.overview || {}).slice(0, props.compact ? 4 : 8));
const inputEntries = computed(() => Object.entries(props.report?.sections?.inputs || {}).slice(0, props.compact ? 4 : 8));
const resultEntries = computed(() => Object.entries(props.report?.sections?.results || {}).slice(0, props.compact ? 4 : 8));
const interpretationEntries = computed(() => Object.entries(props.report?.sections?.interpretation || {}).slice(0, props.compact ? 3 : 6));
const nextSteps = computed(() => Array.isArray(props.report?.sections?.nextSteps) ? props.report.sections.nextSteps.slice(0, props.compact ? 3 : 6) : []);

function formatValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-';
  if (value && typeof value === 'object') return JSON.stringify(value);
  const text = String(value ?? '').trim();
  return text || '-';
}

function setActionMessage(message) {
  actionMessage.value = String(message || '').trim();
  if (actionMessageTimer) window.clearTimeout(actionMessageTimer);
  actionMessageTimer = window.setTimeout(() => {
    actionMessage.value = '';
  }, 2200);
}

async function onCopyReport() {
  try {
    await copyTextToClipboard(serializeReportAsPlainText(props.report));
    setActionMessage('Copied report');
  } catch (error) {
    setActionMessage(error?.message || 'Copy failed');
  }
}

function onDownloadMarkdown() {
  try {
    const filename = buildReportFilename(props.report, 'md');
    downloadTextFile(filename, serializeReportAsMarkdown(props.report), 'text/markdown;charset=utf-8');
    setActionMessage(`Downloaded ${filename}`);
  } catch (error) {
    setActionMessage(error?.message || 'Download failed');
  }
}
</script>

<template>
  <section v-if="report" :class="['analysis-report-card', `is-${report.status || 'direct'}`, { compact }]" data-testid="analysis-report-card">
    <div class="analysis-report-card__head">
      <div>
        <p class="analysis-report-card__kicker">{{ report.type }}</p>
        <h4>{{ report.title }}</h4>
      </div>
      <div class="analysis-report-card__actions">
        <span class="analysis-report-card__chip">{{ report.status }}</span>
        <div class="analysis-report-card__action-row">
          <button type="button" class="analysis-report-card__button" data-testid="analysis-report-copy" @click="onCopyReport">
            Copy report
          </button>
          <button type="button" class="analysis-report-card__button" data-testid="analysis-report-download-md" @click="onDownloadMarkdown">
            Download .md
          </button>
        </div>
        <p v-if="actionMessage" class="analysis-report-card__action-status" data-testid="analysis-report-action-status">
          {{ actionMessage }}
        </p>
      </div>
    </div>

    <RuntimeStatusBlock :artifact="runtimeArtifact" :badges="runtimeBadges" :compact="compact" />

    <div class="analysis-report-card__grid">
      <article v-if="overviewEntries.length" class="analysis-report-card__section">
        <h5>Overview</h5>
        <dl>
          <div v-for="[label, value] in overviewEntries" :key="`overview-${label}`">
            <dt>{{ label }}</dt>
            <dd>{{ formatValue(value) }}</dd>
          </div>
        </dl>
      </article>

      <article v-if="inputEntries.length" class="analysis-report-card__section">
        <h5>Inputs</h5>
        <dl>
          <div v-for="[label, value] in inputEntries" :key="`inputs-${label}`">
            <dt>{{ label }}</dt>
            <dd>{{ formatValue(value) }}</dd>
          </div>
        </dl>
      </article>

      <article v-if="resultEntries.length" class="analysis-report-card__section">
        <h5>Key results</h5>
        <dl>
          <div v-for="[label, value] in resultEntries" :key="`results-${label}`">
            <dt>{{ label }}</dt>
            <dd>{{ formatValue(value) }}</dd>
          </div>
        </dl>
      </article>

      <article v-if="interpretationEntries.length" class="analysis-report-card__section">
        <h5>Interpretation</h5>
        <dl>
          <div v-for="[label, value] in interpretationEntries" :key="`interpretation-${label}`">
            <dt>{{ label }}</dt>
            <dd>{{ formatValue(value) }}</dd>
          </div>
        </dl>
      </article>
    </div>

    <article v-if="nextSteps.length" class="analysis-report-card__section">
      <h5>Recommended next steps</h5>
      <ul class="analysis-report-card__list">
        <li v-for="step in nextSteps" :key="step">{{ step }}</li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
.analysis-report-card {
  display: grid;
  gap: 14px;
}

.analysis-report-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.analysis-report-card__actions {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.analysis-report-card__kicker {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5a6d5f;
}

.analysis-report-card__head h4 {
  margin: 0;
  color: #1f3325;
}

.analysis-report-card__chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  color: #355242;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.analysis-report-card__action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.analysis-report-card__button {
  padding: 7px 11px;
  border: 1px solid #d5dfd1;
  border-radius: 10px;
  background: #ffffff;
  color: #294231;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.analysis-report-card__button:hover {
  border-color: #a8baab;
  background: #f3f8f2;
}

.analysis-report-card__action-status {
  margin: 0;
  font-size: 12px;
  color: #486353;
}

.analysis-report-card.is-fallback .analysis-report-card__chip {
  background: #fff3dd;
  color: #7b5600;
}

.analysis-report-card.is-warning .analysis-report-card__chip {
  background: #fff0e6;
  color: #8b4a14;
}

.analysis-report-card.is-blocked .analysis-report-card__chip {
  background: #fde8e5;
  color: #8b2d17;
}

.analysis-report-card__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.analysis-report-card__section {
  padding: 12px 14px;
  border: 1px solid #dbe3d8;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f7fbf7);
}

.analysis-report-card__section h5 {
  margin: 0 0 10px;
  color: #2c4430;
  font-size: 14px;
}

.analysis-report-card__section dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

.analysis-report-card__section dl div {
  display: grid;
  gap: 4px;
}

.analysis-report-card__section dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5d6f5d;
}

.analysis-report-card__section dd {
  margin: 0;
  color: #203428;
  line-height: 1.5;
}

.analysis-report-card__list {
  margin: 0;
  padding-left: 18px;
  color: #203428;
  display: grid;
  gap: 8px;
}

.compact .analysis-report-card__grid {
  grid-template-columns: 1fr;
}

.compact .analysis-report-card__section {
  padding: 12px;
}

.compact .analysis-report-card__actions {
  width: 100%;
}

@media (max-width: 720px) {
  .analysis-report-card__head {
    flex-direction: column;
  }

  .analysis-report-card__actions {
    width: 100%;
    justify-items: start;
  }

  .analysis-report-card__action-row {
    justify-content: flex-start;
  }
}
</style>
