<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import RuntimeStatusBlock from '@/components/RuntimeStatusBlock.vue';
import {
  getStatCapabilities,
  runStatAnova,
  runStatChiSq,
  runStatNormality,
  runStatTTest,
} from '@/services/statApi';
import { effectBadgesFromStats, effectBadgeClass } from '@/utils/effectSize';
import { runLocalLevene } from '@/utils/statLocalTests';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  preset: { type: Object, default: null },
  artifact: { type: Object, default: null },
});

const emit = defineEmits(['openChart']);

const result = ref(null);
const loading = ref(false);
const err = ref('');
const capLoading = ref(true);
const scipyReady = ref(true);
const presetNotice = ref('');
const lastPresetKey = ref('');
const pendingAutoRunOp = ref('');

const tValue = ref('');
const tGroup = ref('');
const anovaValue = ref('');
const anovaGroup = ref('');
const normColumn = ref('');
const levColumn = ref('');
const levGroup = ref('');
const chisqA = ref('');
const chisqB = ref('');

const numCols = computed(() =>
  props.columns.filter((column) => props.rows.some((row) => Number.isFinite(Number(row?.[column]))))
);
const catCols = computed(() =>
  props.columns.filter((column) => !numCols.value.includes(column))
);

function uniqueValuesForColumn(column, limit = 12) {
  const values = [];
  const seen = new Set();
  for (const row of props.rows || []) {
    const raw = String(row?.[column] ?? '').trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    values.push(raw);
    if (values.length >= limit) break;
  }
  return values;
}

const groupOptions = computed(() =>
  catCols.value.map((column) => ({
    column,
    levels: uniqueValuesForColumn(column).length,
  }))
);

const twoGroupOption = computed(() => groupOptions.value.find((item) => item.levels === 2) || null);
const multiGroupOption = computed(() => groupOptions.value.find((item) => item.levels >= 3) || null);

const supports = computed(() => ({
  ttest: !!(numCols.value[0] && twoGroupOption.value),
  anova: !!(numCols.value[0] && multiGroupOption.value),
  normality: !!(numCols.value[0] && props.rows.length >= 3),
  levene: !!(numCols.value[0] && multiGroupOption.value),
  chisq: catCols.value.length >= 2,
}));

const focusedOp = computed(() => {
  if (props.artifact?.kind === 'stat-tests') {
    return String(props.artifact.request?.op || props.artifact.result?.op || '').toLowerCase();
  }
  if (props.preset?.statPanel === 'tests') {
    return String(props.preset.op || '').toLowerCase();
  }
  return '';
});

const basicMap = computed(() => ({
  ttest:
    focusedOp.value === 'ttest'
      ? supports.value.ttest
      : !focusedOp.value && supports.value.ttest && !supports.value.anova,
  anova:
    focusedOp.value === 'anova' || focusedOp.value === 'levene'
      ? supports.value.anova
      : !focusedOp.value && supports.value.anova,
  normality:
    focusedOp.value === 'normality'
      ? supports.value.normality
      : focusedOp.value === 'anova' || focusedOp.value === 'ttest'
        ? supports.value.normality
        : !focusedOp.value && supports.value.normality && (supports.value.ttest || supports.value.anova),
  levene:
    focusedOp.value === 'levene'
      ? supports.value.levene
      : focusedOp.value === 'anova'
        ? supports.value.levene
        : !focusedOp.value && supports.value.levene,
  chisq:
    focusedOp.value === 'chisq'
      ? supports.value.chisq
      : !focusedOp.value && supports.value.chisq && !(supports.value.ttest || supports.value.anova),
}));

const advancedMap = computed(() => ({
  ttest: supports.value.ttest && !basicMap.value.ttest,
  anova: supports.value.anova && !basicMap.value.anova,
  normality: supports.value.normality && !basicMap.value.normality,
  levene: supports.value.levene && !basicMap.value.levene,
  chisq: supports.value.chisq && !basicMap.value.chisq,
}));

