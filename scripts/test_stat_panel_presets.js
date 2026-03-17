const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", "src", "components", file), "utf8");
}

const files = {
  report: read("StatsReportPanel.vue"),
  tests: read("StatTestsPanel.vue"),
  ols: read("StatsOlsPanel.vue"),
  corr: read("StatsCorrPanel.vue"),
  advanced: read("StatsAdvancedPanel.vue"),
};

const checks = [
  { name: "StatsReportPanel accepts preset prop", re: /preset:\s*\{\s*type:\s*Object,\s*default:\s*null\s*\}/, src: files.report },
  { name: "StatsReportPanel shows preset notice", re: /presetNotice/, src: files.report },
  { name: "StatsReportPanel can auto run preset", re: /preset\.autoRun[\s\S]*await run\(\)/, src: files.report },
  { name: "StatTestsPanel accepts preset prop", re: /preset:\s*\{\s*type:\s*Object,\s*default:\s*null\s*\}/, src: files.tests },
  { name: "StatTestsPanel watches preset", re: /watch\(\s*\(\)\s*=>\s*props\.preset/, src: files.tests },
  { name: "StatTestsPanel can auto run preset", re: /async function runPresetTest\s*\([\s\S]*pendingAutoRunOp[\s\S]*preset\.autoRun/, src: files.tests },
  { name: "StatTestsPanel keeps t-test auto-run path alive", re: /if \(op === 'ttest'\) \{[\s\S]*presetNotice\.value = 'Preset ready for t-test\.';\s*\} else if \(op === 'chisq'\)[\s\S]*pendingAutoRunOp\.value = preset\.autoRun \? op : '';/, src: files.tests },
  { name: "StatsOlsPanel accepts preset prop", re: /preset:\s*\{\s*type:\s*Object,\s*default:\s*null\s*\}/, src: files.ols },
  { name: "StatsOlsPanel applies OLS preset", re: /preset\.statPanel !== 'ols'[\s\S]*Preset ready for OLS regression/, src: files.ols },
  { name: "StatsOlsPanel can auto run preset", re: /pendingAutoRun[\s\S]*preset\.autoRun[\s\S]*await run\(\)/, src: files.ols },
  { name: "StatsCorrPanel accepts preset prop", re: /preset:\s*\{\s*type:\s*Object,\s*default:\s*null\s*\}/, src: files.corr },
  { name: "StatsCorrPanel shows correlation preset notice", re: /Preset ready for correlation review/, src: files.corr },
  { name: "StatsCorrPanel can auto run preset", re: /preset\.autoRun[\s\S]*await run\(\)/, src: files.corr },
  { name: "StatsAdvancedPanel accepts preset prop", re: /preset:\s*\{\s*type:\s*Object,\s*default:\s*null\s*\}/, src: files.advanced },
  { name: "StatsAdvancedPanel tracks expanded section", re: /const expandedSection = ref\('anova'\)/, src: files.advanced },
  { name: "StatsAdvancedPanel applies advanced preset", re: /preset\.statPanel !== 'advanced'[\s\S]*Preset ready for advanced statistics/, src: files.advanced },
  { name: "StatsAdvancedPanel can auto run preset", re: /async function runAdvancedPreset\s*\([\s\S]*preset\.autoRun[\s\S]*await runAdvancedPreset\(op\)/, src: files.advanced },
  { name: "StatsAdvancedPanel keeps op-specific auto-run path alive", re: /if \(op === 'anova'\) \{[\s\S]*presetNotice\.value = 'Preset ready for ANOVA\.';\s*\} else if \(op === 'normality'\)[\s\S]*if \(preset\.autoRun\) \{[\s\S]*await runAdvancedPreset\(op\);/, src: files.advanced },
];

for (const check of checks) {
  if (check.re.test(check.src)) pass(check.name);
  else fail(check.name);
}

if (!process.exitCode) {
  console.log("[OK] Stat panel preset regression checks passed.");
}
