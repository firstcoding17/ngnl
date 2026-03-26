<script setup>
import DataInlet from '@/components/DataInlet.vue';
</script>

<template>
  <div class="data-inlet-view">
    <div class="view-head">
      <div>
        <p class="view-kicker">Workspace</p>
        <h1>Data Workspace</h1>
        <p class="view-subtitle">기존 파일 화면처럼 바로 데이터를 올리고, 표에서 확인한 뒤 그래프와 통계 흐름으로 이어질 수 있게 구성했습니다.</p>
      </div>
      <div class="view-nav">
        <router-link to="/">Workspace</router-link>
        <router-link to="/legacy/file">File</router-link>
        <router-link to="/legacy/graph">Graph</router-link>
        <router-link to="/legacy/stat">Stat</router-link>
      </div>
    </div>
    <DataInlet />
  </div>
</template>

<style scoped>
.data-inlet-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px 28px;
}

.view-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.view-kicker {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6b7280;
}

h1 {
  margin: 0;
  font-size: 30px;
}

.view-subtitle {
  margin: 8px 0 0;
  max-width: 760px;
  color: #5b6777;
  line-height: 1.5;
}

.view-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.view-nav a {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  color: #2f3a49;
  background: #fff;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}

.view-nav a.router-link-active {
  border-color: #1d4ed8;
  color: #1d4ed8;
  background: #eef4ff;
}

@media (max-width: 720px) {
  .data-inlet-view {
    padding: 14px;
  }

  h1 {
    font-size: 24px;
  }
}
</style>
