<template>
  <div class="stat-view">
    <h2>Statistics Analysis</h2>

    <select v-model="selectedColumn">
      <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
    </select>

    <div class="analysis-actions">
      <button @click="runBasicStat">Basic stats</button>
      <button @click="runDistribution">Distribution</button>
      <button @click="runCorrelation">Correlation</button>

      <button @click="doTtest">t-test</button>
      <button @click="doChi2">Chi-square</button>
      <button @click="doLinReg">Linear regression</button>
    </div>

    <div v-if="result">
      <pre>{{ result }}</pre>
    </div>

    <div v-if="imageUrl">
      <img :src="imageUrl" alt="Distribution result" />
    </div>
  </div>
</template>

<script>
import { statTtest, statChi2, statLinReg } from "@/api/statClient";

export default {
  name: "StatView",
  props: ["columns"],
  data() {
    return {
      selectedColumn: null,
      result: null, // JSON output
      imageUrl: null, // Distribution image URL
      // Optional uploaded filename for legacy server flow
      filename: null,
    };
  },
  methods: {
    async runBasicStat() {
      const res = await fetch("http://localhost:5000/stat/basic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          column: this.selectedColumn,
          ...(this.filename ? { filename: this.filename } : {}),
        }),
      });
      const data = await res.json();
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    async runDistribution() {
      const res = await fetch("http://localhost:5000/stat/distribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          column: this.selectedColumn,
          ...(this.filename ? { filename: this.filename } : {}),
        }),
      });
      const data = await res.json();
      if (data?.image) {
        this.imageUrl = `http://localhost:5000/stat/images/${data.image}`;
        this.result = null;
      } else {
        this.imageUrl = null;
        this.result = JSON.stringify(data, null, 2);
      }
    },

    async runCorrelation() {
      const res = await fetch("http://localhost:5000/stat/correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          column: this.selectedColumn,
          ...(this.filename ? { filename: this.filename } : {}),
        }),
      });
      const data = await res.json();
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    async doTtest() {
      const data = await statTtest({
        ...(this.filename ? { filename: this.filename } : {}),
        valueCol: "height",
        groupCol: "sex",
        groupA: "M",
        groupB: "F",
        equal_var: false,
      });
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    async doChi2() {
      const data = await statChi2({
        ...(this.filename ? { filename: this.filename } : {}),
        colA: "smoker",
        colB: "disease",
      });
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    async doLinReg() {
      const data = await statLinReg({
        ...(this.filename ? { filename: this.filename } : {}),
        target: "price",
        features: ["area", "rooms"],
      });
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },
  },
};
</script>

<style scoped>
.analysis-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}
img {
  max-width: 100%;
  height: auto;
  border: 1px solid #eee;
  border-radius: 6px;
}
pre {
  background: #111;
  color: #0f0;
  padding: 8px;
  border-radius: 6px;
  white-space: pre-wrap;
}
</style>
