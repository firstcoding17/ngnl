const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

function readFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const dataInlet = readFile(path.join("src", "components", "DataInlet.vue"));
const recentDatasets = readFile(path.join("src", "components", "RecentDatasets.vue"));
const useDatasetsTs = readFile(path.join("src", "stores", "useDatasets.ts"));
const dbTs = readFile(path.join("src", "stores", "db.ts"));

let useDatasetsJs = "";
const useDatasetsJsPath = path.resolve(__dirname, "..", "src", "stores", "useDatasets.js");
if (fs.existsSync(useDatasetsJsPath)) {
  useDatasetsJs = fs.readFileSync(useDatasetsJsPath, "utf8");
}

let dbJs = "";
const dbJsPath = path.resolve(__dirname, "..", "src", "stores", "db.js");
if (fs.existsSync(dbJsPath)) {
  dbJs = fs.readFileSync(dbJsPath, "utf8");
}

const checks = [
  {
    name: "DataInlet saveAllTabs exists",
    ok: /async function saveAllTabs\s*\(/.test(dataInlet),
  },
  {
    name: "DataInlet closeAllTabs exists",
    ok: /function closeAllTabs\s*\(/.test(dataInlet),
  },
  {
    name: "DataInlet onOpenRecentMany exists",
    ok: /function onOpenRecentMany\s*\(/.test(dataInlet),
  },
  {
    name: "DataInlet has Save all tabs button",
    ok: />Save all tabs</.test(dataInlet),
  },
  {
    name: "DataInlet has Close all tabs button",
    ok: />Close all tabs</.test(dataInlet),
  },
  {
    name: "DataInlet wires @open-many",
    ok: /<RecentDatasets\s+@open="onOpenRecent"\s+@open-many="onOpenRecentMany"/.test(dataInlet),
  },
  {
    name: "RecentDatasets emit supports openMany",
    ok: /defineEmits\(\s*\[\s*['"]open['"]\s*,\s*['"]openMany['"]\s*\]\s*\)/.test(recentDatasets),
  },
  {
    name: "RecentDatasets openMany function exists",
    ok: /function openMany\s*\(/.test(recentDatasets),
  },
  {
    name: "RecentDatasets has Open all button",
    ok: />Open all</.test(recentDatasets),
  },
  {
    name: "RecentDatasets supports version rollback button",
    ok: />Rollback</.test(recentDatasets),
  },
  {
    name: "useDatasets.ts exports listDatasetVersions",
    ok: /export async function listDatasetVersions\s*\(/.test(useDatasetsTs),
  },
  {
    name: "useDatasets.ts exports loadDatasetVersion",
    ok: /export async function loadDatasetVersion\s*\(/.test(useDatasetsTs),
  },
  {
    name: "useDatasets.js exports listDatasetVersions (if file exists)",
    ok: !useDatasetsJs || /export async function listDatasetVersions\s*\(/.test(useDatasetsJs),
  },
  {
    name: "useDatasets.js exports loadDatasetVersion (if file exists)",
    ok: !useDatasetsJs || /export async function loadDatasetVersion\s*\(/.test(useDatasetsJs),
  },
  {
    name: "db.ts includes dataset_versions table",
    ok: /dataset_versions!:\s*Table<DatasetVersion,\s*string>/.test(dbTs) && /dataset_versions:\s*'id,\s*datasetId,\s*version,\s*createdAt'/.test(dbTs),
  },
  {
    name: "db.js includes dataset_versions table (if file exists)",
    ok: !dbJs || /dataset_versions:\s*'id,\s*datasetId,\s*version,\s*createdAt'/.test(dbJs),
  },
];

for (const c of checks) {
  if (c.ok) pass(c.name);
  else fail(c.name);
}

if (!process.exitCode) {
  console.log("[OK] Data save/load regression contract checks passed.");
}
