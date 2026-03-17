<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { callMcpTool, chatWithMcp, getMcpInfo, getMcpTools } from '@/services/mcpApi';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  datasetName: { type: String, default: 'untitled' },
  datasetId: { type: String, default: '' },
  profileSummary: {
    type: Object,
    default: () => ({
      loading: false,
      error: '',
      sampleCount: 0,
      duplicates: 0,
      warnings: [],
      topCorrCount: 0,
      topAnovaCount: 0,
    }),
  },
  workspaceDatasets: { type: Array, default: () => [] },
});
const emit = defineEmits(['open-chart', 'open-chart-board', 'focus-panel', 'open-stat']);

const loading = ref(false);
const error = ref('');

const info = ref(null);
const tools = ref([]);
const selectedTool = ref('health.check');
const inputText = ref('{}');
const callResult = ref(null);
const draft = ref('');
const messages = ref([]);
const datasetNoticeKey = ref('');
const chatBusy = ref(false);
const runningSuggestionKey = ref('');
const sessionStore = ref({});

const datasetSessionKey = computed(() => props.datasetId || `local:${props.datasetName || 'untitled'}`);
const toolMetaByName = computed(() =>
  Object.fromEntries((tools.value || []).map((tool) => [tool.name, tool]))
);

function takeSampleRows(rows, limit = 200) {
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

function looksNumeric(values) {
  let nonNull = 0;
  let numeric = 0;
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    nonNull += 1;
    if (Number.isFinite(Number(value))) numeric += 1;
  }
  return nonNull > 0 && numeric / nonNull >= 0.7;
}

function looksDate(values) {
  let nonNull = 0;
  let dateish = 0;
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    nonNull += 1;
    const t = new Date(String(value)).getTime();
    if (!Number.isNaN(t)) dateish += 1;
  }
  return nonNull > 0 && dateish / nonNull >= 0.7;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function appendMessage(role, text, extra = {}) {
  messages.value.push({
    id: crypto.randomUUID(),
    role,
    mode: extra.mode || '',
    text,
    suggestions: Array.isArray(extra.suggestions) ? extra.suggestions : [],
    warnings: Array.isArray(extra.warnings) ? extra.warnings : [],
    cards: Array.isArray(extra.cards) ? extra.cards : [],
    toolCalls: Array.isArray(extra.toolCalls) ? extra.toolCalls : [],
  });
  persistSession();
}

function appendErrorMessage(context, err, extra = {}) {
  const detail = String(err?.message || err || 'Unknown error');
  appendMessage('assistant', `${context} failed.`, {
    cards: [
      {
        title: 'Action failed',
        body: `${context} failed. ${detail}`,
      },
    ],
    warnings: [detail],
    toolCalls: Array.isArray(extra.toolCalls) ? extra.toolCalls : [],
  });
}

function confirmToolExecution(toolName, label = '') {
  const meta = toolMetaByName.value?.[toolName];
  if (!meta || meta.safe !== false) return true;
  const name = label || toolName;
  return confirm(`${name} may be expensive or mutating. Continue?`);
}

function isClaudeFallbackWarning(warning) {
  return /^Claude fallback activated:/i.test(String(warning || '').trim());
}

function formatClaudeFallbackWarning(warning) {
  return String(warning || '')
    .replace(/^Claude fallback activated:\s*/i, '')
    .trim() || 'Claude is unavailable. Rule-based fallback is active.';
}

function messageFallbackWarnings(message) {
  const warnings = Array.isArray(message?.warnings) ? message.warnings : [];
  return warnings.filter(isClaudeFallbackWarning);
}

function messageGeneralWarnings(message) {
  const warnings = Array.isArray(message?.warnings) ? message.warnings : [];
  return warnings.filter((warning) => !isClaudeFallbackWarning(warning));
}

function triggerCardAction(action) {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'open-chart') {
    emit('open-chart', action.payload || {});
    return;
  }
  if (action.type === 'open-chart-board') {
    emit('open-chart-board', action.payload || {});
    return;
  }
  if (action.type === 'open-stat') {
    emit('open-stat', action.payload || {});
    return;
  }
  if (action.type === 'focus-panel') {
    emit('focus-panel', action.payload || {});
  }
}

function cloneMessages(source = []) {
  return Array.isArray(source)
    ? source.map((message) => ({
      id: message.id || crypto.randomUUID(),
      role: message.role || 'assistant',
      mode: message.mode || '',
      text: message.text || '',
      suggestions: Array.isArray(message.suggestions) ? message.suggestions.map((item) => ({ ...item })) : [],
      warnings: Array.isArray(message.warnings) ? [...message.warnings] : [],
      cards: Array.isArray(message.cards) ? message.cards.map((item) => ({ ...item })) : [],
      toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls.map((item) => ({ ...item })) : [],
    }))
    : [];
}

function persistSession(key = datasetSessionKey.value) {
  if (!key) return;
  sessionStore.value[key] = {
    messages: cloneMessages(messages.value),
    datasetNoticeKey: datasetNoticeKey.value,
  };
}

function restoreSession(key = datasetSessionKey.value) {
  const session = sessionStore.value[key];
  messages.value = cloneMessages(session?.messages || []);
  datasetNoticeKey.value = session?.datasetNoticeKey || '';
}

function sanitizeFileName(value) {
  return String(value || 'dataset')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'dataset';
}

function buildFormalCompareExportLines() {
  const formalMessages = messages.value.filter((message) =>
    Array.isArray(message.toolCalls) && message.toolCalls.some((toolCall) => toolCall?.tool === 'workspace.formal_compare_plan')
  );
  if (!formalMessages.length) return [];

  const lines = [
    '',
    'Formal Compare Summary',
    '======================',
  ];

  formalMessages.forEach((message, messageIndex) => {
    const cards = Array.isArray(message.cards) ? message.cards : [];
    const sharedColumnsCard = cards.find((card) => card?.title === 'Shared columns');
    const sampleSizesCard = cards.find((card) => card?.title === 'Sample sizes');

    lines.push('');
    lines.push(`Run ${messageIndex + 1}`);
    if (sharedColumnsCard?.body) lines.push(`Shared columns: ${sharedColumnsCard.body}`);
    if (sampleSizesCard?.body) lines.push(`Sample sizes: ${sampleSizesCard.body}`);

    cards.forEach((card) => {
      const title = String(card?.title || '');
      const match = title.match(/^(.*)\s+\((high|medium|low)\)$/i);
      if (!match) return;
      const parts = String(card?.body || '').split(' | ').filter(Boolean);
      const reason = parts.find((part) => !part.startsWith('caution: ') && !part.startsWith('ops: ')) || '';
      const caution = parts.find((part) => part.startsWith('caution: ')) || '';
      const ops = parts.find((part) => part.startsWith('ops: ')) || '';

      lines.push(`- [${match[2].toUpperCase()}] ${match[1]}`);
      if (reason) lines.push(`  reason: ${reason}`);
      if (caution) lines.push(`  ${caution}`);
      if (ops) lines.push(`  ${ops}`);
    });
  });

  return lines;
}

function buildWorkspaceOverviewExportLines() {
  const workspaceMessages = messages.value.filter((message) =>
    Array.isArray(message.toolCalls) && message.toolCalls.some((toolCall) =>
      toolCall?.tool === 'workspace.current_dataset' || toolCall?.tool === 'workspace.list_datasets')
  );
  if (!workspaceMessages.length) return [];

  const lines = [
    '',
    'Workspace Overview Summary',
    '==========================',
  ];

  workspaceMessages.forEach((message, messageIndex) => {
    const cards = Array.isArray(message.cards) ? message.cards : [];
    const toolNames = message.toolCalls.map((toolCall) => toolCall?.tool).filter(Boolean);
    const sharedColumnsCard = cards.find((card) => card?.title === 'Shared columns');
    const datasetCards = cards.filter((card) => card?.title !== 'Shared columns');

    lines.push('');
    lines.push(`Run ${messageIndex + 1}`);
    if (toolNames.length) lines.push(`Tools: ${toolNames.join(', ')}`);
    if (message.text) lines.push(`Overview: ${message.text}`);
    if (sharedColumnsCard?.body) lines.push(`Shared columns: ${sharedColumnsCard.body}`);
    datasetCards.forEach((card) => {
      lines.push(`- ${card.title}: ${card.body}`);
    });
    if (Array.isArray(message.warnings) && message.warnings.length) {
      lines.push(`Warnings: ${message.warnings.join(' | ')}`);
    }
  });

  return lines;
}

function buildDescribeCompareExportLines() {
  const describeMessages = messages.value.filter((message) =>
    Array.isArray(message.toolCalls) && message.toolCalls.some((toolCall) => toolCall?.tool === 'workspace.compare_describe')
  );
  if (!describeMessages.length) return [];

  const lines = [
    '',
    'Describe Compare Summary',
    '========================',
  ];

  describeMessages.forEach((message, messageIndex) => {
    const cards = Array.isArray(message.cards) ? message.cards : [];
    const summaryCard = cards.find((card) => card?.title === 'Workspace describe comparison');
    const sharedColumnsCard = cards.find((card) => card?.title === 'Shared columns');
    const focusCard = cards.find((card) => String(card?.title || '').startsWith('Focus numeric column:'));
    const datasetCards = cards.filter((card) => {
      const title = String(card?.title || '');
      return title
        && title !== 'Workspace describe comparison'
        && title !== 'Shared columns'
        && !title.startsWith('Focus numeric column:');
    });

    lines.push('');
    lines.push(`Run ${messageIndex + 1}`);
    if (summaryCard?.body) lines.push(`Overview: ${summaryCard.body}`);
    if (sharedColumnsCard?.body) lines.push(`Shared columns: ${sharedColumnsCard.body}`);
    if (focusCard?.body) lines.push(`${focusCard.title}: ${focusCard.body}`);
    datasetCards.forEach((card) => {
      lines.push(`- ${card.title}: ${card.body}`);
    });
  });

  return lines;
}

function buildChartCompareExportLines() {
  const chartMessages = messages.value.filter((message) =>
    Array.isArray(message.toolCalls) && message.toolCalls.some((toolCall) => toolCall?.tool === 'workspace.compare_chart_plan')
  );
  if (!chartMessages.length) return [];

  const lines = [
    '',
    'Chart Compare Summary',
    '=====================',
  ];

  chartMessages.forEach((message, messageIndex) => {
    const cards = Array.isArray(message.cards) ? message.cards : [];
    const summaryCard = cards.find((card) => card?.title === 'Workspace chart compare plan');
    const sharedColumnsCard = cards.find((card) => card?.title === 'Shared columns');
    const focusColumnsCard = cards.find((card) => card?.title === 'Focus columns');
    const datasetCards = cards.filter((card) => String(card?.body || '').includes('type='));

    lines.push('');
    lines.push(`Run ${messageIndex + 1}`);
    if (summaryCard?.body) lines.push(`Plan: ${summaryCard.body}`);
    if (sharedColumnsCard?.body) lines.push(`Shared columns: ${sharedColumnsCard.body}`);
    if (focusColumnsCard?.body) lines.push(`Focus columns: ${focusColumnsCard.body}`);
    datasetCards.forEach((card) => {
      lines.push(`- ${card.title}: ${card.body}`);
    });
  });

  return lines;
}

