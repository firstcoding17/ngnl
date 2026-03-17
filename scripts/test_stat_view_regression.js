const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

const filePath = path.resolve(__dirname, "..", "src", "views", "StatView.vue");
const src = fs.readFileSync(filePath, "utf8");

const checks = [
  {
    name: "session FDR key constant exists",
    re: /const\s+LEGACY_SESSION_FDR_KEY\s*=\s*"legacy_stat_session_fdr";/,
  },
  {
    name: "quality snapshot key constant exists",
    re: /const\s+LEGACY_QUALITY_SNAPSHOT_KEY\s*=\s*"legacy_table_data_quality_snapshot";/,
  },
  {
    name: "sessionFdrAlpha state exists",
    re: /sessionFdrAlpha:\s*0\.05,/,
  },
  {
    name: "sessionFdrAutoResetOnDatasetChange state exists",
    re: /sessionFdrAutoResetOnDatasetChange:\s*false,/,
  },
  {
    name: "qualityUndoAvailable state exists",
    re: /qualityUndoAvailable:\s*false,/,
  },
  {
    name: "normalizeFdrAlpha method exists",
    re: /normalizeFdrAlpha\s*\(v\)\s*\{/,
  },
  {
    name: "loadSessionFdr method exists",
    re: /loadSessionFdr\s*\(\)\s*\{/,
  },
  {
    name: "persistSessionFdr method exists",
    re: /persistSessionFdr\s*\(\)\s*\{/,
  },
  {
    name: "sessionFdrAlpha watcher exists",
    re: /sessionFdrAlpha\s*\(newVal\)\s*\{/,
  },
  {
    name: "undoQualityProcess method exists",
    re: /undoQualityProcess\s*\(\)\s*\{/,
  },
  {
    name: "quality snapshot is saved during quality process",
    re: /if\s*\(preSnapshot\)\s*this\.saveQualityUndoSnapshot\(preSnapshot\);/,
  },
  {
    name: "quality snapshot is removed during undo",
    re: /localStorage\.removeItem\(LEGACY_QUALITY_SNAPSHOT_KEY\);/,
  },
  {
    name: "quality process undo button exists",
    re: /Undo Last Quality Processing|Undo Quality Processing/,
  },
  {
    name: "session FDR alpha input exists",
    re: /v-model\.number="sessionFdrAlpha"/,
  },
  {
    name: "session FDR auto-reset checkbox exists",
    re: /v-model="sessionFdrAutoResetOnDatasetChange"/,
  },
  {
    name: "dynamic alpha threshold headers exist",
    re: /raw&lt;\{\{\s*sessionFdrAlphaLabel\s*\}\}[\s\S]*fdr&lt;\{\{\s*sessionFdrAlphaLabel\s*\}\}/,
  },
];

for (const c of checks) {
  if (c.re.test(src)) pass(c.name);
  else fail(c.name);
}

if (!process.exitCode) {
  console.log("[OK] StatView regression contract checks passed.");
}
