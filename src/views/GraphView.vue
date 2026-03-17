<template>
  <div class="graph-view">
    <h2>Legacy Graph View</h2>
    <div class="legacy-nav">
      <router-link to="/legacy/file">File</router-link>
      <router-link to="/legacy/graph">Graph</router-link>
      <router-link to="/legacy/stat">Stat</router-link>
    </div>
    <p class="subtitle">Load data in <code>/legacy/file</code>, then generate an image graph here.</p>
    <div class="view-actions">
      <router-link to="/">Open New Workspace</router-link>
      <router-link to="/legacy">Open Legacy Hub</router-link>
      <button @click="resetLegacyDataset" :disabled="loading || !hasDataset">Clear Legacy Dataset</button>
    </div>

    <div class="summary">
      <span><b>Rows:</b> {{ rowCount }}</span>
      <span><b>Columns:</b> {{ columnCount }}</span>
      <span><b>Status:</b> {{ hasDataset ? "ready" : "empty" }}</span>
    </div>

    <div class="controls">
      <label>
        Chart type
        <select v-model="graphType">
          <option value="scatter">Scatter</option>
          <option value="line">Line</option>
          <option value="bar">Bar</option>
          <option value="box">Box</option>
          <option value="histogram">Histogram</option>
        </select>
      </label>

      <label>
        X-axis
        <select v-model="selectedX" :disabled="!effectiveColumns.length">
          <option value="">Select X-axis</option>
          <option v-for="column in effectiveColumns" :key="column" :value="column">
            {{ column }}
          </option>
        </select>
      </label>

      <label>
        Y-axis
        <select v-model="selectedY" :disabled="!effectiveColumns.length || graphType === 'histogram'">
          <option value="">Select Y-axis</option>
          <option v-for="column in effectiveColumns" :key="column" :value="column">
            {{ column }}
          </option>
        </select>
      </label>
    </div>

    <div class="analysis-actions">
      <button @click="generateGraph" :disabled="!canGenerate || loading">
        {{ loading ? "Generating..." : "Generate Graph" }}
      </button>
      <button @click="swapAxes" :disabled="!selectedX || !selectedY || loading">Swap Axes</button>
      <button @click="clearGraph" :disabled="!graphImageUrl || loading">Clear Result</button>
    </div>

    <div v-if="loading" class="state loading">Generating graph image...</div>
    <div v-else-if="errorMessage" class="state error">{{ errorMessage }}</div>
    <div v-else-if="!graphImageUrl" class="state empty">No graph image yet.</div>

    <div v-else class="graph-container">
      <img :src="graphImageUrl" alt="Generated Graph" />
      <div class="graph-meta">
        <span v-if="lastRunAt">Last generated: {{ lastRunAt }}</span>
        <div class="graph-actions">
          <button @click="openGraphTab">Open in new tab</button>
          <button @click="downloadGraph">Download PNG</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import http from "@/api/http";

const LEGACY_DATA_KEY = "legacy_table_data";
const LEGACY_GRAPH_PREF_KEY = "legacy_graph_pref";