function buildStatDiffExportLines() {
  const statDiffMessages = messages.value.filter((message) =>
    Array.isArray(message.toolCalls) && message.toolCalls.some((toolCall) => toolCall?.tool === 'workspace.compare_stat_diff')
  );
  if (!statDiffMessages.length) return [];

  const lines = [
    '',
    'Stat Diff Summary',
    '=================',
  ];

  statDiffMessages.forEach((message, messageIndex) => {
    const cards = Array.isArray(message.cards) ? message.cards : [];
    const summaryCard = cards.find((card) => card?.title === 'Workspace stat diff');
    const topNumericCard = cards.find((card) => String(card?.title || '').startsWith('Top numeric gap:'));
    const topCategoricalCard = cards.find((card) => String(card?.title || '').startsWith('Top categorical gap:'));
    const diffCards = cards.filter((card) => {
      const title = String(card?.title || '');
      return title.startsWith('Numeric diff:') || title.startsWith('Categorical diff:');
    });

    lines.push('');
    lines.push(`Run ${messageIndex + 1}`);
    if (summaryCard?.body) lines.push(`Overview: ${summaryCard.body}`);
    if (topNumericCard?.body) lines.push(`${topNumericCard.title}: ${topNumericCard.body}`);
    if (topCategoricalCard?.body) lines.push(`${topCategoricalCard.title}: ${topCategoricalCard.body}`);
    diffCards.forEach((card) => {
      lines.push(`- ${card.title}: ${card.body}`);
    });
  });

  return lines;
}

function buildPriorityExportLines() {
  const priorityMessages = messages.value.filter((message) =>
    Array.isArray(message.toolCalls) && message.toolCalls.some((toolCall) => toolCall?.tool === 'workspace.recommend_analysis')
  );
  if (!priorityMessages.length) return [];

  const lines = [
    '',
    'Workspace Priority Summary',
    '==========================',
  ];

  priorityMessages.forEach((message, messageIndex) => {
    const cards = Array.isArray(message.cards) ? message.cards : [];
    const workspaceCard = cards.find((card) => card?.title === 'Workspace-wide next step');
    const datasetCards = cards.filter((card) => /^\S.*\((high|medium|low)\)$/.test(String(card?.title || '')));

    lines.push('');
    lines.push(`Run ${messageIndex + 1}`);
    if (workspaceCard?.body) lines.push(`Workspace action: ${workspaceCard.body}`);
    datasetCards.forEach((card) => {
      const title = String(card?.title || '');
      const body = String(card?.body || '');
      const parts = body.split(' / ').filter(Boolean);
      const action = parts[0] || '';
      const score = parts.find((part) => part.startsWith('score=')) || '';
      const sample = parts.find((part) => part.startsWith('sample=')) || '';
      const reasons = parts.slice(3).join(' / ');
      lines.push(`- ${title}`);
      if (action) lines.push(`  action: ${action}`);
      if (score) lines.push(`  ${score}`);
      if (sample) lines.push(`  ${sample}`);
      if (reasons) lines.push(`  reasons: ${reasons}`);
    });
  });

  return lines;
}

function buildExportSummaryText() {
  const lines = [
    `Dataset: ${props.datasetName || 'untitled'}`,
    `Dataset ID: ${props.datasetId || 'local'}`,
    `Rows: ${props.rows.length}`,
    `Columns: ${props.columns.length}`,
    `Exported at: ${new Date().toISOString()}`,
    '',
    'Chat Summary',
    '===========',
  ];
  messages.value.forEach((message, index) => {
    lines.push('');
    lines.push(`[${index + 1}] ${message.role === 'assistant' ? 'Assistant' : 'User'}`);
    lines.push(message.text || '');
    if (Array.isArray(message.cards) && message.cards.length) {
      lines.push('Cards:');
      for (const card of message.cards) {
        lines.push(`- ${card.title}: ${card.body}`);
      }
    }
    if (Array.isArray(message.warnings) && message.warnings.length) {
      lines.push(`Warnings: ${message.warnings.join(' | ')}`);
    }
        if (Array.isArray(message.toolCalls) && message.toolCalls.length) {
          lines.push(`Tools: ${message.toolCalls.map((toolCall) => toolCall.tool).join(', ')}`);
        }
      });
  lines.push(...buildWorkspaceOverviewExportLines());
  lines.push(...buildDescribeCompareExportLines());
  lines.push(...buildChartCompareExportLines());
  lines.push(...buildStatDiffExportLines());
  lines.push(...buildPriorityExportLines());
  lines.push(...buildFormalCompareExportLines());
  return lines.join('\n');
}

function exportSessionSummary() {
  if (!messages.value.length) return;
  const blob = new Blob([buildExportSummaryText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFileName(props.datasetName || 'dataset')}-mcp-summary.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

const datasetFlags = computed(() => {
  const sampleRows = takeSampleRows(props.rows, 200);
  const columns = Array.isArray(props.columns) ? props.columns : [];
  const missingColumns = [];
  const constantColumns = [];
  const outlierColumns = [];
  const imbalancedColumns = [];
  let numericColumns = 0;
  let categoricalColumns = 0;
  let dateColumns = 0;

  for (const column of columns) {
    const values = sampleRows.map((row) => row?.[column]);
    const nonNullValues = values.filter((value) => value !== null && value !== undefined && value !== '');
    const missingCount = values.length - nonNullValues.length;
    const missingRate = values.length ? +(missingCount / values.length * 100).toFixed(1) : 0;
    const uniqueCount = new Set(nonNullValues.map((value) => String(value))).size;
    if (missingRate > 0) {
      missingColumns.push({ name: column, rate: missingRate });
    }
    if (nonNullValues.length > 1 && uniqueCount <= 1) {
      constantColumns.push(column);
    }
    if (looksNumeric(values)) {
      numericColumns += 1;
      const numericValues = nonNullValues.map((value) => Number(value)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (numericValues.length >= 8) {
        const q1 = percentile(numericValues, 0.25);
        const q3 = percentile(numericValues, 0.75);
        const iqr = q3 - q1;
        if (Number.isFinite(iqr) && iqr > 0) {
          const low = q1 - (1.5 * iqr);
          const high = q3 + (1.5 * iqr);
          const count = numericValues.filter((value) => value < low || value > high).length;
          if (count > 0) {
            outlierColumns.push({ name: column, rate: +((count / numericValues.length) * 100).toFixed(1) });
          }
        }
      }
    } else if (looksDate(values)) {
      dateColumns += 1;
    } else {
      categoricalColumns += 1;
      if (nonNullValues.length >= 5 && uniqueCount > 1) {
        const counts = new Map();
        nonNullValues.forEach((value) => {
          const key = String(value);
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const [topValue, topCount] = ranked[0];
        const rate = +((topCount / nonNullValues.length) * 100).toFixed(1);
        if (rate >= 75) {
          imbalancedColumns.push({ name: column, topValue, rate });
        }
      }
    }
  }

  missingColumns.sort((a, b) => b.rate - a.rate);
  outlierColumns.sort((a, b) => b.rate - a.rate);
  imbalancedColumns.sort((a, b) => b.rate - a.rate);
  return {
    numericColumns,
    categoricalColumns,
    dateColumns,
    missingColumns: missingColumns.slice(0, 5),
    constantColumns: constantColumns.slice(0, 5),
    outlierColumns: outlierColumns.slice(0, 5),
    imbalancedColumns: imbalancedColumns.slice(0, 5),
    duplicateRows: Number(props.profileSummary?.duplicates || 0),
    warningCount: Array.isArray(props.profileSummary?.warnings) ? props.profileSummary.warnings.length : 0,
    topCorrCount: Number(props.profileSummary?.topCorrCount || 0),
    topAnovaCount: Number(props.profileSummary?.topAnovaCount || 0),
  };
});

const workspaceFacts = computed(() => {
  const datasets = Array.isArray(props.workspaceDatasets) ? props.workspaceDatasets : [];
  const normalized = datasets.map((dataset) => ({
    datasetId: dataset?.datasetId || '',
    name: dataset?.name || 'untitled',
    rowCount: Number(dataset?.rowCount || 0),
    columnCount: Number(dataset?.columnCount || 0),
    columns: Array.isArray(dataset?.columns) ? dataset.columns.map((column) => String(column)) : [],
    active: !!dataset?.active,
    dirty: !!dataset?.dirty,
  }));
  const current = normalized.find((dataset) => (props.datasetId && dataset.datasetId === props.datasetId) || dataset.active) || normalized[0] || null;
  const sharedColumns = normalized.length > 1
    ? normalized
      .map((dataset) => dataset.columns)
      .reduce((shared, columns, index) => {
        if (!index) return [...columns];
        return shared.filter((column) => columns.includes(column));
      }, [])
      .slice(0, 8)
    : [];
  return {
    count: normalized.length,
    datasets: normalized,
    current,
    sharedColumns,
  };
});

const panelState = computed(() => {
  if (loading.value && !info.value) return { kind: 'loading', text: 'Loading MCP metadata...' };
  if (!props.rows.length && !props.columns.length) return { kind: 'empty', text: 'No dataset is active.' };
  if (error.value && info.value) return { kind: 'partial', text: `Dataset ready, MCP metadata issue: ${error.value}` };
  if (error.value) return { kind: 'error', text: error.value };
  if (info.value) return { kind: 'success', text: `MCP ready with ${tools.value.length} tools.` };
  return { kind: 'empty', text: 'MCP metadata has not loaded yet.' };
});

const latestClaudeFallbackWarning = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const warning = messageFallbackWarnings(messages.value[index])[0];
    if (warning) return formatClaudeFallbackWarning(warning);
  }
  return '';
});

const currentChatMode = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index];
    if (message?.role === 'assistant' && message?.mode) return message.mode;
  }
  return '';
});

const plannerModeMeta = computed(() => {
  if (latestClaudeFallbackWarning.value) {
    return { kind: 'fallback', label: 'Rule-based fallback' };
  }
  if (currentChatMode.value === 'claude') {
    return { kind: 'claude', label: 'Claude planner' };
  }
  if (currentChatMode.value === 'rule-based') {
    return { kind: 'rule-based', label: 'Rule-based planner' };
  }
  return { kind: 'pending', label: 'Planner pending' };
});

