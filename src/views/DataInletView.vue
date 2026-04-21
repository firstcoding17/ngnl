<script setup>
import { defineAsyncComponent } from 'vue';

const DataInlet = defineAsyncComponent(() => import('@/components/DataInlet.vue'));
</script>

<template>
  <div class="data-inlet-view">
    <div class="view-head">
      <div>
        <p class="view-kicker">Workspace</p>
        <h1>Classic Data Workspace</h1>
        <p class="view-subtitle">
          기존 업로드/그리드/그래프/통계 흐름을 바로 쓰고 싶을 때 여는 작업 공간입니다.
          새 메인 플로우와 별도로 기존 기능은 그대로 유지됩니다.
        </p>
      </div>
      <div class="view-nav">
        <router-link to="/">Main</router-link>
        <router-link to="/dashboard/new">Create</router-link>
        <router-link to="/workspace">Workspace</router-link>
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
