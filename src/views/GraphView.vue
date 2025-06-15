<template>
  <div class="graph-view">
    <h2>📊 Graph Settings</h2>

    <label>Select X-axis:</label>
    <select v-model="selectedX">
      <option
        v-for="column in tableData?.columns"
        :key="column"
        :value="column"
      >
        {{ column }}
      </option>
    </select>

    <label>Select Y-axis:</label>
    <select v-model="selectedY">
      <option
        v-for="column in tableData?.columns"
        :key="column"
        :value="column"
      >
        {{ column }}
      </option>
    </select>

    <button @click="generateGraph">Generate Graph</button>
    <div v-if="graphImageUrl" class="graph-container">
      <img :src="graphImageUrl" alt="Generated Graph" />
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  props: {
    tableData: Object,
  },
  data() {
    return {
      selectedX: null,
      selectedY: null,
      graphImageUrl: null,
    };
  },
  methods: {
    async generateGraph() {
      console.log("📡 그래프 요청 시작");

      if (!this.selectedX || !this.selectedY) {
        alert("X축과 Y축을 모두 선택하세요.");
        return;
      }

      try {
        const response = await axios.post(
          "http://localhost:5000/api/generate-graph",
          {
            xColumn: this.selectedX,
            yColumn: this.selectedY,
            data: this.tableData,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        this.graphImageUrl = `data:image/png;base64,${response.data.image}`;
      } catch (error) {
        console.error("그래프 생성 오류:", error);
      }
    },
  },
};
</script>

<style>
.graph-view {
  padding: 20px;
}

.graph-container img {
  max-width: 100%;
  margin-top: 20px;
}
</style>
