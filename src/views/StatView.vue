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

      <button @click="doTtest">t-검정</button>
      <button @click="doChi2">카이제곱</button>
      <button @click="doLinReg">선형회귀</button>
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
import { statTtest, statChi2, statLinReg } from "@/api/statClient";

export default {
  name: "StatView",
  props: ["columns"],
  data() {
    return {
      selectedColumn: null,
      result: null, // 문자열(JSON pretty)
      imageUrl: null, // 분포 이미지 경로
      // 필요하다면 업로드된 파일명을 여기에 저장해서 함께 보낼 수 있음:
      filename: null, // 예) 'uploaded_20250813_101010.csv' (없으면 서버가 최신 업로드 자동 사용)
    };
  },
  methods: {
    // 1) 기초 통계량
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

    // 2) 분포 시각화 (JSON { image: "파일명.png" } 수신 → 정적 경로로 표시)
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
      // 서버에서 router.use('/images', static(outputs))로 제공 중
      this.imageUrl = `http://localhost:5000/stat/images/${data.image}`;
      this.result = null;
    },

    // 3) 상관 분석
    async runCorrelation() {
      const res = await fetch("http://localhost:5000/stat/correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          column: this.selectedColumn, // 프론트 호환용, 서버에서는 전체 수치형 사용
          ...(this.filename ? { filename: this.filename } : {}),
        }),
      });
      const data = await res.json();
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    // 4) t-검정
    async doTtest() {
      const data = await statTtest({
        ...(this.filename ? { filename: this.filename } : {}),
        // 아래 값들은 샘플 — 실제 컬럼명/그룹값에 맞게 바꿔줘
        valueCol: "height",
        groupCol: "sex",
        groupA: "M",
        groupB: "F",
        equal_var: false,
      });
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    // 5) 카이제곱
    async doChi2() {
      const data = await statChi2({
        ...(this.filename ? { filename: this.filename } : {}),
        // 샘플 — 실제 범주형 컬럼명으로 교체
        colA: "smoker",
        colB: "disease",
      });
      this.result = JSON.stringify(data, null, 2);
      this.imageUrl = null;
    },

    // 6) 선형회귀
    async doLinReg() {
      const data = await statLinReg({
        ...(this.filename ? { filename: this.filename } : {}),
        // 샘플 — 실제 타깃/특징 컬럼으로 교체
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
