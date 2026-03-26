<template>
  <div class="key-gate">
    <div class="key-card">
      <p class="key-label">NGNL Access</p>
      <h2>접속 키를 입력하세요</h2>
      <p class="key-help">서버에서 발급한 API 키가 있어야 계속 진행할 수 있습니다.</p>
      <input
        v-model="key"
        class="key-input"
        placeholder="e.g. key_aaa111"
        @keyup.enter="enter"
      />
      <button class="key-button" @click="enter">입장하기</button>
      <p v-if="error" class="key-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { verifyKey } from '@/api/authClient';
import { clearStoredAuth, consumeAuthError, setApiKey } from '@/api/authState';

const key = ref('');
const error = ref(consumeAuthError());
const router = useRouter();

async function enter() {
  setApiKey(key.value.trim());
  try {
    const ok = await verifyKey();
    if (ok) {
      error.value = '';
      window.dispatchEvent(new Event('beta-key-valid'));
      router.push('/');
    } else {
      throw new Error('invalid');
    }
  } catch (e) {
    error.value = consumeAuthError() || e?.message || 'The key is invalid.';
    clearStoredAuth();
  }
}
</script>

<style scoped>
.key-gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(180deg, #f3f7fb 0%, #e5edf6 100%);
}

.key-card {
  width: min(100%, 420px);
  padding: 32px 28px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 20px 50px rgba(29, 47, 76, 0.14);
}

.key-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #45617f;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: 28px;
  color: #142033;
}

.key-help {
  margin: 12px 0 18px;
  color: #556579;
  line-height: 1.5;
}

.key-input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid #c9d5e3;
  border-radius: 12px;
  font-size: 15px;
  outline: none;
}

.key-input:focus {
  border-color: #2f6fed;
  box-shadow: 0 0 0 4px rgba(47, 111, 237, 0.12);
}

.key-button {
  width: 100%;
  margin-top: 14px;
  padding: 14px 16px;
  border: 0;
  border-radius: 12px;
  background: #1e4db7;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.key-error {
  margin: 12px 0 0;
  color: #c62828;
  line-height: 1.45;
}
</style>
