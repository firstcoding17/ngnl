<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { logout } from '@/api/authClient';

const route = useRoute();
const router = useRouter();

const dashboardLink = computed(() => {
  if (route.path.startsWith('/dashboard/')) {
    return route.fullPath;
  }
  return '/dashboard/new';
});

async function onLogout() {
  try {
    await logout();
  } catch (_) {
    // ignore and continue clearing local session state
  }
  router.push('/key');
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <router-link to="/">NGNL</router-link>
      <span>Data Studio</span>
    </div>

    <nav class="nav">
      <router-link to="/">Main</router-link>
      <router-link to="/dashboard/new">Create</router-link>
      <router-link :to="dashboardLink">Dashboard</router-link>
      <router-link to="/workspace">Workspace</router-link>
      <router-link to="/legacy">Legacy</router-link>
    </nav>

    <button class="logout-btn" type="button" @click="onLogout">Logout</button>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(205, 216, 204, 0.9);
  background: rgba(247, 250, 245, 0.88);
  backdrop-filter: blur(14px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 168px;
}

.brand a {
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #223228;
}

.brand span {
  font-size: 12px;
  color: #667566;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.nav a,
.logout-btn {
  padding: 8px 12px;
  border: 1px solid #cad4c7;
  border-radius: 999px;
  background: #fff;
  color: #213128;
  font-size: 13px;
}

.nav a.router-link-active {
  border-color: #224d31;
  background: #224d31;
  color: #fff;
}

.logout-btn {
  margin-left: auto;
  cursor: pointer;
}

@media (max-width: 860px) {
  .app-header {
    flex-wrap: wrap;
  }

  .logout-btn {
    margin-left: 0;
  }
}
</style>
