import { createRouter, createWebHistory } from 'vue-router';
import { clearStoredAuth, hasApiKey } from '@/api/authState';
import { ensureAuthenticatedSession, stopHeartbeat } from '@/api/authClient';

const routes = [
  { path: '/key', name: 'key', component: () => import(/* webpackChunkName: "route-key" */ '@/components/KeyGate.vue') },
  { path: '/', name: 'studio-home', component: () => import(/* webpackChunkName: "route-home" */ '@/views/HomeView.vue') },
  { path: '/workspace', name: 'workspace', component: () => import(/* webpackChunkName: "route-workspace" */ '@/views/DataInletView.vue') },
  { path: '/dashboard/new', name: 'dashboard-new', component: () => import(/* webpackChunkName: "route-dashboard-create" */ '@/views/DashboardCreateView.vue') },
  { path: '/dashboard/:dashboardId', name: 'dashboard', component: () => import(/* webpackChunkName: "route-dashboard" */ '@/views/DashboardView.vue') },

  { path: '/legacy', name: 'legacy-hub', component: () => import(/* webpackChunkName: "route-legacy-hub" */ '@/views/LegacyHubView.vue') },
  { path: '/legacy/file', name: 'legacy-file', component: () => import(/* webpackChunkName: "route-legacy-file" */ '@/views/FileView.vue') },
  { path: '/legacy/graph', name: 'legacy-graph', component: () => import(/* webpackChunkName: "route-legacy-graph" */ '@/views/GraphView.vue') },
  { path: '/legacy/stat', name: 'legacy-stat', component: () => import(/* webpackChunkName: "route-legacy-stat" */ '@/views/StatView.vue') },
  { path: '/legacy/:pathMatch(.*)*', redirect: '/legacy' },

  // Backward compatibility
  { path: '/file', redirect: '/legacy/file' },
  { path: '/graph', redirect: '/legacy/graph' },
  { path: '/stat', redirect: '/legacy/stat' },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.path === '/key') return true;
  if (!hasApiKey()) return '/key';
  try {
    await ensureAuthenticatedSession();
    return true;
  } catch (_) {
    return '/key';
  }
});

window.addEventListener('beta-key-invalid', () => {
  stopHeartbeat();
  clearStoredAuth();
  router.push('/key');
});

export default router;
