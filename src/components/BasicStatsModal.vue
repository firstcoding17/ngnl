<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <h3>기초 통계량 설정</h3>
      <div class="section">
        <h4>통계 항목</h4>
        <label v-for="item in metricOptions" :key="item.value">
          <input type="checkbox" :value="item.value" v-model="selectedMetrics" />
          {{ item.label }}
        </label>
      </div>
      <div class="section">
        <h4>분석 열</h4>
        <label v-for="col in tableData?.columns" :key="col">
          <input type="checkbox" :value="col" v-model="selectedColumns" />
          {{ col }}
        </label>
      </div>
      <div class="actions">
        <button @click="run">실행</button>
        <button @click="close">닫기</button>
      </div>
      <table v-if="hasResult">
        <thead>
          <tr>
            <th>항목</th>
            <th v-for="col in selectedColumns" :key="col">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="metric in selectedMetrics" :key="metric">
            <td>{{ metricLabel(metric) }}</td>
            <td v-for="col in selectedColumns" :key="col">
              {{ result[metric]?.[col] ?? '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  props: {
    tableData: Object,
    visible: Boolean,
  },
  emits: ["close"],
  data() {
    return {
      selectedMetrics: [],
      selectedColumns: [],
      result: {},
      metricOptions: [
        { value: "mean", label: "평균" },
        { value: "median", label: "중앙값" },
        { value: "std", label: "표준편차" },
        { value: "min", label: "최솟값" },
        { value: "max", label: "최댓값" },
        { value: "null_count", label: "결측치 수" },
      ],
    };
  },
  computed: {
    hasResult() {
      return Object.keys(this.result).length > 0;
    },
  },
  methods: {
    metricLabel(val) {
      const item = this.metricOptions.find((m) => m.value === val);
      return item ? item.label : val;
    },
    close() {
      this.$emit("close");
    },
    async run() {
      if (!this.selectedMetrics.length || !this.selectedColumns.length) return;
      try {
        const response = await axios.post("http://localhost:5000/api/basic-stats", {
          data: this.tableData,
          columns: this.selectedColumns,
          metrics: this.selectedMetrics,
        });
        this.result = response.data.results;
      } catch (err) {
        console.error(err);
      }
    },
  },
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}
.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  min-width: 300px;
}
.section {
  margin-bottom: 10px;
}
.actions {
  margin-top: 10px;
}
.actions button {
  margin-right: 10px;
}
</style>
