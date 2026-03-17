<script setup>
import DataInlet from '@/components/DataInlet.vue';
</script>

<template>
  <div class="data-inlet-view">
    <div class="view-nav">
      <router-link to="/">New</router-link>
      <router-link to="/legacy">Legacy</router-link>
    </div>
    <DataInlet />
  </div>
</template>

<style scoped>
.data-inlet-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-nav {
  display: flex;
  gap: 8px;
  padding: 8px 16px 0;
}

.view-nav a {
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  color: #333;
  text-decoration: none;
}

.view-nav a.router-link-active {
  border-color: #2563eb;
  color: #1d4ed8;
}
</style>