const effectBadges = computed(() => effectBadgesFromStats(result.value?.summary?.stats || {}));

function syncDefaults() {
  const firstNumeric = numCols.value[0] || '';
  const firstBinaryGroup = twoGroupOption.value?.column || '';
  const firstMultiGroup = multiGroupOption.value?.column || '';
  const firstCategorical = catCols.value[0] || '';
  const secondCategorical = catCols.value[1] || '';

  if (!numCols.value.includes(tValue.value)) tValue.value = firstNumeric;
  if (!groupOptions.value.some((item) => item.column === tGroup.value && item.levels === 2)) tGroup.value = firstBinaryGroup;

  if (!numCols.value.includes(anovaValue.value)) anovaValue.value = firstNumeric;
  if (!groupOptions.value.some((item) => item.column === anovaGroup.value && item.levels >= 3)) anovaGroup.value = firstMultiGroup;

  if (!numCols.value.includes(normColumn.value)) normColumn.value = firstNumeric;

  if (!numCols.value.includes(levColumn.value)) levColumn.value = firstNumeric;
  if (!groupOptions.value.some((item) => item.column === levGroup.value && item.levels >= 3)) levGroup.value = firstMultiGroup;

  if (!catCols.value.includes(chisqA.value)) chisqA.value = firstCategorical;
  if (!catCols.value.includes(chisqB.value) || chisqB.value === chisqA.value) {
    chisqB.value = secondCategorical || '';
  }
}

watch([numCols, catCols, groupOptions], syncDefaults, { immediate: true });

onMounted(async () => {
  try {
    const caps = await getStatCapabilities();
    scipyReady.value = !!caps?.scipy;
  } catch {
    scipyReady.value = false;
  } finally {
    capLoading.value = false;
  }
});

watch(
  () => props.artifact,
  (artifact) => {
    if (!artifact || artifact.kind !== 'stat-tests') return;
    result.value = artifact.result || null;
    err.value = '';
    presetNotice.value = artifact.summary || 'Loaded saved statistical test artifact.';
  },
  { deep: true, immediate: true }
);

function hydrateFromPreset(op, args = {}) {
  if (op === 'ttest') {
    if (numCols.value.includes(args.value)) tValue.value = args.value;
    if (groupOptions.value.some((item) => item.column === args.group && item.levels === 2)) tGroup.value = args.group;
    presetNotice.value = 'Preset ready for t-test.';
    return;
  }
  if (op === 'anova') {
    if (numCols.value.includes(args.value)) anovaValue.value = args.value;
    if (groupOptions.value.some((item) => item.column === args.group && item.levels >= 3)) anovaGroup.value = args.group;
    presetNotice.value = 'Preset ready for ANOVA.';
    return;
  }
  if (op === 'normality') {
    if (numCols.value.includes(args.column)) normColumn.value = args.column;
    presetNotice.value = 'Preset ready for normality review.';
    return;
  }
  if (op === 'levene') {
    if (numCols.value.includes(args.column)) levColumn.value = args.column;
    if (groupOptions.value.some((item) => item.column === args.group && item.levels >= 3)) levGroup.value = args.group;
    presetNotice.value = 'Preset ready for Levene review.';
    return;
  }
  if (op === 'chisq') {
    if (catCols.value.includes(args.a)) chisqA.value = args.a;
    if (catCols.value.includes(args.b)) chisqB.value = args.b;
    presetNotice.value = 'Preset ready for Chi-square.';
    return;
  }
  presetNotice.value = 'Preset ready for statistical test review.';
}

async function runPresetTest(op) {
  if (op === 'ttest') {
    await runT();
    return;
  }
  if (op === 'anova') {
    await runAnova();
    return;
  }
  if (op === 'normality') {
    await runNormality();
    return;
  }
  if (op === 'levene') {
    await runLevene();
    return;
  }
  if (op === 'chisq') {
    await runChiSq();
  }
}

