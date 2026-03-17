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
const mcpPanel = fs.readFileSync(mcpPanelPath, "utf8");

const checks = [
  {
    name: "McpPanel keeps a session store",
    re: /const sessionStore = ref\(\{\}\);/,
  },
  {
    name: "McpPanel computes dataset session key",
    re: /const datasetSessionKey = computed\(\(\) => props\.datasetId \|\| `local:/,
  },
  {
    name: "McpPanel persists session state",
    re: /function persistSession\s*\(/,
  },
  {
    name: "McpPanel restores session state",
    re: /function restoreSession\s*\(/,
  },
  {
    name: "McpPanel exports analysis summary",
    re: /function exportSessionSummary\s*\(/,
  },
  {
    name: "McpPanel builds a structured formal compare export section",
    re: /function buildFormalCompareExportLines\s*\(/,
  },
  {
    name: "McpPanel builds a structured workspace overview export section",
    re: /function buildWorkspaceOverviewExportLines\s*\(/,
  },
  {
    name: "McpPanel export summary includes workspace overview tool messages",
    re: /workspace\.(current_dataset|list_datasets)[\s\S]*Workspace Overview Summary/,
  },
  {
    name: "McpPanel export summary includes formal compare tool messages",
    re: /workspace\.formal_compare_plan[\s\S]*Formal Compare Summary/,
  },
  {
    name: "McpPanel builds a structured chart compare export section",
    re: /function buildChartCompareExportLines\s*\(/,
  },
  {
    name: "McpPanel builds a structured describe compare export section",
    re: /function buildDescribeCompareExportLines\s*\(/,
  },
  {
    name: "McpPanel export summary includes describe compare tool messages",
    re: /workspace\.compare_describe[\s\S]*Describe Compare Summary/,
  },
  {
    name: "McpPanel export summary includes chart compare tool messages",
    re: /workspace\.compare_chart_plan[\s\S]*Chart Compare Summary/,
  },
  {
    name: "McpPanel builds a structured stat diff export section",
    re: /function buildStatDiffExportLines\s*\(/,
  },
  {
    name: "McpPanel export summary includes stat diff tool messages",
    re: /workspace\.compare_stat_diff[\s\S]*Stat Diff Summary/,
  },
  {
    name: "McpPanel builds a structured workspace priority export section",
    re: /function buildPriorityExportLines\s*\(/,
  },
  {
    name: "McpPanel export summary includes workspace priority tool messages",
    re: /workspace\.recommend_analysis[\s\S]*Workspace Priority Summary/,
  },
  {
    name: "McpPanel renders export summary control",
    re: /Export summary/,
  },
];

for (const check of checks) {
  if (check.re.test(mcpPanel)) pass(check.name);
  else fail(check.name);
}

if (!process.exitCode) {
  console.log("[OK] MCP session/export checks passed.");
}
