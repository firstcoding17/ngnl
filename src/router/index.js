// src/router/index.js
import { createRouter, createWebHistory } from "vue-router";
import FileView from "../views/FileView.vue";
import GraphView from "../views/GraphView.vue";
import StatView from "../views/StatView.vue";

// ✅ 아주 간단한 키 입력 컴포넌트(임시)
//   - 나중에 별도 KeyGate.vue로 분리해도 됨
const KeyGate = {
  template: `
    <div style="max-width:360px;margin:64px auto;padding:24px;border:1px solid #eee;border-radius:12px">
      <h2 style="margin-bottom:12px">초대 키 입력</h2>
      <input v-model="key" placeholder="예: key_aaa111" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px" />
      <button @click="enter" style="margin-top:12px;padding:8px 12px;border:1px solid #ddd;border-radius:6px">입장</button>
      <p v-if="error" style="color:#c00;margin-top:8px">{{ error }}</p>
    </div>
  `,
  data() {
    return { key: localStorage.getItem('beta_api_key') || '', error: '' }
  },
  methods: {
    async enter() {
      localStorage.setItem('beta_api_key', (this.key || '').trim());
      try {
        const ok = await verifyKey();
        if (ok) this.$router.replace('/file'); // 입장 후 기본 페이지로
        else throw new Error('invalid');
      } catch {
        this.error = '키가 올바르지 않습니다.';
        localStorage.removeItem('beta_api_key');
      }
    }
  }
};

// ✅ 키 검증 함수: 서버 /auth/verify를 호출
async function verifyKey() {
  const key = localStorage.getItem('beta_api_key') || '';
  const base = import.meta?.env?.VITE_API_BASE || '/api'; // 프록시(/api) 또는 풀 URL
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/verify`, {
    method: 'GET',
    headers: { 'X-API-Key': key }
  });
  return res.ok;
}

const routes = [
  { path: "/key", component: KeyGate },                      // 키 입력 페이지
  { path: "/file", component: FileView, meta: { requiresKey: true } },
  { path: "/graph", component: GraphView, meta: { requiresKey: true } },
  { path: "/stat", component: StatView, meta: { requiresKey: true } },
  { path: "/", redirect: "/file" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// ✅ 전역 가드: 키 없거나 검증 실패 → /key로 보냄
router.beforeEach(async (to) => {
  if (!to.meta?.requiresKey) return true;

  const key = localStorage.getItem('beta_api_key');
  if (!key) return '/key';

  const ok = await verifyKey().catch(() => false);
  if (!ok) {
    localStorage.removeItem('beta_api_key');
    return '/key';
  }
  return true;
});

// ✅ 서버에서 401이 떨어진 경우를 대비해 앱 어디서든 이벤트로 보낼 수 있게 헬퍼 등록(optional)
window.addEventListener('beta-key-invalid', () => {
  localStorage.removeItem('beta_api_key');
  router.push('/key');
});

export default router;
