<script setup>
import { computed } from 'vue';

const props = defineProps({
  summary: { type: Object, default: null },
  title: { type: String, default: 'Recommended next actions' },
  compact: { type: Boolean, default: false },
  limit: { type: Number, default: 4 },
  actionable: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);

const visibleItems = computed(() =>
  Array.isArray(props.summary?.top)
    ? props.summary.top.slice(0, Math.max(1, Number(props.limit || 4)))
    : []
);

function categoryLabel(value = '') {
  const map = {
    analysis: 'Analysis',
    preprocessing: 'Prep',
    model: 'Model',
    runtime: 'Runtime',
    'next-step': 'Next step',
    nextStep: 'Next step',
  };
  return map[String(value || '').trim()] || 'Recommendation';
}

function actionLabel(item = {}) {
  const actionType = String(item?.nextAction?.type || '').trim().toLowerCase();
  if (!actionType) return 'Use';
  if (['panel', 'dataset-link'].includes(actionType)) return 'Open';
  if (['preprocessing', 'runtime', 'model'].includes(actionType)) return 'Apply';
  return 'Use';
}

function requirementsText(item = {}) {
  return Array.isArray(item?.requirements) ? item.requirements.filter(Boolean).slice(0, 2).join(' | ') : '';
}

function warningsText(item = {}) {
  return Array.isArray(item?.warnings) ? item.warnings.filter(Boolean).slice(0, 2).join(' | ') : '';
}
</script>

<template>
  <section
    v-if="visibleItems.length"
    :class="['recommendation-summary-card', { compact }]"
    data-testid="recommendation-summary-card"
  >
    <div class="recommendation-summary-card__head">
      <div>
        <p class="recommendation-summary-card__kicker">Recommendation Engine v1</p>
        <h3>{{ title }}</h3>
      </div>
      <span class="recommendation-summary-card__count">{{ visibleItems.length }}</span>
    </div>

    <div class="recommendation-summary-card__list">
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="recommendation-summary-card__item"
      >
        <div class="recommendation-summary-card__meta">
          <span>{{ categoryLabel(item.category) }}</span>
          <span v-if="item.availability">{{ item.availability }}</span>
        </div>
        <strong>{{ item.label }}</strong>
        <p>{{ item.reason }}</p>
        <small v-if="item.nextAction?.value">Next action: {{ item.nextAction.value }}</small>
        <small v-if="requirementsText(item)">Requirements: {{ requirementsText(item) }}</small>
        <small v-if="warningsText(item)">Warnings: {{ warningsText(item) }}</small>
        <div v-if="actionable && item.nextAction?.value" class="recommendation-summary-card__actions">
          <button
            type="button"
            class="recommendation-summary-card__button"
            @click="emit('select', item)"
          >
            {{ actionLabel(item) }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.recommendation-summary-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid #dfe6dd;
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff, #f7fbf7);
}

.recommendation-summary-card.compact {
  padding: 14px;
  gap: 10px;
}

.recommendation-summary-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.recommendation-summary-card__kicker {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #60705f;
}

.recommendation-summary-card h3 {
  margin: 0;
  color: #1f3325;
}

.recommendation-summary-card__count {
  min-width: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef4ec;
  font-size: 12px;
  color: #355242;
  text-align: center;
}

.recommendation-summary-card__list {
  display: grid;
  gap: 10px;
}

.recommendation-summary-card__item {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid #e3e9e1;
  border-radius: 16px;
  background: #fbfcfa;
}

.recommendation-summary-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recommendation-summary-card__meta span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #edf4ec;
  font-size: 11px;
  color: #4d6350;
  text-transform: uppercase;
}

.recommendation-summary-card strong {
  color: #1f3325;
}

.recommendation-summary-card p {
  margin: 0;
  color: #5d6d61;
  line-height: 1.5;
}

.recommendation-summary-card small {
  color: #47614e;
}

.recommendation-summary-card__actions {
  display: flex;
  justify-content: flex-start;
}

.recommendation-summary-card__button {
  padding: 8px 12px;
  border: 1px solid #d3ded0;
  border-radius: 999px;
  background: #ffffff;
  color: #244532;
  font-weight: 600;
  cursor: pointer;
}

.recommendation-summary-card__button:hover {
  border-color: #224d31;
  background: #eef6ef;
}
</style>
