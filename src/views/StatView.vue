<template>
  <div class="stat-view">
    <h2>통계 분석</h2>

    <select v-model="selectedColumn">
      <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
    </select>

    <div class="analysis-actions">
      <button @click="runBasicStat">기초 통계량</button>
      <button @click="runDistribution">분포 시각화</button>
      <button @click="runCorrelation">상관 분석</button>
    </div>

    <div v-if="result">
      <pre>{{ result }}</pre>
    </div>

    <div v-if="imageUrl">
      <img :src="imageUrl" alt="시각화 결과" />
    </div>
  </div>
</template>

<script>
export default {
  name: "StatView",
  props: ["columns"],
  data() {
    return {
      selectedColumn: null,
      result: null,
      imageUrl: null,
    };
  },
  methods: {
    async runBasicStat() {
      const res = await fetch("http://localhost:5000/stat/basic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: this.selectedColumn }),
      });
      this.result = await res.json();
      this.imageUrl = null;
    },
    async runDistribution() {
      const res = await fetch("http://localhost:5000/stat/distribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: this.selectedColumn }),
      });
      const blob = await res.blob();
      this.imageUrl = URL.createObjectURL(blob);
      this.result = null;
    },
    async runCorrelation() {
      const res = await fetch("http://localhost:5000/stat/correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: this.selectedColumn }),
      });
      this.result = await res.json();
      this.imageUrl = null;
    },
  },
};
</script>