function buildSummaryReply() {
  const flags = datasetFlags.value;
  const lines = [
    `Active dataset: ${props.datasetName || 'untitled'}.`,
    `Rows: ${props.rows.length}, columns: ${props.columns.length}.`,
    `Column mix: ${flags.numericColumns} numeric, ${flags.categoricalColumns} categorical, ${flags.dateColumns} date-like.`,
  ];
  if (flags.missingColumns.length) {
    lines.push(`Missing-value hotspots: ${flags.missingColumns.map((item) => `${item.name} (${item.rate}%)`).join(', ')}.`);
  } else {
    lines.push('No major missing-value hotspot was detected in the sampled rows.');
  }
  if (flags.duplicateRows > 0) {
    lines.push(`Sample duplicate rows detected: ${flags.duplicateRows}.`);
  }
  if (flags.outlierColumns.length) {
    lines.push(`Possible outlier-heavy columns: ${flags.outlierColumns.map((item) => `${item.name} (${item.rate}%)`).join(', ')}.`);
  }
  if (flags.imbalancedColumns.length) {
    lines.push(`Categorical imbalance: ${flags.imbalancedColumns.map((item) => `${item.name}=${item.topValue} (${item.rate}%)`).join(', ')}.`);
  }
  if (flags.topCorrCount > 0) {
    lines.push(`Profile found ${flags.topCorrCount} correlation candidate pairs worth checking.`);
  }
  if (Array.isArray(props.profileSummary?.warnings) && props.profileSummary.warnings.length) {
    lines.push(`Warnings: ${props.profileSummary.warnings.slice(0, 2).join(' ')}`);
  }
  return lines.join('\n');
}

function buildAnomalyReply() {
  const flags = datasetFlags.value;
  const notes = [];
  if (flags.missingColumns.length) {
    notes.push(`Review missing values first: ${flags.missingColumns.map((item) => `${item.name} (${item.rate}%)`).join(', ')}.`);
  }
  if (flags.duplicateRows > 0) {
    notes.push(`There are ${flags.duplicateRows} duplicate rows in the profile sample.`);
  }
  if (flags.constantColumns.length) {
    notes.push(`Constant or near-constant columns: ${flags.constantColumns.join(', ')}.`);
  }
  if (flags.outlierColumns.length) {
    notes.push(`Possible outlier-heavy columns: ${flags.outlierColumns.map((item) => `${item.name} (${item.rate}%)`).join(', ')}.`);
  }
  if (flags.imbalancedColumns.length) {
    notes.push(`Categorical imbalance candidates: ${flags.imbalancedColumns.map((item) => `${item.name}=${item.topValue} (${item.rate}%)`).join(', ')}.`);
  }
  if (flags.topCorrCount > 0) {
    notes.push(`High-correlation candidates exist. A correlation matrix or scatter review is recommended.`);
  }
  if (props.profileSummary?.warnings?.length) {
    notes.push(`Profile warnings: ${props.profileSummary.warnings.join(' ')}`);
  }
  if (!notes.length) {
    notes.push('No obvious red flag was found from the current lightweight profile. Next step: run descriptive stats and correlation review.');
  }
  return notes.join('\n');
}

function buildStatsReply() {
  const flags = datasetFlags.value;
  const recs = ['1. Start with descriptive statistics.'];
  if (flags.numericColumns >= 2) recs.push('2. Run correlation analysis for numeric relationships.');
  if (flags.numericColumns >= 1 && flags.categoricalColumns >= 1) recs.push('3. Run group comparison tests such as t-test, ANOVA, or a nonparametric alternative.');
  if (flags.numericColumns >= 2) recs.push('4. If you have a target column, test OLS/regression assumptions.');
  if (props.profileSummary?.topAnovaCount > 0) recs.push('5. ANOVA candidates already exist in the current profile sample.');
  return `Recommended statistics for this dataset:\n${recs.join('\n')}`;
}

