<script setup>
import { computed } from 'vue';
import { buildRuntimeStatusDisplay } from '@/utils/runtimeStatus';

const props = defineProps({
  artifact: { type: Object, default: null },
  badges: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
});

const display = computed(() => buildRuntimeStatusDisplay(props.artifact, { badges: props.badges }));
</script>

<template>
  <section
    v-if="display.show"
    :class="['runtime-status-block', `is-${display.state}`, { compact }]"
    data-testid="runtime-status-block"
  >
    <div class="runtime-status-block__head">
      <span :class="['runtime-status-block__chip', `is-${display.state}`]">{{ display.label }}</span>
      <div v-if="display.badges.length" class="runtime-status-block__badges">
        <span v-for="badge in display.badges" :key="`${badge.label}-${badge.value}`">
          {{ badge.label }} <b>{{ badge.value }}</b>
        </span>
      </div>
    </div>

    <p v-if="display.reason" class="runtime-status-block__reason">{{ display.reason }}</p>

    <ul v-if="display.requirements.length" class="runtime-status-block__list runtime-status-block__list--requirements">
      <li v-for="item in display.requirements" :key="item">{{ item }}</li>
    </ul>

    <ul v-if="display.warnings.length" class="runtime-status-block__list runtime-status-block__list--warnings">
      <li v-for="warning in display.warnings" :key="warning">{{ warning }}</li>
    </ul>
  </section>
</template>

<style scoped>
.runtime-status-block {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #dbe3d8;
  border-radius: 16px;
  background: #f8fbf7;
}

.runtime-status-block.compact {
  gap: 8px;
  padding: 10px 12px;
}

.runtime-status-block__head,
.runtime-status-block__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.runtime-status-block__chip,
.runtime-status-block__badges span {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.runtime-status-block__chip {
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.runtime-status-block__badges span {
  background: #edf4ec;
  color: #355242;
}

.runtime-status-block__reason {
  margin: 0;
  line-height: 1.55;
  color: #47614e;
}

.runtime-status-block__list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.5;
}

.runtime-status-block__chip.is-direct {
  background: #ecfdf5;
  color: #166534;
}

.runtime-status-block__chip.is-fallback {
  background: #fffbeb;
  color: #92400e;
}

.runtime-status-block__chip.is-warning {
  background: #eff6ff;
  color: #1d4ed8;
}

.runtime-status-block__chip.is-blocked {
  background: #fff7ed;
  color: #9a3412;
}

.runtime-status-block__list--requirements {
  color: #7a2f18;
}

.runtime-status-block__list--warnings {
  color: #8a5a20;
}
</style>