export default {
  props: {
    tableData: Object,
  },
  data() {
    return {
      selectedX: null,
      selectedY: null,
      graphType: "scatter",
      graphImageUrl: null,
      loading: false,
      errorMessage: "",
      lastRunAt: "",
    };
  },
  computed: {
    effectiveTableData() {
      if (this.tableData?.columns?.length && this.tableData?.rows?.length) return this.tableData;
      try {
        const raw = localStorage.getItem(LEGACY_DATA_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    effectiveColumns() {
      return this.effectiveTableData?.columns || [];
    },
    hasDataset() {
      return !!this.effectiveTableData?.rows?.length;
    },
    rowCount() {
      return this.effectiveTableData?.rows?.length || 0;
    },
    columnCount() {
      return this.effectiveColumns.length;
    },
    canGenerate() {
      if (!this.hasDataset || !this.selectedX) return false;
      if (this.graphType === "histogram") return true;
      return !!this.selectedY;
    },
  },
  methods: {
    loadPrefs() {
      try {
        const raw = localStorage.getItem(LEGACY_GRAPH_PREF_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    },
    persistPrefs() {
      localStorage.setItem(LEGACY_GRAPH_PREF_KEY, JSON.stringify({
        graphType: this.graphType,
        x: this.selectedX || "",
        y: this.selectedY || "",
      }));
    },
    setDefaultAxes(cols) {
      if (!Array.isArray(cols) || !cols.length) return;
      const pref = this.loadPrefs();
      if (["scatter", "line", "bar", "box", "histogram"].includes(pref.graphType)) {
        this.graphType = pref.graphType;
      }
      if (pref.x && cols.includes(pref.x)) this.selectedX = pref.x;
      if (!this.selectedX || !cols.includes(this.selectedX)) this.selectedX = cols[0];
      if (pref.y && cols.includes(pref.y)) this.selectedY = pref.y;
      if (!this.selectedY || !cols.includes(this.selectedY)) this.selectedY = cols[Math.min(1, cols.length - 1)];
    },
    swapAxes() {
      if (!this.selectedX || !this.selectedY) return;
      const temp = this.selectedX;
      this.selectedX = this.selectedY;
      this.selectedY = temp;
    },
    clearGraph() {
      this.graphImageUrl = null;
      this.errorMessage = "";
      this.lastRunAt = "";
    },
    resetLegacyDataset() {
      localStorage.removeItem(LEGACY_DATA_KEY);
      this.clearGraph();
      this.selectedX = null;
      this.selectedY = null;
      this.$router.push("/legacy/file");
    },
    openGraphTab() {
      if (!this.graphImageUrl) return;
      window.open(this.graphImageUrl, "_blank", "noopener,noreferrer");
    },
    downloadGraph() {
      if (!this.graphImageUrl) return;
      const a = document.createElement("a");
      a.href = this.graphImageUrl;
      a.download = `legacy-graph-${Date.now()}.png`;
      a.click();
    },
    async generateGraph() {
      this.errorMessage = "";
      if (!this.canGenerate) {
        this.errorMessage = this.graphType === "histogram"
          ? "Select X-axis after loading a dataset."
          : "Select both X-axis and Y-axis after loading a dataset.";
        return;
      }

      this.loading = true;
      try {
        const response = await http.post(
          "/api/generate-graph",
          {
            xColumn: this.selectedX,
            yColumn: this.graphType === "histogram" ? undefined : this.selectedY,
            graphType: this.graphType,
            data: this.effectiveTableData,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const image = response.data?.data?.image || response.data?.image;
        if (!image) throw new Error("No image payload");
        this.graphImageUrl = `data:image/png;base64,${image}`;
        this.lastRunAt = new Date().toLocaleString();
      } catch (error) {
        console.error("Graph generation error:", error);
        this.errorMessage = "Graph generation failed. Please retry or check the server log.";
      } finally {
        this.loading = false;
      }
    },
    maybeAutoGenerateFromRoute() {
      if (this.$route?.query?.autogen !== "1") return;
      if (!this.canGenerate || this.loading) return;
      this.generateGraph();
      this.$router.replace({ path: this.$route.path, query: {} }).catch(() => {});
    },
  },
  watch: {
    effectiveColumns: {
      immediate: true,
      handler(cols) {
        this.setDefaultAxes(cols);
        this.$nextTick(() => this.maybeAutoGenerateFromRoute());
      },
    },
    "$route.query.autogen"() {
      this.$nextTick(() => this.maybeAutoGenerateFromRoute());
    },
    graphType() {
      this.persistPrefs();
    },
    selectedX() {
      this.persistPrefs();
    },
    selectedY() {
      this.persistPrefs();
    },
  },
};
</script>

<style scoped>
.graph-view {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subtitle {
  margin-top: -4px;
  color: #666;
  font-size: 13px;
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

.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.controls label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.controls select {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.analysis-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

.graph-container {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
}

.graph-container img {
  max-width: 100%;
}

.graph-meta {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #6b7280;
}

.graph-actions {
  display: flex;
  gap: 8px;
}
</style>
