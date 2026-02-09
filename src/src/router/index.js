import { createRouter, createWebHistory } from 'vue-router';
import DataInlet from '@/components/DataInlet.vue';
import KeyGate from '@/components/KeyGate.vue';
import FileView from '@/views/FileView.vue';
import GraphView from '@/views/GraphView.vue';
import StatView from '@/views/StatView.vue';

const routes = [
  { path: '/key', component: KeyGate },
  { path: '/', component: DataInlet },

  { path: '/legacy/file', component: FileView },
  { path: '/legacy/graph', component: GraphView },
  { path: '/legacy/stat', component: StatView },
  { path: '/legacy/:pathMatch(.*)*', redirect: '/legacy/file' },

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

window.addEventListener('beta-key-invalid', () => {
  localStorage.removeItem('beta_api_key');
  router.push('/key');
});

export default router;
