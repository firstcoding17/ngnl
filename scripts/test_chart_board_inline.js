const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

const boardPath = path.resolve(__dirname, "..", "src", "components", "ChartsBoard.vue");
const board = fs.readFileSync(boardPath, "utf8");

const checks = [
  {
    name: "ChartsBoard accepts inlineCharts prop",
    re: /inlineCharts:\s*\{\s*type:\s*Array,\s*default:\s*\(\)\s*=>\s*\[\]\s*\}/,
  },
  {
    name: "ChartsBoard exposes clear-inline emit",
    re: /defineEmits\(\['clear-inline'\]\)/,
  },
  {
    name: "ChartsBoard computes visible inline charts",
    re: /const visibleInlineCharts = computed\(/,
  },
  {
    name: "ChartsBoard tracks opened board mode",
    re: /const activeBoardId = ref\(''\);[\s\S]*const isBoardMode = computed\(\(\) => !!activeBoardId\.value\)/,
  },
  {
    name: "ChartsBoard can persist updates to the opened board",
    re: /async function persistActiveBoard\s*\(/,
  },
  {
    name: "ChartsBoard renders live compare board section",
    re: /Live Compare Board/,
  },
  {
    name: "ChartsBoard can save live compare boards",
    re: /async function saveInlineBoard\s*\(/,
  },
  {
    name: "ChartsBoard can export live compare boards",
    re: /function saveInlineAll\s*\(/,
  },
  {
    name: "ChartsBoard restores snapshot-based board items",
    re: /bi\?\.snapshot\?\.spec[\s\S]*bi\.snapshot\.rows[\s\S]*bi\.snapshot\.columns/,
  },
  {
    name: "ChartsBoard rename path is board-aware",
    re: /async function rename\s*\([\s\S]*if \(isBoardMode\.value\)[\s\S]*persistActiveBoard/,
  },
  {
    name: "ChartsBoard delete path is board-aware",
    re: /async function remove\s*\([\s\S]*if \(isBoardMode\.value\)[\s\S]*Remove this chart from the opened board/,
  },
  {
    name: "ChartsBoard reorder paths are board-aware",
    re: /async function moveUp\s*\([\s\S]*isBoardMode\.value[\s\S]*persistActiveBoard[\s\S]*async function moveDown\s*\([\s\S]*isBoardMode\.value[\s\S]*persistActiveBoard/,
  },
  {
    name: "ChartsBoard hide path is board-aware",
    re: /async function toggleHidden\s*\([\s\S]*isBoardMode\.value[\s\S]*persistActiveBoard/,
  },
  {
    name: "ChartsBoard renders inline ChartCanvas items",
    re: /inlineCanvasRefs[\s\S]*ChartCanvas[\s\S]*it\.rows \|\| props\.rows/,
  },
  {
    name: "ChartsBoard renders save and export actions for live compare board",
    re: /Save live board[\s\S]*Export live board/,
  },
  {
    name: "ChartsBoard renders opened board notice",
    re: /Opened board:/,
  },
];

for (const check of checks) {
  if (check.re.test(board)) pass(check.name);
  else fail(check.name);
}

if (!process.exitCode) {
  console.log("[OK] Chart board inline regression checks passed.");
}
