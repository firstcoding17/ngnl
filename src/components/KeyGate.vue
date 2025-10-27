<template>
    <div class="p-6 max-w-sm mx-auto">
      <h2 class="text-xl mb-3">초대 키 입력</h2>
      <input v-model="key" placeholder="예: key_aaa111" class="border p-2 w-full" />
      <button @click="enter" class="mt-3 px-4 py-2 border">입장</button>
      <p v-if="error" class="text-red-600 mt-2">{{ error }}</p>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue';
  import { verifyKey } from '@/api/authClient';
  
  const key = ref('');
  const error = ref('');
  
  async function enter() {
    localStorage.setItem('beta_api_key', key.value.trim());
    try {
      const ok = await verifyKey();
      if (ok) {
        error.value = '';
        window.dispatchEvent(new Event('beta-key-valid')); // 앱에 알림
      } else {
        throw new Error('invalid');
      }
    } catch {
      error.value = '키가 올바르지 않습니다.';
      localStorage.removeItem('beta_api_key');
    }
  }
  </script>
  
  <style scoped>
  /* 간단 스타일 */
  </style>
  