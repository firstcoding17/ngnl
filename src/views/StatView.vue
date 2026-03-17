<template>
  <div class="stat-view">
    <h2>Legacy Statistics View</h2>
    <div class="legacy-nav">
      <router-link to="/legacy/file">File</router-link>
      <router-link to="/legacy/graph">Graph</router-link>
      <router-link to="/legacy/stat">Stat</router-link>
    </div>
    <p class="subtitle">Uses <code>/stat/run</code> contract. Load dataset in <code>/legacy/file</code> first.</p>
    <div class="cap-strip">
      <span v-if="capLoading">Checking runtime capabilities...</span>
      <span v-else>
        <b>Stat:</b> scipy {{ statCaps?.scipy ? "ready" : "missing" }} /
        statsmodels {{ statCaps?.statsmodels ? "ready" : "missing" }}
      </span>
      <span v-if="!capLoading">
        <b>ML:</b> sklearn {{ mlCaps?.sklearn ? "ready" : "missing" }} /
        mode {{ mlCaps?.deepLearningMode || "n/a" }}
      </span>
      <router-link to="/">Open ML/DL in New Workspace</router-link>
    </div>
    <div v-if="capError" class="cap-error">{{ capError }}</div>
    <div class="view-actions">
      <router-link to="/">Open New Workspace</router-link>
      <router-link to="/legacy">Open Legacy Hub</router-link>
      <button @click="resetLegacyDataset" :disabled="!!loadingAction || !hasDataset">Clear Legacy Dataset</button>
    </div>

    <div class="summary">
      <span><b>Rows:</b> {{ rowCount }}</span>
      <span><b>Columns:</b> {{ columnCount }}</span>
      <span><b>Status:</b> {{ hasDataset ? "ready" : "empty" }}</span>
    </div>

    <div class="control-strip">
      <label>
        Focus column
        <select v-model="selectedColumn" :disabled="!effectiveColumns.length">
          <option value="">Select column</option>
          <option v-for="col in effectiveColumns" :key="col" :value="col">{{ col }}</option>
        </select>
      </label>
    </div>

    <div class="analysis-grid">
      <section class="card">
        <h3>Test Recommender</h3>
        <div class="field-grid">
          <label>
            Goal
            <select v-model="recommendGoal">
              <option value="auto">Auto</option>
              <option value="compare_two_groups">Compare Two Groups</option>
              <option value="compare_multi_groups">Compare Multi Groups</option>
              <option value="association">Categorical Association</option>
              <option value="paired_difference">Paired Difference</option>
              <option value="regression">Regression</option>
              <option value="distribution">Distribution / Assumption</option>
            </select>
          </label>
          <label>
            Value hint (numeric)
            <select v-model="recommendValueCol" :disabled="!numericColumns.length">
              <option value="">Auto select</option>
              <option v-for="col in numericColumns" :key="`r-v-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Group hint (categorical)
            <select v-model="recommendGroupCol" :disabled="!categoricalColumns.length">
              <option value="">Auto select</option>
              <option v-for="col in categoricalColumns" :key="`r-g-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Column A hint
            <select v-model="recommendColA" :disabled="!effectiveColumns.length">
              <option value="">Auto select</option>
              <option v-for="col in effectiveColumns" :key="`r-a-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Column B hint
            <select v-model="recommendColB" :disabled="!effectiveColumns.length">
              <option value="">Auto select</option>
              <option v-for="col in effectiveColumns" :key="`r-b-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
        </div>
        <div class="analysis-actions">
          <button @click="doRecommend" :disabled="!hasDataset || !!loadingAction">
            {{ loadingAction === "recommend" ? "Running..." : "Recommend Tests" }}
          </button>
        </div>
        <div v-if="recommendationItems.length" class="recommend-list">
          <div v-for="(rec, idx) in recommendationItems" :key="`rec-${idx}-${rec.op}`" class="recommend-item">
            <div class="recommend-head">
              <span class="recommend-op">{{ rec.label || rec.op }}</span>
              <span class="recommend-chart">{{ rec.chart?.type || "chart:n/a" }}</span>
            </div>
            <div class="recommend-reason">{{ rec.reason }}</div>
            <button @click="runRecommendedTest(rec)" :disabled="!!loadingAction">
              Run {{ rec.op }}
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Data Quality (Missing / Outlier)</h3>
        <div class="field-grid">
          <label>
            Method
            <select v-model="qualityMethod">
              <option value="iqr">IQR</option>
              <option value="zscore">Z-score</option>
            </select>
          </label>
          <label>
            Strategy
            <select v-model="qualityStrategy">
              <option value="exclude">Exclude Rows</option>
              <option value="winsorize">Winsorize Values</option>
            </select>
          </label>
          <label>
            Target numeric column
            <select v-model="qualityTargetCol" :disabled="!numericColumns.length">
              <option value="">All numeric columns</option>
              <option v-for="col in numericColumns" :key="`q-col-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            IQR k
            <input v-model.number="qualityIqrK" type="number" min="0.5" max="5" step="0.1" />
          </label>
          <label>
            Z threshold
            <input v-model.number="qualityZThresh" type="number" min="1.5" max="6" step="0.1" />
          </label>
          <label class="inline-check">
            <input v-model="qualityDropMissing" type="checkbox" />
            Drop rows with missing values
          </label>
        </div>
        <div class="analysis-actions">
          <button @click="doQualityCheck" :disabled="!hasDataset || !!loadingAction">
            {{ loadingAction === "quality" ? "Running..." : "Run Quality Check" }}
          </button>
          <button @click="doQualityProcess" :disabled="!hasDataset || !!loadingAction">
            {{ loadingAction === "quality_process" ? "Running..." : "Apply Quality Processing" }}
          </button>
          <button @click="undoQualityProcess" :disabled="!!loadingAction || !qualityUndoAvailable">
            Undo Last Quality Processing
          </button>
        </div>
      </section>

      <section v-if="qualityProcessCompare" class="card">
        <h3>Quality Process Delta Report</h3>
        <div class="quality-delta-meta">
          Method: <b>{{ qualityProcessCompare.method }}</b> /
          Strategy: <b>{{ qualityProcessCompare.strategy }}</b> /
          Generated: {{ qualityProcessCompare.generatedAt }}
        </div>
        <div class="quality-delta-grid">
          <div>
            <b>Rows:</b>
            {{ formatDiagNumber(qualityProcessCompare.rowsBefore, 0) }} →
            {{ formatDiagNumber(qualityProcessCompare.rowsAfter, 0) }}
            (removed {{ formatDiagNumber(qualityProcessCompare.rowsRemoved, 0) }})
          </div>
          <div>
            <b>Rows with missing:</b>
            {{ formatDiagNumber(qualityProcessCompare.missingRowsBefore, 0) }} →
            {{ formatDiagNumber(qualityProcessCompare.missingRowsAfter, 0) }}
          </div>
          <div>
            <b>Outlier rows:</b>
            {{ formatDiagNumber(qualityProcessCompare.outlierRowsBefore, 0) }} →
            {{ formatDiagNumber(qualityProcessCompare.outlierRowsAfter, 0) }}
          </div>
          <div>
            <b>Outlier values ({{ qualityProcessCompare.outlierMetricLabel }}):</b>
            {{ formatDiagNumber(qualityProcessCompare.outliersBefore, 0) }} →
            {{ formatDiagNumber(qualityProcessCompare.outliersAfter, 0) }}
          </div>
          <div>
            <b>Target columns:</b> {{ qualityProcessCompare.targetColumnsLabel }}
          </div>
        </div>
        <div v-if="qualityProcessCompare.columnDeltas && qualityProcessCompare.columnDeltas.length" class="quality-delta-table">
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Outliers Before</th>
                <th>Outliers After</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in qualityProcessCompare.columnDeltas" :key="`qd-${row.column}`">
                <td>{{ row.column }}</td>
                <td>{{ formatDiagNumber(row.outlierBefore, 0) }}</td>
                <td>{{ formatDiagNumber(row.outlierAfter, 0) }}</td>
                <td>{{ formatDiagNumber(row.outlierDelta, 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="analysis-actions">
          <button @click="runBasicStat" :disabled="!hasDataset || !!loadingAction">Run Basic Stats on Cleaned Data</button>
          <button @click="doRecommend" :disabled="!hasDataset || !!loadingAction">Recommend Tests on Cleaned Data</button>
          <button @click="openResultInGraph" :disabled="!hasDataset || !!loadingAction">Open Cleaned Data in Graph</button>
          <button @click="undoQualityProcess" :disabled="!!loadingAction || !qualityUndoAvailable">Undo Quality Processing</button>
          <button @click="qualityProcessCompare = null">Clear Delta Card</button>
        </div>
      </section>

      <section class="card">
        <h3>Session FDR Control</h3>
        <div class="analysis-actions">
          <label class="inline-control">
            alpha
            <input v-model.number="sessionFdrAlpha" type="number" min="0.001" max="0.2" step="0.001" />
          </label>
          <label class="inline-control">
            <input v-model="sessionFdrAutoResetOnDatasetChange" type="checkbox" />
            Auto reset on dataset change
          </label>
          <button @click="clearSessionFdr" :disabled="!sessionFdrRows.length">Clear Session FDR</button>
        </div>
        <div v-if="sessionFdrRows.length" class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Source</th>
                <th>p(raw)</th>
                <th>p(FDR)</th>
                <th>raw&lt;{{ sessionFdrAlphaLabel }}</th>
                <th>fdr&lt;{{ sessionFdrAlphaLabel }}</th>
                <th>At</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in sessionFdrRows.slice(-80).reverse()" :key="r.id">
                <td>{{ idx + 1 }}</td>
                <td>{{ r.source }}</td>
                <td>{{ Number(r.p_raw).toFixed(6) }}</td>
                <td>{{ r.p_fdr == null ? '' : Number(r.p_fdr).toFixed(6) }}</td>
                <td>{{ r.sig_raw ? 'yes' : 'no' }}</td>
                <td>{{ r.sig_fdr ? 'yes' : 'no' }}</td>
                <td>{{ r.at }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="text-xs text-gray-500">No p-values recorded yet in this session.</div>
      </section>

      <section class="card">
        <h3>Summary</h3>
        <div class="analysis-actions">
          <button @click="runBasicStat" :disabled="!hasDataset || !!loadingAction">
            {{ loadingAction === "basic" ? "Running..." : "Basic Stats" }}
          </button>
          <button @click="runDistribution" :disabled="!hasDataset || !!loadingAction">
            {{ loadingAction === "distribution" ? "Running..." : "Distribution" }}
          </button>
          <button @click="runCorrelation" :disabled="!hasDataset || !!loadingAction">
            {{ loadingAction === "correlation" ? "Running..." : "Correlation" }}
          </button>
        </div>
      </section>

      <section class="card">
        <h3>t-test</h3>
        <div class="field-grid">
          <label>
            Value (numeric)
            <select v-model="tValueCol" :disabled="!numericColumns.length">
              <option value="">Select value column</option>
              <option v-for="col in numericColumns" :key="col" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Group (categorical)
            <select v-model="tGroupCol" :disabled="!categoricalColumns.length">
              <option value="">Select group column</option>
              <option v-for="col in categoricalColumns" :key="col" :value="col">{{ col }}</option>
            </select>
          </label>
        </div>
        <button @click="doTtest" :disabled="!hasDataset || !!loadingAction || !tValueCol || !tGroupCol">
          {{ loadingAction === "ttest" ? "Running..." : "Run t-test" }}
        </button>
      </section>

      <section class="card">
        <h3>Chi-square</h3>
        <div class="field-grid">
          <label>
            Category A
            <select v-model="chiColA" :disabled="!categoricalColumns.length">
              <option value="">Select category A</option>
              <option v-for="col in categoricalColumns" :key="col" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Category B
            <select v-model="chiColB" :disabled="!categoricalColumns.length">
              <option value="">Select category B</option>
              <option v-for="col in categoricalColumns" :key="col" :value="col">{{ col }}</option>
            </select>
          </label>
        </div>
        <button @click="doChi2" :disabled="!hasDataset || !!loadingAction || !chiColA || !chiColB || chiColA === chiColB">
          {{ loadingAction === "chi2" ? "Running..." : "Run Chi-square" }}
        </button>
      </section>

      <section class="card">
        <h3>Linear Regression</h3>
        <div class="field-grid">
          <label>
            Target (Y)
            <select v-model="olsTargetCol" :disabled="!numericColumns.length">
              <option value="">Select target</option>
              <option v-for="col in numericColumns" :key="col" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Features (X)
            <select v-model="olsFeatureCols" multiple size="5" :disabled="!numericColumns.length">
              <option v-for="col in numericColumns.filter((c) => c !== olsTargetCol)" :key="col" :value="col">
                {{ col }}
              </option>
            </select>
          </label>
        </div>
        <button @click="doLinReg" :disabled="!hasDataset || !!loadingAction || !olsTargetCol || !olsFeatureCols.length">
          {{ loadingAction === "linreg" ? "Running..." : "Run Linear Regression" }}
        </button>
      </section>

      <section class="card">
        <h3>ANOVA / Post-hoc</h3>
        <div class="field-grid">
          <label>
            Value (numeric)
            <select v-model="anovaValueCol" :disabled="!numericColumns.length">
              <option value="">Select value column</option>
              <option v-for="col in numericColumns" :key="`anova-v-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Group (categorical)
            <select v-model="anovaGroupCol" :disabled="!categoricalColumns.length">
              <option value="">Select group column</option>
              <option v-for="col in categoricalColumns" :key="`anova-g-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Tukey alpha
            <input v-model.number="posthocAlpha" type="number" min="0.01" max="0.2" step="0.01" />
          </label>
          <label>
            Pairwise correction
            <select v-model="posthocAdjust">
              <option value="holm">Holm</option>
              <option value="bonferroni">Bonferroni</option>
              <option value="fdr_bh">FDR (BH)</option>
            </select>
          </label>
        </div>
        <div class="analysis-actions">
          <button @click="doAnova" :disabled="!hasDataset || !!loadingAction || !anovaValueCol || !anovaGroupCol">
            {{ loadingAction === "anova" ? "Running..." : "Run ANOVA" }}
          </button>
          <button @click="doTukey" :disabled="!hasDataset || !!loadingAction || !anovaValueCol || !anovaGroupCol">
            {{ loadingAction === "tukey" ? "Running..." : "Run Tukey" }}
          </button>
          <button @click="doPairwiseAdjusted" :disabled="!hasDataset || !!loadingAction || !anovaValueCol || !anovaGroupCol">
            {{ loadingAction === "pairwise_adjusted" ? "Running..." : "Run Pairwise Adjusted" }}
          </button>
        </div>
      </section>

      <section class="card">
        <h3>Assumption / CI</h3>
        <div class="field-grid">
          <label>
            Normality column
            <select v-model="normalityCol" :disabled="!numericColumns.length">
              <option value="">Select numeric column</option>
              <option v-for="col in numericColumns" :key="`norm-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <div class="analysis-actions">
            <button @click="doNormality" :disabled="!hasDataset || !!loadingAction || !normalityCol">
              {{ loadingAction === "normality" ? "Running..." : "Run Normality" }}
            </button>
          </div>
        </div>
        <div class="field-grid">
          <label>
            Mean CI column
            <select v-model="ciValueCol" :disabled="!numericColumns.length">
              <option value="">Select numeric column</option>
              <option v-for="col in numericColumns" :key="`ci-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Confidence level
            <input v-model.number="ciLevel" type="number" min="0.8" max="0.99" step="0.01" />
          </label>
          <div class="analysis-actions">
            <button @click="doMeanCI" :disabled="!hasDataset || !!loadingAction || !ciValueCol">
              {{ loadingAction === "ci_mean" ? "Running..." : "Run Mean CI" }}
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Nonparametric</h3>
        <div class="field-grid">
          <label>
            Mann-Whitney value
            <select v-model="mwValueCol" :disabled="!numericColumns.length">
              <option value="">Select numeric column</option>
              <option v-for="col in numericColumns" :key="`mw-v-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Mann-Whitney group
            <select v-model="mwGroupCol" :disabled="!categoricalColumns.length">
              <option value="">Select group column</option>
              <option v-for="col in categoricalColumns" :key="`mw-g-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <div class="analysis-actions">
            <button @click="doMannWhitney" :disabled="!hasDataset || !!loadingAction || !mwValueCol || !mwGroupCol">
              {{ loadingAction === "mannwhitney" ? "Running..." : "Run Mann-Whitney" }}
            </button>
          </div>
        </div>
        <div class="field-grid">
          <label>
            Wilcoxon column A
            <select v-model="wilcoxonColA" :disabled="!numericColumns.length">
              <option value="">Select numeric A</option>
              <option v-for="col in numericColumns" :key="`w-a-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Wilcoxon column B
            <select v-model="wilcoxonColB" :disabled="!numericColumns.length">
              <option value="">Select numeric B</option>
              <option v-for="col in numericColumns" :key="`w-b-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <div class="analysis-actions">
            <button @click="doWilcoxon" :disabled="!hasDataset || !!loadingAction || !wilcoxonColA || !wilcoxonColB || wilcoxonColA === wilcoxonColB">
              {{ loadingAction === "wilcoxon" ? "Running..." : "Run Wilcoxon" }}
            </button>
          </div>
        </div>
        <div class="field-grid">
          <label>
            Kruskal value
            <select v-model="kruskalValueCol" :disabled="!numericColumns.length">
              <option value="">Select numeric column</option>
              <option v-for="col in numericColumns" :key="`k-v-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <label>
            Kruskal group
            <select v-model="kruskalGroupCol" :disabled="!categoricalColumns.length">
              <option value="">Select group column</option>
              <option v-for="col in categoricalColumns" :key="`k-g-${col}`" :value="col">{{ col }}</option>
            </select>
          </label>
          <div class="analysis-actions">
            <button @click="doKruskal" :disabled="!hasDataset || !!loadingAction || !kruskalValueCol || !kruskalGroupCol">
              {{ loadingAction === "kruskal" ? "Running..." : "Run Kruskal" }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <div class="result-toolbar">
      <button
        @click="resultView = 'raw'"
        :disabled="!result"
        :class="{ active: resultView === 'raw' }"
      >
        Raw
      </button>
      <button
        @click="resultView = 'table'"
        :disabled="!hasResultTables"
        :class="{ active: resultView === 'table' }"
      >
        Table
      </button>
      <button @click="downloadResultJson" :disabled="!result">Download JSON</button>
      <button @click="downloadResultTablesCsv" :disabled="!hasResultTables">Download Tables CSV</button>
      <button @click="downloadResultReport" :disabled="!resultObj">Download Report (HTML)</button>
      <button @click="openResultInGraph" :disabled="!result || !hasDataset">Open in Graph</button>
      <button @click="copyResult" :disabled="!result">Copy Result</button>
      <button @click="clearResult" :disabled="!result && !errorMessage">Clear</button>
    </div>

    <div v-if="loadingAction" class="state loading">Running {{ loadingAction }}...</div>
    <div v-else-if="errorMessage" class="state error">{{ errorMessage }}</div>
    <div v-else-if="!result" class="state empty">No analysis result yet.</div>

    <div v-else class="result-card">
      <div class="result-header">
        <span>Latest result</span>
        <span v-if="resultAt" class="result-time">{{ resultAt }}</span>
      </div>
      <div v-if="olsDiagnostics" class="ols-diag-panel">
        <div class="ols-diag-title">OLS Diagnostics</div>
        <div class="ols-diag-grid">
          <div><b>Residual vs Fitted:</b> {{ olsDiagnostics.hasResidualFitted ? "ready" : "missing" }}</div>
          <div><b>Q-Q Plot:</b> {{ olsDiagnostics.hasQQ ? "ready" : "missing" }}</div>
          <div><b>Residual points:</b> {{ olsDiagnostics.residualPoints.length }}</div>
          <div><b>Q-Q points:</b> {{ olsDiagnostics.qqPoints.length }}</div>
          <div><b>BP LM:</b> {{ formatDiagNumber(olsDiagnostics.bpLm, 4) }}</div>
          <div><b>BP LM p:</b> {{ formatDiagNumber(olsDiagnostics.bpLmP, 6) }}</div>
          <div><b>BP F:</b> {{ formatDiagNumber(olsDiagnostics.bpF, 4) }}</div>
          <div><b>BP F p:</b> {{ formatDiagNumber(olsDiagnostics.bpFP, 6) }}</div>
        </div>
        <div class="ols-diag-charts">
          <div class="ols-mini-plot">
            <div class="ols-mini-title">Residual vs Fitted</div>
            <svg v-if="olsDiagnostics.residualPoints.length" viewBox="0 0 220 120" role="img" aria-label="Residual vs Fitted mini plot">
              <line x1="8" y1="112" x2="212" y2="112" stroke="#cbd5e1" stroke-width="1" />
              <line x1="8" y1="8" x2="8" y2="112" stroke="#cbd5e1" stroke-width="1" />
              <circle
                v-for="(p, idx) in projectMiniScatter(olsDiagnostics.residualPoints, 220, 120)"
                :key="`rf-${idx}`"
                :cx="p.x"
                :cy="p.y"
                r="1.7"
                fill="#2563eb"
                opacity="0.75"
              />
            </svg>
            <div v-else class="ols-mini-empty">No residual points.</div>
          </div>
          <div class="ols-mini-plot">
            <div class="ols-mini-title">Q-Q Plot</div>
            <svg v-if="olsDiagnostics.qqPoints.length" viewBox="0 0 220 120" role="img" aria-label="Q-Q mini plot">
              <line x1="8" y1="112" x2="212" y2="112" stroke="#cbd5e1" stroke-width="1" />
              <line x1="8" y1="8" x2="8" y2="112" stroke="#cbd5e1" stroke-width="1" />
              <circle
                v-for="(p, idx) in projectMiniScatter(olsDiagnostics.qqPoints, 220, 120)"
                :key="`qq-${idx}`"
                :cx="p.x"
                :cy="p.y"
                r="1.7"
                fill="#0f766e"
                opacity="0.75"
              />
            </svg>
            <div v-else class="ols-mini-empty">No Q-Q points.</div>
          </div>
        </div>
        <div class="ols-diag-note">
          {{ olsDiagnostics.bpLmP != null && olsDiagnostics.bpLmP < 0.05
            ? "Heteroskedasticity suspected (BP p < 0.05). Consider robust covariance."
            : "No strong heteroskedasticity signal from BP." }}
        </div>
      </div>
      <pre v-if="resultView === 'raw'">{{ result }}</pre>

      <div v-else class="table-results">
        <div v-for="t in resultTables" :key="t.name" class="table-box">
          <div class="table-title">{{ t.name }}</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th v-for="c in t.columns" :key="`${t.name}-${c}`">{{ c }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(r, ridx) in t.rows"
                  :key="`${t.name}-${ridx}`"
                  class="result-row"
                  :class="{ clickable: isTableRowGraphMappable(t, r) }"
                  :title="isTableRowGraphMappable(t, r) ? 'Open this row in Graph view' : ''"
                  tabindex="0"
                  @click="openTableRowInGraph(t, r)"
                  @keydown.enter.prevent="openTableRowInGraph(t, r)"
                >
                  <td v-for="(cell, cidx) in r" :key="`${t.name}-${ridx}-${cidx}`">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  statSummary,
  statCorr,
  statTtest,
  statChi2,
  statLinReg,
  statAnova,
  statTukey,
  statPairwiseAdjusted,
  statNormality,
  statMeanCI,
  statMannWhitney,
  statWilcoxon,
  statKruskal,
  statRecommend,
  statQuality,
  statQualityProcess,
} from "@/api/statClient";
import { getStatCapabilities } from "@/services/statApi";

const LEGACY_DATA_KEY = "legacy_table_data";
const LEGACY_GRAPH_PREF_KEY = "legacy_graph_pref";
const LEGACY_SESSION_FDR_KEY = "legacy_stat_session_fdr";
const LEGACY_QUALITY_SNAPSHOT_KEY = "legacy_table_data_quality_snapshot";

export default {
  name: "StatView",
  props: ["columns"],
  data() {
    return {
      selectedColumn: null,
      result: null, // JSON output
      resultObj: null,
      resultView: "raw",
      loadingAction: "",
      errorMessage: "",
      resultAt: "",
      tValueCol: "",
      tGroupCol: "",
      chiColA: "",
      chiColB: "",
      olsTargetCol: "",
      olsFeatureCols: [],
      anovaValueCol: "",
      anovaGroupCol: "",
      posthocAlpha: 0.05,
      posthocAdjust: "holm",
      normalityCol: "",
      ciValueCol: "",
      ciLevel: 0.95,
      mwValueCol: "",
      mwGroupCol: "",
      wilcoxonColA: "",
      wilcoxonColB: "",
      kruskalValueCol: "",
      kruskalGroupCol: "",
      recommendGoal: "auto",
      recommendValueCol: "",
      recommendGroupCol: "",
      recommendColA: "",
      recommendColB: "",
      qualityMethod: "iqr",
      qualityStrategy: "exclude",
      qualityTargetCol: "",
      qualityIqrK: 1.5,
      qualityZThresh: 3.0,
      qualityDropMissing: true,
      qualityProcessCompare: null,
      qualityUndoAvailable: false,
      sessionFdrAlpha: 0.05,
      sessionFdrAutoResetOnDatasetChange: false,
      lastDatasetFingerprint: "",
      sessionPHistory: [],
      capLoading: true,
      capError: "",
      statCaps: null,
      mlCaps: null,
    };
  },
  computed: {
    effectiveTableData() {
      try {
        const raw = localStorage.getItem(LEGACY_DATA_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.columns || !Array.isArray(parsed.rows)) return null;
        if (parsed.rows.length && Array.isArray(parsed.rows[0])) {
          const rows = parsed.rows.map((arr) => {
            const obj = {};
            parsed.columns.forEach((c, i) => { obj[c] = arr[i]; });
            return obj;
          });
          return { columns: parsed.columns, rows };
        }
        return parsed;
      } catch {
        return null;
      }
    },
    effectiveColumns() {
      return this.effectiveTableData?.columns || this.columns || [];
    },
    effectiveRows() {
      return this.effectiveTableData?.rows || [];
    },
    hasDataset() {
      return this.effectiveRows.length > 0;
    },
    rowCount() {
      return this.effectiveRows.length;
    },
    columnCount() {
      return this.effectiveColumns.length;
    },
    numericColumns() {
      return this.effectiveColumns.filter((c) =>
        this.effectiveRows.some((r) => Number.isFinite(Number(r?.[c])))
      );
    },
    categoricalColumns() {
      return this.effectiveColumns.filter((c) => !this.numericColumns.includes(c));
    },
    resultTables() {
      const candidates = [];
      if (Array.isArray(this.resultObj?.tables)) candidates.push(...this.resultObj.tables);
      if (Array.isArray(this.resultObj?.data?.tables)) candidates.push(...this.resultObj.data.tables);
      return candidates.filter((t) => Array.isArray(t?.columns) && Array.isArray(t?.rows));
    },
    hasResultTables() {
      return this.resultTables.length > 0;
    },
    recommendationItems() {
      const list = this.resultObj?.recommendations || this.resultObj?.data?.recommendations || [];
      return Array.isArray(list) ? list : [];
    },
    sessionFdrAlphaLabel() {
      const a = this.toFiniteNumber(this.sessionFdrAlpha);
      if (a == null) return "0.05";
      return Number(a).toFixed(3);
    },
    sessionFdrRows() {
      return [...(this.sessionPHistory || [])];
    },
    olsDiagnostics() {
      const op = this.resultObj?.op || this.resultObj?.data?.op || "";
      if (op !== "ols") return null;
      const stats = this.resultObj?.summary?.stats || this.resultObj?.data?.summary?.stats || {};
      const figures = Array.isArray(this.resultObj?.figures)
        ? this.resultObj.figures
        : (Array.isArray(this.resultObj?.data?.figures) ? this.resultObj.data.figures : []);
      const figTypes = new Set(figures.map((f) => String(f?.type || "")));
      const toPoints = (figType) => {
        const f = figures.find((x) => String(x?.type || "") === figType);
        const xs = Array.isArray(f?.x) ? f.x : [];
        const ys = Array.isArray(f?.y) ? f.y : [];
        const n = Math.min(xs.length, ys.length);
        const out = [];
        for (let i = 0; i < n; i += 1) {
          const x = Number(xs[i]);
          const y = Number(ys[i]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          out.push({ x, y });
        }
        return out;
      };
      return {
        bpLm: this.toFiniteNumber(stats.bp_lm),
        bpLmP: this.toFiniteNumber(stats.bp_lm_p),
        bpF: this.toFiniteNumber(stats.bp_f),
        bpFP: this.toFiniteNumber(stats.bp_f_p),
        hasResidualFitted: figTypes.has("residual_fitted"),
        hasQQ: figTypes.has("residual_qq"),
        residualPoints: toPoints("residual_fitted"),
        qqPoints: toPoints("residual_qq"),
      };
    },
  },
  methods: {
    toFiniteNumber(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
    formatDiagNumber(v, digits = 6) {
      const n = this.toFiniteNumber(v);
      return n == null ? "n/a" : n.toFixed(digits);
    },
    normalizeFdrAlpha(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0.05;
      return Math.min(0.2, Math.max(0.001, n));
    },
    buildDatasetFingerprint(columns, rows) {
      const cols = Array.isArray(columns) ? columns.map((c) => String(c)) : [];
      const safeRows = Array.isArray(rows) ? rows : [];
      const sampleCols = cols.slice(0, 3);
      const sample = safeRows
        .slice(0, 3)
        .map((r) => sampleCols.map((c, idx) => {
          if (Array.isArray(r)) return String(r[idx] ?? "");
          if (r && typeof r === "object") return String(r[c] ?? "");
          return String(r ?? "");
        }).join("|"))
        .join("||");
      return `${cols.join(",")}::${safeRows.length}::${sample}`;
    },
    handleDatasetChangeForFdr(nextColumns, nextRows) {
      const nextFp = this.buildDatasetFingerprint(nextColumns, nextRows);
      const prevFp = this.lastDatasetFingerprint || "";
      const changed = prevFp !== nextFp;
      this.lastDatasetFingerprint = nextFp;
      if (changed && this.sessionFdrAutoResetOnDatasetChange && this.sessionPHistory.length) {
        this.sessionPHistory = [];
      }
      this.persistSessionFdr();
    },
    refreshQualityUndoAvailable() {
      try {
        this.qualityUndoAvailable = !!localStorage.getItem(LEGACY_QUALITY_SNAPSHOT_KEY);
      } catch {
        this.qualityUndoAvailable = false;
      }
    },
    buildCurrentDatasetSnapshot() {
      if (!this.effectiveColumns.length || !this.effectiveRows.length) return null;
      return {
        columns: [...this.effectiveColumns],
        rows: this.effectiveRows.map((r) => ({ ...r })),
        savedAt: new Date().toISOString(),
      };
    },
    saveQualityUndoSnapshot(snapshot) {
      if (!snapshot?.columns || !Array.isArray(snapshot?.rows)) return;
      try {
        localStorage.setItem(LEGACY_QUALITY_SNAPSHOT_KEY, JSON.stringify(snapshot));
      } catch (_e) {
        // no-op
      }
      this.refreshQualityUndoAvailable();
    },
    undoQualityProcess() {
      try {
        const raw = localStorage.getItem(LEGACY_QUALITY_SNAPSHOT_KEY);
        if (!raw) {
          this.errorMessage = "No quality-processing snapshot found to restore.";
          this.refreshQualityUndoAvailable();
          return;
        }
        const snap = JSON.parse(raw);
        if (!Array.isArray(snap?.columns) || !Array.isArray(snap?.rows) || !snap.columns.length) {
          this.errorMessage = "Invalid snapshot format. Cannot restore.";
          return;
        }
        this.handleDatasetChangeForFdr(snap.columns, snap.rows);
        localStorage.setItem(LEGACY_DATA_KEY, JSON.stringify({
          columns: snap.columns,
          rows: snap.rows,
        }));
        localStorage.removeItem(LEGACY_QUALITY_SNAPSHOT_KEY);
        this.qualityProcessCompare = null;
        this.errorMessage = "";
        this.setDefaultSelections();
      } catch {
        this.errorMessage = "Failed to restore quality snapshot.";
      }
      this.refreshQualityUndoAvailable();
    },
    loadSessionFdr() {
      try {
        const raw = localStorage.getItem(LEGACY_SESSION_FDR_KEY);
        if (!raw) {
          this.sessionFdrAlpha = this.normalizeFdrAlpha(this.sessionFdrAlpha);
          this.sessionFdrAutoResetOnDatasetChange = Boolean(this.sessionFdrAutoResetOnDatasetChange);
          this.sessionPHistory = [];
          return;
        }
        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed)
          ? parsed
          : (Array.isArray(parsed?.rows) ? parsed.rows : null);
        const alpha = Array.isArray(parsed) ? this.sessionFdrAlpha : parsed?.alpha;
        const autoReset = Array.isArray(parsed) ? this.sessionFdrAutoResetOnDatasetChange : parsed?.autoResetOnDatasetChange;
        const datasetFingerprint = Array.isArray(parsed) ? "" : String(parsed?.datasetFingerprint || "");
        this.sessionFdrAlpha = this.normalizeFdrAlpha(alpha);
        this.sessionFdrAutoResetOnDatasetChange = Boolean(autoReset);
        this.lastDatasetFingerprint = datasetFingerprint;
        if (!Array.isArray(rows)) {
          this.sessionPHistory = [];
          return;
        }
        const normalized = rows
          .map((r, i) => ({
            id: String(r?.id || `restored-${Date.now()}-${i}`),
            source: String(r?.source || ""),
            p_raw: Number(r?.p_raw),
            p_fdr: this.toFiniteNumber(r?.p_fdr),
            sig_raw: Boolean(r?.sig_raw),
            sig_fdr: Boolean(r?.sig_fdr),
            at: String(r?.at || ""),
          }))
          .filter((r) => Number.isFinite(r.p_raw));
        this.sessionPHistory = this.applySessionFdrBH(normalized);
      } catch {
        this.sessionPHistory = [];
      }
    },
    persistSessionFdr() {
      try {
        localStorage.setItem(LEGACY_SESSION_FDR_KEY, JSON.stringify({
          alpha: this.normalizeFdrAlpha(this.sessionFdrAlpha),
          autoResetOnDatasetChange: Boolean(this.sessionFdrAutoResetOnDatasetChange),
          datasetFingerprint: String(this.lastDatasetFingerprint || ""),
          rows: this.sessionPHistory || [],
        }));
      } catch (_e) {
        // no-op
      }
    },
    getNamedTable(obj, tableName) {
      const name = String(tableName || "");
      const tables = [];
      if (Array.isArray(obj?.tables)) tables.push(...obj.tables);
      if (Array.isArray(obj?.data?.tables)) tables.push(...obj.data.tables);
      return tables.find((t) => String(t?.name || "") === name) || null;
    },
    sumNumericColumn(table, candidates) {
      const cols = Array.isArray(table?.columns) ? table.columns : [];
      const rows = Array.isArray(table?.rows) ? table.rows : [];
      if (!cols.length || !rows.length) return null;
      const names = Array.isArray(candidates) ? candidates : [candidates];
      const idx = names
        .map((c) => cols.findIndex((x) => String(x) === String(c)))
        .find((i) => i >= 0);
      if (idx == null || idx < 0) return null;
      let sum = 0;
      let seen = false;
      rows.forEach((r) => {
        const n = Number(r?.[idx]);
        if (Number.isFinite(n)) {
          sum += n;
          seen = true;
        }
      });
      return seen ? sum : null;
    },
    buildQualityProcessCompare(beforeQuality, processResult, afterQuality, runConfig) {
      const procStats = processResult?.summary?.stats || processResult?.data?.summary?.stats || {};
      const beforeStats = beforeQuality?.summary?.stats || beforeQuality?.data?.summary?.stats || {};
      const afterStats = afterQuality?.summary?.stats || afterQuality?.data?.summary?.stats || {};
      const outlierMetric = runConfig?.method === "zscore" ? "z_outliers" : "iqr_outliers";
      const outlierMetricLabel = runConfig?.method === "zscore" ? "Z-score" : "IQR";
      const beforeOutlierTbl = this.getNamedTable(beforeQuality, "outlier_summary");
      const afterOutlierTbl = this.getNamedTable(afterQuality, "outlier_summary");
      const procOutlierTbl = this.getNamedTable(processResult, "quality_process_summary");

      const rowsBefore = this.toFiniteNumber(procStats.rows_before) ?? this.toFiniteNumber(beforeStats.rows) ?? this.toFiniteNumber(runConfig?.rowsBefore) ?? 0;
      const rowsAfter = this.toFiniteNumber(procStats.rows_after) ?? this.toFiniteNumber(afterStats.rows) ?? rowsBefore;
      const rowsRemoved = this.toFiniteNumber(procStats.rows_removed) ?? Math.max(0, rowsBefore - rowsAfter);
      const missingRowsBefore = this.toFiniteNumber(procStats.rows_with_missing_before) ?? this.toFiniteNumber(beforeStats.rows_with_missing) ?? 0;
      const missingRowsAfter = this.toFiniteNumber(procStats.rows_with_missing_after) ?? this.toFiniteNumber(afterStats.rows_with_missing) ?? 0;
      const outlierRowsBefore = this.toFiniteNumber(procStats.outlier_rows_before) ?? null;
      const outlierRowsAfter = this.toFiniteNumber(procStats.outlier_rows_after) ?? null;
      const outliersBefore = this.sumNumericColumn(beforeOutlierTbl, [outlierMetric]);
      const outliersAfter = this.sumNumericColumn(afterOutlierTbl, [outlierMetric]);
      const outliersFromProcess = this.sumNumericColumn(procOutlierTbl, ["outlier_count"]);
      const outlierValuesBefore = this.toFiniteNumber(procStats.outlier_value_count_before) ?? outliersBefore ?? outliersFromProcess ?? 0;
      const outlierValuesAfter = this.toFiniteNumber(procStats.outlier_value_count_after) ?? outliersAfter ?? null;
      const targetColumns = Array.isArray(runConfig?.columns) && runConfig.columns.length ? runConfig.columns : [];
      const columnDeltas = (() => {
        const cols = Array.isArray(procOutlierTbl?.columns) ? procOutlierTbl.columns : [];
        const rows = Array.isArray(procOutlierTbl?.rows) ? procOutlierTbl.rows : [];
        if (!cols.length || !rows.length) return [];
        const cIdx = cols.findIndex((c) => String(c) === "column");
        const bIdx = cols.findIndex((c) => String(c) === "outlier_count_before");
        const aIdx = cols.findIndex((c) => String(c) === "outlier_count_after");
        const dIdx = cols.findIndex((c) => String(c) === "outlier_count_delta");
        if (cIdx < 0 || bIdx < 0 || aIdx < 0) return [];
        return rows
          .map((r) => ({
            column: String(r?.[cIdx] ?? ""),
            outlierBefore: this.toFiniteNumber(r?.[bIdx]) ?? 0,
            outlierAfter: this.toFiniteNumber(r?.[aIdx]) ?? 0,
            outlierDelta: dIdx >= 0 ? (this.toFiniteNumber(r?.[dIdx]) ?? 0) : ((this.toFiniteNumber(r?.[aIdx]) ?? 0) - (this.toFiniteNumber(r?.[bIdx]) ?? 0)),
          }))
          .filter((r) => r.column);
      })();

      return {
        method: runConfig?.method || "iqr",
        strategy: runConfig?.strategy || "exclude",
        generatedAt: new Date().toLocaleString(),
        rowsBefore,
        rowsAfter,
        rowsRemoved,
        missingRowsBefore,
        missingRowsAfter,
        outlierRowsBefore,
        outlierRowsAfter,
        outliersBefore: outlierValuesBefore,
        outliersAfter: outlierValuesAfter,
        outlierMetricLabel,
        targetColumnsLabel: targetColumns.length ? targetColumns.join(", ") : "All numeric columns",
        columnDeltas,
      };
    },
    projectMiniScatter(points, width = 220, height = 120) {
      const src = Array.isArray(points) ? points : [];
      if (!src.length) return [];
      const maxPoints = 180;
      const sample = src.length > maxPoints
        ? src.filter((_, i) => i % Math.ceil(src.length / maxPoints) === 0).slice(0, maxPoints)
        : src;
      const xs = sample.map((p) => p.x);
      const ys = sample.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const pad = 8;
      const spanX = Math.max(maxX - minX, 1e-9);
      const spanY = Math.max(maxY - minY, 1e-9);
      return sample.map((p) => ({
        x: pad + ((p.x - minX) / spanX) * (width - pad * 2),
        y: height - pad - ((p.y - minY) / spanY) * (height - pad * 2),
      }));
    },
    async loadCapabilities() {
      this.capLoading = true;
      this.capError = "";
      try {
        this.statCaps = await getStatCapabilities();
      } catch (e) {
        this.statCaps = null;
        this.capError = e?.message || "Failed to load stat capabilities.";
      }

      try {
        const key = localStorage.getItem("beta_api_key") || "";
        const res = await fetch("/ml/capabilities", {
          method: "GET",
          headers: {
            ...(key ? { "X-API-Key": key } : {}),
          },
        });
        const payload = await res.json();
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Failed to load ML capabilities.");
        }
        this.mlCaps = payload?.data || null;
      } catch (e) {
        this.mlCaps = null;
        if (!this.capError) this.capError = e?.message || "Failed to load ML capabilities.";
      } finally {
        this.capLoading = false;
      }
    },
    setDefaultSelections() {
      if (!this.selectedColumn && this.effectiveColumns.length) this.selectedColumn = this.effectiveColumns[0];
      if (!this.tValueCol || !this.numericColumns.includes(this.tValueCol)) this.tValueCol = this.numericColumns[0] || "";
      if (!this.tGroupCol || !this.categoricalColumns.includes(this.tGroupCol)) this.tGroupCol = this.categoricalColumns[0] || "";

      if (!this.chiColA || !this.categoricalColumns.includes(this.chiColA)) this.chiColA = this.categoricalColumns[0] || "";
      if (!this.chiColB || !this.categoricalColumns.includes(this.chiColB) || this.chiColB === this.chiColA) {
        const fallback = this.categoricalColumns.find((c) => c !== this.chiColA);
        this.chiColB = fallback || "";
      }

      if (!this.olsTargetCol || !this.numericColumns.includes(this.olsTargetCol)) this.olsTargetCol = this.numericColumns[0] || "";
      const validFeatureSet = new Set(this.numericColumns.filter((c) => c !== this.olsTargetCol));
      this.olsFeatureCols = (this.olsFeatureCols || []).filter((c) => validFeatureSet.has(c));
      if (!this.olsFeatureCols.length) this.olsFeatureCols = this.numericColumns.filter((c) => c !== this.olsTargetCol).slice(0, 3);

      if (!this.anovaValueCol || !this.numericColumns.includes(this.anovaValueCol)) this.anovaValueCol = this.numericColumns[0] || "";
      if (!this.anovaGroupCol || !this.categoricalColumns.includes(this.anovaGroupCol)) this.anovaGroupCol = this.categoricalColumns[0] || "";

      if (!this.normalityCol || !this.numericColumns.includes(this.normalityCol)) this.normalityCol = this.numericColumns[0] || "";
      if (!this.ciValueCol || !this.numericColumns.includes(this.ciValueCol)) this.ciValueCol = this.numericColumns[0] || "";

      if (!this.mwValueCol || !this.numericColumns.includes(this.mwValueCol)) this.mwValueCol = this.numericColumns[0] || "";
      if (!this.mwGroupCol || !this.categoricalColumns.includes(this.mwGroupCol)) this.mwGroupCol = this.categoricalColumns[0] || "";

      if (!this.wilcoxonColA || !this.numericColumns.includes(this.wilcoxonColA)) this.wilcoxonColA = this.numericColumns[0] || "";
      if (!this.wilcoxonColB || !this.numericColumns.includes(this.wilcoxonColB) || this.wilcoxonColB === this.wilcoxonColA) {
        const fallbackB = this.numericColumns.find((c) => c !== this.wilcoxonColA);
        this.wilcoxonColB = fallbackB || "";
      }

      if (!this.kruskalValueCol || !this.numericColumns.includes(this.kruskalValueCol)) this.kruskalValueCol = this.numericColumns[0] || "";
      if (!this.kruskalGroupCol || !this.categoricalColumns.includes(this.kruskalGroupCol)) this.kruskalGroupCol = this.categoricalColumns[0] || "";

      if (!this.recommendValueCol || !this.numericColumns.includes(this.recommendValueCol)) this.recommendValueCol = this.numericColumns[0] || "";
      if (!this.recommendGroupCol || !this.categoricalColumns.includes(this.recommendGroupCol)) this.recommendGroupCol = this.categoricalColumns[0] || "";
      if (!this.recommendColA || !this.effectiveColumns.includes(this.recommendColA)) this.recommendColA = this.effectiveColumns[0] || "";
      if (!this.recommendColB || !this.effectiveColumns.includes(this.recommendColB) || this.recommendColB === this.recommendColA) {
        const fallbackC = this.effectiveColumns.find((c) => c !== this.recommendColA);
        this.recommendColB = fallbackC || "";
      }

      if (this.qualityTargetCol && !this.numericColumns.includes(this.qualityTargetCol)) this.qualityTargetCol = "";
    },
    async runWithResult(action, runner) {
      if (!this.hasDataset) {
        this.errorMessage = "No dataset found. Load a dataset first in /legacy/file.";
        return;
      }
      this.loadingAction = action;
      this.errorMessage = "";
      try {
        const data = await runner();
        this.resultObj = data;
        this.result = JSON.stringify(data, null, 2);
        this.resultView = this.resultTables.length ? "table" : "raw";
        this.resultAt = new Date().toLocaleString();
        this.updateSessionFdr(data, action);
      } catch (error) {
        this.resultObj = null;
        this.result = null;
        this.errorMessage = error?.message || `${action} failed.`;
      } finally {
        this.loadingAction = "";
      }
    },
    clearResult() {
      this.resultObj = null;
      this.result = null;
      this.resultView = "raw";
      this.errorMessage = "";
      this.resultAt = "";
    },
    resetLegacyDataset() {
      this.handleDatasetChangeForFdr([], []);
      localStorage.removeItem(LEGACY_DATA_KEY);
      localStorage.removeItem(LEGACY_QUALITY_SNAPSHOT_KEY);
      this.clearResult();
      this.selectedColumn = null;
      this.refreshQualityUndoAvailable();
      this.$router.push("/legacy/file");
    },
    async copyResult() {
      if (!this.result) return;
      try {
        await navigator.clipboard.writeText(this.result);
      } catch {
        this.errorMessage = "Failed to copy result to clipboard.";
      }
    },
    downloadBlob(content, filename, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    csvLine(values) {
      return (values || [])
        .map((v) => {
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",");
    },
    downloadResultJson() {
      if (!this.result) return;
      this.downloadBlob(
        this.result,
        `legacy-stat-${Date.now()}.json`,
        "application/json;charset=utf-8",
      );
    },
    downloadResultTablesCsv() {
      if (!this.hasResultTables) return;
      const lines = [];
      this.resultTables.forEach((t) => {
        lines.push(`# ${t.name}`);
        lines.push(this.csvLine(t.columns));
        t.rows.forEach((row) => lines.push(this.csvLine(row)));
        lines.push("");
      });
      this.downloadBlob(
        lines.join("\n"),
        `legacy-stat-tables-${Date.now()}.csv`,
        "text/csv;charset=utf-8",
      );
    },
    escapeHtml(value) {
      const s = value == null ? "" : String(value);
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
    reportCell(value) {
      if (value == null) return "";
      if (typeof value === "object") {
        try {
          return this.escapeHtml(JSON.stringify(value));
        } catch {
          return this.escapeHtml(String(value));
        }
      }
      return this.escapeHtml(String(value));
    },
    buildResultReportHtml() {
      const obj = this.resultObj || {};
      const summary = obj.summary || obj.data?.summary || {};
      const inputs = obj.inputs || obj.data?.inputs || {};
      const warnings = Array.isArray(obj.warnings) ? obj.warnings : (Array.isArray(obj.data?.warnings) ? obj.data.warnings : []);
      const statsEntries = Object.entries(summary?.stats || {});
      const recommendations = this.recommendationItems || [];
      const fdrRowsData = this.sessionFdrRows || [];
      const qualityDelta = this.qualityProcessCompare || null;
      const generatedAt = this.resultAt || new Date().toLocaleString();

      const inputRows = Object.entries(inputs || {})
        .map(([k, v]) => `<tr><th>${this.escapeHtml(k)}</th><td>${this.reportCell(v)}</td></tr>`)
        .join("");

      const statRows = statsEntries
        .map(([k, v]) => `<tr><th>${this.escapeHtml(k)}</th><td>${this.reportCell(v)}</td></tr>`)
        .join("");

      const warnRows = warnings
        .map((w) => `<li>${this.escapeHtml(w)}</li>`)
        .join("");

      const recRows = recommendations
        .map((r, idx) => {
          const chart = r?.chart || {};
          const args = r?.args || {};
          return `<tr>
            <td>${idx + 1}</td>
            <td>${this.escapeHtml(r?.op || "")}</td>
            <td>${this.escapeHtml(r?.label || "")}</td>
            <td>${this.escapeHtml(r?.reason || "")}</td>
            <td>${this.escapeHtml(chart?.type || "")}</td>
            <td><code>${this.escapeHtml(JSON.stringify(args))}</code></td>
          </tr>`;
        })
        .join("");

      const fdrRows = fdrRowsData
        .map((r, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${this.escapeHtml(r.source || "")}</td>
          <td>${this.reportCell(r.p_raw)}</td>
          <td>${this.reportCell(r.p_fdr)}</td>
          <td>${this.reportCell(r.at)}</td>
        </tr>`)
        .join("");

      const qualityDeltaRows = qualityDelta
        ? [
            ["method", qualityDelta.method],
            ["strategy", qualityDelta.strategy],
            ["rows_before", qualityDelta.rowsBefore],
            ["rows_after", qualityDelta.rowsAfter],
            ["rows_removed", qualityDelta.rowsRemoved],
            ["missing_rows_before", qualityDelta.missingRowsBefore],
            ["missing_rows_after", qualityDelta.missingRowsAfter],
            ["outlier_rows_before", qualityDelta.outlierRowsBefore],
            ["outlier_rows_after", qualityDelta.outlierRowsAfter],
            [`outliers_before (${qualityDelta.outlierMetricLabel})`, qualityDelta.outliersBefore],
            [`outliers_after (${qualityDelta.outlierMetricLabel})`, qualityDelta.outliersAfter],
            ["target_columns", qualityDelta.targetColumnsLabel],
            ["generated_at", qualityDelta.generatedAt],
          ]
            .map(([k, v]) => `<tr><th>${this.escapeHtml(String(k))}</th><td>${this.reportCell(v)}</td></tr>`)
            .join("")
        : "";
      const qualityDeltaColumnRows = qualityDelta && Array.isArray(qualityDelta.columnDeltas)
        ? qualityDelta.columnDeltas
            .map((r) => `<tr>
              <td>${this.escapeHtml(String(r.column || ""))}</td>
              <td>${this.reportCell(r.outlierBefore)}</td>
              <td>${this.reportCell(r.outlierAfter)}</td>
              <td>${this.reportCell(r.outlierDelta)}</td>
            </tr>`)
            .join("")
        : "";

      const tableBlocks = this.resultTables
        .map((t) => {
          const head = (t.columns || [])
            .map((c) => `<th>${this.escapeHtml(c)}</th>`)
            .join("");
          const body = (t.rows || [])
            .map((r) => `<tr>${(r || []).map((c) => `<td>${this.reportCell(c)}</td>`).join("")}</tr>`)
            .join("");
          return `
            <h3>${this.escapeHtml(t.name || "table")}</h3>
            <div class="table-wrap">
              <table>
                <thead><tr>${head}</tr></thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          `;
        })
        .join("");

      const title = this.escapeHtml(summary?.title || `Stat Result (${obj?.op || obj?.data?.op || "unknown"})`);
      const conclusion = this.escapeHtml(summary?.conclusion || "");

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stat Report</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color:#111827; }
    h1 { margin:0 0 8px; font-size: 24px; }
    h2 { margin:24px 0 8px; font-size: 18px; }
    h3 { margin:18px 0 8px; font-size: 15px; }
    .meta { color:#4b5563; font-size:12px; margin-bottom:16px; }
    .box { border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:12px; background:#f9fafb; }
    table { border-collapse: collapse; width:100%; font-size:12px; }
    th, td { border:1px solid #e5e7eb; padding:6px 8px; text-align:left; vertical-align:top; }
    th { background:#f3f4f6; }
    .table-wrap { overflow:auto; max-height:420px; }
    code { background:#f3f4f6; padding:1px 4px; border-radius:4px; }
    ul { margin:6px 0 0 18px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">Generated at: ${this.escapeHtml(generatedAt)} | op: ${this.escapeHtml(obj?.op || obj?.data?.op || "")}</div>

  <div class="box">
    <h2>Conclusion</h2>
    <div>${conclusion || "n/a"}</div>
  </div>

  <div class="box">
    <h2>Inputs</h2>
    ${inputRows ? `<table><tbody>${inputRows}</tbody></table>` : "<div>n/a</div>"}
  </div>

  <div class="box">
    <h2>Summary Stats</h2>
    ${statRows ? `<table><tbody>${statRows}</tbody></table>` : "<div>n/a</div>"}
  </div>

  <div class="box">
    <h2>Warnings</h2>
    ${warnRows ? `<ul>${warnRows}</ul>` : "<div>none</div>"}
  </div>

  ${recRows ? `
  <div class="box">
    <h2>Recommendations</h2>
    <table>
      <thead>
        <tr><th>#</th><th>op</th><th>label</th><th>reason</th><th>chart</th><th>args</th></tr>
      </thead>
      <tbody>${recRows}</tbody>
    </table>
  </div>` : ""}

  ${fdrRows ? `
  <div class="box">
    <h2>Session FDR (BH, alpha=${this.escapeHtml(this.sessionFdrAlphaLabel)})</h2>
    <table>
      <thead>
        <tr><th>#</th><th>source</th><th>p_raw</th><th>p_fdr</th><th>at</th></tr>
      </thead>
      <tbody>${fdrRows}</tbody>
    </table>
  </div>` : ""}

  ${qualityDeltaRows ? `
  <div class="box">
    <h2>Quality Process Delta</h2>
    <table><tbody>${qualityDeltaRows}</tbody></table>
    ${qualityDeltaColumnRows ? `
    <h3>Column Outlier Delta</h3>
    <table>
      <thead><tr><th>column</th><th>before</th><th>after</th><th>delta</th></tr></thead>
      <tbody>${qualityDeltaColumnRows}</tbody>
    </table>` : ""}
  </div>` : ""}

  <div class="box">
    <h2>Result Tables</h2>
    ${tableBlocks || "<div>n/a</div>"}
  </div>
</body>
</html>`;
    },
    downloadResultReport() {
      if (!this.resultObj) return;
      const html = this.buildResultReportHtml();
      this.downloadBlob(
        `\ufeff${html}`,
        `legacy-stat-report-${Date.now()}.html`,
        "text/html;charset=utf-8",
      );
    },
    isRawPKey(key) {
      const k = String(key || "").toLowerCase();
      return k === "p" || k === "p_raw" || k.endsWith("_p");
    },
    toProb(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      if (n < 0 || n > 1) return null;
      return n;
    },
    collectRawPValues(obj, action) {
      const rows = [];
      const sourcePrefix = String(action || obj?.op || obj?.data?.op || "stat");
      const summaryStats = obj?.summary?.stats || obj?.data?.summary?.stats || {};
      Object.entries(summaryStats).forEach(([k, v]) => {
        if (!this.isRawPKey(k)) return;
        const p = this.toProb(v);
        if (p == null) return;
        rows.push({ source: `${sourcePrefix}.summary.${k}`, p_raw: p });
      });

      const tables = [];
      if (Array.isArray(obj?.tables)) tables.push(...obj.tables);
      if (Array.isArray(obj?.data?.tables)) tables.push(...obj.data.tables);
      tables.forEach((t) => {
        const cols = Array.isArray(t?.columns) ? t.columns : [];
        const pIdx = cols
          .map((c, i) => ({ i, c }))
          .filter((x) => this.isRawPKey(x.c))
          .map((x) => x.i);
        if (!pIdx.length) return;
        (t.rows || []).forEach((r, ridx) => {
          pIdx.forEach((ci) => {
            const p = this.toProb(r?.[ci]);
            if (p == null) return;
            rows.push({ source: `${sourcePrefix}.${t.name || "table"}[${ridx}].${cols[ci]}`, p_raw: p });
          });
        });
      });
      return rows;
    },
    applySessionFdrBH(history) {
      const alpha = this.normalizeFdrAlpha(this.sessionFdrAlpha);
      const arr = [...history];
      const indexed = arr.map((r, idx) => ({ idx, p: Number(r.p_raw) })).filter((x) => Number.isFinite(x.p));
      indexed.sort((a, b) => a.p - b.p);
      const n = indexed.length || 1;
      let runningMin = 1;
      for (let i = indexed.length - 1; i >= 0; i -= 1) {
        const rank = i + 1;
        const raw = indexed[i].p;
        const adj = Math.min(runningMin, (raw * n) / rank);
        runningMin = adj;
        arr[indexed[i].idx].p_fdr = adj;
      }
      return arr.map((r) => ({
        ...r,
        p_fdr: Number.isFinite(Number(r.p_fdr)) ? Number(r.p_fdr) : null,
        sig_raw: Number.isFinite(Number(r.p_raw)) ? Number(r.p_raw) < alpha : false,
        sig_fdr: Number.isFinite(Number(r.p_fdr)) ? Number(r.p_fdr) < alpha : false,
      }));
    },
    updateSessionFdr(obj, action) {
      const added = this.collectRawPValues(obj, action);
      if (!added.length) return;
      const now = new Date().toLocaleString();
      const merged = [
        ...this.sessionPHistory,
        ...added.map((r, i) => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          source: r.source,
          p_raw: r.p_raw,
          p_fdr: null,
          sig_raw: false,
          sig_fdr: false,
          at: now,
        })),
      ];
      this.sessionPHistory = this.applySessionFdrBH(merged);
      this.persistSessionFdr();
    },
    clearSessionFdr() {
      this.sessionPHistory = [];
      this.persistSessionFdr();
    },
    async doQualityCheck() {
      const columns = this.qualityTargetCol ? [this.qualityTargetCol] : this.numericColumns;
      await this.runWithResult("quality", async () => {
        return statQuality({
          rows: this.effectiveRows,
          columns,
          method: this.qualityMethod,
          iqrK: this.qualityIqrK,
          zThresh: this.qualityZThresh,
        });
      });
    },
    applyProcessedDataset(obj) {
      const rows = obj?.data?.rows;
      const columns = obj?.data?.columns;
      if (!Array.isArray(rows) || !rows.length || !Array.isArray(columns) || !columns.length) return false;
      this.handleDatasetChangeForFdr(columns, rows);
      localStorage.setItem(LEGACY_DATA_KEY, JSON.stringify({ columns, rows }));
      this.setDefaultSelections();
      return true;
    },
    async doQualityProcess() {
      const columns = this.qualityTargetCol ? [this.qualityTargetCol] : this.numericColumns;
      const preSnapshot = this.buildCurrentDatasetSnapshot();
      const runConfig = {
        method: this.qualityMethod,
        strategy: this.qualityStrategy,
        iqrK: this.qualityIqrK,
        zThresh: this.qualityZThresh,
        dropMissing: this.qualityDropMissing,
        columns: [...columns],
        rowsBefore: this.effectiveRows.length,
      };

      await this.runWithResult("quality_process", async () => {
        return statQualityProcess({
          rows: this.effectiveRows,
          strategy: runConfig.strategy,
          method: runConfig.method,
          columns,
          iqrK: runConfig.iqrK,
          zThresh: runConfig.zThresh,
          dropMissing: runConfig.dropMissing,
        });
      });
      const processResult = this.resultObj;

      const ok = this.applyProcessedDataset(processResult);
      if (ok) {
        if (preSnapshot) this.saveQualityUndoSnapshot(preSnapshot);
        this.errorMessage = "";
        this.qualityProcessCompare = this.buildQualityProcessCompare(null, processResult, null, runConfig);
      }
    },
    openResultInGraph() {
      if (!this.hasDataset || !this.effectiveColumns.length) return;
      if (!window.confirm("Open Graph view with the current statistics context?")) return;

      const op = this.resultObj?.op || this.resultObj?.data?.op || "";
      const resultInputs = this.resultObj?.inputs || this.resultObj?.data?.inputs || {};
      const numeric = this.numericColumns || [];
      const categorical = this.categoricalColumns || [];
      let graphType = "histogram";
      let x = this.selectedColumn || numeric[0] || this.effectiveColumns[0] || "";
      let y = "";

      if (op === "ttest") {
        graphType = "bar";
        x = this.tGroupCol || categorical[0] || this.effectiveColumns[0] || "";
        y = this.tValueCol || numeric[0] || "";
      } else if (op === "corr") {
        graphType = "scatter";
        x = numeric[0] || this.effectiveColumns[0] || "";
        y = numeric[1] || "";
      } else if (op === "ols") {
        graphType = "scatter";
        x = this.olsFeatureCols?.[0] || numeric[0] || this.effectiveColumns[0] || "";
        y = this.olsTargetCol || numeric[1] || "";
      } else if (op === "chisq") {
        graphType = "bar";
        x = this.chiColA || categorical[0] || this.effectiveColumns[0] || "";
        y = numeric[0] || "";
      } else if (op === "anova" || op === "tukey" || op === "pairwise_adjusted" || op === "mannwhitney" || op === "kruskal") {
        graphType = "box";
        x = String(resultInputs.group || this.anovaGroupCol || this.mwGroupCol || this.kruskalGroupCol || categorical[0] || this.effectiveColumns[0] || "");
        y = String(resultInputs.value || this.anovaValueCol || this.mwValueCol || this.kruskalValueCol || numeric[0] || "");
      } else if (op === "wilcoxon") {
        graphType = "scatter";
        x = String(resultInputs.a || this.wilcoxonColA || numeric[0] || this.effectiveColumns[0] || "");
        y = String(resultInputs.b || this.wilcoxonColB || numeric[1] || "");
      } else if (op === "normality" || op === "ci_mean") {
        graphType = "histogram";
        x = String(resultInputs.column || this.normalityCol || this.ciValueCol || numeric[0] || this.effectiveColumns[0] || "");
        y = "";
      } else if (op === "quality" || op === "quality_process") {
        graphType = "histogram";
        x = String((resultInputs.columns || [])[0] || this.qualityTargetCol || numeric[0] || this.effectiveColumns[0] || "");
        y = "";
      }

      if (!x) {
        this.errorMessage = "No valid X-axis column found for graph handoff.";
        return;
      }
      if (graphType !== "histogram" && !y) {
        graphType = "histogram";
      }

      localStorage.setItem(LEGACY_GRAPH_PREF_KEY, JSON.stringify({
        graphType,
        x,
        y: graphType === "histogram" ? "" : y,
      }));
      this.$router.push("/legacy/graph?from=stat&autogen=1");
    },
    rowToObject(table, row) {
      const out = {};
      (table?.columns || []).forEach((c, i) => {
        out[c] = row?.[i];
      });
      return out;
    },
    isValidDataColumn(col) {
      return typeof col === "string" && this.effectiveColumns.includes(col);
    },
    isNumericDataColumn(col) {
      return typeof col === "string" && this.numericColumns.includes(col);
    },
    resolveCoefTermColumn(termRaw) {
      const term = String(termRaw || "").trim();
      if (!term || term === "const" || term === "Intercept") return "";
      if (this.isValidDataColumn(term)) return term;

      const bracketMatch = term.match(/^(.+?)\[T\..+\]$/);
      if (bracketMatch?.[1] && this.isValidDataColumn(bracketMatch[1])) return bracketMatch[1];

      const interactionBase = term.split(":")[0];
      if (this.isValidDataColumn(interactionBase)) return interactionBase;

      const byPrefix = [...this.effectiveColumns]
        .sort((a, b) => b.length - a.length)
        .find((c) => term.startsWith(`${c}_`) || term.startsWith(`${c}[`) || term.startsWith(`${c}:`));

      return byPrefix || "";
    },
    graphPrefFromTableRow(table, row) {
      const tableName = String(table?.name || "");
      const op = this.resultObj?.op || this.resultObj?.data?.op || "";
      const rowObj = this.rowToObject(table, row);
      const resultInputs = this.resultObj?.inputs || this.resultObj?.data?.inputs || {};

      const groupedValuePref = () => {
        const x = String(resultInputs.group || this.anovaGroupCol || this.mwGroupCol || this.kruskalGroupCol || this.tGroupCol || this.categoricalColumns[0] || "");
        const y = String(resultInputs.value || this.anovaValueCol || this.mwValueCol || this.kruskalValueCol || this.tValueCol || this.olsTargetCol || this.numericColumns[0] || "");
        if (this.isValidDataColumn(x) && this.isValidDataColumn(y)) {
          return { graphType: "box", x, y };
        }
        return null;
      };

      if (tableName === "top_pairs") {
        const x = String(rowObj.col_a || "");
        const y = String(rowObj.col_b || "");
        if (this.isValidDataColumn(x) && this.isValidDataColumn(y)) {
          return { graphType: "scatter", x, y };
        }
      }

      if (tableName === "coef_table") {
        const term = String(rowObj.term || "");
        const mappedTermCol = this.resolveCoefTermColumn(term);
        const x = mappedTermCol
          || this.olsFeatureCols.find((c) => this.isValidDataColumn(c))
          || this.numericColumns.find((c) => c !== this.olsTargetCol)
          || "";
        const y = this.olsTargetCol || this.numericColumns.find((c) => c !== x) || "";
        if (this.isValidDataColumn(x) && this.isValidDataColumn(y)) {
          const graphType = this.isNumericDataColumn(x) && this.isNumericDataColumn(y) ? "scatter" : "bar";
          return { graphType, x, y };
        }
      }

      if (tableName === "group_summary" && op === "ttest") {
        const x = this.tGroupCol || this.categoricalColumns[0] || "";
        const y = this.tValueCol || this.numericColumns[0] || "";
        if (this.isValidDataColumn(x) && this.isValidDataColumn(y)) {
          return { graphType: "box", x, y };
        }
      }

      if (tableName === "group_summary" && (op === "anova" || op === "mannwhitney" || op === "kruskal")) {
        return groupedValuePref();
      }

      if (tableName === "anova_table" && op === "anova") {
        return groupedValuePref();
      }

      if (tableName === "tukey_pairs" && op === "tukey") {
        const g1 = String(rowObj.group1 || "");
        const g2 = String(rowObj.group2 || "");
        if (g1 && g2) {
          return groupedValuePref();
        }
      }

      if (tableName === "pairwise_adjusted" && op === "pairwise_adjusted") {
        const g1 = String(rowObj.group1 || "");
        const g2 = String(rowObj.group2 || "");
        if (g1 && g2) {
          return groupedValuePref();
        }
      }

      if (tableName === "pair_summary" && op === "wilcoxon") {
        const x = String(resultInputs.a || this.wilcoxonColA || this.numericColumns[0] || "");
        const y = String(resultInputs.b || this.wilcoxonColB || this.numericColumns.find((c) => c !== x) || "");
        if (this.isValidDataColumn(x) && this.isValidDataColumn(y)) {
          return { graphType: "scatter", x, y };
        }
      }

      if (tableName === "normality_stats" && op === "normality") {
        const x = String(resultInputs.column || this.normalityCol || this.numericColumns[0] || "");
        if (this.isValidDataColumn(x)) {
          return { graphType: "histogram", x, y: "" };
        }
      }

      if (tableName === "mean_ci" && op === "ci_mean") {
        const x = String(resultInputs.column || this.ciValueCol || this.numericColumns[0] || "");
        if (this.isValidDataColumn(x)) {
          return { graphType: "histogram", x, y: "" };
        }
      }

      if ((op === "quality" || op === "quality_process") && tableName === "outlier_summary") {
        const x = String(rowObj.column || this.qualityTargetCol || this.numericColumns[0] || "");
        if (this.isValidDataColumn(x)) {
          return { graphType: "histogram", x, y: "" };
        }
      }

      return null;
    },
    isTableRowGraphMappable(table, row) {
      return !!this.graphPrefFromTableRow(table, row);
    },
    openTableRowInGraph(table, row) {
      if (!this.hasDataset) return;
      const pref = this.graphPrefFromTableRow(table, row);
      if (!pref) {
        this.errorMessage = "This row cannot be mapped to graph axes automatically.";
        return;
      }
      localStorage.setItem(LEGACY_GRAPH_PREF_KEY, JSON.stringify(pref));
      this.$router.push("/legacy/graph?from=stat-row&autogen=1");
    },
    async runBasicStat() {
      await this.runWithResult("basic", async () => {
        return statSummary({
          rows: this.effectiveRows,
          ...(this.selectedColumn ? { column: this.selectedColumn } : {}),
        });
      });
    },

    async runDistribution() {
      await this.runWithResult("distribution", async () => {
        const data = await statSummary({
          rows: this.effectiveRows,
          ...(this.selectedColumn ? { column: this.selectedColumn } : {}),
        });
        return {
          notice: "Legacy distribution image endpoint is deprecated. Showing /stat/run summary instead.",
          data,
        };
      });
    },

    async runCorrelation() {
      await this.runWithResult("correlation", async () => {
        return statCorr({
          rows: this.effectiveRows,
          ...(this.selectedColumn ? { column: this.selectedColumn } : {}),
        });
      });
    },

    async doRecommend() {
      await this.runWithResult("recommend", async () => {
        return statRecommend({
          rows: this.effectiveRows,
          goal: this.recommendGoal,
          valueCol: this.recommendValueCol || undefined,
          groupCol: this.recommendGroupCol || undefined,
          colA: this.recommendColA || undefined,
          colB: this.recommendColB || undefined,
        });
      });
    },

    async runRecommendedTest(rec) {
      const op = rec?.op;
      const args = rec?.args || {};

      if (op === "describe") return this.runBasicStat();
      if (op === "corr") return this.runCorrelation();

      if (op === "ttest") {
        this.tValueCol = args.value || this.tValueCol;
        this.tGroupCol = args.group || this.tGroupCol;
        return this.doTtest();
      }
      if (op === "mannwhitney") {
        this.mwValueCol = args.value || this.mwValueCol;
        this.mwGroupCol = args.group || this.mwGroupCol;
        return this.doMannWhitney();
      }
      if (op === "anova") {
        this.anovaValueCol = args.value || this.anovaValueCol;
        this.anovaGroupCol = args.group || this.anovaGroupCol;
        return this.doAnova();
      }
      if (op === "kruskal") {
        this.kruskalValueCol = args.value || this.kruskalValueCol;
        this.kruskalGroupCol = args.group || this.kruskalGroupCol;
        return this.doKruskal();
      }
      if (op === "tukey") {
        this.anovaValueCol = args.value || this.anovaValueCol;
        this.anovaGroupCol = args.group || this.anovaGroupCol;
        if (Number.isFinite(Number(args.alpha))) this.posthocAlpha = Number(args.alpha);
        return this.doTukey();
      }
      if (op === "pairwise_adjusted") {
        this.anovaValueCol = args.value || this.anovaValueCol;
        this.anovaGroupCol = args.group || this.anovaGroupCol;
        this.posthocAdjust = args.pAdjust || this.posthocAdjust;
        return this.doPairwiseAdjusted();
      }
      if (op === "chisq") {
        this.chiColA = args.a || this.chiColA;
        this.chiColB = args.b || this.chiColB;
        return this.doChi2();
      }
      if (op === "ols") {
        this.olsTargetCol = args.y || this.olsTargetCol;
        this.olsFeatureCols = Array.isArray(args.x) ? args.x.filter((c) => c !== this.olsTargetCol) : this.olsFeatureCols;
        return this.doLinReg();
      }
      if (op === "normality") {
        this.normalityCol = args.column || this.normalityCol;
        return this.doNormality();
      }
      if (op === "ci_mean") {
        this.ciValueCol = args.column || this.ciValueCol;
        if (Number.isFinite(Number(args.confidence))) this.ciLevel = Number(args.confidence);
        return this.doMeanCI();
      }
      if (op === "wilcoxon") {
        this.wilcoxonColA = args.a || this.wilcoxonColA;
        this.wilcoxonColB = args.b || this.wilcoxonColB;
        return this.doWilcoxon();
      }

      this.errorMessage = `Unsupported recommended test: ${String(op || "")}`;
      return null;
    },

    async doTtest() {
      const valueCol = this.tValueCol || this.selectedColumn || this.numericColumns[0];
      const groupCol = this.tGroupCol || this.categoricalColumns[0];
      if (!valueCol || !groupCol) {
        this.errorMessage = "Need one numeric column and one categorical column for t-test.";
        return;
      }
      await this.runWithResult("ttest", async () => {
        return statTtest({
          rows: this.effectiveRows,
          valueCol,
          groupCol,
        });
      });
    },

    async doChi2() {
      const a = this.chiColA || this.categoricalColumns[0];
      const b = this.chiColB || this.categoricalColumns.find((c) => c !== a);
      if (!a || !b || a === b) {
        this.errorMessage = "Need two different categorical columns for Chi-square.";
        return;
      }
      await this.runWithResult("chi2", async () => {
        return statChi2({
          rows: this.effectiveRows,
          colA: a,
          colB: b,
        });
      });
    },

    async doLinReg() {
      const y = this.olsTargetCol || this.selectedColumn || this.numericColumns[0];
      const x = (this.olsFeatureCols || []).filter((c) => c !== y);
      if (!y || !x.length) {
        this.errorMessage = "Need one numeric target and at least one predictor for linear regression.";
        return;
      }
      await this.runWithResult("linreg", async () => {
        return statLinReg({
          rows: this.effectiveRows,
          target: y,
          features: x,
        });
      });
    },

    async doAnova() {
      const valueCol = this.anovaValueCol || this.numericColumns[0];
      const groupCol = this.anovaGroupCol || this.categoricalColumns[0];
      if (!valueCol || !groupCol) {
        this.errorMessage = "Need one numeric column and one categorical column for ANOVA.";
        return;
      }
      await this.runWithResult("anova", async () => {
        return statAnova({
          rows: this.effectiveRows,
          valueCol,
          groupCol,
        });
      });
    },

    async doTukey() {
      const valueCol = this.anovaValueCol || this.numericColumns[0];
      const groupCol = this.anovaGroupCol || this.categoricalColumns[0];
      if (!valueCol || !groupCol) {
        this.errorMessage = "Need one numeric column and one categorical column for Tukey.";
        return;
      }
      await this.runWithResult("tukey", async () => {
        return statTukey({
          rows: this.effectiveRows,
          valueCol,
          groupCol,
          alpha: this.posthocAlpha,
        });
      });
    },

    async doPairwiseAdjusted() {
      const valueCol = this.anovaValueCol || this.numericColumns[0];
      const groupCol = this.anovaGroupCol || this.categoricalColumns[0];
      if (!valueCol || !groupCol) {
        this.errorMessage = "Need one numeric column and one categorical column for pairwise adjusted tests.";
        return;
      }
      await this.runWithResult("pairwise_adjusted", async () => {
        return statPairwiseAdjusted({
          rows: this.effectiveRows,
          valueCol,
          groupCol,
          pAdjust: this.posthocAdjust,
        });
      });
    },

    async doNormality() {
      const column = this.normalityCol || this.numericColumns[0];
      if (!column) {
        this.errorMessage = "Need one numeric column for normality test.";
        return;
      }
      await this.runWithResult("normality", async () => {
        return statNormality({
          rows: this.effectiveRows,
          column,
        });
      });
    },

    async doMeanCI() {
      const column = this.ciValueCol || this.numericColumns[0];
      if (!column) {
        this.errorMessage = "Need one numeric column for mean confidence interval.";
        return;
      }
      await this.runWithResult("ci_mean", async () => {
        return statMeanCI({
          rows: this.effectiveRows,
          column,
          confidence: this.ciLevel,
        });
      });
    },

    async doMannWhitney() {
      const valueCol = this.mwValueCol || this.numericColumns[0];
      const groupCol = this.mwGroupCol || this.categoricalColumns[0];
      if (!valueCol || !groupCol) {
        this.errorMessage = "Need one numeric column and one categorical column for Mann-Whitney.";
        return;
      }
      await this.runWithResult("mannwhitney", async () => {
        return statMannWhitney({
          rows: this.effectiveRows,
          valueCol,
          groupCol,
        });
      });
    },

    async doWilcoxon() {
      const a = this.wilcoxonColA || this.numericColumns[0];
      const b = this.wilcoxonColB || this.numericColumns.find((c) => c !== a);
      if (!a || !b || a === b) {
        this.errorMessage = "Need two different numeric columns for Wilcoxon paired test.";
        return;
      }
      await this.runWithResult("wilcoxon", async () => {
        return statWilcoxon({
          rows: this.effectiveRows,
          colA: a,
          colB: b,
        });
      });
    },

    async doKruskal() {
      const valueCol = this.kruskalValueCol || this.numericColumns[0];
      const groupCol = this.kruskalGroupCol || this.categoricalColumns[0];
      if (!valueCol || !groupCol) {
        this.errorMessage = "Need one numeric column and one categorical column for Kruskal-Wallis.";
        return;
      }
      await this.runWithResult("kruskal", async () => {
        return statKruskal({
          rows: this.effectiveRows,
          valueCol,
          groupCol,
        });
      });
    },
  },
  watch: {
    effectiveColumns: {
      immediate: true,
      handler() {
        this.setDefaultSelections();
      },
    },
    numericColumns() {
      this.setDefaultSelections();
    },
    categoricalColumns() {
      this.setDefaultSelections();
    },
    sessionFdrAlpha(newVal) {
      const normalized = this.normalizeFdrAlpha(newVal);
      if (Number(newVal) !== normalized) {
        this.sessionFdrAlpha = normalized;
        return;
      }
      this.sessionPHistory = this.applySessionFdrBH(this.sessionPHistory || []);
      this.persistSessionFdr();
    },
    sessionFdrAutoResetOnDatasetChange() {
      this.persistSessionFdr();
    },
  },
  mounted() {
    this.refreshQualityUndoAvailable();
    this.loadSessionFdr();
    this.handleDatasetChangeForFdr(this.effectiveColumns, this.effectiveRows);
    this.loadCapabilities();
  },
};
</script>

<style scoped>
.stat-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.subtitle {
  margin-top: -4px;
  color: #666;
  font-size: 13px;
}

.cap-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 10px;
  background: #f9fafb;
  font-size: 12px;
}

.cap-strip a {
  margin-left: auto;
  text-decoration: none;
  color: #1d4ed8;
}

.cap-error {
  font-size: 12px;
  color: #b91c1c;
}

.legacy-nav {
  display: flex;
  gap: 8px;
}

.legacy-nav a {
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  color: #333;
  text-decoration: none;
}

.legacy-nav a.router-link-active {
  border-color: #2563eb;
  color: #1d4ed8;
}

.view-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.view-actions a {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #333;
  text-decoration: none;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  font-size: 13px;
}

.control-strip label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  max-width: 320px;
}

.control-strip select,
.field-grid select,
.field-grid input {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card h3 {
  margin: 0;
  font-size: 15px;
}

.field-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.field-grid .inline-check {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.analysis-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.inline-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #334155;
}

.inline-control input[type="number"] {
  width: 88px;
}

.quality-delta-meta {
  font-size: 12px;
  color: #334155;
}

.quality-delta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  font-size: 12px;
  color: #1f2937;
}

.quality-delta-table {
  overflow: auto;
  max-height: 240px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.quality-delta-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.quality-delta-table th,
.quality-delta-table td {
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f1f5f9;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
}

.recommend-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recommend-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #f9fafb;
}

.recommend-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.recommend-op {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.recommend-chart {
  font-size: 11px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 2px 8px;
  color: #334155;
  background: #ffffff;
}

.recommend-reason {
  font-size: 12px;
  color: #4b5563;
}

button {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.result-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result-toolbar .active {
  border-color: #2563eb;
  color: #1d4ed8;
  background: #eff6ff;
}

.state {
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
}

.state.loading {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
}

.state.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

.state.empty {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  color: #4b5563;
}

.result-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
}

.result-time {
  white-space: nowrap;
}

.ols-diag-panel {
  margin: 10px;
  padding: 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ols-diag-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e3a8a;
}

.ols-diag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
  font-size: 12px;
  color: #1f2937;
}

.ols-diag-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.ols-mini-plot {
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ols-mini-title {
  font-size: 12px;
  color: #334155;
}

.ols-mini-empty {
  font-size: 12px;
  color: #64748b;
  padding: 8px 0;
}

.ols-diag-note {
  font-size: 12px;
  color: #334155;
}

pre {
  background: #111;
  color: #0f0;
  margin: 0;
  padding: 10px;
  white-space: pre-wrap;
}

.table-results {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.table-box {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.table-title {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 10px;
  font-size: 12px;
  color: #374151;
}

.table-scroll {
  overflow: auto;
  max-height: 280px;
}

.table-scroll table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.table-scroll th,
.table-scroll td {
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f1f5f9;
  text-align: left;
  padding: 6px 8px;
  white-space: nowrap;
}

.result-row.clickable {
  cursor: pointer;
}

.result-row.clickable:hover {
  background: #eff6ff;
}

.result-row.clickable:focus {
  outline: 2px solid #93c5fd;
  outline-offset: -2px;
}
</style>
