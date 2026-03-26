<script setup>
import AppHeader from './components/Header.vue';
import { onBeforeUnmount, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { logoutOnExit } from './api/authClient';

const route = useRoute();

function handlePageExit() {
  logoutOnExit();
}

onMounted(() => {
  window.addEventListener('pagehide', handlePageExit);
  window.addEventListener('beforeunload', handlePageExit);
});

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', handlePageExit);
  window.removeEventListener('beforeunload', handlePageExit);
});
</script>

<template>
  <div :class="['app-shell', { 'app-shell--key': route.path === '/key' }]">
    <AppHeader v-if="route.path !== '/key'" />
    <RouterView />
  </div>
</template>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  min-height: 100%;
}

.app-shell {
  min-height: 100vh;
  padding-top: 56px;
}

.app-shell--key {
  padding-top: 0;
}
</style>