watch(
  () => props.preset,
  async (preset) => {
    if (!preset || preset.statPanel !== 'tests' || preset.key === lastPresetKey.value) return;
    lastPresetKey.value = preset.key;
    const op = String(preset.op || '').toLowerCase();
    hydrateFromPreset(op, preset.args || {});
    pendingAutoRunOp.value = preset.autoRun ? op : '';
    if (preset.autoRun && !capLoading.value) {
      presetNotice.value = `Running ${op || 'test'} from preset...`;
      await runPresetTest(op);
      pendingAutoRunOp.value = '';
    }
  },
  { deep: true }
);

watch(
  () => capLoading.value,
  async (loadingNow) => {
    if (loadingNow || !pendingAutoRunOp.value) return;
    const op = pendingAutoRunOp.value;
    pendingAutoRunOp.value = '';
    presetNotice.value = `Running ${op} from preset...`;
    await runPresetTest(op);
  }
);

function resetResult() {
  err.value = '';
  result.value = null;
}

async function runT() {
  resetResult();
  if (!scipyReady.value) {
    err.value = 'scipy is not installed on the server. t-test is unavailable.';
    return;
  }
  if (!tValue.value || !tGroup.value) return;
  loading.value = true;
  try {
    result.value = await runStatTTest(props.rows, tValue.value, tGroup.value);
  } catch (error) {
    err.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
}

async function runAnova() {
  resetResult();
  if (!scipyReady.value) {
    err.value = 'scipy is not installed on the server. ANOVA is unavailable.';
    return;
  }
  if (!anovaValue.value || !anovaGroup.value) return;
  loading.value = true;
  try {
    result.value = await runStatAnova(props.rows, anovaValue.value, anovaGroup.value);
  } catch (error) {
    err.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
}

async function runNormality() {
  resetResult();
  if (!scipyReady.value) {
    err.value = 'scipy is not installed on the server. Normality check is unavailable.';
    return;
  }
  if (!normColumn.value) return;
  loading.value = true;
  try {
    result.value = await runStatNormality(props.rows, normColumn.value);
  } catch (error) {
    err.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
}

async function runLevene() {
  resetResult();
  if (!levColumn.value || !levGroup.value) return;
  loading.value = true;
  try {
    result.value = await runLocalLevene(props.rows, levColumn.value, levGroup.value);
  } catch (error) {
    err.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
}

async function runChiSq() {
  resetResult();
  if (!scipyReady.value) {
    err.value = 'scipy is not installed on the server. Chi-square is unavailable.';
    return;
  }
  if (!chisqA.value || !chisqB.value || chisqA.value === chisqB.value) return;
  loading.value = true;
  try {
    result.value = await runStatChiSq(props.rows, chisqA.value, chisqB.value);
  } catch (error) {
    err.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
}

function openResultChart() {
  const op = String(result.value?.op || '').toLowerCase();
  if (op === 'ttest' || op === 'anova') {
    const table = result.value?.tables?.find((item) => item?.name === 'group_summary');
    if (!table?.rows?.length) return;
    const groupIdx = table.columns.indexOf('group');
    const meanIdx = table.columns.indexOf('mean');
    if (groupIdx < 0 || meanIdx < 0) return;
    const chartRows = table.rows.map((row) => ({
      group: row[groupIdx],
      mean: Number(row[meanIdx]),
    }));
    emit('openChart', {
      rows: chartRows,
      columns: ['group', 'mean'],
      spec: {
        type: 'bar',
        x: 'group',
        y: 'mean',
        options: {
          title: op === 'anova' ? 'ANOVA Group Mean' : 't-test Group Mean',
          xLabel: 'Group',
          yLabel: 'Mean',
          agg: 'mean',
        },
      },
    });
    return;
  }

  if (op === 'normality') {
    const histogram = result.value?.figures?.find((item) => item?.type === 'histogram');
    const bins = histogram?.bins || [];
    const counts = histogram?.counts || [];
    if (!bins.length || !counts.length) return;
    const chartRows = counts.map((count, index) => ({
      bin: `${bins[index] ?? index}`,
      count: Number(count),
    }));
    emit('openChart', {
      rows: chartRows,
      columns: ['bin', 'count'],
      spec: {
        type: 'bar',
        x: 'bin',
        y: 'count',
        options: {
          title: 'Normality histogram',
          xLabel: 'Bin',
          yLabel: 'Count',
          agg: 'mean',
        },
      },
    });
    return;
  }

  if (op === 'levene') {
    const table = result.value?.tables?.find((item) => item?.name === 'group_summary');
    if (!table?.rows?.length) return;
    const groupIdx = table.columns.indexOf('group');
    const meanIdx = table.columns.indexOf('mean_abs_dev');
    if (groupIdx < 0 || meanIdx < 0) return;
    const chartRows = table.rows.map((row) => ({
      group: row[groupIdx],
      mean_abs_dev: Number(row[meanIdx]),
    }));
    emit('openChart', {
      rows: chartRows,
      columns: ['group', 'mean_abs_dev'],
      spec: {
        type: 'bar',
        x: 'group',
        y: 'mean_abs_dev',
        options: {
          title: 'Levene group deviation',
          xLabel: 'Group',
          yLabel: 'Mean absolute deviation',
          agg: 'mean',
        },
      },
    });
    return;
  }

  if (op === 'chisq') {
    const table = result.value?.tables?.find((item) => item?.name === 'contingency_table');
    if (!table?.rows?.length || table.columns.length < 2) return;
    const rowKey = table.columns[0];
    const colKeys = table.columns.slice(1);
    const chartRows = [];
    table.rows.forEach((row) => {
      const rowLabel = row[0];
      for (let index = 0; index < colKeys.length; index += 1) {
        chartRows.push({
          row: rowLabel,
          col: colKeys[index],
          count: Number(row[index + 1]) || 0,
        });
      }
    });
    emit('openChart', {
      rows: chartRows,
      columns: ['row', 'col', 'count'],
      spec: {
        type: 'heatmap',
        x: 'col',
        y: 'row',
        hue: 'count',
        options: {
          title: `Chi-square Contingency Heatmap (${rowKey} x columns)`,
          xLabel: 'Column category',
          yLabel: 'Row category',
          bins: 30,
        },
      },
    });
  }
}
</script>

<template>
  <div class="tests-panel">
    <div class="tests-panel__head">
      <div>
        <h3>Statistical Tests</h3>
        <p>현재 데이터 구조에 맞는 검정만 기본으로 보여주고, 나머지는 고급 옵션으로 숨깁니다.</p>
      </div>
      <button type="button" @click="openResultChart" :disabled="!result || loading">Open result chart</button>
    </div>

    <div v-if="capLoading" class="tests-panel__notice">Checking statistical package availability...</div>
    <div v-else-if="!scipyReady" class="tests-panel__notice tests-panel__notice--warn">
      scipy is not installed on the server. Parametric API tests are limited, but local Levene review can still run.
    </div>
    <div v-if="presetNotice" class="tests-panel__notice tests-panel__notice--info">{{ presetNotice }}</div>
    <RuntimeStatusBlock v-if="artifact" :artifact="artifact" compact />
    <div v-if="err" class="tests-panel__notice tests-panel__notice--error">{{ err }}</div>

    <section class="tests-section">
      <div class="tests-section__head">
        <h4>Recommended tests</h4>
        <p>데이터 구조와 목표에 바로 맞는 검정만 우선 노출합니다.</p>
      </div>

      <div v-if="basicMap.ttest || basicMap.anova || basicMap.normality || basicMap.levene || basicMap.chisq" class="tests-grid">
        <article v-if="basicMap.ttest" class="test-card">
          <div class="test-card__head">
            <strong>t-test</strong>
            <span>2-group mean comparison</span>
          </div>
          <p>그룹이 정확히 2개일 때 평균 차이를 먼저 확인합니다.</p>
          <div class="test-card__controls">
            <select v-model="tValue">
              <option value="">value column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="tGroup">
              <option value="">group column (2 levels)</option>
              <option v-for="item in groupOptions.filter((entry) => entry.levels === 2)" :key="item.column" :value="item.column">
                {{ item.column }}
              </option>
            </select>
            <button type="button" @click="runT" :disabled="capLoading || !scipyReady || loading || !tValue || !tGroup">Run</button>
          </div>
        </article>

        <article v-if="basicMap.anova" class="test-card">
          <div class="test-card__head">
            <strong>ANOVA</strong>
            <span>3+ group mean comparison</span>
          </div>
          <p>그룹이 3개 이상이면 ANOVA를 기본 후보로 올립니다.</p>
          <div class="test-card__controls">
            <select v-model="anovaValue">
              <option value="">value column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="anovaGroup">
              <option value="">group column (3+ levels)</option>
              <option v-for="item in groupOptions.filter((entry) => entry.levels >= 3)" :key="item.column" :value="item.column">
                {{ item.column }}
              </option>
            </select>
            <button type="button" @click="runAnova" :disabled="capLoading || !scipyReady || loading || !anovaValue || !anovaGroup">Run</button>
          </div>
        </article>

        <article v-if="basicMap.normality" class="test-card">
          <div class="test-card__head">
            <strong>Normality</strong>
            <span>parametric assumption check</span>
          </div>
          <p>평균 비교 검정을 하기 전에 분포가 크게 비정상적이지 않은지 확인합니다.</p>
          <div class="test-card__controls">
            <select v-model="normColumn">
              <option value="">numeric column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <button type="button" @click="runNormality" :disabled="capLoading || !scipyReady || loading || !normColumn">Run</button>
          </div>
        </article>

        <article v-if="basicMap.levene" class="test-card">
          <div class="test-card__head">
            <strong>Levene</strong>
            <span>variance homogeneity</span>
          </div>
          <p>그룹이 3개 이상이면 ANOVA 전 분산 동질성도 같이 점검합니다.</p>
          <div class="test-card__controls">
            <select v-model="levColumn">
              <option value="">numeric column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="levGroup">
              <option value="">group column (3+ levels)</option>
              <option v-for="item in groupOptions.filter((entry) => entry.levels >= 3)" :key="item.column" :value="item.column">
                {{ item.column }}
              </option>
            </select>
            <button type="button" @click="runLevene" :disabled="loading || !levColumn || !levGroup">Run</button>
          </div>
        </article>

        <article v-if="basicMap.chisq" class="test-card">
          <div class="test-card__head">
            <strong>Chi-square</strong>
            <span>categorical association</span>
          </div>
          <p>수치형 비교보다 범주형 연관성 확인이 더 맞을 때 기본 후보로 보여줍니다.</p>
          <div class="test-card__controls">
            <select v-model="chisqA">
              <option value="">category A</option>
              <option v-for="column in catCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="chisqB">
              <option value="">category B</option>
              <option v-for="column in catCols.filter((column) => column !== chisqA)" :key="column" :value="column">{{ column }}</option>
            </select>
            <button type="button" @click="runChiSq" :disabled="capLoading || !scipyReady || loading || !chisqA || !chisqB || chisqA === chisqB">Run</button>
          </div>
        </article>
      </div>

      <div v-else class="tests-empty">
        현재 데이터 구조에서 바로 추천할 검정이 없습니다. 필요한 경우 아래 고급 옵션에서 직접 실행할 수 있습니다.
      </div>
    </section>

    <details v-if="advancedMap.ttest || advancedMap.anova || advancedMap.normality || advancedMap.levene || advancedMap.chisq" class="tests-advanced">
      <summary>Advanced options</summary>
      <div class="tests-grid">
        <article v-if="advancedMap.ttest" class="test-card">
          <div class="test-card__head">
            <strong>t-test</strong>
            <span>advanced</span>
          </div>
          <p>기본 추천에서 숨긴 2-group mean comparison입니다.</p>
          <div class="test-card__controls">
            <select v-model="tValue">
              <option value="">value column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="tGroup">
              <option value="">group column (2 levels)</option>
              <option v-for="item in groupOptions.filter((entry) => entry.levels === 2)" :key="item.column" :value="item.column">
                {{ item.column }}
              </option>
            </select>
            <button type="button" @click="runT" :disabled="capLoading || !scipyReady || loading || !tValue || !tGroup">Run</button>
          </div>
        </article>

        <article v-if="advancedMap.anova" class="test-card">
          <div class="test-card__head">
            <strong>ANOVA</strong>
            <span>advanced</span>
          </div>
          <p>다른 목표가 우선일 때는 고급 옵션으로만 숨깁니다.</p>
          <div class="test-card__controls">
            <select v-model="anovaValue">
              <option value="">value column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="anovaGroup">
              <option value="">group column (3+ levels)</option>
              <option v-for="item in groupOptions.filter((entry) => entry.levels >= 3)" :key="item.column" :value="item.column">
                {{ item.column }}
              </option>
            </select>
            <button type="button" @click="runAnova" :disabled="capLoading || !scipyReady || loading || !anovaValue || !anovaGroup">Run</button>
          </div>
        </article>

        <article v-if="advancedMap.normality" class="test-card">
          <div class="test-card__head">
            <strong>Normality</strong>
            <span>advanced</span>
          </div>
          <p>필요할 때만 분포 가정 점검을 수동으로 실행합니다.</p>
          <div class="test-card__controls">
            <select v-model="normColumn">
              <option value="">numeric column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <button type="button" @click="runNormality" :disabled="capLoading || !scipyReady || loading || !normColumn">Run</button>
          </div>
        </article>

        <article v-if="advancedMap.levene" class="test-card">
          <div class="test-card__head">
            <strong>Levene</strong>
            <span>advanced</span>
          </div>
          <p>분산 동질성은 필요한 경우에만 고급 옵션으로 열어 둡니다.</p>
          <div class="test-card__controls">
            <select v-model="levColumn">
              <option value="">numeric column</option>
              <option v-for="column in numCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="levGroup">
              <option value="">group column (3+ levels)</option>
              <option v-for="item in groupOptions.filter((entry) => entry.levels >= 3)" :key="item.column" :value="item.column">
                {{ item.column }}
              </option>
            </select>
            <button type="button" @click="runLevene" :disabled="loading || !levColumn || !levGroup">Run</button>
          </div>
        </article>

        <article v-if="advancedMap.chisq" class="test-card">
          <div class="test-card__head">
            <strong>Chi-square</strong>
            <span>advanced</span>
          </div>
          <p>범주형 연관성은 현재 목표가 평균 비교일 때 고급 옵션으로만 둡니다.</p>
          <div class="test-card__controls">
            <select v-model="chisqA">
              <option value="">category A</option>
              <option v-for="column in catCols" :key="column" :value="column">{{ column }}</option>
            </select>
            <select v-model="chisqB">
              <option value="">category B</option>
              <option v-for="column in catCols.filter((column) => column !== chisqA)" :key="column" :value="column">{{ column }}</option>
            </select>
            <button type="button" @click="runChiSq" :disabled="capLoading || !scipyReady || loading || !chisqA || !chisqB || chisqA === chisqB">Run</button>
          </div>
        </article>
      </div>
    </details>

    <div v-if="loading" class="tests-panel__notice">Running...</div>

    <section v-if="result" class="tests-result">
      <div class="tests-result__head">
        <div>
          <strong>{{ result.summary?.title }}</strong>
          <p>{{ result.summary?.conclusion }}</p>
        </div>
      </div>

      <div v-if="result.warnings?.length" class="tests-panel__notice tests-panel__notice--warn">
        <div v-for="warning in result.warnings" :key="warning">- {{ warning }}</div>
      </div>

      <div class="tests-result__stats" v-if="result.summary?.stats">
        <span v-for="(value, key) in result.summary.stats" :key="key">
          <b>{{ key }}</b>: {{ value }}
        </span>
      </div>

      <div v-if="effectBadges.length" class="effect-badges">
        <span
          v-for="badge in effectBadges"
          :key="badge.key"
          class="effect-badge"
          :class="effectBadgeClass(badge.level)"
        >
          {{ badge.label }} {{ badge.value }} ({{ badge.level }})
        </span>
      </div>

      <div v-for="table in result.tables || []" :key="table.name" class="tests-result__table">
        <div class="tests-result__table-name">{{ table.name }}</div>
        <div class="tests-result__table-wrap">
          <table>
            <thead>
              <tr>
                <th v-for="column in table.columns" :key="column">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in table.rows" :key="`${table.name}-${rowIndex}`">
                <td v-for="(cell, cellIndex) in row" :key="`${table.name}-${rowIndex}-${cellIndex}`">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tests-panel {
  display: grid;
  gap: 14px;
  padding: 12px;
  border: 1px solid #dbe3d8;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #f8fbf7);
}

.tests-panel__head,
.tests-section__head,
.test-card__head,
.tests-result__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.tests-panel__head h3,
.tests-section__head h4,
.test-card__head strong,
.tests-result__head strong {
  margin: 0;
  color: #1f3325;
}

.tests-panel__head p,
.tests-section__head p,
.test-card p,
.tests-result__head p,
.tests-empty {
  margin: 6px 0 0;
  color: #5d6d61;
  line-height: 1.55;
}

.tests-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.test-card,
.tests-result__table {
  padding: 14px;
  border: 1px solid #dbe3d8;
  border-radius: 18px;
  background: #fff;
}

.test-card__head span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  color: #355242;
  font-size: 12px;
}

.test-card__controls {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.tests-panel button,
.tests-panel select {
  font: inherit;
}

.tests-panel button {
  padding: 8px 12px;
  border: 1px solid #c4cfbf;
  border-radius: 999px;
  background: #fff;
  color: #223228;
  cursor: pointer;
}

.tests-panel button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tests-panel select {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #cad4c7;
  border-radius: 12px;
  background: #fff;
  color: #203428;
}

.tests-panel__notice {
  padding: 10px 12px;
  border-radius: 14px;
  background: #f3f4f6;
  color: #475569;
  font-size: 13px;
}

.tests-panel__notice--info {
  background: #eff6ff;
  color: #1d4ed8;
}

.tests-panel__notice--warn {
  background: #fffbeb;
  color: #92400e;
}

.tests-panel__notice--error {
  background: #fef2f2;
  color: #b91c1c;
}

.tests-advanced {
  padding: 12px;
  border: 1px dashed #cad4c7;
  border-radius: 18px;
  background: #fbfcfa;
}

.tests-advanced summary {
  cursor: pointer;
  font-weight: 600;
  color: #355242;
}

.tests-result {
  display: grid;
  gap: 12px;
}

.tests-result__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tests-result__stats span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf4ec;
  font-size: 12px;
  color: #355242;
}

.effect-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.effect-badge {
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid;
}

.badge-negligible { background:#f3f4f6; border-color:#d1d5db; color:#374151; }
.badge-small { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
.badge-medium { background:#fff7ed; border-color:#fdba74; color:#9a3412; }
.badge-large { background:#fef2f2; border-color:#fca5a5; color:#991b1b; }

.tests-result__table-name {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #355242;
}

.tests-result__table-wrap {
  overflow: auto;
}

.tests-result__table table {
  width: 100%;
  border-collapse: collapse;
}

.tests-result__table th,
.tests-result__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e8eee7;
  text-align: left;
  white-space: nowrap;
  font-size: 12px;
}
</style>
