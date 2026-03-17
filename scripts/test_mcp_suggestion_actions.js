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
    name: "McpPanel builds suggestion input",
    re: /function buildSuggestionInput\s*\(/,
  },
  {
    name: "McpPanel can run suggestion actions",
    re: /async function runSuggestion\s*\(/,
  },
  {
    name: "McpPanel summarizes tool execution",
    re: /function summarizeToolExecution\s*\(/,
  },
  {
    name: "McpPanel renders run suggestion button",
    re: /Run suggestion/,
  },
  {
    name: "McpPanel passes built suggestion input into execution summary context",
    re: /const builtInput = buildSuggestionInput\(suggestion\)[\s\S]*summarizeToolExecution\(suggestion\.tool, res\?\.data, suggestion\.label, \{ input: builtInput \}\)/,
  },
  {
    name: "McpPanel can trigger card actions",
    re: /function triggerCardAction\s*\(/,
  },
  {
    name: "McpPanel can build open-stat actions for presets",
    re: /function buildOpenStatAction\s*\(/,
  },
  {
    name: "McpPanel open-stat actions can request auto run",
    re: /autoRun:\s*!!extra\.autoRun/,
  },
  {
    name: "McpPanel prepares default viz input",
    re: /function buildDefaultVizInput\s*\(/,
  },
  {
    name: "McpPanel infers ML preset requests from dataset columns",
    re: /function inferMlPresetRequest\s*\([\s\S]*defaultTask[\s\S]*classification[\s\S]*timeseries[\s\S]*next\.args\.features/,
  },
  {
    name: "McpPanel uses default viz input for viz.aggregate suggestions",
    re: /suggestion\?\.tool === 'viz\.prepare' \|\| suggestion\?\.tool === 'viz\.aggregate'/,
  },
  {
    name: "McpPanel uses inferred ML preset input for ml.run suggestions",
    re: /if \(suggestion\?\.tool === 'ml\.run'\) \{[\s\S]*return inferMlPresetRequest\(input\);/,
  },
  {
    name: "McpPanel maps stat recommendations into follow-up suggestions",
    re: /function buildStatRecommendationSuggestions\s*\(/,
  },
  {
    name: "McpPanel summarizes workspace comparison results",
    re: /tool === 'workspace\.list_datasets'/,
  },
  {
    name: "McpPanel summarizes workspace describe comparison results",
    re: /tool === 'workspace\.compare_describe'/,
  },
  {
    name: "McpPanel summarizes workspace chart comparison plan",
    re: /tool === 'workspace\.compare_chart_plan'/,
  },
  {
    name: "McpPanel can open compare board from workspace chart plan",
    re: /workspace\.compare_chart_plan[\s\S]*Open compare board/,
  },
  {
    name: "McpPanel summarizes workspace stat difference results",
    re: /tool === 'workspace\.compare_stat_diff'/,
  },
  {
    name: "McpPanel uses concrete stat diff actions when available",
    re: /tool === 'workspace\.compare_stat_diff'[\s\S]*item\.action\?\.tool === 'stat\.run'[\s\S]*Open and run stat diff follow-up/,
  },
  {
    name: "McpPanel summarizes workspace recommendation results",
    re: /tool === 'workspace\.recommend_analysis'/,
  },
  {
    name: "McpPanel summarizes workspace formal compare plans",
    re: /tool === 'workspace\.formal_compare_plan'/,
  },
  {
    name: "McpPanel uses concrete formal compare actions when available",
    re: /plan\.action\?\.tool === 'stat\.run'[\s\S]*Open and run suggested stats/,
  },
  {
    name: "McpPanel summarizes stat.run with stats preset action",
    re: /tool === 'stat\.run'[\s\S]*Run in Stats panel/,
  },
  {
    name: "McpPanel supports stat.recommend suggestion tool",
    re: /Ask for recommended tests[\s\S]*tool:\s*'stat\.recommend'/,
  },
  {
    name: "McpPanel summarizes stat.recommend with stats preset action",
    re: /tool === 'stat\.run' \|\| tool === 'stat\.recommend'[\s\S]*Run in Stats panel/,
  },
  {
    name: "McpPanel summarizes viz.aggregate results",
    re: /tool === 'viz\.aggregate'[\s\S]*Aggregated chart data[\s\S]*Prepare chart from the same spec/,
  },
  {
    name: "McpPanel supports ml.run starter suggestion tool",
    re: /Run anomaly detection starter[\s\S]*tool:\s*'ml\.run'/,
  },
  {
    name: "McpPanel supports regression, classification, and time-series ml starters",
    re: /Run regression starter[\s\S]*tool:\s*'ml\.run'[\s\S]*Run classification starter[\s\S]*tool:\s*'ml\.run'[\s\S]*Run time-series starter[\s\S]*tool:\s*'ml\.run'/,
  },
  {
    name: "McpPanel builds task-aware ML result metadata",
    re: /function buildMlResultMeta\s*\([\s\S]*Regression result[\s\S]*Classification result[\s\S]*Forecast result[\s\S]*Review anomaly summary/,
  },
  {
    name: "McpPanel builds task-aware ML follow-up suggestions",
    re: /function buildMlFollowUpSuggestions\s*\([\s\S]*Run correlation analysis[\s\S]*Ask for recommended tests[\s\S]*Prepare .* forecast line[\s\S]*Inspect dataset flags/,
  },
  {
    name: "McpPanel builds task-aware ML direct card actions",
    re: /function buildMlCardActions\s*\([\s\S]*buildOpenMlAction[\s\S]*item\?\.tool === 'stat\.run' \|\| item\?\.tool === 'stat\.recommend'[\s\S]*tool === 'stat\.recommend' \? 'recommend'[\s\S]*buildOpenStatAction[\s\S]*item\?\.tool === 'viz\.prepare'[\s\S]*type: 'open-chart'/,
  },
  {
    name: "McpPanel summarizes ml.run results with task-aware ML actions and follow-ups",
    re: /tool === 'ml\.run'[\s\S]*buildMlResultMeta[\s\S]*buildMlFollowUpSuggestions[\s\S]*buildMlCardActions[\s\S]*suggestions: mlFollowUps/,
  },
];

for (const check of checks) {
  if (check.re.test(mcpPanel)) pass(check.name);
  else fail(check.name);
}

if (!process.exitCode) {
  console.log("[OK] MCP suggestion-action checks passed.");
}
