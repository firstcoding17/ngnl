const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

const filePath = path.resolve(__dirname, "..", "src", "components", "MlPanel.vue");
const src = fs.readFileSync(filePath, "utf8");

const checks = [
  {
    name: "task selector exists",
    re: /<select\s+v-model="task">/,
  },
  {
    name: "model selector exists",
    re: /<select\s+v-model="model">/,
  },
  {
    name: "all major tasks are listed",
    re: /value="regression"[\s\S]*value="classification"[\s\S]*value="anomaly"[\s\S]*value="clustering"[\s\S]*value="dim_reduction"[\s\S]*value="timeseries"/,
  },
  {
    name: "phase2 models are listed",
    re: /extra_trees[\s\S]*adaboost[\s\S]*svm[\s\S]*calibrated[\s\S]*voting/,
  },
  {
    name: "phase3 models are listed",
    re: /xgboost[\s\S]*lightgbm[\s\S]*catboost/,
  },
  {
    name: "deep optional models are listed",
    re: /tabnet[\s\S]*ft_transformer[\s\S]*torch_mlp[\s\S]*tf_mlp/,
  },
  {
    name: "timeseries models are listed",
    re: /moving_avg[\s\S]*arima[\s\S]*exp_smoothing/,
  },
  {
    name: "cv folds control exists",
    re: /CV folds \(0=off\)[\s\S]*v-model\.number="cvFolds"/,
  },
  {
    name: "scoring control exists",
    re: /Scoring[\s\S]*v-model="scoring"/,
  },
  {
    name: "preset control exists",
    re: /Preset[\s\S]*v-model="preset"[\s\S]*value="fast"[\s\S]*value="balanced"[\s\S]*value="accurate"/,
  },
  {
    name: "component accepts MCP preset prop",
    re: /preset:\s*\{\s*type:\s*Object,\s*default:\s*null\s*\}/,
  },
  {
    name: "MCP preset watcher applies preset request",
    re: /watch\(\s*\(\)\s*=>\s*props\.preset[\s\S]*nextPreset\.panel !== 'ml'[\s\S]*await applyArtifactRequest\(nextPreset\.request\)/,
  },
  {
    name: "preset notice rendering exists",
    re: /presetNotice[\s\S]*Preset ready for ML panel[\s\S]*v-if="presetNotice"/,
  },
  {
    name: "artifact include control exists",
    re: /v-model="includeArtifact"[\s\S]*Include model binary/,
  },
  {
    name: "payload includes cv and scoring options",
    re: /cv:\s*cvFolds\.value[\s\S]*scoring:\s*scoring\.value/,
  },
  {
    name: "payload includes preset option",
    re: /preset:\s*preset\.value/,
  },
  {
    name: "payload includes includeArtifact option",
    re: /includeArtifact:\s*includeArtifact\.value/,
  },
  {
    name: "payload includes shap and timeseries options",
    re: /enableShap:\s*enableShap\.value[\s\S]*horizon:\s*tsHorizon\.value[\s\S]*maWindow:\s*maWindow\.value/,
  },
  {
    name: "artifact save and load actions exist",
    re: /@click="saveArtifact"[\s\S]*@click="openArtifactFile"[\s\S]*@change="onArtifactFilePick"/,
  },
  {
    name: "recommendation apply action exists",
    re: /@click="applyRecommendation"[\s\S]*Apply recommendation/,
  },
  {
    name: "validation summary rendering exists",
    re: /v-if="result\.validation"[\s\S]*validation:\s*holdout=/,
  },
  {
    name: "feature importance rendering exists",
    re: /result\.featureImportance\?\.length/,
  },
  {
    name: "permutation importance rendering exists",
    re: /result\.permutationImportance\?\.length/,
  },
  {
    name: "shap importance rendering exists",
    re: /result\.shapImportance\?\.length/,
  },
  {
    name: "timeseries preview rendering exists",
    re: /result\.timeSeriesPreview\?\.forecast\?\.length/,
  },
  {
    name: "error analysis rendering exists",
    re: /result\.errorAnalysis\?\.type === 'classification'[\s\S]*result\.errorAnalysis\?\.type === 'regression'/,
  },
  {
    name: "anomaly summary rendering exists",
    re: /result\.anomalySummary\?\.labelCounts\?\.length/,
  },
  {
    name: "cluster summary rendering exists",
    re: /result\.clusterSummary\?\.length/,
  },
  {
    name: "dim reduction preview rendering exists",
    re: /result\.projectionPreview\?\.length/,
  },
];

for (const c of checks) {
  if (c.re.test(src)) pass(c.name);
  else fail(c.name);
}

if (!process.exitCode) {
  console.log("[OK] MlPanel regression contract checks passed.");
}
