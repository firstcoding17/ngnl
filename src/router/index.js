import { createRouter, createWebHistory } from 'vue-router';
import DataInletView from '@/views/DataInletView.vue';
import KeyGate from '@/components/KeyGate.vue';
import LegacyHubView from '@/views/LegacyHubView.vue';
import FileView from '@/views/FileView.vue';
import GraphView from '@/views/GraphView.vue';
import StatView from '@/views/StatView.vue';
import { clearStoredAuth, hasApiKey } from '@/api/authState';
import { ensureAuthenticatedSession, stopHeartbeat } from '@/api/authClient';

const routes = [
  { path: '/key', component: KeyGate },
  { path: '/', component: DataInletView },

  { path: '/legacy', component: LegacyHubView },
  { path: '/legacy/file', component: FileView },
  { path: '/legacy/graph', component: GraphView },
  { path: '/legacy/stat', component: StatView },
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