function buildChartReply() {
  const flags = datasetFlags.value;
  const recs = [];
  if (flags.numericColumns >= 1) recs.push('Histogram for distribution checks');
  if (flags.numericColumns >= 2) recs.push('Scatter plot for pair relationships');
  if (flags.numericColumns >= 1 && flags.categoricalColumns >= 1) recs.push('Box plot for group comparisons');
  if (flags.categoricalColumns >= 1) recs.push('Bar chart for category balance');
  if (flags.topCorrCount > 0) recs.push('Correlation heatmap for global pair review');
  if (!recs.length) recs.push('Start with a simple table preview and category counts');
  return `Suggested charts:\n${recs.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

function buildMlReply() {
  const flags = datasetFlags.value;
  if (props.rows.length < 30) {
    return 'The dataset is small for ML. Start with statistics and visualization first, then move to lightweight models only if the target is clear.';
  }
  const recs = [];
  if (flags.numericColumns >= 2) recs.push('Regression if you have a numeric target');
  if (flags.categoricalColumns >= 1 && flags.numericColumns >= 1) recs.push('Classification if you have a label column');
  if (flags.dateColumns >= 1 && flags.numericColumns >= 1) recs.push('Time-series forecasting if one date column defines the sequence');
  recs.push('Clustering for unsupervised segmentation');
  recs.push('Anomaly detection for rare-case inspection');
  return `Suggested ML directions:\n${recs.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

function buildCompareReply() {
  if (workspaceFacts.value.count < 2) {
    return 'Only one dataset is open right now. Open at least two workspace tabs to compare them.';
  }
  const lines = [
    `Open datasets: ${workspaceFacts.value.datasets.map((dataset) => dataset.name).join(', ')}.`,
    `Active dataset: ${workspaceFacts.value.current?.name || props.datasetName || 'untitled'}.`,
  ];
  if (workspaceFacts.value.sharedColumns.length) {
    lines.push(`Shared columns across open datasets: ${workspaceFacts.value.sharedColumns.join(', ')}.`);
  } else {
    lines.push('No shared column names were detected across all open datasets.');
  }
  lines.push(`Dataset sizes: ${workspaceFacts.value.datasets.map((dataset) => `${dataset.name} (${dataset.rowCount} rows / ${dataset.columnCount} cols)`).join(' | ')}.`);
  lines.push('Recommended next step: inspect workspace summaries first, then run the same descriptive workflow across the datasets you want to compare.');
  return lines.join('\n');
}

function buildLocalSuggestions() {
  const suggestions = [
    ...(workspaceFacts.value.count > 1
      ? [{
        label: 'Compare open datasets',
        tool: 'workspace.list_datasets',
        reason: 'Multiple datasets are open in the workspace.',
        inputTemplate: {},
      }, {
        label: 'Compare descriptive stats across workspace',
        tool: 'workspace.compare_describe',
        reason: 'Run the same descriptive workflow across the open datasets.',
        inputTemplate: {},
      }, {
        label: 'Plan comparison charts across workspace',
        tool: 'workspace.compare_chart_plan',
        reason: 'Build chart specs to compare the open datasets.',
        inputTemplate: {},
      }, {
        label: 'Compare stat differences across workspace',
        tool: 'workspace.compare_stat_diff',
        reason: 'Highlight the strongest numeric and categorical differences across the open datasets.',
        inputTemplate: {},
      }, {
        label: 'Recommend workspace priorities',
        tool: 'workspace.recommend_analysis',
        reason: 'Prioritize which dataset and analysis should be handled first.',
        inputTemplate: {},
      }, {
        label: 'Plan formal compares across workspace',
        tool: 'workspace.formal_compare_plan',
        reason: 'Align comparable tests and cautions before deeper inference.',
        inputTemplate: {},
      }]
      : []),
    {
      label: 'Inspect dataset profile',
      tool: 'dataset.profile',
      reason: 'Read the compact dataset summary first.',
      inputTemplate: {},
    },
    {
      label: 'Inspect dataset flags',
      tool: 'dataset.flags',
      reason: 'Check fast warnings before deeper analysis.',
      inputTemplate: {},
    },
    {
      label: 'Run descriptive statistics',
      tool: 'stat.run',
      reason: 'Start with a compact summary of the current dataset.',
      inputTemplate: { op: 'describe' },
    },
  ];
  if (datasetFlags.value.numericColumns >= 2) {
    suggestions.push({
      label: 'Run correlation analysis',
      tool: 'stat.run',
      reason: 'Multiple numeric columns are available.',
      inputTemplate: { op: 'corr' },
    });
  }
  if (datasetFlags.value.numericColumns >= 1 && datasetFlags.value.categoricalColumns >= 1) {
    suggestions.push({
      label: 'Ask for recommended tests',
      tool: 'stat.recommend',
      reason: 'Mixed numeric and categorical structure suggests comparison tests.',
      inputTemplate: {},
    });
  }
  if (props.rows.length >= 30) {
    suggestions.push({
      label: 'Run anomaly detection starter',
      tool: 'ml.run',
      reason: 'Start with an unsupervised anomaly scan without selecting a target.',
      inputTemplate: {
        task: 'anomaly',
        model: 'isolation_forest',
        options: {
          preset: 'balanced',
          contamination: 'auto',
        },
      },
    });
    if (datasetFlags.value.numericColumns >= 2) {
      suggestions.push({
        label: 'Run regression starter',
        tool: 'ml.run',
        reason: 'Use a numeric target candidate with the remaining columns as starter features.',
        inputTemplate: {
          task: 'regression',
          model: 'linear',
          options: {
            preset: 'balanced',
          },
        },
      });
    }
    if (datasetFlags.value.categoricalColumns >= 1 && datasetFlags.value.numericColumns >= 1) {
      suggestions.push({
        label: 'Run classification starter',
        tool: 'ml.run',
        reason: 'Use a categorical target candidate with mixed numeric and categorical features.',
        inputTemplate: {
          task: 'classification',
          model: 'forest',
          options: {
            preset: 'balanced',
          },
        },
      });
    }
    if (datasetFlags.value.dateColumns >= 1 && datasetFlags.value.numericColumns >= 1) {
      suggestions.push({
        label: 'Run time-series starter',
        tool: 'ml.run',
        reason: 'Use a date-like column and numeric measure for a first-pass forecast.',
        inputTemplate: {
          task: 'timeseries',
          model: 'moving_avg',
          options: {
            preset: 'balanced',
            horizon: 12,
          },
        },
      });
    }
  }
  return suggestions;
}

function buildGenericReply(promptText) {
  const prompt = String(promptText || '').toLowerCase();
  if (prompt.includes('compare') || prompt.includes('difference') || prompt.includes('workspace') || prompt.includes('datasets')) {
    return buildCompareReply();
  }
  if (prompt.includes('summary') || prompt.includes('summarize') || prompt.includes('overview')) {
    return buildSummaryReply();
  }
  if (prompt.includes('anomaly') || prompt.includes('issue') || prompt.includes('problem') || prompt.includes('weird')) {
    return buildAnomalyReply();
  }
  if (prompt.includes('stat') || prompt.includes('test') || prompt.includes('analysis')) {
    return buildStatsReply();
  }
  if (prompt.includes('chart') || prompt.includes('graph') || prompt.includes('visual')) {
    return buildChartReply();
  }
  if (prompt.includes('ml') || prompt.includes('model') || prompt.includes('predict')) {
    return buildMlReply();
  }
  return [
    'I can help with three things right now:',
    '1. Summarize the current dataset',
    '2. Flag likely issues or anomalies',
    '3. Suggest stats, charts, or ML next steps',
    '',
    'Try one of the quick actions below or ask a direct question.',
  ].join('\n');
}

function buildDatasetContext() {
  return {
    datasetId: props.datasetId || '',
    datasetName: props.datasetName || 'untitled',
    rowCount: props.rows.length,
    columnCount: props.columns.length,
    columns: props.columns,
    sampleRows: takeSampleRows(props.rows, 40),
    profileSummary: props.profileSummary,
    workspaceDatasets: Array.isArray(props.workspaceDatasets) ? props.workspaceDatasets : [],
  };
}

function inferColumnBuckets() {
  const buckets = {
    numeric: [],
    categorical: [],
    dateLike: [],
  };
  const sampleRows = takeSampleRows(props.rows, 120);
  for (const column of props.columns || []) {
    const values = sampleRows.map((row) => row?.[column]);
    if (looksNumeric(values)) buckets.numeric.push(column);
    else if (looksDate(values)) buckets.dateLike.push(column);
    else buckets.categorical.push(column);
  }
  return buckets;
}

function buildDefaultVizInput() {
  const buckets = inferColumnBuckets();
  if (buckets.dateLike[0] && buckets.numeric[0]) {
    return {
      spec: {
        type: 'line',
        x: buckets.dateLike[0],
        y: buckets.numeric[0],
        options: {
          title: `${buckets.numeric[0]} over ${buckets.dateLike[0]}`,
          xLabel: buckets.dateLike[0],
          yLabel: buckets.numeric[0],
        },
      },
    };
  }
  if (buckets.categorical[0] && buckets.numeric[0]) {
    return {
      spec: {
        type: 'bar',
        x: buckets.categorical[0],
        y: buckets.numeric[0],
        options: {
          agg: 'mean',
          title: `${buckets.numeric[0]} by ${buckets.categorical[0]}`,
          xLabel: buckets.categorical[0],
          yLabel: buckets.numeric[0],
        },
      },
    };
  }
  if (buckets.numeric[0] && buckets.numeric[1]) {
    return {
      spec: {
        type: 'scatter',
        x: buckets.numeric[0],
        y: buckets.numeric[1],
        options: {
          title: `${buckets.numeric[1]} vs ${buckets.numeric[0]}`,
          xLabel: buckets.numeric[0],
          yLabel: buckets.numeric[1],
        },
      },
    };
  }
  if (buckets.numeric[0]) {
    return {
      spec: {
        type: 'histogram',
        x: buckets.numeric[0],
        options: {
          title: `Distribution of ${buckets.numeric[0]}`,
          xLabel: buckets.numeric[0],
          yLabel: 'Count',
        },
      },
    };
  }
  if (buckets.categorical[0]) {
    return {
      spec: {
        type: 'bar',
        x: buckets.categorical[0],
        options: {
          agg: 'count',
          title: `${buckets.categorical[0]} counts`,
          xLabel: buckets.categorical[0],
          yLabel: 'Count',
        },
      },
    };
  }
  return { spec: { type: 'bar' } };
}

function inferMlPresetRequest(request = {}) {
  const next = request && typeof request === 'object' ? { ...request } : {};
  const buckets = inferColumnBuckets();
  const numeric = Array.isArray(buckets.numeric) ? buckets.numeric : [];
  const categorical = Array.isArray(buckets.categorical) ? buckets.categorical : [];
  const dateLike = Array.isArray(buckets.dateLike) ? buckets.dateLike : [];
  const allColumns = Array.isArray(props.columns) ? props.columns : [];
  const defaultTask = dateLike[0] && numeric[0]
    ? 'timeseries'
    : numeric.length >= 2
      ? 'anomaly'
      : categorical[0] && numeric[0]
        ? 'classification'
        : 'anomaly';
  const task = String(next.task || defaultTask).toLowerCase();
  const modelDefaults = {
    regression: 'linear',
    classification: 'forest',
    anomaly: 'isolation_forest',
    clustering: 'kmeans',
    dim_reduction: 'pca',
    timeseries: 'moving_avg',
  };
  next.task = task;
  next.model = String(next.model || modelDefaults[task] || 'isolation_forest');
  next.args = next.args && typeof next.args === 'object' ? { ...next.args } : {};
  next.options = next.options && typeof next.options === 'object' ? { ...next.options } : {};
  if (!next.options.preset) next.options.preset = props.rows.length >= 20000 ? 'fast' : 'balanced';

  const numericFeatures = numeric.slice(0, Math.min(6, numeric.length));
  const fallbackFeatures = allColumns.slice(0, Math.min(6, allColumns.length));

  if (task === 'timeseries') {
    if (!next.args.timeColumn) next.args.timeColumn = dateLike[0] || allColumns[0] || '';
    if (!next.args.target) {
      next.args.target = numeric.find((column) => column !== next.args.timeColumn) || numeric[0] || '';
    }
    next.args.features = [];
    if (next.options.horizon == null) next.options.horizon = 12;
    return next;
  }

  if (task === 'regression') {
    if (!next.args.target) next.args.target = numeric[numeric.length - 1] || numeric[0] || '';
    if (!Array.isArray(next.args.features) || !next.args.features.length) {
      const candidates = allColumns.filter((column) => column !== next.args.target);
      next.args.features = candidates.slice(0, Math.min(6, candidates.length));
    }
    if (!next.options.scoring) next.options.scoring = 'r2';
    if (next.options.cv == null) next.options.cv = props.rows.length >= 100 ? 5 : 3;
    return next;
  }

  if (task === 'classification') {
    if (!next.args.target) next.args.target = categorical[0] || allColumns[0] || '';
    if (!Array.isArray(next.args.features) || !next.args.features.length) {
      const candidates = [...numericFeatures, ...categorical.filter((column) => column !== next.args.target)]
        .filter((column, index, list) => column !== next.args.target && list.indexOf(column) === index);
      next.args.features = candidates.slice(0, Math.min(6, candidates.length));
    }
    if (!next.options.scoring) next.options.scoring = 'f1_weighted';
    if (next.options.cv == null) next.options.cv = props.rows.length >= 100 ? 5 : 3;
    return next;
  }

  if (task === 'clustering' || task === 'dim_reduction' || task === 'anomaly') {
    if (!Array.isArray(next.args.features) || !next.args.features.length) {
      next.args.features = (numericFeatures.length ? numericFeatures : fallbackFeatures).slice(0, Math.min(6, (numericFeatures.length ? numericFeatures : fallbackFeatures).length));
    }
    if (task === 'clustering' && next.options.nClusters == null) next.options.nClusters = 3;
    if (task === 'dim_reduction' && next.options.nComponents == null) next.options.nComponents = 2;
    if (task === 'anomaly' && next.options.contamination == null) next.options.contamination = 'auto';
  }

  return next;
}

function buildSuggestionInput(suggestion) {
  const input = suggestion?.inputTemplate && typeof suggestion.inputTemplate === 'object'
    ? { ...suggestion.inputTemplate }
    : suggestion?.input && typeof suggestion.input === 'object'
      ? { ...suggestion.input }
      : {};
  if (suggestion?.tool === 'stat.run' && !input.op) {
    input.op = 'describe';
  }
  if ((suggestion?.tool === 'viz.prepare' || suggestion?.tool === 'viz.aggregate') && !input.spec) {
    return buildDefaultVizInput();
  }
  if (suggestion?.tool === 'ml.run') {
    return inferMlPresetRequest(input);
  }
  return input;
}

function firstNonEmptyTable(result) {
  if (!Array.isArray(result?.tables)) return null;
  return result.tables.find((table) => Array.isArray(table?.rows) && table.rows.length > 0) || null;
}

function summarizeTable(table) {
  if (!table) return '';
  const rowCount = Array.isArray(table.rows) ? table.rows.length : 0;
  const columns = Array.isArray(table.columns) ? table.columns.slice(0, 4).join(', ') : '';
  return `${rowCount} rows available${columns ? ` (${columns})` : ''}.`;
}

function parseFigureInfo(figJson) {
  try {
    const parsed = JSON.parse(figJson || '{}');
    const title = parsed?.layout?.title?.text || parsed?.layout?.title || 'Prepared chart';
    const traceCount = Array.isArray(parsed?.data) ? parsed.data.length : 0;
    return { title: String(title || 'Prepared chart'), traceCount };
  } catch {
    return { title: 'Prepared chart', traceCount: 0 };
  }
}

function buildStatRecommendationSuggestions(result) {
  const suggestions = [];
  const recommendations = Array.isArray(result?.recommendations) ? result.recommendations : [];
  for (const recommendation of recommendations.slice(0, 3)) {
    suggestions.push({
      label: recommendation.label || `Run ${recommendation.op}`,
      tool: 'stat.run',
      reason: recommendation.reason || 'Recommended by the statistics engine.',
      inputTemplate: {
        op: recommendation.op,
        args: recommendation.args || {},
      },
    });
    if (recommendation?.chart?.type) {
      suggestions.push({
        label: `Prepare ${recommendation.chart.type} chart`,
        tool: 'viz.prepare',
        reason: `Chart hint for ${recommendation.label || recommendation.op}.`,
        inputTemplate: {
          spec: {
            type: recommendation.chart.type,
            x: recommendation.chart.x,
            y: recommendation.chart.y,
            options: {
              title: recommendation.label || 'Recommended chart',
            },
          },
        },
      });
    }
  }
  return suggestions.slice(0, 4);
}

function statPanelForOp(op) {
  const normalized = String(op || '').toLowerCase();
  if (!normalized) return '';
  if (normalized === 'describe') return 'report';
  if (normalized === 'corr') return 'corr';
  if (['ttest', 'chisq', 'recommend'].includes(normalized)) return 'tests';
  if (normalized === 'ols') return 'ols';
  if (['anova', 'normality', 'ci_mean', 'mannwhitney', 'wilcoxon', 'kruskal', 'tukey', 'pairwise_adjusted'].includes(normalized)) {
    return 'advanced';
  }
  return '';
}

function buildOpenStatAction(op, args = {}, extra = {}) {
  const statPanel = statPanelForOp(op);
  if (!statPanel) return null;
  return {
    label: extra.label || 'Run in Stats panel',
    type: 'open-stat',
    payload: {
      statPanel,
      op,
      args: args && typeof args === 'object' ? { ...args } : {},
      options: extra.options && typeof extra.options === 'object' ? { ...extra.options } : {},
      datasetId: extra.datasetId || '',
      datasetName: extra.datasetName || '',
      title: extra.title || '',
      autoRun: !!extra.autoRun,
    },
  };
}

function buildOpenMlAction(request = {}, extra = {}) {
  if (!request || typeof request !== 'object') return null;
  const normalizedRequest = inferMlPresetRequest(request);
  return {
    label: extra.label || 'Open ML preset',
    type: 'focus-panel',
    payload: {
      panel: 'ml',
      request: normalizedRequest,
      datasetId: extra.datasetId || '',
      datasetName: extra.datasetName || '',
      title: extra.title || '',
    },
  };
}

function buildMlResultMeta(data = {}, request = {}) {
  const task = String(data?.task || request?.task || 'ml').toLowerCase();
  const model = String(data?.model || request?.model || 'model');
  const primary = data?.metricsContract?.primary;
  const target = String(data?.target || request?.args?.target || '').trim();
  const featureCount = Array.isArray(data?.features)
    ? data.features.length
    : Array.isArray(request?.args?.features)
      ? request.args.features.length
      : 0;
  const timeColumn = String(data?.timeColumn || request?.args?.timeColumn || '').trim();
  const primaryText = primary ? `${primary.name}: ${primary.value}` : '';

  if (task === 'regression') {
    return {
      title: 'Regression result',
      body: `${primaryText || `${model} completed`}${target ? ` | target=${target}` : ''}${featureCount ? ` | features=${featureCount}` : ''}. Review residual diagnostics and importance in the ML panel.`,
      openLabel: 'Open regression preset',
      focusLabel: 'Review residual diagnostics',
      panelTitle: `${model} regression preset is ready in the ML panel.`,
    };
  }
  if (task === 'classification') {
    return {
      title: 'Classification result',
      body: `${primaryText || `${model} completed`}${target ? ` | target=${target}` : ''}${featureCount ? ` | features=${featureCount}` : ''}. Review confusion matrix and importance in the ML panel.`,
      openLabel: 'Open classification preset',
      focusLabel: 'Review confusion matrix',
      panelTitle: `${model} classification preset is ready in the ML panel.`,
    };
  }
  if (task === 'timeseries') {
    return {
      title: 'Forecast result',
      body: `${primaryText || `${model} completed`}${target ? ` | target=${target}` : ''}${timeColumn ? ` | time=${timeColumn}` : ''}. Review forecast preview and residual summary in the ML panel.`,
      openLabel: 'Open forecast preset',
      focusLabel: 'Review forecast preview',
      panelTitle: `${model} forecast preset is ready in the ML panel.`,
    };
  }
  if (task === 'clustering') {
    return {
      title: 'Clustering result',
      body: `${primaryText || `${model} completed`}${featureCount ? ` | features=${featureCount}` : ''}. Review cluster summary in the ML panel.`,
      openLabel: 'Open clustering preset',
      focusLabel: 'Review cluster summary',
      panelTitle: `${model} clustering preset is ready in the ML panel.`,
    };
  }
  if (task === 'dim_reduction') {
    return {
      title: 'Dimensionality reduction result',
      body: `${primaryText || `${model} completed`}${featureCount ? ` | features=${featureCount}` : ''}. Review projection preview in the ML panel.`,
      openLabel: 'Open projection preset',
      focusLabel: 'Review projection preview',
      panelTitle: `${model} dimensionality-reduction preset is ready in the ML panel.`,
    };
  }
  return {
    title: 'Anomaly detection result',
    body: `${primaryText || `${model} completed`}${featureCount ? ` | features=${featureCount}` : ''}. Review anomaly summary and importance in the ML panel.`,
    openLabel: 'Open anomaly preset',
    focusLabel: 'Review anomaly summary',
    panelTitle: `${model} anomaly preset is ready in the ML panel.`,
  };
}

function buildMlFollowUpSuggestions(data = {}, request = {}) {
  const normalized = inferMlPresetRequest(request);
  const task = String(data?.task || normalized?.task || 'ml').toLowerCase();
  const target = String(data?.target || normalized?.args?.target || '').trim();
  const timeColumn = String(data?.timeColumn || normalized?.args?.timeColumn || '').trim();
  const features = Array.isArray(data?.features)
    ? data.features
    : Array.isArray(normalized?.args?.features)
      ? normalized.args.features
      : [];
  const firstFeature = String(features[0] || '').trim();
  const secondFeature = String(features[1] || '').trim();
  const suggestions = [];

  if (task === 'regression') {
    suggestions.push({
      label: 'Run correlation analysis',
      tool: 'stat.run',
      reason: 'Check linear relationships around the regression setup.',
      inputTemplate: { op: 'corr' },
    });
    if (target && firstFeature) {
      suggestions.push({
        label: `Prepare ${target} vs ${firstFeature} scatter`,
        tool: 'viz.prepare',
        reason: 'Visualize the main target-feature relationship used by the regression preset.',
        inputTemplate: {
          spec: {
            type: 'scatter',
            x: firstFeature,
            y: target,
            options: {
              title: `${target} vs ${firstFeature}`,
              xLabel: firstFeature,
              yLabel: target,
            },
          },
        },
      });
    }
    return suggestions;
  }

  if (task === 'classification') {
    suggestions.push({
      label: 'Ask for recommended tests',
      tool: 'stat.recommend',
      reason: 'Review class-related group differences before tuning the classifier.',
      inputTemplate: {},
    });
    if (target && firstFeature) {
      suggestions.push({
        label: `Prepare ${firstFeature} by ${target} chart`,
        tool: 'viz.prepare',
        reason: 'Compare the starter feature across the predicted class groups.',
        inputTemplate: {
          spec: {
            type: 'bar',
            x: target,
            y: firstFeature,
            options: {
              agg: 'mean',
              title: `${firstFeature} by ${target}`,
              xLabel: target,
              yLabel: firstFeature,
            },
          },
        },
      });
    }
    return suggestions;
  }

  if (task === 'timeseries') {
    suggestions.push({
      label: 'Run descriptive statistics',
      tool: 'stat.run',
      reason: 'Check the scale and spread of the forecast target.',
      inputTemplate: { op: 'describe' },
    });
    if (timeColumn && target) {
      suggestions.push({
        label: `Prepare ${target} forecast line`,
        tool: 'viz.prepare',
        reason: 'Review the source series alongside the forecast setup.',
        inputTemplate: {
          spec: {
            type: 'line',
            x: timeColumn,
            y: target,
            options: {
              title: `${target} over ${timeColumn}`,
              xLabel: timeColumn,
              yLabel: target,
            },
          },
        },
      });
    }
    return suggestions;
  }

  if (task === 'clustering') {
    suggestions.push({
      label: 'Run descriptive statistics',
      tool: 'stat.run',
      reason: 'Check the scale of the variables used for clustering.',
      inputTemplate: { op: 'describe' },
    });
    if (firstFeature && secondFeature) {
      suggestions.push({
        label: `Prepare ${secondFeature} vs ${firstFeature} scatter`,
        tool: 'viz.prepare',
        reason: 'Inspect the first two clustering features together.',
        inputTemplate: {
          spec: {
            type: 'scatter',
            x: firstFeature,
            y: secondFeature,
            options: {
              title: `${secondFeature} vs ${firstFeature}`,
              xLabel: firstFeature,
              yLabel: secondFeature,
            },
          },
        },
      });
    }
    return suggestions;
  }

  if (task === 'dim_reduction') {
    suggestions.push({
      label: 'Run correlation analysis',
      tool: 'stat.run',
      reason: 'Review the numeric relationships before interpreting the reduced space.',
      inputTemplate: { op: 'corr' },
    });
    suggestions.push({
      label: 'Review visualization options',
      tool: 'viz.prepare',
      reason: 'Choose a compact chart before comparing the reduced-space results.',
      inputTemplate: buildDefaultVizInput(),
    });
    return suggestions;
  }

  suggestions.push({
    label: 'Inspect dataset flags',
    tool: 'dataset.flags',
    reason: 'Check whether data-quality issues explain anomaly-like behavior.',
    inputTemplate: {},
  });
  if (firstFeature && secondFeature) {
    suggestions.push({
      label: `Prepare ${secondFeature} vs ${firstFeature} scatter`,
      tool: 'viz.prepare',
      reason: 'Inspect the first two anomaly features together.',
      inputTemplate: {
        spec: {
          type: 'scatter',
          x: firstFeature,
          y: secondFeature,
          options: {
            title: `${secondFeature} vs ${firstFeature}`,
            xLabel: firstFeature,
            yLabel: secondFeature,
          },
        },
      },
    });
  } else if (firstFeature) {
    suggestions.push({
      label: `Prepare ${firstFeature} distribution`,
      tool: 'viz.prepare',
      reason: 'Review the distribution of the main anomaly feature.',
      inputTemplate: {
        spec: {
          type: 'histogram',
          x: firstFeature,
          options: {
            title: `Distribution of ${firstFeature}`,
            xLabel: firstFeature,
            yLabel: 'Count',
          },
        },
      },
    });
  }
  return suggestions;
}

function buildMlCardActions(suggestions = [], request = {}, mlMeta = {}) {
  const datasetId = props.datasetId || '';
  const datasetName = props.datasetName || '';
  const actions = [];
  const openMlAction = buildOpenMlAction(request, {
    label: mlMeta.openLabel,
    datasetId,
    datasetName,
    title: mlMeta.panelTitle,
  });
  if (openMlAction) {
    actions.push(openMlAction);
  }
  if (mlMeta.focusLabel) {
    actions.push({
      label: mlMeta.focusLabel,
      type: 'focus-panel',
      payload: { panel: 'ml', datasetId, datasetName },
    });
  }
  const statSuggestion = suggestions.find((item) =>
    (item?.tool === 'stat.run' || item?.tool === 'stat.recommend')
      && (item?.inputTemplate?.op || item?.tool === 'stat.recommend')
  );
  if (statSuggestion) {
    const statOp = statSuggestion.inputTemplate?.op || (statSuggestion.tool === 'stat.recommend' ? 'recommend' : '');
    const statAction = buildOpenStatAction(statOp, statSuggestion.inputTemplate?.args, {
      label: statSuggestion.label,
      datasetId,
      datasetName,
      title: statSuggestion.label,
      autoRun: true,
    });
    if (statAction) actions.push(statAction);
  }
  const chartSuggestion = suggestions.find((item) => item?.tool === 'viz.prepare' && item?.inputTemplate?.spec);
  if (chartSuggestion) {
    actions.push({
      label: chartSuggestion.label,
      type: 'open-chart',
      payload: {
        spec: chartSuggestion.inputTemplate.spec,
        datasetId,
        datasetName,
      },
    });
  }
  return actions.filter(Boolean);
}

function inferSuggestedStatOp(suggestedOps = []) {
  for (const suggestedOp of suggestedOps || []) {
    const text = String(suggestedOp || '').toLowerCase();
    if (text.includes('pairwise_adjusted')) return 'pairwise_adjusted';
    if (text.includes('tukey')) return 'tukey';
    if (text.includes('kruskal')) return 'kruskal';
    if (text.includes('mann-whitney') || text.includes('mannwhitney')) return 'mannwhitney';
    if (text.includes('wilcoxon')) return 'wilcoxon';
    if (text.includes('anova')) return 'anova';
    if (text.includes('chi-square') || text.includes('chi square') || text.includes('association')) return 'chisq';
    if (text.includes('t-test') || text.includes('ttest')) return 'ttest';
    if (text.includes('corr')) return 'corr';
    if (text.includes('describe')) return 'describe';
    if (text.includes('recommend')) return 'recommend';
  }
  return '';
}

function summarizeToolExecution(tool, wrappedResult, label, context = {}) {
  const result = wrappedResult?.result || wrappedResult || {};
  if (tool === 'workspace.current_dataset') {
    const data = result?.data || {};
    return {
      text: `${label || 'Current dataset summary'} completed.`,
      cards: [
        {
          title: data.datasetName || props.datasetName || 'Current dataset',
          body: `${data.rowCount || props.rows.length} rows / ${data.columnCount || props.columns.length} columns / ${data.numericColumns || 0} numeric / ${data.categoricalColumns || 0} categorical`,
        },
      ],
      suggestions: buildLocalSuggestions().slice(0, 3),
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    };
  }
  if (tool === 'workspace.list_datasets') {
    const data = result?.data || {};
    const datasets = Array.isArray(data.datasets) ? data.datasets : [];
    const cards = datasets.slice(0, 4).map((dataset) => ({
      title: `${dataset.name}${dataset.active ? ' (active)' : ''}`,
      body: `${dataset.rowCount || 0} rows / ${dataset.columnCount || 0} columns${dataset.dirty ? ' / unsaved changes' : ''}`,
    }));
    if (Array.isArray(data.sharedColumns) && data.sharedColumns.length) {
      cards.unshift({
        title: 'Shared columns',
        body: data.sharedColumns.join(', '),
      });
    }
    return {
      text: `${label || 'Workspace comparison'} completed.`,
      cards,
      suggestions: [
        {
          label: 'Run descriptive statistics',
          tool: 'stat.run',
          reason: 'Compare the same summary stats across the open datasets manually.',
          inputTemplate: { op: 'describe' },
        },
      ],
      warnings: [],
    };
  }
  if (tool === 'workspace.compare_describe') {
    const data = result?.data || {};
    const datasets = Array.isArray(data.datasets) ? data.datasets : [];
    const cards = [];
    cards.push({
      title: 'Workspace describe comparison',
      body: `${data.comparedDatasets || datasets.length || 0} dataset(s) compared on capped samples.`,
    });
    if (Array.isArray(data.sharedColumns) && data.sharedColumns.length) {
      cards.push({
        title: 'Shared columns',
        body: data.sharedColumns.join(', '),
      });
    }
    if (data.focusNumericColumn) {
      cards.push({
        title: `Focus numeric column: ${data.focusNumericColumn}`,
        body: datasets
          .map((dataset) => `${dataset.name}: mean=${dataset.focusStats?.mean ?? 'n/a'}, median=${dataset.focusStats?.median ?? 'n/a'}, std=${dataset.focusStats?.std ?? 'n/a'}`)
          .join(' | '),
      });
    }
    datasets.slice(0, 4).forEach((dataset) => {
      const openReportAction = buildOpenStatAction('describe', {}, {
        label: 'Open and run report',
        datasetId: dataset.datasetId,
        datasetName: dataset.name,
        autoRun: true,
      });
      cards.push({
        title: dataset.name,
        body: `${dataset.rowCount || 0} rows / ${dataset.columnCount || 0} columns / sample ${dataset.sampleRows || 0} / dup ${dataset.dupRows || 0}${dataset.topMissing ? ` / top missing ${dataset.topMissing}` : ''}`,
        actions: [
          openReportAction,
          {
            label: 'Focus stats panels',
            type: 'focus-panel',
            payload: { panel: 'stats', datasetId: dataset.datasetId, datasetName: dataset.name },
          },
        ].filter(Boolean),
      });
    });
    return {
      text: `${label || 'Workspace descriptive comparison'} completed.`,
      cards,
      suggestions: [
        {
          label: 'Compare open datasets',
          tool: 'workspace.list_datasets',
          reason: 'Review structure and shared columns alongside the descriptive diff.',
          inputTemplate: {},
        },
      ],
      warnings: [],
    };
  }
  if (tool === 'workspace.compare_chart_plan') {
    const data = result?.data || {};
    const datasets = Array.isArray(data.datasets) ? data.datasets : [];
    const focus = data.focus || {};
    const cards = [
      {
        title: 'Workspace chart compare plan',
        body: `${data.chartType || 'bar'} chart recommended. ${data.reason || ''}`.trim(),
        actions: datasets.length
          ? [
            {
              label: 'Open compare board',
              type: 'open-chart-board',
              payload: {
                title: 'Workspace compare board',
                charts: datasets.map((dataset) => ({
                  datasetId: dataset.datasetId,
                  datasetName: dataset.name,
                  spec: dataset.spec,
                })),
              },
            },
            {
              label: 'Focus Graph',
              type: 'focus-panel',
              payload: { panel: 'graph' },
            },
          ]
          : [],
      },
    ];
    if (Array.isArray(data.sharedColumns) && data.sharedColumns.length) {
      cards.push({
        title: 'Shared columns',
        body: data.sharedColumns.join(', '),
      });
    }
    if (focus.x || focus.y) {
      cards.push({
        title: 'Focus columns',
        body: `x: ${focus.x || 'n/a'} | y: ${focus.y || 'n/a'}${focus.agg ? ` | agg: ${focus.agg}` : ''}`,
      });
    }
    datasets.slice(0, 4).forEach((dataset) => {
      cards.push({
        title: dataset.name,
        body: `type=${dataset.spec?.type || 'bar'} | x=${dataset.spec?.x || 'n/a'} | y=${dataset.spec?.y || 'n/a'}`,
        actions: [
          {
            label: 'Open in Graph',
            type: 'open-chart',
            payload: { datasetId: dataset.datasetId, datasetName: dataset.name, spec: dataset.spec },
          },
          {
            label: 'Focus Graph',
            type: 'focus-panel',
            payload: { panel: 'graph', datasetId: dataset.datasetId, datasetName: dataset.name },
          },
        ],
      });
    });
    return {
      text: `${label || 'Workspace chart comparison plan'} completed.`,
      cards,
      suggestions: [
        {
          label: 'Compare descriptive stats across workspace',
          tool: 'workspace.compare_describe',
          reason: 'Validate the chart plan against summary statistics.',
          inputTemplate: {},
        },
      ],
      warnings: [],
    };
  }
  if (tool === 'workspace.compare_stat_diff') {
    const data = result?.data || {};
    const numericDiffs = Array.isArray(data.numericDiffs) ? data.numericDiffs : [];
    const categoricalDiffs = Array.isArray(data.categoricalDiffs) ? data.categoricalDiffs : [];
    const cards = [
      {
        title: 'Workspace stat diff',
        body: `${data.comparedDatasets || 0} dataset(s) compared on capped samples.`,
      },
    ];
    if (data.focusNumericColumn) {
      const focus = numericDiffs.find((item) => item.column === data.focusNumericColumn);
      if (focus) {
        cards.push({
          title: `Top numeric gap: ${focus.column}`,
          body: focus.datasets.map((dataset) => `${dataset.name}: mean=${dataset.stats?.mean ?? 'n/a'}, median=${dataset.stats?.median ?? 'n/a'}, std=${dataset.stats?.std ?? 'n/a'}`).join(' | '),
        });
      }
    }
    if (data.focusCategoricalColumn) {
      const focus = categoricalDiffs.find((item) => item.column === data.focusCategoricalColumn);
      if (focus) {
        cards.push({
          title: `Top categorical gap: ${focus.column}`,
          body: focus.datasets.map((dataset) => `${dataset.name}: top=${dataset.stats?.topLabel ?? 'n/a'} (${dataset.stats?.topRatio ?? 'n/a'})`).join(' | '),
        });
      }
    }
    numericDiffs.slice(0, 2).forEach((item) => {
      const numericStatAction = item.action?.tool === 'stat.run'
        ? buildOpenStatAction(item.action?.inputTemplate?.op, item.action?.inputTemplate?.args, {
          label: 'Open and run stat diff follow-up',
          datasetId: item.datasetId,
          datasetName: item.datasetName,
          autoRun: true,
        })
        : null;
      cards.push({
        title: `Numeric diff: ${item.column}`,
        body: `mean delta=${item.meanDelta}`,
        actions: [
          numericStatAction,
          {
            label: 'Focus stats panels',
            type: 'focus-panel',
            payload: { panel: 'stats', datasetId: item.datasetId, datasetName: item.datasetName },
          },
        ].filter(Boolean),
      });
    });
    categoricalDiffs.slice(0, 2).forEach((item) => {
      const categoricalStatAction = item.action?.tool === 'stat.run'
        ? buildOpenStatAction(item.action?.inputTemplate?.op, item.action?.inputTemplate?.args, {
          label: 'Open and run stat diff follow-up',
          datasetId: item.datasetId,
          datasetName: item.datasetName,
          autoRun: true,
        })
        : null;
      cards.push({
        title: `Categorical diff: ${item.column}`,
        body: `dominance gap=${item.dominanceGap}`,
        actions: [
          categoricalStatAction,
          {
            label: 'Focus stats panels',
            type: 'focus-panel',
            payload: { panel: 'stats', datasetId: item.datasetId, datasetName: item.datasetName },
          },
        ].filter(Boolean),
      });
    });
    return {
      text: `${label || 'Workspace stat difference summary'} completed.`,
      cards,
      suggestions: [
        {
          label: 'Plan comparison charts across workspace',
          tool: 'workspace.compare_chart_plan',
          reason: 'Translate the strongest differences into a comparison chart plan.',
          inputTemplate: {},
        },
      ],
      warnings: [],
    };
  }
  if (tool === 'workspace.recommend_analysis') {
    const data = result?.data || {};
    const recommendations = Array.isArray(data.recommendedDatasets) ? data.recommendedDatasets : [];
    const cards = [];
    if (data.workspaceAction) {
      cards.push({
        title: 'Workspace-wide next step',
        body: `${data.workspaceAction.label}: ${data.workspaceAction.reason}`,
      });
    }
    recommendations.forEach((item) => {
      const recommendedStatAction = item.action?.tool === 'stat.run'
        ? buildOpenStatAction(item.action?.inputTemplate?.op, item.action?.inputTemplate?.args, {
          label: 'Open and run recommended stats',
          datasetId: item.datasetId,
          datasetName: item.name,
          autoRun: true,
        })
        : null;
      cards.push({
        title: `${item.name} (${item.priority})`,
        body: `${item.action?.label || 'Review dataset'} / score=${item.score} / sample=${item.sampleRows}${item.reasons?.length ? ` / ${item.reasons.join('; ')}` : ''}`,
        actions: item.action?.tool === 'stat.run'
          ? [
            recommendedStatAction,
            {
              label: 'Focus stats panels',
              type: 'focus-panel',
              payload: { panel: 'stats', datasetId: item.datasetId, datasetName: item.name },
            },
          ].filter(Boolean)
          : [],
      });
    });
    return {
      text: `${label || 'Workspace analysis priorities'} completed.`,
      cards,
      suggestions: [
        ...(data.workspaceAction ? [data.workspaceAction] : []),
        ...recommendations.slice(0, 2).map((item) => item.action).filter(Boolean),
      ],
      warnings: [],
    };
  }
  if (tool === 'workspace.formal_compare_plan') {
    const data = result?.data || {};
    const plans = Array.isArray(data.plans) ? data.plans : [];
    const cards = [];
    if (Array.isArray(data.sharedColumns) && data.sharedColumns.length) {
      cards.push({
        title: 'Shared columns',
        body: data.sharedColumns.join(', '),
      });
    }
    if (Array.isArray(data.sampleSizes) && data.sampleSizes.length) {
      cards.push({
        title: 'Sample sizes',
        body: data.sampleSizes.map((item) => `${item.name}: ${item.sampleRows}`).join(' | '),
      });
    }
    plans.forEach((plan) => {
      const planInput = plan.action?.inputTemplate || {};
      const formalStatAction = plan.action?.tool === 'stat.run'
        ? buildOpenStatAction(planInput.op, planInput.args, {
          label: 'Open and run suggested stats',
          autoRun: true,
        })
        : buildOpenStatAction(inferSuggestedStatOp(plan.suggestedOps), {}, {
          label: 'Open suggested stats panel',
        });
      cards.push({
        title: `${plan.title} (${plan.priority})`,
        body: `${plan.reason}${plan.caution ? ` | caution: ${plan.caution}` : ''}${Array.isArray(plan.suggestedOps) && plan.suggestedOps.length ? ` | ops: ${plan.suggestedOps.join(', ')}` : ''}`,
        actions: [
          formalStatAction,
          {
            label: 'Focus stats panels',
            type: 'focus-panel',
            payload: { panel: 'stats' },
          },
        ].filter(Boolean),
      });
    });
    return {
      text: `${label || 'Workspace formal compare plan'} completed.`,
      cards,
      suggestions: [
        {
          label: 'Compare stat differences across workspace',
          tool: 'workspace.compare_stat_diff',
          reason: 'Use the formal plan together with the observed stat gaps.',
          inputTemplate: {},
        },
        {
          label: 'Recommend workspace priorities',
          tool: 'workspace.recommend_analysis',
          reason: 'Turn the formal plan into dataset/action order.',
          inputTemplate: {},
        },
      ],
      warnings: [],
    };
  }
  if (tool === 'dataset.profile') {
    const data = result?.data || {};
    const cards = [
      {
        title: 'Dataset profile',
        body: `${data.rowCount || 0} rows / ${data.columnCount || 0} columns / ${data.numericColumns || 0} numeric / ${data.categoricalColumns || 0} categorical / ${data.dateColumns || 0} date-like`,
      },
    ];
    if (Array.isArray(data.missingColumns) && data.missingColumns.length) {
      cards.push({
        title: 'Missing hotspots',
        body: data.missingColumns.map((item) => `${item.name} (${item.rate}%)`).join(', '),
      });
    }
    if (Array.isArray(data.outlierColumns) && data.outlierColumns.length) {
      cards.push({
        title: 'Outlier-heavy columns',
        body: data.outlierColumns.map((item) => `${item.name} (${item.rate}%)`).join(', '),
      });
    }
    if (Array.isArray(data.imbalancedColumns) && data.imbalancedColumns.length) {
      cards.push({
        title: 'Categorical imbalance',
        body: data.imbalancedColumns.map((item) => `${item.name}=${item.topValue} (${item.rate}%)`).join(', '),
      });
    }
    return {
      text: `${label || 'Dataset profile'} completed.`,
      cards,
      suggestions: buildLocalSuggestions().slice(1, 4),
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
  }
  if (tool === 'dataset.flags') {
    const flags = Array.isArray(result?.data?.flags) ? result.data.flags : [];
    return {
      text: `${label || 'Dataset flags'} completed.`,
      cards: flags.map((flag) => ({
        title: `${flag.kind} (${flag.severity})`,
        body: flag.summary,
      })),
      suggestions: buildLocalSuggestions(),
      warnings: [],
    };
  }
  if (tool === 'stat.run' || tool === 'stat.recommend') {
    const summary = result?.summary || {};
    const openStatAction = buildOpenStatAction(result?.op, context?.input?.args, {
      label: 'Run in Stats panel',
      options: context?.input?.options,
      title: summary.title,
      autoRun: true,
    });
    const cards = [
      {
        title: summary.title || `Statistics: ${result?.op || 'result'}`,
        body: summary.conclusion || `${result?.op || 'Statistics'} completed.`,
      },
    ];
    if (summary.stats && typeof summary.stats === 'object') {
      cards.push({
        title: 'Summary stats',
        body: Object.entries(summary.stats).map(([key, value]) => `${key}: ${value}`).join(' | '),
      });
    }
    const table = firstNonEmptyTable(result);
    if (table) {
      cards.push({
        title: `Table preview: ${table.name}`,
        body: summarizeTable(table),
      });
    }
    cards[0].actions = [
      openStatAction,
      {
        label: 'Focus stats panels',
        type: 'focus-panel',
        payload: { panel: 'stats' },
      },
    ].filter(Boolean);
    return {
      text: `${label || (tool === 'stat.recommend' ? 'Statistics recommendation' : 'Statistics run')} completed.`,
      cards,
      suggestions: result?.op === 'recommend' ? buildStatRecommendationSuggestions(result) : [],
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    };
  }
  if (tool === 'viz.prepare') {
    const data = result?.data || result || {};
    const figInfo = parseFigureInfo(data?.fig_json);
    return {
      text: `${label || 'Visualization preparation'} completed.`,
      cards: [
        {
          title: figInfo.title,
          body: `Chart payload is ready with ${figInfo.traceCount} trace(s). Use GraphView or the chart panel to render/export it.`,
          actions: context?.input?.spec
            ? [{
              label: 'Open in Graph',
              type: 'open-chart',
              payload: { spec: context.input.spec },
            }, {
              label: 'Focus Graph',
              type: 'focus-panel',
              payload: { panel: 'graph' },
            }]
            : [{
              label: 'Focus Graph',
              type: 'focus-panel',
              payload: { panel: 'graph' },
            }],
        },
      ],
      suggestions: [
        {
          label: 'Inspect dataset flags',
          tool: 'dataset.flags',
          reason: 'Validate data quality before finalizing the chart.',
          inputTemplate: {},
        },
      ],
      warnings: [],
    };
  }
  if (tool === 'viz.aggregate') {
    const data = result?.data || result || {};
    const aggregateResult = data?.result || {};
    const meta = data?.meta || {};
    let detail = `Aggregation op: ${meta.op || 'unknown'} / rows used: ${meta.rowsUsed ?? 'n/a'}.`;
    if (aggregateResult?.series && typeof aggregateResult.series === 'object') {
      detail = `${detail} ${Object.keys(aggregateResult.series).length} grouped series prepared.`;
    } else if (Array.isArray(aggregateResult?.counts)) {
      detail = `${detail} ${aggregateResult.counts.length} bins prepared.`;
    } else if (aggregateResult?.quantiles && typeof aggregateResult.quantiles === 'object') {
      detail = `${detail} ${Object.keys(aggregateResult.quantiles).length} quantile group(s) prepared.`;
    } else if (Array.isArray(aggregateResult?.x) && Array.isArray(aggregateResult?.y)) {
      detail = `${detail} ${aggregateResult.x.length} aggregated point(s) prepared.`;
    } else if (Array.isArray(aggregateResult?.zCounts)) {
      detail = `${detail} 2D bin matrix prepared.`;
    }
    return {
      text: `${label || 'Visualization aggregation'} completed.`,
      cards: [
        {
          title: 'Aggregated chart data',
          body: detail,
        },
      ],
      suggestions: context?.input?.spec
        ? [{
          label: 'Prepare chart from the same spec',
          tool: 'viz.prepare',
          reason: 'Render a chart using the same structure after checking the aggregated payload.',
          inputTemplate: { spec: context.input.spec },
        }]
        : [],
      warnings: [],
    };
  }
  if (tool === 'ml.capabilities') {
    const data = result?.data || {};
    const enabled = Object.entries(data)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .slice(0, 8);
    return {
      text: `${label || 'ML capability check'} completed.`,
      cards: [
        {
          title: 'ML capabilities',
          body: enabled.length ? `Available backends: ${enabled.join(', ')}` : 'No optional ML backend was reported as available.',
        },
      ],
      suggestions: [],
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    };
  }
  if (tool === 'ml.run') {
    const data = result?.data || {};
    const mlMeta = buildMlResultMeta(data, context?.input || {});
    const mlFollowUps = buildMlFollowUpSuggestions(data, context?.input || {});
    return {
      text: `${label || 'ML run'} completed.`,
      cards: [
        {
          title: mlMeta.title,
          body: mlMeta.body,
          actions: buildMlCardActions(mlFollowUps, context?.input || {}, mlMeta),
        },
      ],
      suggestions: mlFollowUps,
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    };
  }
  return {
    text: `${label || tool} completed.`,
    cards: [
      {
        title: tool,
        body: 'Tool finished successfully. Open the MCP debug panel for the raw payload if needed.',
      },
    ],
    suggestions: [],
    warnings: [],
  };
}

async function runSuggestion(suggestion, messageId = '', index = 0) {
  if (!suggestion?.tool) return;
  if (!confirmToolExecution(suggestion.tool, suggestion.label)) return;
  const key = `${messageId}:${index}:${suggestion.tool}`;
  runningSuggestionKey.value = key;
  error.value = '';
  try {
    const builtInput = buildSuggestionInput(suggestion);
    const res = await callMcpTool(suggestion.tool, builtInput, buildDatasetContext());
    const summary = summarizeToolExecution(suggestion.tool, res?.data, suggestion.label, { input: builtInput });
    appendMessage('assistant', summary.text, {
      cards: summary.cards,
      suggestions: summary.suggestions,
      warnings: summary.warnings,
      toolCalls: [{ tool: suggestion.tool }],
    });
  } catch (e) {
    appendErrorMessage(`Run ${suggestion.label || suggestion.tool}`, e, {
      toolCalls: [{ tool: suggestion.tool }],
    });
  } finally {
    runningSuggestionKey.value = '';
  }
}

async function sendPrompt(text) {
  const promptText = String(text || draft.value || '').trim();
  if (!promptText) return;
  appendMessage('user', promptText);
  draft.value = '';
  chatBusy.value = true;
  try {
    const history = messages.value.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
    }));
    const res = await chatWithMcp(promptText, buildDatasetContext(), history);
    const data = res?.data || {};
    appendMessage(
      'assistant',
      data.reply || buildGenericReply(promptText),
      {
        mode: data.mode || '',
        suggestions: data.suggestions || [],
        warnings: data.warnings || [],
        cards: data.cards || [],
        toolCalls: data.toolCalls || [],
      }
    );
  } catch (e) {
    appendErrorMessage('MCP chat request', e);
    appendMessage('assistant', buildGenericReply(promptText), {
      suggestions: buildLocalSuggestions(),
    });
  } finally {
    chatBusy.value = false;
  }
}

