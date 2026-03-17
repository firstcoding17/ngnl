const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

const mcpPanelPath = path.resolve(__dirname, "..", "src", "components", "McpPanel.vue");
const dataInletPath = path.resolve(__dirname, "..", "src", "components", "DataInlet.vue");

const mcpPanel = fs.readFileSync(mcpPanelPath, "utf8");
const dataInlet = fs.readFileSync(dataInletPath, "utf8");

const checks = [
  {
    name: "McpPanel accepts datasetName prop",
    re: /datasetName:\s*\{\s*type:\s*String,/,
    src: mcpPanel,
  },
  {
    name: "McpPanel accepts datasetId prop",
    re: /datasetId:\s*\{\s*type:\s*String,/,
    src: mcpPanel,
  },
  {
    name: "McpPanel accepts profileSummary prop",
    re: /profileSummary:\s*\{/,
    src: mcpPanel,
  },
  {
    name: "McpPanel accepts workspaceDatasets prop",
    re: /workspaceDatasets:\s*\{\s*type:\s*Array,/,
    src: mcpPanel,
  },
  {
    name: "McpPanel has quick action handler",
    re: /function applyQuickAction\s*\(/,
    src: mcpPanel,
  },
  {
    name: "McpPanel has local prompt sender",
    re: /function sendPrompt\s*\(/,
    src: mcpPanel,
  },
  {
    name: "McpPanel has common error message helper",
    re: /function appendErrorMessage\s*\(/,
    src: mcpPanel,
  },
  {
    name: "McpPanel passes dataset context into MCP tool calls",
    re: /callMcpTool\(suggestion\.tool, builtInput, buildDatasetContext\(\)\)[\s\S]*callMcpTool\(selectedTool\.value, parsedInput, buildDatasetContext\(\)\)/,
    src: mcpPanel,
  },
  {
    name: "McpPanel confirms unsafe tool execution",
    re: /function confirmToolExecution\s*\(/,
    src: mcpPanel,
  },
  {
    name: "McpPanel distinguishes Claude fallback warnings",
    re: /function isClaudeFallbackWarning\s*\([\s\S]*function messageFallbackWarnings\s*\([\s\S]*function messageGeneralWarnings\s*\(/,
    src: mcpPanel,
  },
  {
    name: "McpPanel stores assistant chat mode for session restore",
    re: /appendMessage[\s\S]*mode:\s*extra\.mode \|\| ''[\s\S]*cloneMessages[\s\S]*mode:\s*message\.mode \|\| ''/m,
    src: mcpPanel,
  },
  {
    name: "McpPanel computes planner mode badge state",
    re: /const currentChatMode = computed\(\(\) =>[\s\S]*const plannerModeMeta = computed\(\(\) =>/m,
    src: mcpPanel,
  },
  {
    name: "McpPanel defines open-chart, open-chart-board, focus-panel, and open-stat emits",
    re: /defineEmits\(\['open-chart', 'open-chart-board', 'focus-panel', 'open-stat'\]\)/,
    src: mcpPanel,
  },
  {
    name: "McpPanel handles card actions",
    re: /function triggerCardAction\s*\(/,
    src: mcpPanel,
  },
  {
    name: "McpPanel tracks outlier columns in local flags",
    re: /outlierColumns/,
    src: mcpPanel,
  },
  {
    name: "McpPanel tracks imbalanced categorical columns in local flags",
    re: /imbalancedColumns/,
    src: mcpPanel,
  },
  {
    name: "McpPanel imports chatWithMcp",
    re: /chatWithMcp/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders assistant title",
    re: /MCP Chat Assistant/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders planner mode badge",
    re: /mode-badge[\s\S]*plannerModeMeta\.label/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders quick action buttons",
    re: /Summarize this dataset[\s\S]*Find anomalies[\s\S]*Recommend stats[\s\S]*Recommend charts[\s\S]*Suggest ML task/,
    src: mcpPanel,
  },
  {
    name: "McpPanel includes compare open datasets action",
    re: /Compare open datasets/,
    src: mcpPanel,
  },
  {
    name: "McpPanel includes compare charts action",
    re: /Plan compare charts/,
    src: mcpPanel,
  },
  {
    name: "McpPanel includes compare stat diff action",
    re: /Compare stat diff/,
    src: mcpPanel,
  },
  {
    name: "McpPanel includes recommend priorities action",
    re: /Recommend priorities/,
    src: mcpPanel,
  },
  {
    name: "McpPanel includes formal compare action",
    re: /Plan formal compares/,
    src: mcpPanel,
  },
  {
    name: "McpPanel keeps MCP tool debug section",
    re: /MCP tool debug/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders suggestion cards",
    re: /message-suggestions[\s\S]*message-suggestion-title/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders card action buttons",
    re: /message-card-actions[\s\S]*message-card-action/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders Claude fallback banner and message block",
    re: /claude-fallback-banner[\s\S]*message-fallback-warning[\s\S]*message-fallback-warning-title/,
    src: mcpPanel,
  },
  {
    name: "McpPanel renders tool call traces",
    re: /message-toolcalls[\s\S]*tool used:/,
    src: mcpPanel,
  },
  {
    name: "DataInlet passes dataset name into McpPanel",
    re: /:dataset-name="currentName"/,
    src: dataInlet,
  },
  {
    name: "DataInlet passes dataset id into McpPanel",
    re: /:dataset-id="activeDatasetId \|\| ''"/,
    src: dataInlet,
  },
  {
    name: "DataInlet passes profile summary into McpPanel",
    re: /:profile-summary="profileSummary"/,
    src: dataInlet,
  },
  {
    name: "DataInlet passes workspace datasets into McpPanel",
    re: /:workspace-datasets="workspaceDatasetSummaries"/,
    src: dataInlet,
  },
  {
    name: "DataInlet handles MCP open-chart event",
    re: /@open-chart="onMcpOpenChart"/,
    src: dataInlet,
  },
  {
    name: "DataInlet handles MCP open-chart-board event",
    re: /@open-chart-board="onMcpOpenChartBoard"/,
    src: dataInlet,
  },
  {
    name: "DataInlet handles MCP open-stat event",
    re: /@open-stat="onMcpOpenStat"/,
    src: dataInlet,
  },
  {
    name: "DataInlet handles MCP focus-panel event",
    re: /@focus-panel="onMcpFocusPanel"/,
    src: dataInlet,
  },
  {
    name: "DataInlet can focus the ML panel from MCP actions",
    re: /const mlPanelRef = ref\(null\)[\s\S]*const mlPreset = ref\(null\)[\s\S]*payload\?\.panel === 'ml'[\s\S]*payload\?\.request[\s\S]*mlPreset\.value = \{[\s\S]*scrollToPanel\(mlPanelRef\)[\s\S]*MlPanel[\s\S]*:preset="mlPreset"/,
    src: dataInlet,
  },
  {
    name: "DataInlet defines graph and stats focus handlers",
    re: /async function onMcpOpenChart\s*\([\s\S]*async function onMcpFocusPanel\s*\(/,
    src: dataInlet,
  },
  {
    name: "DataInlet defines MCP stat preset handler",
    re: /async function onMcpOpenStat\s*\(/,
    src: dataInlet,
  },
  {
    name: "DataInlet defines MCP chart board handler",
    re: /async function onMcpOpenChartBoard\s*\(/,
    src: dataInlet,
  },
  {
    name: "DataInlet passes stat preset into stats panels",
    re: /StatsReportPanel[\s\S]*:preset="statPreset"[\s\S]*StatTestsPanel[\s\S]*:preset="statPreset"[\s\S]*StatsOlsPanel[\s\S]*:preset="statPreset"[\s\S]*StatsCorrPanel[\s\S]*:preset="statPreset"[\s\S]*StatsAdvancedPanel[\s\S]*:preset="statPreset"/,
    src: dataInlet,
  },
  {
    name: "DataInlet passes inline charts into ChartsBoard",
    re: /ChartsBoard[\s\S]*:inline-charts="inlineBoardCharts"/,
    src: dataInlet,
  },
];

for (const check of checks) {
  if (check.re.test(check.src)) pass(check.name);
  else fail(check.name);
}

if (!process.exitCode) {
  console.log("[OK] McpPanel regression contract checks passed.");
}