function applyQuickAction(action) {
  const promptMap = {
    summarize: 'Summarize this dataset',
    anomalies: 'Find anomalies or data quality issues',
    stats: 'Recommend statistics for this dataset',
    charts: 'Recommend charts for this dataset',
    ml: 'Suggest an ML direction for this dataset',
    compare: 'Compare the open datasets in this workspace',
    compareCharts: 'Plan comparison charts for the open datasets in this workspace',
    compareStats: 'Compare stat differences for the open datasets in this workspace',
    compareRecommend: 'Recommend workspace analysis priorities for the open datasets',
    compareFormal: 'Plan formal comparisons for the open datasets in this workspace',
  };
  sendPrompt(promptMap[action] || 'What should I analyze first?');
}

function syncDatasetNotice() {
  const key = `${props.datasetId || 'local'}:${props.datasetName}:${props.rows.length}:${props.columns.length}`;
  if (datasetNoticeKey.value === key) return;
  datasetNoticeKey.value = key;
  appendMessage(
    'assistant',
    `Dataset context is attached.\nActive dataset: ${props.datasetName || 'untitled'}.\nRows: ${props.rows.length}, columns: ${props.columns.length}.`
  );
}

async function loadMeta() {
  loading.value = true;
  error.value = '';
  try {
    const [i, t] = await Promise.all([getMcpInfo(), getMcpTools()]);
    info.value = i?.data || null;
    tools.value = t?.data?.tools || [];
    if (!tools.value.some((x) => x.name === selectedTool.value) && tools.value.length) {
      selectedTool.value = tools.value[0].name;
    }
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}

async function runTool() {
  if (!confirmToolExecution(selectedTool.value, selectedTool.value)) return;
  loading.value = true;
  error.value = '';
  callResult.value = null;
  try {
    let parsedInput = {};
    try {
      parsedInput = inputText.value ? JSON.parse(inputText.value) : {};
    } catch {
      throw new Error('Invalid JSON input');
    }
    const res = await callMcpTool(selectedTool.value, parsedInput, buildDatasetContext());
    callResult.value = res?.data || null;
  } catch (e) {
    error.value = String(e?.message || e);
    appendErrorMessage(`Call ${selectedTool.value}`, e, {
      toolCalls: selectedTool.value ? [{ tool: selectedTool.value }] : [],
    });
  } finally {
    loading.value = false;
  }
}

onMounted(loadMeta);
watch(
  () => datasetSessionKey.value,
  (nextKey, prevKey) => {
    if (prevKey) persistSession(prevKey);
    restoreSession(nextKey);
    syncDatasetNotice();
  },
  { immediate: true }
);
watch(() => [props.datasetName, props.rows.length, props.columns.length], () => {
  syncDatasetNotice();
  persistSession();
});
</script>

<template>
  <div class="mcp-shell border rounded p-3 space-y-3">
    <div class="flex items-center gap-2">
      <div>
        <div class="font-semibold">MCP Chat Assistant</div>
        <div class="text-xs text-gray-500">Phase 6: dataset-aware chat, session memory, and export summary</div>
      </div>
      <span class="dataset-badge">{{ datasetName || 'untitled' }}</span>
      <span class="mode-badge" :class="plannerModeMeta.kind">{{ plannerModeMeta.label }}</span>
      <button class="ml-auto" @click="loadMeta" :disabled="loading">
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div class="state" :class="panelState.kind">{{ panelState.text }}</div>

    <div v-if="latestClaudeFallbackWarning" class="claude-fallback-banner">
      <div class="claude-fallback-title">Claude fallback mode</div>
      <div class="claude-fallback-body">{{ latestClaudeFallbackWarning }}</div>
    </div>

    <div class="assistant-summary">
      <div><b>Dataset</b>: {{ rows.length }} rows / {{ columns.length }} columns</div>
      <div><b>Profile sample</b>: {{ profileSummary.sampleCount || 0 }} rows</div>
      <div><b>Warnings</b>: {{ datasetFlags.warningCount }}</div>
      <div><b>MCP tools</b>: {{ tools.length }}</div>
      <div><b>Workspace</b>: {{ workspaceFacts.count }} dataset(s)</div>
    </div>

    <div class="session-actions">
      <div class="session-meta">
        <b>Session</b>: {{ messages.length }} message(s) stored for this dataset
      </div>
      <button @click="exportSessionSummary" :disabled="!messages.length">Export summary</button>
    </div>

    <div class="quick-actions">
      <button @click="applyQuickAction('summarize')">Summarize this dataset</button>
      <button @click="applyQuickAction('anomalies')">Find anomalies</button>
      <button @click="applyQuickAction('stats')">Recommend stats</button>
      <button @click="applyQuickAction('charts')">Recommend charts</button>
      <button @click="applyQuickAction('ml')">Suggest ML task</button>
      <button v-if="workspaceFacts.count > 1" @click="applyQuickAction('compare')">Compare open datasets</button>
      <button v-if="workspaceFacts.count > 1" @click="applyQuickAction('compareCharts')">Plan compare charts</button>
      <button v-if="workspaceFacts.count > 1" @click="applyQuickAction('compareStats')">Compare stat diff</button>
      <button v-if="workspaceFacts.count > 1" @click="applyQuickAction('compareRecommend')">Recommend priorities</button>
      <button v-if="workspaceFacts.count > 1" @click="applyQuickAction('compareFormal')">Plan formal compares</button>
    </div>

    <div class="chat-log">
      <div v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <div class="message-role">{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</div>
        <div class="message-text">{{ message.text }}</div>
        <div v-if="message.cards.length" class="message-cards">
          <div v-for="(card, index) in message.cards" :key="`${message.id}-card-${index}`" class="message-card">
            <div class="message-card-title">{{ card.title }}</div>
            <div class="message-card-body">{{ card.body }}</div>
            <div v-if="card.actions?.length" class="message-card-actions">
              <button
                v-for="(action, actionIndex) in card.actions"
                :key="`${message.id}-card-${index}-action-${actionIndex}`"
                type="button"
                class="message-card-action"
                @click="triggerCardAction(action)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="message.suggestions.length" class="message-suggestions">
          <div v-for="(suggestion, index) in message.suggestions" :key="`${message.id}-suggestion-${index}`" class="message-suggestion">
            <div class="message-suggestion-title">{{ suggestion.label }}</div>
            <div class="message-suggestion-body">{{ suggestion.reason }}</div>
            <div v-if="suggestion.tool" class="message-suggestion-tool">tool: {{ suggestion.tool }}</div>
            <button
              v-if="suggestion.tool"
              class="message-suggestion-action"
              @click="runSuggestion(suggestion, message.id, index)"
              :disabled="runningSuggestionKey === `${message.id}:${index}:${suggestion.tool}`"
            >
              {{ runningSuggestionKey === `${message.id}:${index}:${suggestion.tool}` ? 'Running...' : 'Run suggestion' }}
            </button>
          </div>
        </div>
        <div v-if="messageFallbackWarnings(message).length" class="message-fallback-warning">
          <div class="message-fallback-warning-title">Claude fallback mode</div>
          <div
            v-for="(warning, index) in messageFallbackWarnings(message)"
            :key="`${message.id}-fallback-warning-${index}`"
            class="message-fallback-warning-body"
          >
            {{ formatClaudeFallbackWarning(warning) }}
          </div>
        </div>
        <div v-if="messageGeneralWarnings(message).length" class="message-warnings">
          <div v-for="(warning, index) in messageGeneralWarnings(message)" :key="`${message.id}-warning-${index}`">{{ warning }}</div>
        </div>
        <div v-if="message.toolCalls.length" class="message-toolcalls">
          <div v-for="(toolCall, index) in message.toolCalls" :key="`${message.id}-tool-${index}`">
            tool used: {{ toolCall.tool }}
          </div>
        </div>
      </div>
    </div>

    <div class="composer">
      <textarea
        v-model="draft"
        rows="3"
        placeholder="Ask how to analyze this dataset, what looks suspicious, or what to chart next."
        @keydown.enter.exact.prevent="sendPrompt()"
      ></textarea>
      <button @click="sendPrompt()" :disabled="chatBusy || !draft.trim()">{{ chatBusy ? 'Thinking...' : 'Send' }}</button>
    </div>

    <details class="debug-box">
      <summary class="font-medium">MCP tool debug</summary>
      <div class="grid md:grid-cols-2 gap-3 mt-3">
        <label>
          Tool
          <select v-model="selectedTool">
            <option v-for="t in tools" :key="t.name" :value="t.name">{{ t.name }}</option>
          </select>
        </label>
        <label>
          Input JSON
          <textarea v-model="inputText" rows="4"></textarea>
        </label>
      </div>

      <button class="mt-3" @click="runTool" :disabled="loading || !selectedTool">Call tool</button>

      <div v-if="callResult" class="result mt-3">
        <pre>{{ JSON.stringify(callResult, null, 2) }}</pre>
      </div>
    </details>
  </div>
</template>

<style scoped>
select,
textarea,
button {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

textarea {
  width: 100%;
  resize: vertical;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.state {
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 13px;
}

.state.loading {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.state.error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.state.partial {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}

.state.empty {
  background: #f9fafb;
  color: #4b5563;
}

.state.success {
  background: #ecfdf5;
  border-color: #bbf7d0;
  color: #166534;
}

.mcp-shell {
  background: linear-gradient(180deg, #fcfcfd 0%, #f8fafc 100%);
}

.dataset-badge {
  font-size: 12px;
  color: #0f172a;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 4px 10px;
}

.mode-badge {
  font-size: 12px;
  border-radius: 999px;
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
}

.mode-badge.pending {
  background: #f8fafc;
  color: #475569;
}

.mode-badge.claude {
  background: #ecfeff;
  border-color: #67e8f9;
  color: #155e75;
}

.mode-badge.rule-based {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.mode-badge.fallback {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}

.assistant-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  font-size: 12px;
  color: #334155;
}

.assistant-summary > div {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.85);
}

.claude-fallback-banner {
  border: 1px solid #f59e0b;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff7ed;
  color: #9a3412;
}

.claude-fallback-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.claude-fallback-body {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.4;
}

.session-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.session-meta {
  font-size: 12px;
  color: #475569;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-actions button {
  background: #ffffff;
}

.chat-log {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 420px;
  overflow: auto;
  padding: 4px;
}

.message {
  max-width: 92%;
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
}

.message.user {
  align-self: flex-end;
  background: #dbeafe;
  border-color: #93c5fd;
}

.message.assistant {
  align-self: flex-start;
  background: #ffffff;
}

.message-role {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-bottom: 4px;
}

.message-text {
  white-space: pre-wrap;
  line-height: 1.45;
  color: #0f172a;
}

.message-cards,
.message-suggestions,
.message-fallback-warning,
.message-warnings,
.message-toolcalls {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.message-card,
.message-suggestion {
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  padding: 8px 10px;
  background: #f8fafc;
}

.message-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.message-card-action {
  background: #ffffff;
}

.message-suggestion-action {
  margin-top: 8px;
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.message-suggestion-action:disabled {
  opacity: 0.6;
  cursor: progress;
}

.message-card-title,
.message-suggestion-title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
}

.message-card-body,
.message-suggestion-body,
.message-suggestion-tool,
.message-warnings {
  font-size: 12px;
  color: #475569;
}

.message-fallback-warning {
  border: 1px solid #fdba74;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff7ed;
  color: #9a3412;
}

.message-fallback-warning-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.message-fallback-warning-body {
  font-size: 12px;
  line-height: 1.4;
}

.message-warnings {
  color: #9a3412;
}

.message-toolcalls {
  font-size: 12px;
  color: #1d4ed8;
}

.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;
}

.debug-box {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}

.result pre {
  margin: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
